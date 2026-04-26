// supabase/functions/apple-revocation-retry/index.ts
//
// Cron-invoked worker for retrying Apple token revocations queued by
// delete-account when inline revoke failed. Uses lease_apple_revocations RPC
// with FOR UPDATE SKIP LOCKED for safe concurrent execution.
//
// Auth: service-role JWT only. Public invocation would let anyone drain
// Apple's rate limits or force revocation attempts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  AppleApiError,
  decryptRefreshToken,
  revokeToken,
} from '../_shared/apple.ts';

const MAX_ATTEMPTS = 10;
const STALE_LOCK_MS = 10 * 60 * 1000;
const BATCH_SIZE = 25;
const INSTANCE_ID = `cron:${crypto.randomUUID()}`;

const BACKOFF_MINUTES: Record<number, number> = {
  1: 15,
  2: 60,
  3: 360,
  4: 1440,
};
function backoffMinutes(attempts: number): number {
  return BACKOFF_MINUTES[attempts] ?? 1440;
}

Deno.serve(async (req) => {
  // Auth guard: caller must present the service-role JWT. Compare timing-safely.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!jwt || jwt.length !== serviceRoleKey.length) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let equal = 0;
  for (let i = 0; i < jwt.length; i++) {
    equal |= jwt.charCodeAt(i) ^ serviceRoleKey.charCodeAt(i);
  }
  if (equal !== 0) {
    return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  // Acquire leases atomically.
  const { data: leased, error: leaseErr } = await supa.rpc('lease_apple_revocations', {
    p_limit: BATCH_SIZE,
    p_instance_id: INSTANCE_ID,
    p_stale_lock_ms: STALE_LOCK_MS,
  });
  if (leaseErr) {
    console.error(JSON.stringify({
      event: 'lease_apple_revocations_failed',
      pg_code: (leaseErr as { code?: string })?.code ?? null,
    }));
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let succeeded = 0;
  let failedTransient = 0;
  let deadLettered = 0;

  for (const row of leased ?? []) {
    try {
      const refreshToken = await decryptRefreshToken(
        row.encrypted_refresh_token,
        row.key_version,
      );
      await revokeToken(refreshToken, (row.client_id_type as 'native' | 'web') ?? 'native');
      const { error: deleteErr } = await supa
        .from('pending_apple_revocations')
        .delete()
        .eq('id', row.id);
      if (deleteErr) {
        console.error(JSON.stringify({
          event: 'apple_revoke_delete_failed',
          row_id: row.id,
          pg_code: (deleteErr as { code?: string })?.code ?? null,
        }));
      } else {
        succeeded++;
        console.log(JSON.stringify({ event: 'apple_revoke_succeeded', row_id: row.id }));
      }
    } catch (err) {
      const isAppleErr = err instanceof AppleApiError;
      const status = isAppleErr ? err.status : null;
      const bodyText = isAppleErr ? err.body : '';
      const isInvalidGrant = bodyText.includes('invalid_grant');
      const isRateLimit = isAppleErr && err.status === 429;
      const isClientError = isAppleErr && err.status >= 400 && err.status < 500 && !isRateLimit;

      if (isInvalidGrant || isClientError) {
        // Apple says no — permanent. Dead-letter immediately.
        const { error: updateErr } = await supa
          .from('pending_apple_revocations')
          .update({
            dead_letter: true,
            locked_at: null,
            locked_by: null,
            last_attempt_at: new Date().toISOString(),
            attempts: row.attempts + 1,
          })
          .eq('id', row.id);
        if (updateErr) {
          console.error(JSON.stringify({
            event: 'apple_revoke_dead_letter_update_failed',
            row_id: row.id,
            pg_code: (updateErr as { code?: string })?.code ?? null,
          }));
        } else {
          deadLettered++;
          console.error(JSON.stringify({
            event: 'apple_revoke_failed_final',
            row_id: row.id,
            status,
          }));
        }
      } else {
        const newAttempts = row.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          const { error: updateErr } = await supa
            .from('pending_apple_revocations')
            .update({
              dead_letter: true,
              locked_at: null,
              locked_by: null,
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            })
            .eq('id', row.id);
          if (updateErr) {
            console.error(JSON.stringify({
              event: 'apple_revoke_max_attempts_update_failed',
              row_id: row.id,
              pg_code: (updateErr as { code?: string })?.code ?? null,
            }));
          } else {
            deadLettered++;
            console.error(JSON.stringify({
              event: 'apple_revoke_failed_final',
              row_id: row.id,
              status,
              reason: 'max_attempts',
            }));
          }
        } else {
          const nextMs = Date.now() + backoffMinutes(newAttempts) * 60_000;
          const { error: updateErr } = await supa
            .from('pending_apple_revocations')
            .update({
              attempts: newAttempts,
              next_attempt_at: new Date(nextMs).toISOString(),
              last_attempt_at: new Date().toISOString(),
              locked_at: null,
              locked_by: null,
            })
            .eq('id', row.id);
          if (updateErr) {
            console.error(JSON.stringify({
              event: 'apple_revoke_backoff_update_failed',
              row_id: row.id,
              pg_code: (updateErr as { code?: string })?.code ?? null,
            }));
          } else {
            failedTransient++;
          }
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      leased: leased?.length ?? 0,
      succeeded,
      failedTransient,
      deadLettered,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
