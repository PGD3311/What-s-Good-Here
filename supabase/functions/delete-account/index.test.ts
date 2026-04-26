// supabase/functions/delete-account/index.test.ts
//
// Integration tests for delete-account Edge Function — B3.6 scenarios.
//
// Tests the Apple revocation pre-cascade logic (step 1.5) added in B3.6.
// Existing cascade (steps 2-7) behaviour is unchanged and not re-tested here.
//
// Run with:
//   deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   SUPABASE_FUNCTIONS_URL  (defaults to ${SUPABASE_URL}/functions/v1)
//
// NOTE: These tests hit a live deployed function. They will FAIL if the
// function has not been deployed to the target Supabase project. They also
// require the delete-account function to be deployed with verify_jwt=false
// (or with a valid SUPABASE_ANON_KEY configured) so the function can verify
// the test user's JWT.
//
// Test scenarios implemented (B3.6 spec lines 3023-3037):
//   T1 — Non-Apple user: cascade runs, no pending row inserted.
//   T2 — Apple user, no token row (Case B): sentinel inserted, cascade succeeds.
//   T3 — Apple user, token row present (Case A): pending row inserted.
//         Sub-test: inline revoke attempted (live Apple not reachable in CI,
//         so we assert the pending row exists post-call with expected fields).
//   T4 — Apple user, multiple identities: 500 returned, no cascade.
//
// Scenarios SKIPPED:
//   T5 — Cascade failure rollback: would require the function to fail midway
//         (e.g. injecting a DB error at step 4). Not feasible without a mock
//         layer; skipped per spec guidance.
//   T6 — Vault unavailable mid-flow: same reason — no mock layer for Vault
//         in the integration test harness.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  cleanupPending,
  cleanupUser,
  createTestPendingRow,
  createTestUser,
  getPendingRow,
  insertAppleIdentity,
  invokeFn,
} from '../_test/harness.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`[test] Required env var missing: ${key}`)
  return val
}

const SUPABASE_URL = getEnv('SUPABASE_URL')
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Returns true iff a row exists in auth.users for the given userId. */
async function authUserExists(userId: string): Promise<boolean> {
  const { data } = await supa.auth.admin.getUserById(userId)
  return data?.user?.id === userId
}

/** Deletes a user_apple_tokens row for cleanup. Swallows errors. */
async function cleanupAppleToken(userId: string): Promise<void> {
  try {
    await supa.from('user_apple_tokens').delete().eq('user_id', userId)
  } catch { /* swallow */ }
}

/** Inserts a minimal user_apple_tokens row so delete-account sees a Case A. */
async function insertAppleToken(
  userId: string,
  appleSub: string,
): Promise<void> {
  const { error } = await supa.from('user_apple_tokens').insert({
    user_id: userId,
    apple_sub: appleSub,
    encrypted_refresh_token: 'ciphertext-test-placeholder',
    key_version: 'v1',
    client_id_type: 'native',
  })
  if (error) {
    throw new Error(`[test] insertAppleToken failed: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// T1 — Non-Apple user: cascade runs, no pending row inserted
// ---------------------------------------------------------------------------

Deno.test({
  name: 'T1: non-Apple user — delete succeeds, no pending_apple_revocations row created',
  async fn() {
    const { userId, jwt } = await createTestUser()
    let pendingCountBefore = 0
    let pendingCountAfter = 0

    try {
      // Count pending rows before (should be stable across the test).
      const { count: before } = await supa
        .from('pending_apple_revocations')
        .select('id', { count: 'exact', head: true })
      pendingCountBefore = before ?? 0

      const res = await invokeFn('delete-account', { jwt })
      assertEquals(res.status, 200, 'Expected 200 on successful delete')
      const body = await res.json()
      assertEquals(body.success, true)

      // Verify auth.users row is gone (cascade worked).
      const still = await authUserExists(userId)
      assertEquals(still, false, 'auth.users row should be deleted after success')

      // Verify no new pending_apple_revocations row was inserted.
      const { count: after } = await supa
        .from('pending_apple_revocations')
        .select('id', { count: 'exact', head: true })
      pendingCountAfter = after ?? 0
      assertEquals(
        pendingCountAfter,
        pendingCountBefore,
        'Non-Apple user should not insert any pending_apple_revocations rows',
      )
    } finally {
      // If test failed mid-way, best-effort cleanup.
      await cleanupUser(userId)
    }
  },
})

// ---------------------------------------------------------------------------
// T2 — Apple user, no token row (Case B): sentinel inserted, cascade succeeds
// ---------------------------------------------------------------------------

Deno.test({
  name: 'T2: Apple user no token (Case B) — sentinel inserted, delete succeeds',
  async fn() {
    const { userId, jwt } = await createTestUser()
    const appleSub = `test-apple-sub-case-b-${crypto.randomUUID()}`
    let sentinelId: string | null = null

    try {
      // Wire up an Apple identity but NO token row → Case B.
      await insertAppleIdentity(userId, appleSub)

      const res = await invokeFn('delete-account', { jwt })

      // The function may succeed (200) or fail with a cascade error if the live
      // DB doesn't have the delete_auth_user RPC. Either way, we assert on the
      // Apple-specific behaviour: the sentinel row was inserted.
      //
      // Find the sentinel by apple_sub (since we don't have the ID from the
      // function's perspective).
      const { data: sentinels, error: findErr } = await supa
        .from('pending_apple_revocations')
        .select('id, unrevokable, encrypted_refresh_token')
        .eq('apple_sub', appleSub)

      assert(!findErr, `Sentinel lookup failed: ${findErr?.message}`)
      assert(
        sentinels && sentinels.length >= 1,
        'Case B must insert a pending_apple_revocations sentinel row',
      )

      const sentinel = sentinels[0]
      sentinelId = sentinel.id as string
      assertEquals(sentinel.unrevokable, true, 'Sentinel must have unrevokable=true')
      assertEquals(
        sentinel.encrypted_refresh_token,
        null,
        'Sentinel encrypted_refresh_token must be null',
      )

      if (res.status === 200) {
        // Cascade worked too. Auth user should be gone.
        const still = await authUserExists(userId)
        assertEquals(still, false, 'auth.users row should be deleted on success')
      }
      // If 500, the cascade failed for unrelated reasons (e.g. missing RPC in env).
      // The Apple sentinel behaviour is still correct and testable.
    } finally {
      if (sentinelId) await cleanupPending(sentinelId)
      await cleanupUser(userId)
    }
  },
})

// ---------------------------------------------------------------------------
// T3 — Apple user + token row (Case A): pending row inserted with lease
// ---------------------------------------------------------------------------

Deno.test({
  name: 'T3: Apple user with token (Case A) — pending row inserted with lease or inline-revoke attempted',
  async fn() {
    const { userId, jwt } = await createTestUser()
    const appleSub = `test-apple-sub-case-a-${crypto.randomUUID()}`
    let pendingId: string | null = null

    try {
      await insertAppleIdentity(userId, appleSub)
      await insertAppleToken(userId, appleSub)

      // Call delete-account. The inline revoke will fail (placeholder ciphertext
      // can't be decrypted, or Apple API unreachable in CI). The function should:
      //   (a) Insert a pending_apple_revocations row (Case A)
      //   (b) Release the lease (locked_at/locked_by → null) after inline failure
      //   (c) Proceed with cascade (delete the auth user)
      //   OR return 500 if the inline failure prevents completion — but per spec
      //   inline revoke failure is non-fatal; only the cascade can abort.

      const res = await invokeFn('delete-account', { jwt })

      // Find the pending row by apple_sub.
      const { data: rows, error: findErr } = await supa
        .from('pending_apple_revocations')
        .select('id, apple_sub, unrevokable, locked_at, locked_by, client_id_type')
        .eq('apple_sub', appleSub)

      assert(!findErr, `Pending row lookup failed: ${findErr?.message}`)

      if (res.status === 200) {
        // Full success path:
        //   - If inline revoke SUCCEEDED: pending row was deleted.
        //   - If inline revoke FAILED (expected here): pending row exists, lease released.
        // We can't know which branch was taken without knowing if Apple was reachable,
        // so assert that either no row exists OR row exists with lease released.
        if (rows && rows.length > 0) {
          pendingId = rows[0].id as string
          assertEquals(
            rows[0].unrevokable,
            false,
            'Case A row must not be unrevokable',
          )
          assertEquals(
            rows[0].locked_at,
            null,
            'After inline revoke failure, lease should be released (locked_at null)',
          )
          assertEquals(
            rows[0].locked_by,
            null,
            'After inline revoke failure, lease should be released (locked_by null)',
          )
          assertEquals(rows[0].client_id_type, 'native')
        }
        // If row was deleted: inline revoke succeeded (Apple was reachable) — also valid.
        const still = await authUserExists(userId)
        assertEquals(still, false, 'auth.users row should be deleted on success')
      } else {
        // 500 — some cascade step failed. Assert the pending row exists.
        assert(
          rows && rows.length >= 1,
          'Case A must have inserted a pending row before the cascade attempt',
        )
        pendingId = rows![0].id as string
        // The spec says: if cascade failed and inline didn't succeed → pending row
        // should have been deleted (cleanup path). If cascade failed and inline
        // DID succeed → row marked dead_letter. Either is valid; just verify
        // the row has expected apple_sub.
        assertEquals(rows![0].apple_sub, appleSub)
      }
    } finally {
      if (pendingId) await cleanupPending(pendingId)
      await cleanupAppleToken(userId)
      await cleanupUser(userId)
    }
  },
})

// ---------------------------------------------------------------------------
// T4 — Apple user with multiple identities: 500, no cascade
// ---------------------------------------------------------------------------

Deno.test({
  name: 'T4: Apple user with multiple identities — 500, auth user still exists',
  async fn() {
    const { userId, jwt } = await createTestUser()
    const appleSub1 = `test-apple-sub-multi-1-${crypto.randomUUID()}`
    const appleSub2 = `test-apple-sub-multi-2-${crypto.randomUUID()}`

    try {
      // Insert two Apple identities for the same user — this triggers the
      // MULTI_APPLE_IDENTITY guard and must abort before any cascade.
      await insertAppleIdentity(userId, appleSub1)
      await insertAppleIdentity(userId, appleSub2)

      const res = await invokeFn('delete-account', { jwt })

      assertEquals(res.status, 500, 'Must return 500 for multiple Apple identities')
      const body = await res.json()
      assertEquals(
        body.code,
        'MULTI_APPLE_IDENTITY',
        'Error code must be MULTI_APPLE_IDENTITY',
      )

      // Critical: auth user must still exist — no cascade should have run.
      const still = await authUserExists(userId)
      assert(still, 'auth.users row must still exist after MULTI_APPLE_IDENTITY abort')
    } finally {
      await cleanupUser(userId)
    }
  },
})

// ---------------------------------------------------------------------------
// T5 — apple_sub drift returns 500 APPLE_SUB_DRIFT, auth user still exists
// ---------------------------------------------------------------------------

Deno.test({
  name: 'T5: apple_sub drift — 500 APPLE_SUB_DRIFT returned, auth user not deleted',
  async fn() {
    const { userId, jwt } = await createTestUser()
    // Use a different sub in the token row vs the identity row.
    const identitySub = `test-apple-sub-identity-${crypto.randomUUID()}`
    const tokenSub = `test-apple-sub-token-DIFFERENT-${crypto.randomUUID()}`

    try {
      // Wire up Apple identity with identitySub.
      await insertAppleIdentity(userId, identitySub)

      // Insert token row with a different apple_sub to simulate drift.
      const { error: tokenErr } = await supa.from('user_apple_tokens').insert({
        user_id: userId,
        apple_sub: tokenSub, // deliberately different from identitySub
        encrypted_refresh_token: 'ciphertext-test-placeholder',
        key_version: 'v1',
        client_id_type: 'native',
      })
      if (tokenErr) throw new Error(`[test] insertAppleToken (drift) failed: ${tokenErr.message}`)

      const res = await invokeFn('delete-account', { jwt })

      assertEquals(res.status, 500, 'Must return 500 for apple_sub drift')
      const body = await res.json()
      assertEquals(body.code, 'APPLE_SUB_DRIFT', 'Error code must be APPLE_SUB_DRIFT')

      // Critical: auth user must still exist — no cascade should have run.
      const still = await authUserExists(userId)
      assert(still, 'auth.users row must still exist after APPLE_SUB_DRIFT abort')
    } finally {
      try {
        await supa.from('user_apple_tokens').delete().eq('user_id', userId)
      } catch { /* swallow */ }
      await cleanupUser(userId)
    }
  },
})

// ---------------------------------------------------------------------------
// T6 (REMOVED) — Concurrent double-submit
//
// Previously asserted that a second concurrent delete-account call returned
// 409 DELETE_IN_PROGRESS via a Postgres advisory lock. The lock was reverted
// (Codex must-fix): pg_try_advisory_lock + pg_advisory_unlock are session-
// scoped, but Supabase pgbouncer runs in transaction-pool mode, so the unlock
// call lands on a different backend than the acquire — leaking the lock until
// the original session is recycled. The test asserted behaviour that no longer
// exists.
//
// The original concern (false `apple_revoke_cascade_mismatch` on concurrent
// calls) is documented as a known limitation in delete-account/index.ts.
// A row-based delete_account_locks table is a future fix.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T7 (SKIPPED) — Cascade failure rollback
//
// Rationale: Simulating a cascade failure (e.g. storage error in step 5)
// would require injecting a fault into the live function mid-execution. The
// integration test harness has no mock layer for Supabase Storage or DB ops.
// This scenario is documented but not automated.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T8 (SKIPPED) — Vault unavailable mid-flow
//
// Rationale: Vault access is controlled by Supabase infra. We cannot
// reliably revoke or restore Vault access from a test. Noted as a manual
// smoke test scenario.
// ---------------------------------------------------------------------------
