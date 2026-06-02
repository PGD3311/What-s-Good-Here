// supabase/functions/apple-token-persist/index.test.ts
//
// Integration tests for apple-token-persist. Require live Supabase:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the apple_encryption_master_key_v1
// Vault secret populated. Run with:
//
//   deno test --allow-net --allow-env supabase/functions/apple-token-persist/
//
// Tests that don't hit Vault (400/401/409 paths) succeed without credentials
// as long as the Edge Function is deployed and SUPABASE_URL is reachable.
//
// DB-error paths (IDENTITY_LOOKUP_FAILED, TOKEN_LOOKUP_FAILED, UPSERT_FAILED)
// require fault injection and are not covered by integration tests. If the
// handler is ever refactored to accept injected dependencies, add unit tests
// driving those branches directly. For now they're exercised implicitly by
// the live Postgres error channel.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  createTestUser,
  insertAppleIdentity,
  invokeFn,
  cleanupUser,
  getAppleTokenRow,
} from '../_test/harness.ts';

// Service-role admin client for test-only operations the harness doesn't expose
// (identity deletion, direct auth.identities inserts with null provider_id).
function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

Deno.test('happy path: JWT + Apple identity + token → 200, row upserted', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    const appleSub = `0001.${crypto.randomUUID()}.000`;
    await insertAppleIdentity(userId, appleSub);

    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.happy-path' },
    });
    assertEquals(res.status, 200);
    const row = await getAppleTokenRow(userId);
    assert(row, 'row was written');
    assertEquals(row!.apple_sub, appleSub);
    assertEquals(row!.client_id_type, 'web');
    assert(typeof row!.encrypted_refresh_token === 'string' && (row!.encrypted_refresh_token as string).length > 0);
    assertEquals(row!.key_version, 'v1');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('missing Authorization header → 401 MISSING_JWT', async () => {
  const res = await invokeFn('apple-token-persist', {
    body: { provider_refresh_token: 'rt.x' },
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'MISSING_JWT');
});

Deno.test('invalid JWT → 401 INVALID_JWT', async () => {
  const res = await invokeFn('apple-token-persist', {
    jwt: 'not.a.valid.jwt',
    body: { provider_refresh_token: 'rt.x' },
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'INVALID_JWT');
});

Deno.test('missing provider_refresh_token → 400 MISSING_TOKEN', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    const res = await invokeFn('apple-token-persist', { jwt, body: {} });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, 'MISSING_TOKEN');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('malformed JSON body → 400 MALFORMED_BODY', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    // invokeFn JSON-encodes, so bypass it with raw fetch
    const url = `${Deno.env.get('SUPABASE_FUNCTIONS_URL') ?? Deno.env.get('SUPABASE_URL') + '/functions/v1'}/apple-token-persist`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: '{not-json',
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.code, 'MALFORMED_BODY');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('user without Apple identity → 409 NO_APPLE_IDENTITY', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    // deliberately NO insertAppleIdentity
    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.x' },
    });
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(body.code, 'NO_APPLE_IDENTITY');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('multi Apple identity rows → 500 MULTI_APPLE_IDENTITY', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    // Insert two rows for the same user with provider='apple'. This is a
    // degraded state Supabase should prevent but the function fails closed.
    await insertAppleIdentity(userId, `0001.${crypto.randomUUID()}.dup1`);
    await insertAppleIdentity(userId, `0001.${crypto.randomUUID()}.dup2`);

    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.x' },
    });
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.code, 'MULTI_APPLE_IDENTITY');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('Apple identity with null provider_id → 500 IDENTITY_MISSING_SUB', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    // Insert directly with provider_id = NULL to force the degraded branch.
    // This bypasses harness.insertAppleIdentity which requires an appleSub.
    const admin = adminClient();
    const now = new Date().toISOString();
    const { error: idErr } = await admin.schema('auth').from('identities').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      provider_id: null,
      provider: 'apple',
      identity_data: { sub: null },
      last_sign_in_at: null,
      created_at: now,
      updated_at: now,
    });
    if (idErr) {
      // Some Supabase versions have a NOT NULL constraint on provider_id. If
      // the insert fails, skip the test — the branch is unreachable in that
      // configuration.
      console.warn(`skipping IDENTITY_MISSING_SUB test — insert rejected: ${idErr.message}`);
      return;
    }

    const res = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.x' },
    });
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.code, 'IDENTITY_MISSING_SUB');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('idempotent: second call upserts in place, same user row', async () => {
  const { userId, jwt } = await createTestUser();
  try {
    const appleSub = `0001.${crypto.randomUUID()}.idem`;
    await insertAppleIdentity(userId, appleSub);

    const r1 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.first' },
    });
    assertEquals(r1.status, 200);
    const row1 = await getAppleTokenRow(userId);
    const first = row1!.encrypted_refresh_token as string;

    const r2 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.second' },
    });
    assertEquals(r2.status, 200);
    const row2 = await getAppleTokenRow(userId);
    const second = row2!.encrypted_refresh_token as string;

    assert(first !== second, 'ciphertext changed on second write (fresh IV)');
    assertEquals(row2!.apple_sub, appleSub);
    assertEquals(row2!.client_id_type, 'web');
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('APPLE_SUB_MISMATCH: existing row with different apple_sub → 409', async () => {
  // Simulate account-linking drift: row in user_apple_tokens has apple_sub A,
  // but auth.identities now says apple_sub B. Function must refuse to overwrite.
  const { userId, jwt } = await createTestUser();
  try {
    const oldSub = `0001.${crypto.randomUUID()}.old`;
    const newSub = `0001.${crypto.randomUUID()}.new`;
    await insertAppleIdentity(userId, oldSub);

    // First write — establishes the row with oldSub.
    const r1 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.old' },
    });
    assertEquals(r1.status, 200);

    // Swap the identity: delete the old row, insert a new one with newSub.
    const admin = adminClient();
    const { error: delErr } = await admin
      .schema('auth')
      .from('identities')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'apple');
    assert(!delErr, `identity delete must succeed: ${delErr?.message}`);
    await insertAppleIdentity(userId, newSub);

    // Sanity — exactly one Apple identity row for this user.
    const { data: idsAfter, error: countErr } = await admin
      .schema('auth')
      .from('identities')
      .select('provider_id')
      .eq('user_id', userId)
      .eq('provider', 'apple');
    assert(!countErr, `identity count query failed: ${countErr?.message}`);
    assertEquals(idsAfter?.length, 1);
    assertEquals(idsAfter?.[0].provider_id, newSub);

    // Second write — should 409 because user_apple_tokens row still has oldSub.
    const r2 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.new' },
    });
    assertEquals(r2.status, 409);
    const body = await r2.json();
    assertEquals(body.code, 'APPLE_SUB_MISMATCH');

    // Verify the row wasn't mutated.
    const row = await getAppleTokenRow(userId);
    assertEquals(row!.apple_sub, oldSub);
  } finally {
    await cleanupUser(userId);
  }
});
