// supabase/functions/_test/harness.ts
//
// Shared Deno test harness for Edge Function integration tests.
// Used by B1.4 (_shared/apple.ts tests), B1.6 (apple-token-persist tests),
// and upcoming B3 tests (apple-token-exchange, apple-revocation-retry).
//
// Requires env vars at runtime (never hard-coded):
//   SUPABASE_URL              — e.g. https://vpioftosgdkyiwvhxewy.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service-role JWT (bypasses RLS)
//   SUPABASE_FUNCTIONS_URL    — optional; defaults to ${SUPABASE_URL}/functions/v1
//
// Run integration tests via:
//   deno test --allow-net --allow-env supabase/functions/<path>.test.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Module-scope service-role client — shared across all harness calls so we
// don't pay the connection overhead on every helper invocation.
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`[harness] Required env var missing: ${key}`);
  return val;
}

const SUPABASE_URL = getEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const FUNCTIONS_BASE_URL =
  Deno.env.get('SUPABASE_FUNCTIONS_URL') ?? `${SUPABASE_URL}/functions/v1`;

// Service-role client: bypasses RLS, can write auth.* tables, can call
// auth.admin.*. All harness DB operations go through this client.
const supa: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// createTestUser
// ---------------------------------------------------------------------------

/**
 * Creates a fresh Supabase auth user (email-confirmed, password-auth).
 * Returns the userId and a valid access JWT obtained via signInWithPassword.
 *
 * Email format: test+<uuid>@wgh-test.invalid
 * Password: a fixed test-only string long enough to satisfy Supabase defaults.
 */
export async function createTestUser(): Promise<{ userId: string; jwt: string }> {
  const uuid = crypto.randomUUID();
  const email = `test+${uuid}@wgh-test.invalid`;
  const password = `T3st-${uuid}-pass!`;

  // Create via admin API so we can set email_confirm = true immediately.
  const { data: createData, error: createErr } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !createData?.user) {
    throw new Error(
      `[harness] createUser failed: ${createErr?.message ?? 'no user returned'}`,
    );
  }

  const userId = createData.user.id;

  // Sign in to obtain a real access JWT. Use a throwaway client — if we
  // reused `supa` (the shared service-role client) for signInWithPassword,
  // its subsequent DB calls would travel as the user's JWT instead of the
  // service role, silently losing RLS bypass and leaking fixtures.
  const signInClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signInData, error: signInErr } = await signInClient.auth
    .signInWithPassword({ email, password });

  if (signInErr || !signInData?.session?.access_token) {
    // Best-effort cleanup before throwing so we don't leak users.
    await supa.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(
      `[harness] signInWithPassword failed after createUser: ${signInErr?.message ?? 'no session'}`,
    );
  }

  return { userId, jwt: signInData.session.access_token };
}

// ---------------------------------------------------------------------------
// insertAppleIdentity
// ---------------------------------------------------------------------------

/**
 * Inserts a row into auth.identities linking userId to an Apple provider_id
 * (appleSub). Uses the service-role client to bypass RLS.
 *
 * Schema assumptions (Supabase Postgres 15 auth.identities as of 2026-04):
 *   id            UUID NOT NULL
 *   user_id       UUID NOT NULL
 *   provider_id   TEXT NOT NULL   ← appleSub goes here
 *   provider      TEXT NOT NULL
 *   identity_data JSONB NOT NULL
 *   last_sign_in_at TIMESTAMPTZ   ← nullable in Supabase schema; supply NULL
 *   created_at    TIMESTAMPTZ
 *   updated_at    TIMESTAMPTZ
 *
 * NOTE: Supabase has evolved auth.identities across versions. If you hit a
 * "column does not exist" error the most likely culprits are:
 *   - `provider_id` renamed from `id` in older schemas (pre-2023-12)
 *   - `email` column present in some project configs (derived, not needed here)
 * If that happens, inspect the live schema:
 *   SELECT column_name, data_type FROM information_schema.columns
 *   WHERE table_schema='auth' AND table_name='identities';
 * and adjust this insert accordingly.
 */
export async function insertAppleIdentity(
  userId: string,
  appleSub: string,
): Promise<void> {
  const identityId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error } = await supa.schema('auth').from('identities').insert({
    id: identityId,
    user_id: userId,
    provider_id: appleSub,
    provider: 'apple',
    identity_data: { sub: appleSub, email: `${appleSub}@privaterelay.appleid.com` },
    last_sign_in_at: null,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw new Error(`[harness] insertAppleIdentity failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// invokeFn
// ---------------------------------------------------------------------------

/**
 * POSTs to a deployed Edge Function. Returns the raw Response so tests can
 * inspect status + body independently.
 *
 * - If opts.jwt is provided, sends `Authorization: Bearer <jwt>`.
 * - If opts.body is provided, JSON-encodes it as the request body.
 * - Always POSTs (even if body is undefined) — Edge Functions expect POST.
 */
export async function invokeFn(
  name: string,
  opts: { jwt?: string; body?: unknown } = {},
): Promise<Response> {
  const url = `${FUNCTIONS_BASE_URL}/${name}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (opts.jwt) {
    headers['Authorization'] = `Bearer ${opts.jwt}`;
  }

  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;

  return fetch(url, {
    method: 'POST',
    headers,
    body: bodyStr,
  });
}

// ---------------------------------------------------------------------------
// cleanupUser
// ---------------------------------------------------------------------------

/**
 * Deletes the test auth user. Swallows errors — cleanup must not throw and
 * abort a test's finally block.
 */
export async function cleanupUser(userId: string): Promise<void> {
  try {
    await supa.auth.admin.deleteUser(userId);
  } catch {
    // swallow — test cleanup must not throw
  }
}

// ---------------------------------------------------------------------------
// getAppleTokenRow
// ---------------------------------------------------------------------------

/**
 * Returns the user_apple_tokens row for userId, or null if none exists.
 */
export async function getAppleTokenRow(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supa
    .from('user_apple_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`[harness] getAppleTokenRow failed: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// createTestPendingRow
// ---------------------------------------------------------------------------

/**
 * Inserts a row into pending_apple_revocations and returns its UUID.
 *
 * Column semantics:
 *   apple_sub             — required; identifies the Apple user
 *   encrypted_refresh_token — ciphertext; null when unrevokable=true
 *   key_version           — 'v1' default; null when unrevokable=true
 *   client_id_type        — 'native'|'web'; null when unrevokable=true
 *   unrevokable           — sentinel flag (no token captured, audit-only)
 *   locked_at / locked_by — lease fields for FOR UPDATE SKIP LOCKED
 *   next_attempt_at       — ISO 8601 string; defaults to NOW()
 *
 * The table has a CHECK constraint:
 *   unrevokable OR (encrypted_refresh_token IS NOT NULL AND key_version IS NOT NULL AND client_id_type IS NOT NULL)
 *
 * When unrevokable=true this harness sets the three token columns to null
 * regardless of what was passed, satisfying the CHECK.
 * When unrevokable=false (default), defaults ensure the CHECK passes without
 * the caller having to supply all three columns explicitly.
 */
export async function createTestPendingRow(row: {
  apple_sub: string;
  encrypted_refresh_token?: string | null;
  key_version?: string | null;
  client_id_type?: 'native' | 'web' | null;
  unrevokable?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
  next_attempt_at?: string;
}): Promise<string> {
  const unrevokable = row.unrevokable ?? false;

  const insert: Record<string, unknown> = {
    apple_sub: row.apple_sub,
    unrevokable,
  };

  if (unrevokable) {
    // CHECK constraint: when unrevokable=true the three token columns must be
    // null (or absent). Force them regardless of caller input.
    insert.encrypted_refresh_token = null;
    insert.key_version = null;
    insert.client_id_type = null;
  } else {
    // Defaults satisfy the CHECK constraint without forcing caller to supply all.
    insert.encrypted_refresh_token = row.encrypted_refresh_token ?? 'ciphertext-placeholder';
    insert.key_version = row.key_version ?? 'v1';
    insert.client_id_type = row.client_id_type ?? 'native';
  }

  if (row.locked_at !== undefined) insert.locked_at = row.locked_at;
  if (row.locked_by !== undefined) insert.locked_by = row.locked_by;
  if (row.next_attempt_at !== undefined) insert.next_attempt_at = row.next_attempt_at;

  const { data, error } = await supa
    .from('pending_apple_revocations')
    .insert(insert)
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`[harness] createTestPendingRow failed: ${error?.message ?? 'no id returned'}`);
  }

  return data.id as string;
}

// ---------------------------------------------------------------------------
// getPendingRow
// ---------------------------------------------------------------------------

/**
 * Returns the pending_apple_revocations row for id, or null if none exists.
 */
export async function getPendingRow(
  id: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supa
    .from('pending_apple_revocations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`[harness] getPendingRow failed: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// cleanupPending
// ---------------------------------------------------------------------------

/**
 * Deletes a pending_apple_revocations row by id. Swallows errors.
 */
export async function cleanupPending(id: string): Promise<void> {
  try {
    await supa.from('pending_apple_revocations').delete().eq('id', id);
  } catch {
    // swallow — test cleanup must not throw
  }
}
