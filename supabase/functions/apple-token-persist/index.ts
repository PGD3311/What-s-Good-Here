// supabase/functions/apple-token-persist/index.ts
//
// Web path for Apple refresh-token capture (Flow K in the spec).
//
// Client flow:
//   Supabase web OAuth callback → onAuthStateChange fires SIGNED_IN with
//   session.provider_refresh_token present → authApi.persistAppleRefreshToken
//   POSTs here with { provider_refresh_token } and the user's JWT in
//   Authorization.
//
// This function never calls Apple. It only encrypts + upserts. The token
// itself came from Supabase's own OAuth callback and is already validated.
//
// Auth: Bearer JWT (user JWT from Supabase). We derive user_id from claims
// and look up apple_sub from auth.identities. Client-supplied apple_sub or
// user_id is ignored.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptRefreshToken } from '../_shared/apple.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  // 1. Authenticate caller
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!jwt) return json(401, { ok: false, code: 'MISSING_JWT' });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return json(401, { ok: false, code: 'INVALID_JWT' });
  }
  const userId = userData.user.id;

  // 2. Parse body
  let body: { provider_refresh_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'MALFORMED_BODY' });
  }
  const providerRefreshToken = typeof body?.provider_refresh_token === 'string'
    ? body.provider_refresh_token
    : '';
  if (!providerRefreshToken) {
    return json(400, { ok: false, code: 'MISSING_TOKEN' });
  }

  // 3. Derive apple_sub from auth.identities (server-side only — never trust client)
  const { data: identities, error: idErr } = await supa
    .schema('auth')
    .from('identities')
    .select('provider_id, provider')
    .eq('user_id', userId)
    .eq('provider', 'apple');

  if (idErr) {
    return json(500, { ok: false, code: 'IDENTITY_LOOKUP_FAILED', transient: true });
  }
  if (!identities || identities.length === 0) {
    return json(409, { ok: false, code: 'NO_APPLE_IDENTITY' });
  }
  if (identities.length > 1) {
    // Degraded state — fail closed. Mirror apple-token-exchange behavior.
    console.error(JSON.stringify({
      event: 'apple_token_persist_multi_identity',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'MULTI_APPLE_IDENTITY' });
  }
  const appleSub = identities[0].provider_id;
  if (!appleSub) {
    console.error(JSON.stringify({
      event: 'apple_token_persist_null_provider_id',
      user_hash: await hashUserId(userId),
    }));
    return json(500, { ok: false, code: 'IDENTITY_MISSING_SUB' });
  }

  // 4. Refuse to overwrite a row whose apple_sub differs from the identity
  // we just derived — defense against account-linking edge cases where the
  // stored row drifted from auth.identities. Spec Flow K: 409 + alert.
  const { data: existing, error: existingErr } = await supa
    .from('user_apple_tokens')
    .select('apple_sub')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingErr) {
    return json(500, { ok: false, code: 'TOKEN_LOOKUP_FAILED', transient: true });
  }
  if (existing && existing.apple_sub !== appleSub) {
    console.error(JSON.stringify({
      event: 'apple_token_persist_sub_mismatch',
      user_hash: await hashUserId(userId),
    }));
    return json(409, { ok: false, code: 'APPLE_SUB_MISMATCH' });
  }

  // 5. Encrypt + upsert
  let encrypted: { ciphertext: string; keyVersion: string };
  try {
    encrypted = await encryptRefreshToken(providerRefreshToken);
  } catch {
    console.error(JSON.stringify({
      event: 'apple_token_persist_encrypt_failed',
      user_hash: await hashUserId(userId),
    }));
    return json(503, { ok: false, code: 'VAULT_UNAVAILABLE', transient: true });
  }

  // Web path — this is always client_id_type = 'web' because the refresh
  // token came from Supabase's OAuth callback using the Services ID.
  const { error: upsertErr } = await supa
    .from('user_apple_tokens')
    .upsert(
      {
        user_id: userId,
        apple_sub: appleSub,
        encrypted_refresh_token: encrypted.ciphertext,
        key_version: encrypted.keyVersion,
        client_id_type: 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (upsertErr) {
    // Structured, scrubbed — never log the raw error object (may contain query fragments).
    console.error(JSON.stringify({
      event: 'apple_token_persist_upsert_failed',
      user_hash: await hashUserId(userId),
      pg_code: (upsertErr as Record<string, unknown>)?.code ?? null,
    }));
    return json(500, { ok: false, code: 'UPSERT_FAILED', transient: true });
  }

  return json(200, { ok: true });
});

async function hashUserId(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
