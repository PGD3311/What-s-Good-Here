// supabase/functions/apple-token-exchange/index.ts
//
// Native iOS path for Apple authorization_code exchange.
//
// Flow: client (authApi.signInWithApple native branch) receives authorizationCode
// from Capgo plugin. When present on ANY sign-in (not first-time only, per spec
// revision v3), client POSTs here. We exchange with Apple, verify the returned
// id_token.sub matches the stored apple_sub on auth.identities (sub binding),
// encrypt the refresh token, UPSERT into user_apple_tokens.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AppleApiError,
  decodeIdToken,
  encryptRefreshToken,
  exchangeAuthorizationCode,
} from '../_shared/apple.ts';
import { corsHeaders } from '../_shared/cors.ts';

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

const IDEMPOTENCY_WINDOW_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });

  // 1. Authenticate
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return json(req, 401, { ok: false, code: 'MISSING_JWT' });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  if (userErr || !userData.user) return json(req, 401, { ok: false, code: 'INVALID_JWT' });
  const userId = userData.user.id;

  // 2. Parse body — ignore any client-supplied apple_sub or user_id
  let body: { authorization_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, code: 'MALFORMED_BODY' });
  }
  const authorizationCode = typeof body?.authorization_code === 'string'
    ? body.authorization_code
    : '';
  if (!authorizationCode) return json(req, 400, { ok: false, code: 'MISSING_CODE' });

  // 3. Look up apple_sub from auth.identities — fail closed on degraded states
  const { data: identities, error: idErr } = await supa
    .schema('auth')
    .from('identities')
    .select('provider_id, provider')
    .eq('user_id', userId)
    .eq('provider', 'apple');
  if (idErr) return json(req, 500, { ok: false, code: 'IDENTITY_LOOKUP_FAILED', transient: true });
  if (!identities || identities.length === 0) {
    console.warn(JSON.stringify({
      event: 'apple_token_exchange_no_apple_identity',
      user_hash: await hashUserId(userId),
    }));
    return json(req, 409, { ok: false, code: 'NO_APPLE_IDENTITY' });
  }
  if (identities.length > 1) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_multi_identity',
      user_hash: await hashUserId(userId),
    }));
    return json(req, 500, { ok: false, code: 'MULTI_APPLE_IDENTITY' });
  }
  const storedAppleSub = identities[0].provider_id;
  if (!storedAppleSub) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_null_provider_id',
      user_hash: await hashUserId(userId),
    }));
    return json(req, 500, { ok: false, code: 'IDENTITY_MISSING_SUB' });
  }

  // 4. Idempotency check — same code within 60s window, keyed on the
  // dedicated code_hash + code_hash_seen_at columns (NOT updated_at, which
  // is bumped by non-exchange writes like web token re-captures).
  // Best-effort check before burning the Apple code. A rare microsecond
  // race between two concurrent requests is gracefully handled by Apple
  // itself — the second exchange returns invalid_grant → 422.
  const codeHash = await sha256Hex(authorizationCode);
  const { data: existing, error: lookupErr } = await supa
    .from('user_apple_tokens')
    .select('code_hash, code_hash_seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupErr) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_idempotency_lookup_failed',
      user_hash: await hashUserId(userId),
      pg_code: (lookupErr as { code?: string })?.code ?? null,
    }));
    return json(req, 500, { ok: false, code: 'IDEMPOTENCY_LOOKUP_FAILED', transient: true });
  }
  if (
    existing?.code_hash === codeHash &&
    existing.code_hash_seen_at &&
    Date.now() - new Date(existing.code_hash_seen_at).getTime() < IDEMPOTENCY_WINDOW_MS
  ) {
    return json(req, 409, { ok: false, code: 'DUPLICATE_CODE' });
  }

  // 5. Exchange with Apple
  let exchangeRes;
  try {
    exchangeRes = await exchangeAuthorizationCode(authorizationCode, 'native');
  } catch (err) {
    if (err instanceof AppleApiError) {
      if (err.body.includes('invalid_grant')) {
        return json(req, 422, { ok: false, code: 'APPLE_CODE_INVALID', subcode: 'apple_invalid_grant', transient: false });
      }
      if (err.body.includes('invalid_client') || err.body.includes('unauthorized_client')) {
        console.error(JSON.stringify({ event: 'apple_invalid_client', user_hash: await hashUserId(userId) }));
        return json(req, 500, { ok: false, code: 'APPLE_CONFIG', subcode: 'apple_invalid_client', transient: false });
      }
      if (err.transient) {
        return json(req, 502, { ok: false, code: 'APPLE_UNAVAILABLE', subcode: 'apple_unavailable', transient: true });
      }
      return json(req, err.status >= 400 && err.status < 500 ? err.status : 500, {
        ok: false,
        code: 'APPLE_EXCHANGE_FAILED',
        transient: false,
      });
    }
    // Non-AppleApiError thrown — likely network/TLS/DNS from fetch, treat as transient
    console.error(JSON.stringify({ event: 'apple_token_exchange_unexpected', user_hash: await hashUserId(userId) }));
    return json(req, 502, { ok: false, code: 'APPLE_EXCHANGE_FAILED', transient: true });
  }

  // 6. Apple sub binding
  let decodedSub: string;
  try {
    decodedSub = decodeIdToken(exchangeRes.idToken).sub;
  } catch {
    return json(req, 502, { ok: false, code: 'APPLE_ID_TOKEN_INVALID', transient: false });
  }
  if (decodedSub !== storedAppleSub) {
    console.error(JSON.stringify({
      event: 'apple_sub_mismatch',
      user_hash: await hashUserId(userId),
    }));
    return json(req, 403, { ok: false, code: 'AUTH_SECURITY', subcode: 'apple_sub_mismatch' });
  }

  // 7. Encrypt + upsert
  let encrypted;
  try {
    encrypted = await encryptRefreshToken(exchangeRes.refreshToken);
  } catch {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_encrypt_failed',
      user_hash: await hashUserId(userId),
    }));
    return json(req, 500, { ok: false, code: 'ENCRYPT_FAILED', transient: true });
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supa
    .from('user_apple_tokens')
    .upsert(
      {
        user_id: userId,
        apple_sub: storedAppleSub,
        encrypted_refresh_token: encrypted.ciphertext,
        key_version: encrypted.keyVersion,
        client_id_type: 'native',
        code_hash: codeHash,
        code_hash_seen_at: now,
        updated_at: now,
        last_exchange_at: now,
      },
      { onConflict: 'user_id' },
    );
  if (upsertErr) {
    console.error(JSON.stringify({
      event: 'apple_token_exchange_upsert_failed',
      user_hash: await hashUserId(userId),
      pg_code: (upsertErr as unknown as Record<string, unknown>)?.code ?? null,
    }));
    return json(req, 500, { ok: false, code: 'UPSERT_FAILED', transient: true });
  }

  return json(req, 200, { ok: true });
});

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashUserId(userId: string): Promise<string> {
  return (await sha256Hex(userId)).slice(0, 16);
}
