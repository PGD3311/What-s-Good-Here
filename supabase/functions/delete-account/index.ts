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

    // 2. Null nullable created_by references so rows survive the cascade
    const nullTables = [
      'restaurants',
      'dishes',
      'admins',
      'specials',
      'restaurant_managers',
      'events',
    ] as const

    for (const table of nullTables) {
      const { data, error } = await admin
        .from(table)
        .update({ created_by: null })
        .eq('created_by', userId)
        .select('id')
      if (error) {
        console.error(`delete-account: failed to null created_by on ${table}:`, error)
        return json({ error: `Failed to detach ${table}: ${error.message}` }, 500)
      }
      console.log(`delete-account: nulled created_by on ${data?.length ?? 0} ${table} rows`)
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
    async function purgeUserPhotos(): Promise<{ removed: number; error?: string }> {
      const PAGE = 1000
      let offset = 0
      let totalRemoved = 0
      while (true) {
        const { data: objects, error: listError } = await admin.storage
          .from('dish-photos')
          .list(userId, { limit: PAGE, offset })
        if (listError) {
          return { removed: totalRemoved, error: `Storage list failed: ${listError.message}` }
        }
        if (!objects || objects.length === 0) break

        const paths = objects.map((o) => `${userId}/${o.name}`)
        const { error: removeError } = await admin.storage
          .from('dish-photos')
          .remove(paths)
        if (removeError) {
          return { removed: totalRemoved, error: `Storage remove failed: ${removeError.message}` }
        }
        totalRemoved += paths.length

        // If we got a full page, there may be more. Otherwise we're done.
        if (objects.length < PAGE) break
        offset += PAGE
      }
      return { removed: totalRemoved }
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
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('delete-account: auth.admin.deleteUser failed:', deleteError)
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
