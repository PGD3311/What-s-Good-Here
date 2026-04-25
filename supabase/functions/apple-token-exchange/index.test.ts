// supabase/functions/apple-token-exchange/index.test.ts
//
// Integration tests for apple-token-exchange. Mocks Apple's /auth/token via
// globalThis.fetch patching. Uses the same test harness as apple-token-persist.
//
// Requires env vars at runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Run:
//   deno test --allow-net --allow-env supabase/functions/apple-token-exchange/

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  cleanupUser,
  createTestUser,
  getAppleTokenRow,
  insertAppleIdentity,
  invokeFn,
} from '../_test/harness.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAppleTokenEndpoint(handler: (req: Request) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : (input as Request).url;
    if (url.includes('appleid.apple.com/auth/token')) {
      return handler(new Request(url, init));
    }
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Builds a minimal Apple id_token (unsigned, test-only). The base64url
 * payload encodes the given sub claim. decodeIdToken() in _shared/apple.ts
 * only reads the payload — it does not verify the signature — so this is
 * sufficient for sub-binding tests.
 */
function makeIdToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'ES256', kid: 'fake' })).replace(/=+$/, '');
  const payload = btoa(JSON.stringify({ sub, iss: 'https://appleid.apple.com' })).replace(/=+$/, '');
  return `${header}.${payload}.fakesig`;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

Deno.test('happy path: exchange succeeds, row upserted, 200', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(
      JSON.stringify({
        refresh_token: 'apple-rt-123',
        id_token: makeIdToken('000123.abc'),
        access_token: 'apple-at',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'fresh-code-1' },
    });
    assertEquals(res.status, 200);
    const row = await getAppleTokenRow(userId);
    assert(row, 'row should exist after successful exchange');
    assert(row.code_hash, 'code_hash populated');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('apple_sub mismatch returns 403 AUTH_SECURITY, no row written', async () => {
  // Apple returns id_token with a different sub than what's in auth.identities
  const restore = mockAppleTokenEndpoint(() =>
    new Response(
      JSON.stringify({
        refresh_token: 'rt',
        id_token: makeIdToken('999.bad'),
        access_token: 'at',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'fresh-code-2' },
    });
    assertEquals(res.status, 403);
    const resBody = await res.json();
    assertEquals(resBody.code, 'AUTH_SECURITY');
    assertEquals(resBody.subcode, 'apple_sub_mismatch');
    const row = await getAppleTokenRow(userId);
    assertEquals(row, null, 'no row written on sub mismatch');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('Apple invalid_grant returns 422', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'expired-code' },
    });
    assertEquals(res.status, 422);
    const resBody = await res.json();
    assertEquals(resBody.code, 'APPLE_CODE_INVALID');
    assertEquals(resBody.subcode, 'apple_invalid_grant');
    assertEquals(resBody.transient, false);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('Apple 500 returns 502 transient', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response('server error', { status: 500 })
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'code-x' },
    });
    assertEquals(res.status, 502);
    const resBody = await res.json();
    assertEquals(resBody.code, 'APPLE_UNAVAILABLE');
    assertEquals(resBody.transient, true);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('no Apple identity → 409 NO_APPLE_IDENTITY fail-closed', async () => {
  const { userId, jwt } = await createTestUser();
  // Deliberately no insertAppleIdentity — user exists but has no Apple identity
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'code-y' },
    });
    assertEquals(res.status, 409);
    const resBody = await res.json();
    assertEquals(resBody.code, 'NO_APPLE_IDENTITY');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('duplicate code within 60s → 409 DUPLICATE_CODE', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(
      JSON.stringify({
        refresh_token: 'rt',
        id_token: makeIdToken('000123.abc'),
        access_token: 'at',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    // First call — should succeed
    const r1 = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'same-code' },
    });
    assertEquals(r1.status, 200);

    // Second call with same code within 60s window — should be rejected
    const r2 = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'same-code' },
    });
    assertEquals(r2.status, 409);
    const r2Body = await r2.json();
    assertEquals(r2Body.code, 'DUPLICATE_CODE');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

Deno.test('network error during Apple exchange → 502 transient', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : (input as Request).url;
    if (url.includes('appleid.apple.com/auth/token')) {
      throw new TypeError('network down');
    }
    return originalFetch(input, init);
  };
  const restore = () => { globalThis.fetch = originalFetch; };
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: { authorization_code: 'x' },
    });
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.code, 'APPLE_EXCHANGE_FAILED');
    assertEquals(body.transient, true);
  } finally {
    restore();
    await cleanupUser(userId);
  }
});

// NOTE: MULTI_APPLE_IDENTITY test skipped — harness insertAppleIdentity does not
// support inserting a second identity row for the same user without schema changes.
// The multi-identity branch is covered by the structured log event
// (apple_token_exchange_multi_identity) in production observability.

Deno.test('client-supplied apple_sub in body is ignored, stored sub used', async () => {
  const restore = mockAppleTokenEndpoint(() =>
    new Response(
      JSON.stringify({
        refresh_token: 'rt',
        id_token: makeIdToken('000123.abc'),
        access_token: 'at',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  );
  const { userId, jwt } = await createTestUser();
  await insertAppleIdentity(userId, '000123.abc');
  try {
    const res = await invokeFn('apple-token-exchange', {
      jwt,
      body: {
        authorization_code: 'fresh-code-3',
        // Attacker-supplied fields — must be silently ignored by the function
        apple_sub: 'attacker.controlled.sub',
        user_id: 'attacker.user.id',
      },
    });
    // Should succeed: sub binding uses stored identity sub ('000123.abc'),
    // not the attacker-supplied value. Apple mock returns id_token with '000123.abc'.
    assertEquals(res.status, 200);
    const row = await getAppleTokenRow(userId);
    assertEquals(row!.apple_sub, '000123.abc', 'stored apple_sub is canonical, not attacker value');
  } finally {
    restore();
    await cleanupUser(userId);
  }
});
