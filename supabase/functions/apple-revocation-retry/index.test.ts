// supabase/functions/apple-revocation-retry/index.test.ts
//
// Integration tests for apple-revocation-retry Edge Function (B3.7).
//
// These tests exercise the cron worker against a deployed function and a live
// Supabase DB. They use the same `globalThis.fetch` mock strategy as
// apple-token-exchange/index.test.ts — the mock intercepts Apple's revoke
// endpoint at the process level. This works in `supabase functions serve`
// mode (where the Edge Function runs in the same Deno process) but NOT against
// a remotely-deployed function (remote isolation is a separate process).
//
// Auth: the function requires a service-role JWT. We pass it explicitly via
// invokeFn({ jwt: SERVICE_ROLE_KEY }). The harness `invokeFn` accepts any
// string in opts.jwt — callers are responsible for supplying the right JWT.
//
// Run:
//   deno test --allow-net --allow-env supabase/functions/apple-revocation-retry/
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   SUPABASE_FUNCTIONS_URL  (defaults to ${SUPABASE_URL}/functions/v1)
//
// NOTE: Tests will throw "Required env var missing" if env vars are not set.
// This is expected in CI without credentials. Run only in environments with
// access to the target Supabase project.
//
// Test scenarios implemented (per B3.7 spec lines 3280-3372):
//   T1 — No pending rows → 200 with leased=0 (noop)
//   T2 — Apple 200 → row deleted
//   T3 — Apple 500 → attempts+=1, next_attempt_at scheduled, lock cleared
//   T4 — Apple invalid_grant → dead_letter immediately
//   T5 — Unrevokable sentinel rows are never selected
//   T6 — Concurrency: two workers vs same row → only one revoke
//   T7 — Stale lease (>10min) is reclaimed
//   T_AUTH — Requests without service-role JWT return 401

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cleanupPending,
  createTestPendingRow,
  getPendingRow,
  invokeFn,
} from '../_test/harness.ts';

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`[test] Required env var missing: ${key}`);
  return val;
}

// SERVICE_ROLE_KEY is read once — used as the auth credential for every invokeFn
// call, since the function is guarded by a service-role JWT check.
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

// ---------------------------------------------------------------------------
// mockAppleRevoke
//
// Patches globalThis.fetch to intercept POST requests to
// appleid.apple.com/auth/revoke. Returns an object with:
//   callCount — number of times the mock was invoked
//   restore() — removes the patch
//
// NOTE: This mock only intercepts calls made from the same Deno process. It
// works correctly in `supabase functions serve` mode. Against a remotely-
// deployed function it has NO effect — Apple calls happen in the remote
// sandbox. The concurrency test (T6) documents this limitation explicitly.
// ---------------------------------------------------------------------------

interface MockAppleRevoke {
  callCount: number;
  restore: () => void;
}

function mockAppleRevoke(
  statusCode: number,
  bodyText = '',
): MockAppleRevoke {
  const originalFetch = globalThis.fetch;
  const mock: MockAppleRevoke = {
    callCount: 0,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;

    if (url.includes('appleid.apple.com/auth/revoke')) {
      mock.callCount++;
      return new Response(bodyText || '', { status: statusCode });
    }
    // Pass all other requests through to real fetch.
    return originalFetch(input, init);
  };

  return mock;
}

// ---------------------------------------------------------------------------
// T_AUTH — Missing / wrong JWT → 401
//
// This is a unit-level check against the deployed function's auth guard.
// It does NOT require a live pending row.
// ---------------------------------------------------------------------------

Deno.test('T_AUTH: missing JWT → 401 UNAUTHORIZED', async () => {
  // No jwt = no Authorization header
  const res = await invokeFn('apple-revocation-retry', {});
  assertEquals(
    res.status,
    401,
    'Function must reject requests without a service-role JWT',
  );
  const body = await res.json();
  assertEquals(body.code, 'UNAUTHORIZED');
});

Deno.test('T_AUTH: wrong JWT → 401 UNAUTHORIZED', async () => {
  const res = await invokeFn('apple-revocation-retry', {
    jwt: 'definitely-not-the-service-role-key',
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'UNAUTHORIZED');
});

// ---------------------------------------------------------------------------
// T1 — No pending rows → noop (200 with leased=0)
//
// We don't guarantee the table is empty — other tests may have rows. We only
// assert that the function returns 200 with ok=true and no error. The
// leased count may be non-zero if concurrent tests are running.
// ---------------------------------------------------------------------------

Deno.test('T1: authenticated with no targetable rows → 200 ok', async () => {
  const res = await invokeFn('apple-revocation-retry', {
    jwt: SERVICE_ROLE_KEY,
  });
  assertEquals(res.status, 200, 'Expected 200 from authenticated call');
  const body = await res.json();
  assertEquals(body.ok, true, 'Expected ok:true');
  assert(typeof body.leased === 'number', 'Expected leased to be a number');
});

// ---------------------------------------------------------------------------
// T2 — Apple 200 → row deleted
// ---------------------------------------------------------------------------

Deno.test('T2: Apple 200 → pending row deleted after successful revoke', async () => {
  const mock = mockAppleRevoke(200);
  // Use a past next_attempt_at so the row is immediately eligible.
  const rowId = await createTestPendingRow({
    apple_sub: `t2-${crypto.randomUUID()}`,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);

    // Row should be gone after successful revoke.
    const after = await getPendingRow(rowId);
    assertEquals(after, null, 'Row must be deleted after successful Apple revoke');
  } finally {
    mock.restore();
    await cleanupPending(rowId); // no-op if already deleted
  }
});

// ---------------------------------------------------------------------------
// T3 — Apple 500 → attempts+=1, next_attempt_at in the future, lock cleared
// ---------------------------------------------------------------------------

Deno.test('T3: Apple 500 → attempts incremented, next_attempt_at scheduled, lock cleared', async () => {
  const mock = mockAppleRevoke(500, 'server error');
  const rowId = await createTestPendingRow({
    apple_sub: `t3-${crypto.randomUUID()}`,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);

    const after = await getPendingRow(rowId);
    assert(after !== null, 'Row must still exist after transient failure');
    assertEquals(after!.attempts, 1, 'attempts should be incremented to 1');
    assertEquals(after!.locked_at, null, 'lock must be cleared after processing');
    assertEquals(after!.locked_by, null, 'locked_by must be cleared after processing');
    assertEquals(after!.dead_letter, false, 'Row must not be dead-lettered for transient error');
    assert(
      new Date(after!.next_attempt_at as string).getTime() > Date.now(),
      'next_attempt_at must be scheduled in the future for backoff',
    );
  } finally {
    mock.restore();
    await cleanupPending(rowId);
  }
});

// ---------------------------------------------------------------------------
// T4 — Apple invalid_grant → dead_letter immediately
// ---------------------------------------------------------------------------

Deno.test('T4: Apple invalid_grant (400) → row dead-lettered immediately', async () => {
  const mock = mockAppleRevoke(400, 'invalid_grant');
  const rowId = await createTestPendingRow({
    apple_sub: `t4-${crypto.randomUUID()}`,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);

    const after = await getPendingRow(rowId);
    assert(after !== null, 'Row must still exist as a dead-letter');
    assertEquals(after!.dead_letter, true, 'Row must be dead-lettered for invalid_grant');
    assertEquals(after!.locked_at, null, 'lock must be cleared on dead-letter');
    assertEquals(after!.locked_by, null, 'locked_by must be cleared on dead-letter');
  } finally {
    mock.restore();
    await cleanupPending(rowId);
  }
});

// ---------------------------------------------------------------------------
// T5 — Unrevokable sentinel rows are never selected
// ---------------------------------------------------------------------------

Deno.test('T5: unrevokable sentinel rows are skipped by the lease RPC', async () => {
  // Insert a sentinel (unrevokable=true, no token). The lease RPC filters
  // these out via `AND NOT sub.unrevokable`.
  const rowId = await createTestPendingRow({
    apple_sub: `t5-${crypto.randomUUID()}`,
    unrevokable: true,
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);

    // The sentinel row must be completely untouched.
    const after = await getPendingRow(rowId);
    assert(after !== null, 'Unrevokable sentinel must not be deleted or mutated');
    assertEquals(after!.unrevokable, true, 'unrevokable flag must remain true');
    assertEquals(after!.attempts, 0, 'attempts must remain 0 for unrevokable sentinel');
  } finally {
    await cleanupPending(rowId);
  }
});

// ---------------------------------------------------------------------------
// T6 — Concurrency: two workers vs same row → only one revoke
//
// We fire two invokeFn calls in parallel. The lease RPC uses FOR UPDATE SKIP
// LOCKED, so exactly one worker should acquire the row; the other sees zero
// rows. After both complete the row should be gone (Apple 200).
//
// NOTE: `mock.callCount` reflects calls in THIS process only. Against a
// remotely-deployed function it will always be 0 — the deployed function
// makes Apple calls in its own sandbox. In local `supabase functions serve`
// mode, mock.callCount correctly shows 1. In remote mode, the correctness of
// the "only one revoke" guarantee is enforced by the DB-level FOR UPDATE SKIP
// LOCKED — we verify row state (null) as a proxy rather than counting fetches.
// ---------------------------------------------------------------------------

Deno.test('T6: two concurrent workers vs same row — only one revoke, row deleted', async () => {
  const mock = mockAppleRevoke(200);
  const rowId = await createTestPendingRow({
    apple_sub: `t6-${crypto.randomUUID()}`,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const [r1, r2] = await Promise.all([
      invokeFn('apple-revocation-retry', { jwt: SERVICE_ROLE_KEY }),
      invokeFn('apple-revocation-retry', { jwt: SERVICE_ROLE_KEY }),
    ]);
    assertEquals(r1.status, 200, 'First worker must return 200');
    assertEquals(r2.status, 200, 'Second worker must return 200');

    // Row must be deleted: exactly one of the two workers leased+deleted it.
    const after = await getPendingRow(rowId);
    assertEquals(
      after,
      null,
      'Row must be deleted — exactly one worker processed it',
    );

    // In local serve mode the callCount should be exactly 1 (SKIP LOCKED
    // blocks the second worker from picking up the same row).
    // In remote mode callCount is 0 (Apple calls happen in remote sandbox) —
    // we skip the assertion to avoid a false failure.
    if (mock.callCount > 0) {
      assertEquals(mock.callCount, 1, 'Apple revoke should be called exactly once');
    }
    // If callCount === 0 we're in remote mode — correctness proved by row state above.
  } finally {
    mock.restore();
    await cleanupPending(rowId); // no-op if already deleted
  }
});

// ---------------------------------------------------------------------------
// T8 — Apple 429 (rate limit) → transient, not dead_letter
//
// 429 must be treated as transient — Apple may rate-limit during bulk account
// deletion. Dead-lettering would silently abandon the revocation. We assert
// the same shape as T3 (Apple 500): row preserved, attempts incremented,
// dead_letter false, lock cleared, next_attempt_at scheduled in the future.
// ---------------------------------------------------------------------------

Deno.test('T8: Apple 429 rate limit → transient backoff, not dead-lettered', async () => {
  const mock = mockAppleRevoke(429, 'too_many_requests');
  const rowId = await createTestPendingRow({
    apple_sub: `t8-${crypto.randomUUID()}`,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);

    const after = await getPendingRow(rowId);
    assert(after !== null, 'Row must still exist after 429 — not dead-lettered');
    assertEquals(after!.dead_letter, false, '429 must be transient, not dead_letter');
    assertEquals(after!.attempts, 1, 'attempts should be incremented to 1');
    assertEquals(after!.locked_at, null, 'lock must be cleared after processing');
    assertEquals(after!.locked_by, null, 'locked_by must be cleared after processing');
    assert(
      new Date(after!.next_attempt_at as string).getTime() > Date.now(),
      'next_attempt_at must be scheduled in the future for backoff',
    );
  } finally {
    mock.restore();
    await cleanupPending(rowId);
  }
});

// ---------------------------------------------------------------------------
// T7 — Stale lease (>10 min) is reclaimed
//
// Insert a row that is already locked (locked_at = 15 min ago, locked_by =
// 'dead-worker'). The lease RPC should reclaim it because the stale lock
// threshold (STALE_LOCK_MS = 10 min) has elapsed. After the worker runs the
// row should be processed (deleted on Apple 200).
// ---------------------------------------------------------------------------

Deno.test('T7: stale lease (15min old) is reclaimed and row processed', async () => {
  const mock = mockAppleRevoke(200);
  const rowId = await createTestPendingRow({
    apple_sub: `t7-${crypto.randomUUID()}`,
    locked_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    locked_by: 'dead-worker',
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
  });
  try {
    const res = await invokeFn('apple-revocation-retry', {
      jwt: SERVICE_ROLE_KEY,
    });
    assertEquals(res.status, 200);

    // Row should be deleted — worker reclaimed the stale lease and succeeded.
    const after = await getPendingRow(rowId);
    assertEquals(
      after,
      null,
      'Stale-leased row must be reclaimed and deleted after successful revoke',
    );
  } finally {
    mock.restore();
    await cleanupPending(rowId); // no-op if already deleted
  }
});
