#!/usr/bin/env node
/**
 * Account Deletion smoke test.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node supabase/tests/account-deletion-smoke.mjs
 *
 * Creates a throwaway target user + a follower user, seeds the target with one of each
 * data shape the delete-account Edge Function must handle (restaurant/dish they created,
 * vote, favorite, follow, follow-generated notification on the follower, restaurant_invite),
 * invokes the Edge Function with the target user's JWT, then verifies:
 *
 *   - auth user is gone
 *   - profile/votes/favorites/follows cascaded
 *   - restaurants.created_by / dishes.created_by nulled (rows survive)
 *   - restaurant_invites they created are deleted
 *   - follow-notification on the follower (with deleted user's follower_id) is gone
 *   - storage bucket is empty for the user
 *
 * Run this after deploying the Edge Function and again after any schema change that
 * adds a new FK to auth.users.
 */

import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(2)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stamp = Date.now()
const testEmail = `wgh-deletion-smoke-${stamp}@example.test`
const testPassword = `SmokeTest!${stamp}`
let testUserId = null
let secondUserId = null
let testRestaurantId = null
let testDishId = null

function h1(msg) { console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`) }
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); process.exitCode = 1 }

async function run() {
  h1('1. Create test users')
  {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail, password: testPassword, email_confirm: true,
      user_metadata: { display_name: `SmokeTest-${stamp}` },
    })
    if (error) { fail(`createUser: ${error.message}`); return }
    testUserId = data.user.id
    ok(`target user: ${testUserId}`)
  }
  {
    const { data, error } = await admin.auth.admin.createUser({
      email: `wgh-follower-${stamp}@example.test`,
      password: testPassword, email_confirm: true,
      user_metadata: { display_name: `Follower-${stamp}` },
    })
    if (error) { fail(`createUser follower: ${error.message}`); return }
    secondUserId = data.user.id
    ok(`follower user: ${secondUserId}`)
  }

  h1('2. Seed test data')
  {
    const { data, error } = await admin.from('restaurants').insert({
      name: `SmokeTestCafe-${stamp}`, town: 'Oak Bluffs', region: 'mv',
      address: '1 Smoke Test St', lat: 41.43, lng: -70.56, is_open: false,
      created_by: testUserId,
    }).select().single()
    if (error) { fail(`insert restaurant: ${error.message}`); return }
    testRestaurantId = data.id
    ok(`restaurant created_by = target: ${testRestaurantId}`)
  }
  {
    const { data, error } = await admin.from('dishes').insert({
      restaurant_id: testRestaurantId, name: `SmokeDish-${stamp}`,
      category: 'other', created_by: testUserId,
    }).select().single()
    if (error) { fail(`insert dish: ${error.message}`); return }
    testDishId = data.id
    ok(`dish created_by = target: ${testDishId}`)
  }
  {
    const { error } = await admin.from('votes').insert({
      dish_id: testDishId, user_id: testUserId, rating_10: 8, review_text: 'Smoke test review',
    })
    if (error) { fail(`insert vote: ${error.message}`); return }
    ok('vote inserted')
  }
  {
    const { error } = await admin.from('favorites').insert({ user_id: testUserId, dish_id: testDishId })
    if (error) { fail(`insert favorite: ${error.message}`); return }
    ok('favorite inserted')
  }
  {
    const { error } = await admin.from('follows').insert({
      follower_id: testUserId, followed_id: secondUserId,
    })
    if (error) { fail(`insert follow: ${error.message}`); return }
    ok('follow: target → follower')
  }
  {
    const { data } = await admin.from('notifications').select('id, data')
      .eq('user_id', secondUserId).eq('type', 'follow')
    if (!data?.length) { fail('expected follow notification on follower'); return }
    ok(`notification on follower with follower_id=${data[0].data?.follower_id}`)
  }
  {
    const { error } = await admin.from('restaurant_invites').insert({
      restaurant_id: testRestaurantId, created_by: testUserId,
    })
    if (error) { fail(`insert restaurant_invite: ${error.message}`); return }
    ok('restaurant_invite created_by = target')
  }

  h1('3. Sign in as target user')
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  let accessToken = null
  {
    const { data, error } = await userClient.auth.signInWithPassword({
      email: testEmail, password: testPassword,
    })
    if (error) { fail(`signIn: ${error.message}`); return }
    accessToken = data.session.access_token
    ok('signed in')
  }

  h1('4. Invoke delete-account Edge Function')
  {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    })
    const body = await res.json()
    if (!res.ok || !body.success) {
      fail(`delete-account returned ${res.status}: ${JSON.stringify(body)}`)
      return
    }
    ok(`delete-account → 200 { success: true }`)
  }

  h1('5. Verify deletion')
  {
    // listUsers + client-side filter (Supabase admin API doesn't expose id filter)
    let found = false
    for (let page = 1; page < 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (!data?.users?.length) break
      if (data.users.find(u => u.id === testUserId)) { found = true; break }
      if (data.users.length < 1000) break
    }
    found ? fail('auth user still exists') : ok('auth user gone')
  }
  {
    const { data } = await admin.from('profiles').select('id').eq('id', testUserId).maybeSingle()
    data ? fail('profile still exists') : ok('profile cascaded')
  }
  for (const [table, col, label] of [
    ['votes', 'user_id', 'votes cascaded'],
    ['favorites', 'user_id', 'favorites cascaded'],
    ['follows', 'follower_id', 'outgoing follows cascaded'],
  ]) {
    const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, testUserId)
    count === 0 ? ok(label) : fail(`${count} ${table} rows remain`)
  }
  {
    const { data } = await admin.from('restaurants').select('created_by').eq('id', testRestaurantId).maybeSingle()
    if (!data) fail('restaurant missing')
    else if (data.created_by === null) ok('restaurants.created_by nulled (row survived)')
    else fail('restaurants.created_by still set')
  }
  {
    const { data } = await admin.from('dishes').select('created_by').eq('id', testDishId).maybeSingle()
    if (!data) fail('dish missing')
    else if (data.created_by === null) ok('dishes.created_by nulled (row survived)')
    else fail('dishes.created_by still set')
  }
  {
    const { count } = await admin.from('restaurant_invites').select('*', { count: 'exact', head: true }).eq('created_by', testUserId)
    count === 0 ? ok('restaurant_invites deleted') : fail(`${count} invites remain`)
  }
  {
    const { data } = await admin.from('notifications').select('id, data')
      .eq('user_id', secondUserId).eq('type', 'follow')
    const surviving = (data || []).filter(n => n.data?.follower_id === testUserId)
    surviving.length === 0
      ? ok('follow notification PII cleaned from other user')
      : fail(`${surviving.length} follow notifications with deleted follower_id remain`)
  }
  {
    const { data, error } = await admin.storage.from('dish-photos').list(testUserId)
    if (error) fail(`storage list: ${error.message}`)
    else if (!data?.length) ok('storage bucket empty for user')
    else fail(`${data.length} storage objects remain`)
  }

  h1('6. Cleanup')
  {
    await admin.from('restaurants').delete().eq('id', testRestaurantId)
    await admin.auth.admin.deleteUser(secondUserId)
    ok('cleaned up follower + test restaurant')
  }
}

run().then(() => {
  if (process.exitCode) console.log('\n\x1b[31mSMOKE TEST FAILED\x1b[0m')
  else console.log('\n\x1b[32mSMOKE TEST PASSED\x1b[0m')
}).catch(e => {
  console.error('Unhandled:', e)
  process.exit(3)
})
