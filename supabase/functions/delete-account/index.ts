import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
 *   1. Verify JWT, extract user.id
 *   2. Null FK columns on tables where created_by is nullable
 *   3. Delete invite rows (restaurant_invites, curator_invites) — created_by NOT NULL
 *      AND nulling used_by would reactivate consumed tokens
 *   4. Delete follow notifications this user generated (stored in JSONB on recipient rows)
 *   5. Purge dish-photos storage bucket for this user — abort if this fails
 *   6. auth.admin.deleteUser() — cascades votes, profiles, favorites, dish_photos,
 *      follows, received notifications, jitter_*, user_rating_stats, etc.
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

    console.log(`delete-account: user ${userId} successfully deleted`)
    return json({ success: true })
  } catch (error) {
    console.error('delete-account: unexpected error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: `Internal error: ${message}` }, 500)
  }
})
