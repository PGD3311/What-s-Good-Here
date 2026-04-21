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

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestUser,
  insertAppleIdentity,
  invokeFn,
  cleanupUser,
  getAppleTokenRow,
} from '../_test/harness.ts';

Deno.test('happy path: JWT + Apple identity + token → 200, row upserted', async () => {
  const { userId, jwt } = await createTestUser();
  const appleSub = `0001.${crypto.randomUUID()}.000`;
  await insertAppleIdentity(userId, appleSub);
  try {
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
  } finally {
    await cleanupUser(userId);
  }
});

Deno.test('user without Apple identity → 409 NO_APPLE_IDENTITY', async () => {
  const { userId, jwt } = await createTestUser();
  // deliberately NO insertAppleIdentity
  try {
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

Deno.test('idempotent: second call upserts in place, same user row', async () => {
  const { userId, jwt } = await createTestUser();
  const appleSub = `0001.${crypto.randomUUID()}.idem`;
  await insertAppleIdentity(userId, appleSub);
  try {
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
  const oldSub = `0001.${crypto.randomUUID()}.old`;
  const newSub = `0001.${crypto.randomUUID()}.new`;
  await insertAppleIdentity(userId, oldSub);
  try {
    // First write — establishes the row with oldSub.
    const r1 = await invokeFn('apple-token-persist', {
      jwt,
      body: { provider_refresh_token: 'rt.old' },
    });
    assertEquals(r1.status, 200);

    // Swap the identity: delete the old row, insert a new one with newSub.
    // Harness doesn't expose deleteIdentity — do it inline via service-role.
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    await admin.schema('auth').from('identities').delete()
      .eq('user_id', userId).eq('provider', 'apple');
    await insertAppleIdentity(userId, newSub);

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
