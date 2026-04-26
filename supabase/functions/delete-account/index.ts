import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AppleApiError, decryptRefreshToken, revokeToken } from '../_shared/apple.ts'

// deno-lint-ignore no-explicit-any
type AdminClient = SupabaseClient<any, any, any>

/**
 * Account Deletion Edge Function
 *
 * Apple App Store Guideline 5.1.1(v): apps that support account creation
 * must offer in-app account deletion.
 *
 * Auth: Bearer JWT of the user requesting deletion
 *
 * POST /functions/v1/delete-account
 * Response: { success: true } | { error: "...", code?: "..." }
 *
 * Order of operations (abort on any destructive failure before auth delete):
 *   1.   Verify JWT, extract user.id
 *   1.5  Apple revocation pre-cascade (B3.6): look up Apple identity, insert
 *        pending_apple_revocations row (Case A or B), attempt inline revoke.
 *   2.   Null FK columns on tables where created_by is nullable
 *   3.   Delete invite rows (restaurant_invites, curator_invites) — created_by NOT NULL
 *        AND nulling used_by would reactivate consumed tokens
 *   4.   Delete follow notifications this user generated (stored in JSONB on recipient rows)
 *   5.   Purge dish-photos storage bucket for this user — abort if this fails
 *   6.   auth.admin.deleteUser() — cascades votes, profiles, favorites, dish_photos,
 *        follows, received notifications, jitter_*, user_rating_stats, etc.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Verify caller's JWT with anon client
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const userId = user.id
    console.log(`delete-account: starting deletion for user ${userId}`)

    // Service-role client bypasses RLS for destructive operations
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    // -----------------------------------------------------------------------
    // Concurrent double-submit limitation: two simultaneous delete-account calls
    // for the same user can both run to completion. The "loser" (whose cascade
    // runs after the user is already deleted) may log a false
    // `apple_revoke_cascade_mismatch` audit event. Recoverable via cron retry +
    // dead_letter eventual cleanup. Lower-probability than user double-click,
    // upper-bound risk is noisy logs, not data corruption.
    //
    // A previous attempt used pg_advisory_lock — REVERTED because it leaks under
    // pgbouncer's transaction-pool mode (the unlock call lands on a different
    // backend session than the lock acquire). Session-scoped advisory locks
    // require a single transaction context, which we don't have here.
    //
    // Future fix (B4 or later): row-based lock in a `delete_account_locks`
    // table with TTL — atomic INSERT...ON CONFLICT, DELETE on completion,
    // stale-row cleanup at the start of each call.
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // 1.5  Apple Revocation Pre-Cascade (B3.6 — Plan B Flow F)
    //
    // Goals:
    //   Case A: Token row exists → insert pending row (already leased), attempt
    //           inline revoke, fall through to cascade.
    //   Case B: No token row   → insert unrevokable sentinel for audit, fall
    //           through to cascade.
    //   Non-Apple user          → skip entirely, no pending row inserted.
    //
    // Two state variables thread through the remainder of this function and
    // control post-cascade and cascade-failure cleanup:
    //   pendingRowId        — id of the pending_apple_revocations row we inserted,
    //                         or null if no Apple identity was found.
    //   inlineRevokeSucceeded — true iff we successfully called revokeToken()
    //                           before the cascade. Used to decide what to do with
    //                           the pending row if the cascade later fails.
    // -----------------------------------------------------------------------

    let pendingRowId: string | null = null
    let inlineRevokeSucceeded = false

    {
      // Look up Apple identities for this user. Fail closed — don't proceed
      // with deletion if we can't determine Apple state.
      const { data: appleIdentities, error: appleIdErr } = await admin
        .schema('auth')
        .from('identities')
        .select('provider_id')
        .eq('user_id', userId)
        .eq('provider', 'apple')

      if (appleIdErr) {
        return json({ error: 'Identity lookup failed', code: 'IDENTITY_LOOKUP_FAILED' }, 500)
      }

      if (appleIdentities && appleIdentities.length > 0) {
        if (appleIdentities.length > 1) {
          console.error(JSON.stringify({
            event: 'delete_account_multi_apple_identity',
            user_hash: await hashUserId(userId),
          }))
          return json({ error: 'Multiple Apple identities', code: 'MULTI_APPLE_IDENTITY' }, 500)
        }

        const appleSub = appleIdentities[0].provider_id
        if (!appleSub) {
          console.error(JSON.stringify({
            event: 'delete_account_null_provider_id',
            user_hash: await hashUserId(userId),
          }))
          return json({ error: 'Apple identity missing sub', code: 'IDENTITY_MISSING_SUB' }, 500)
        }

        // Check for existing token row (determines Case A vs Case B).
        // Fail closed — a transient DB error here must NOT fall through to
        // Case B: a real Apple user would be marked unrevokable. Return 500
        // so the client can retry.
        const { data: tokenRow, error: tokenLookupErr } = await admin
          .from('user_apple_tokens')
          .select('apple_sub, encrypted_refresh_token, key_version, client_id_type')
          .eq('user_id', userId)
          .maybeSingle()

        if (tokenLookupErr) {
          console.error(JSON.stringify({
            event: 'delete_account_token_lookup_failed',
            user_hash: await hashUserId(userId),
            pg_code: (tokenLookupErr as { code?: string })?.code ?? null,
          }))
          return json({ error: 'Token lookup failed', code: 'TOKEN_LOOKUP_FAILED' }, 500)
        }

        const requestId = crypto.randomUUID()
        const leaseHolder = `delete-account:${requestId}`

        if (tokenRow) {
          // ----------------------------------------------------------------
          // Case A — token row exists.
          // Insert a pending row already-leased to block the cron from
          // attempting a duplicate revoke while we do our inline attempt.
          // ----------------------------------------------------------------
          if (!tokenRow.client_id_type) {
            console.error(JSON.stringify({
              event: 'delete_account_token_missing_client_id_type',
              user_hash: await hashUserId(userId),
            }))
            return json({ error: 'Token row corrupt', code: 'TOKEN_ROW_CORRUPT' }, 500)
          }

          // Important #4 — Sub-binding guard: token row apple_sub must match
          // the apple_sub from auth.identities. Drift here indicates data
          // corruption or a manual edit — fail closed to avoid revoking the
          // wrong Apple account.
          if (tokenRow.apple_sub !== appleSub) {
            console.error(JSON.stringify({
              event: 'delete_account_apple_sub_drift',
              user_hash: await hashUserId(userId),
            }))
            return json({ error: 'Apple sub mismatch', code: 'APPLE_SUB_DRIFT' }, 500)
          }

          const { error: insertErr, data: pendingRow } = await admin
            .from('pending_apple_revocations')
            .insert({
              apple_sub: appleSub,
              encrypted_refresh_token: tokenRow.encrypted_refresh_token,
              key_version: tokenRow.key_version,
              client_id_type: tokenRow.client_id_type,
              locked_at: new Date().toISOString(),
              locked_by: leaseHolder,
              next_attempt_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (insertErr || !pendingRow) {
            return json({ error: 'Delete queue insert failed', code: 'DELETE_QUEUE_FAILED' }, 500)
          }
          pendingRowId = pendingRow.id

          // Attempt inline revoke while we hold the lease.
          // Critical #2: the lease is NOT released on failure here. It stays
          // held through the cascade. This prevents the cron from picking up
          // the row mid-cascade and revoking while we're still working.
          // The lease is released or the row is updated in the post-cascade
          // cleanup branches below.
          try {
            const refreshToken = await decryptRefreshToken(
              tokenRow.encrypted_refresh_token,
              tokenRow.key_version,
            )
            await revokeToken(refreshToken, tokenRow.client_id_type as 'native' | 'web')
            inlineRevokeSucceeded = true
            // Don't delete pendingRow yet — wait until cascade succeeds.
            console.log(JSON.stringify({
              event: 'apple_revoke_inline_success',
              user_hash: await hashUserId(userId),
            }))
          } catch (err) {
            console.warn(JSON.stringify({
              event: 'apple_revoke_inline_failed',
              user_hash: await hashUserId(userId),
              status: err instanceof AppleApiError ? err.status : null,
            }))
            // Lease stays HELD through cascade. Released or repurposed in the
            // post-cascade cleanup branches below — preventing cron from picking
            // up this row mid-cascade and revoking while we're still working.
          }
        } else {
          // ----------------------------------------------------------------
          // Case B — no token row. The user authenticated with Apple but we
          // never persisted a refresh token (e.g. web-only sign-in, B1 not
          // yet deployed when they first signed in). Insert an unrevokable
          // sentinel so the deletion audit trail is complete.
          // ----------------------------------------------------------------
          const { error: sentinelErr, data: sentinel } = await admin
            .from('pending_apple_revocations')
            .insert({
              apple_sub: appleSub,
              unrevokable: true,
              encrypted_refresh_token: null,
              key_version: null,
              client_id_type: null,
            })
            .select('id')
            .single()

          if (sentinelErr || !sentinel) {
            return json({ error: 'Sentinel insert failed', code: 'DELETE_QUEUE_FAILED' }, 500)
          }
          pendingRowId = sentinel.id
          console.log(JSON.stringify({
            event: 'apple_revoke_unrevokable',
            user_hash: await hashUserId(userId),
          }))
        }
      }
      // Non-Apple user: pendingRowId stays null, inlineRevokeSucceeded stays false.
    }

    // -----------------------------------------------------------------------
    // Steps 2–7 wrapped so we can clean up the pending Apple row on failure.
    //
    // runCascade() returns:
    //   null       → cascade succeeded
    //   Response   → cascade failed; this response should be returned to client
    //                (after Apple cleanup)
    // -----------------------------------------------------------------------
    const cascadeResult = await runCascade(admin, userId)

    if (cascadeResult !== null) {
      // Cascade failed — clean up the pending Apple row.
      // Critical #2: handle all 4 outcomes explicitly with lease release.
      if (pendingRowId !== null) {
        if (!inlineRevokeSucceeded) {
          // Inline revoke didn't happen AND cascade failed → drop the queued row.
          // The account still exists, nothing was unrecoverably mutated on Apple's
          // side. Remove so cron doesn't attempt a revoke for a still-live account.
          const { error: cleanupErr } = await admin
            .from('pending_apple_revocations')
            .delete()
            .eq('id', pendingRowId)
          if (cleanupErr) {
            console.error(JSON.stringify({
              event: 'apple_pending_cleanup_failed',
              branch: 'cascade_failure_no_inline',
              user_hash: await hashUserId(userId),
              error: cleanupErr.message,
            }))
          }
        } else {
          // Apple revoked but cascade failed → mark dead_letter, release lease,
          // audit. Account still exists but Apple consent is gone.
          const { error: cleanupErr } = await admin
            .from('pending_apple_revocations')
            .update({ dead_letter: true, locked_at: null, locked_by: null })
            .eq('id', pendingRowId)
          if (cleanupErr) {
            console.error(JSON.stringify({
              event: 'apple_pending_cleanup_failed',
              branch: 'cascade_failure_inline_succeeded',
              user_hash: await hashUserId(userId),
              error: cleanupErr.message,
            }))
          }
          console.error(JSON.stringify({
            event: 'apple_revoke_cascade_mismatch',
            user_hash: await hashUserId(userId),
          }))
        }
      }
      return cascadeResult
    }

    // Cascade succeeded. Critical #2: handle all outcomes with explicit lease release.
    if (pendingRowId !== null) {
      if (inlineRevokeSucceeded) {
        // Revoked AND cascade succeeded → drop the row. Nothing left for cron.
        const { error: cleanupErr } = await admin
          .from('pending_apple_revocations')
          .delete()
          .eq('id', pendingRowId)
        if (cleanupErr) {
          console.error(JSON.stringify({
            event: 'apple_pending_cleanup_failed',
            branch: 'success_inline',
            user_hash: await hashUserId(userId),
            error: cleanupErr.message,
          }))
        }
      } else {
        // Inline revoke failed but cascade succeeded → release lease and schedule
        // immediate retry. Cron picks up on next tick.
        const { error: cleanupErr } = await admin
          .from('pending_apple_revocations')
          .update({
            locked_at: null,
            locked_by: null,
            next_attempt_at: new Date().toISOString(),
          })
          .eq('id', pendingRowId)
        if (cleanupErr) {
          console.error(JSON.stringify({
            event: 'apple_pending_cleanup_failed',
            branch: 'success_no_inline',
            user_hash: await hashUserId(userId),
            error: cleanupErr.message,
          }))
        }
      }
    }
    // If pendingRowId === null: non-Apple user or unrevokable sentinel (Case B).
    // Case B sentinel is intentionally left in place for audit.

    console.log(`delete-account: user ${userId} successfully deleted`)
    return json({ success: true })
  } catch (error) {
    console.error('delete-account: unexpected error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: `Internal error: ${message}` }, 500)
  }
})

// ---------------------------------------------------------------------------
// runCascade — steps 2-7, extracted so cascade failures can be detected and
// the Apple pending row cleaned up before returning the error response.
//
// Returns null on success; returns a Response on failure.
// ---------------------------------------------------------------------------

async function runCascade(
  admin: AdminClient,
  userId: string,
): Promise<Response | null> {
  // 2. Null nullable FKs that reference auth.users so rows survive the cascade.
  //    If `optional: true`, skip the table gracefully when it doesn't exist in this
  //    environment — lets the function keep working when schema.sql and prod drift.
  const nullOps: Array<{ table: string; column: string; optional?: boolean }> = [
    { table: 'restaurants', column: 'created_by' },
    { table: 'dishes', column: 'created_by' },
    { table: 'admins', column: 'created_by' },
    { table: 'specials', column: 'created_by' },
    { table: 'restaurant_managers', column: 'created_by' },
    { table: 'events', column: 'created_by' },
    // dish_suggestions.reviewed_by → auth.users (NO ACTION). Without nulling,
    // auth.admin.deleteUser fails with "Database error deleting user" if this
    // admin has ever reviewed a submission. Table is on the live DB but not
    // yet in supabase/schema.sql — marked optional so rebuilds from schema.sql
    // don't 500 until the drift is reconciled.
    { table: 'dish_suggestions', column: 'reviewed_by', optional: true },
  ]

  for (const { table, column, optional } of nullOps) {
    const { data, error } = await admin
      .from(table)
      .update({ [column]: null })
      .eq(column, userId)
      .select('id')
    if (error) {
      // PostgREST returns code 'PGRST205' / '42P01' when the relation doesn't exist.
      // For optional tables, treat that as "not in this environment" and continue.
      const isMissingRelation =
        optional && (error.code === '42P01' || error.code === 'PGRST205' ||
          /relation .* does not exist/i.test(error.message || ''))
      if (isMissingRelation) {
        console.log(`delete-account: ${table} not present in this environment — skipping`)
        continue
      }
      console.error(`delete-account: failed to null ${table}.${column}:`, error)
      return json({ error: `Failed to detach ${table}.${column}: ${error.message}` }, 500)
    }
    console.log(`delete-account: nulled ${data?.length ?? 0} ${table}.${column} rows`)
  }

  // 3. Delete invite rows
  //    restaurant_invites.created_by is NOT NULL (schema.sql:260) — must delete
  //    Nulling used_by would reactivate a consumed token (validate/accept checks used_by IS NOT NULL),
  //    so deletion is the only safe option on either side
  const inviteTables: Array<[string, string]> = [
    ['restaurant_invites', 'created_by'],
    ['restaurant_invites', 'used_by'],
    ['curator_invites', 'created_by'],
    ['curator_invites', 'used_by'],
  ]

  for (const [table, column] of inviteTables) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .eq(column, userId)
      .select('id')
    if (error) {
      console.error(`delete-account: failed to delete from ${table} by ${column}:`, error)
      return json({ error: `Failed to clean ${table}.${column}: ${error.message}` }, 500)
    }
    console.log(`delete-account: deleted ${data?.length ?? 0} ${table} rows by ${column}`)
  }

  // 4. Clean follow notifications this user sent.
  //    schema.sql:1815 — notify_on_follow trigger inserts a row on the recipient with
  //    follower_id + follower_name in data JSONB. These rows belong to the recipient and
  //    do not cascade. ABORT on failure — leaving them keeps PII of the deleted user
  //    visible on other users' notification feeds.
  {
    const { data, error } = await admin
      .from('notifications')
      .delete()
      .eq('type', 'follow')
      .eq('data->>follower_id', userId)
      .select('id')
    if (error) {
      console.error('delete-account: follow notification cleanup failed:', error)
      return json({ error: `Notification cleanup failed: ${error.message}` }, 500)
    }
    console.log(`delete-account: deleted ${data?.length ?? 0} follow notifications`)
  }

  // 5. Purge dish-photos storage bucket for this user.
  //    Path convention: dish-photos/<user_id>/<dish_id>.<ext> (flat, see dishPhotosApi.js:66)
  //    ABORT on failure — orphan public photos would defeat the privacy intent.
  //    Paginate list() — default limit is 100, so a user with 100+ photos would otherwise leak.
  //    IMPORTANT: do NOT advance `offset` between iterations. We're deleting objects
  //    between list calls, so the remaining objects shift toward offset 0. Always read
  //    from offset 0 and stop when the listing is empty. A safety cap prevents an
  //    infinite loop if remove() ever silently no-ops.
  async function purgeUserPhotos(): Promise<{ removed: number; error?: string }> {
    const PAGE = 1000
    const MAX_ITERATIONS = 1000 // safety cap: up to 1M photos per user
    let totalRemoved = 0
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const { data: objects, error: listError } = await admin.storage
        .from('dish-photos')
        .list(userId, { limit: PAGE, offset: 0 })
      if (listError) {
        return { removed: totalRemoved, error: `Storage list failed: ${listError.message}` }
      }
      if (!objects || objects.length === 0) {
        return { removed: totalRemoved }
      }

      const paths = objects.map((o) => `${userId}/${o.name}`)
      const { error: removeError } = await admin.storage
        .from('dish-photos')
        .remove(paths)
      if (removeError) {
        return { removed: totalRemoved, error: `Storage remove failed: ${removeError.message}` }
      }
      totalRemoved += paths.length
    }
    return {
      removed: totalRemoved,
      error: `Storage purge exceeded ${MAX_ITERATIONS} pages — aborting`,
    }
  }

  {
    const result = await purgeUserPhotos()
    if (result.error) {
      console.error(`delete-account: ${result.error}`)
      return json({ error: result.error }, 500)
    }
    console.log(`delete-account: removed ${result.removed} photo(s) from storage (pre-auth-delete)`)
  }

  // 6. Delete the auth user. Cascades per schema:
  //    profiles, votes, favorites, dish_photos, follows (both directions),
  //    notifications received, user_rating_stats, bias_events, user_badges,
  //    restaurant_managers, rate_limits, jitter_profiles, jitter_samples, local_lists
  //
  //    We call the SECURITY DEFINER `public.delete_auth_user` SQL function instead of
  //    `supabase.auth.admin.deleteUser()`. The admin API was returning a 500
  //    "Database error deleting user" for users with certain FK dependencies (e.g.
  //    rows in the `follows` table), while raw `DELETE FROM auth.users` works fine.
  //    The SQL function is service-role-only and simply runs the DELETE that the
  //    admin API's underlying code would have run, avoiding the broken wrapper.
  const { error: deleteError } = await admin.rpc('delete_auth_user', { p_user_id: userId })
  if (deleteError) {
    console.error('delete-account: delete_auth_user RPC failed:', deleteError)
    return json({ error: `Account deletion failed: ${deleteError.message}` }, 500)
  }

  // 7. Final re-purge after auth delete closes the race window where a concurrent upload
  //    between step 5 and step 6 could have landed in Storage. After auth.admin.deleteUser
  //    succeeds, no new uploads are possible (dish_photos INSERT fails on FK, and the user's
  //    JWT references a nonexistent sub), so whatever's there now is everything.
  //    Non-fatal: account deletion already succeeded. Any remaining orphan is visible in logs
  //    and can be cleaned up manually.
  {
    const result = await purgeUserPhotos()
    if (result.error) {
      console.error(`delete-account: post-delete re-purge failed (orphans possible): ${result.error}`)
    } else if (result.removed > 0) {
      console.log(`delete-account: removed ${result.removed} straggler photo(s) post-delete`)
    }
  }

  return null // success
}

// ---------------------------------------------------------------------------
// hashUserId — one-way hash for structured log events.
// We never log raw user IDs in structured events so logs can be shipped to
// third-party aggregators without PII exposure. First 16 hex chars of SHA-256.
// ---------------------------------------------------------------------------

async function hashUserId(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

