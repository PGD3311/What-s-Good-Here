# H1 — Account Deletion Flow

**Status:** Ready to implement (revised 2026-04-13 after Codex pressure-test)
**Effort:** 14-19h
**Apple rule:** Guideline 5.1.1(v) — hard gate
**Source audit:** Codex gpt-5.4 xhigh (initial spec) + Codex gpt-5.4 high (pressure-test). See `wgh-phone#151`.

> **Revision notes:** First draft had several wrong assumptions about schema constraints, API patterns, and what cascades on auth delete. This revision incorporates Codex's pressure-test findings. See the "Revision log" at the bottom.

---

## Goal

Ship an in-app account deletion flow so users can permanently delete their account and all personal data without contacting support. Apple auto-rejects apps with account creation that lack this. Also valuable for PWA (GDPR + user trust).

## Non-goals

- Soft-delete / "deactivate" option. Apple wants hard-delete.
- Account recovery after deletion. One-way door.
- Restaurant-manager-specific deletion flow (just make sure managers can delete).
- Export-before-delete (data portability is a separate feature, not blocking).
- Audit log of deletions beyond standard Supabase Auth logs.

## Approach

Four concerns:

1. **Backend**: Supabase Edge Function `delete-account` runs with service-role key. Authenticates caller from JWT, handles FK blockers (mixing null + delete per column nullability), purges dish-photos Storage bucket, cleans follow notifications, calls `auth.admin.deleteUser()`.
2. **Frontend**: New "Delete Account" section on `/profile`. Typed-"DELETE" confirmation modal matching `LoginModal` shell. Loading state. Error state. Post-delete signOut via AuthContext + React Query cache clear + navigate home + toast.
3. **Copy**: Fix two "contact us" references in `Privacy.jsx` (lines 123-126 AND 133-137). Update "Last updated" date. Update Privacy operator line.
4. **QA**: End-to-end on normal user, restaurant-manager user. Verify storage purge, verify session invalidation, verify no orphan photos on failure path.

---

## Backend — Edge Function `delete-account`

### File
`supabase/functions/delete-account/index.ts`

### Reference pattern
Use `supabase/functions/backfill-restaurants/index.ts:133` as the model for authenticated Edge Functions (not `discover-restaurants`, which is service-role-only with no JWT check). Match repo conventions: `console.log` / `console.error` for logging (Edge Functions do NOT use the app's `logger`).

### Request
- Method: `POST`
- Auth: Bearer JWT (from `supabase.auth.getSession()` on client)
- Body: none (user derives from JWT)

### Response
```json
{ "success": true }
// or
{ "error": "...", "code": "..." }
```

### Logic (in order)

1. **Parse + validate JWT.** Use `createClient` with ANON key to verify JWT. Get `user.id`. If missing/invalid, return 401.

2. **Create service-role client.** `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — this client bypasses RLS. All destructive operations use this client.

3. **Handle FK blockers per table (nullable vs NOT NULL):**

   **Null the column (column is nullable):**
   - `restaurants.created_by` → UPDATE SET NULL
   - `dishes.created_by` → UPDATE SET NULL
   - `admins.created_by` → UPDATE SET NULL
   - `specials.created_by` → UPDATE SET NULL
   - `restaurant_managers.created_by` → UPDATE SET NULL
   - `events.created_by` → UPDATE SET NULL

   **Delete the row (column is NOT NULL, or nulling creates a security bug):**
   - `restaurant_invites` where `created_by = user_id` → DELETE (column is NOT NULL per schema.sql:256)
   - `restaurant_invites` where `used_by = user_id` → DELETE (nulling `used_by` reactivates consumed tokens — validate/accept only checks `used_by IS NOT NULL`, schema.sql:1800)
   - `curator_invites` where `created_by = user_id` → DELETE (same NOT NULL + reactivation concern)
   - `curator_invites` where `used_by = user_id` → DELETE (same reactivation concern)

   Log row counts per table.

4. **Clean follow notifications SENT by this user.** These don't cascade — the notification row belongs to the recipient, with sender info in JSONB:
   ```sql
   DELETE FROM notifications
   WHERE type = 'new_follower'
   AND (data->>'follower_id') = user_id::text;
   ```
   Reference: `schema.sql:1872` (notify_on_follow trigger) + `NotificationBell.jsx:95` (UI reads from data JSON).

5. **List + delete Storage objects.** Dish photos live at `dish-photos/<user.id>/<dishId>.<ext>` — flat directory, no nested folders (confirmed `dishPhotosApi.js:63`):
   ```ts
   const { data: objects, error: listError } = await supabase.storage
     .from('dish-photos').list(user.id)
   if (listError) throw new Error(`Storage list failed: ${listError.message}`)

   if (objects && objects.length > 0) {
     const paths = objects.map(o => `${user.id}/${o.name}`)
     const { error: removeError } = await supabase.storage
       .from('dish-photos').remove(paths)
     if (removeError) throw new Error(`Storage remove failed: ${removeError.message}`)
   }
   ```

   **IMPORTANT:** If storage listing or removal fails, ABORT the operation (return 500) — do NOT proceed to `auth.admin.deleteUser()`. Orphan public photos would defeat the privacy intent. User can retry.

6. **Delete the auth user.** `supabase.auth.admin.deleteUser(user.id)`. This cascades to:
   - `profiles` (schema.sql:103)
   - `votes` (schema.sql:77) — **votes are deleted, not anonymized**
   - `favorites` (schema.sql:117)
   - `dish_photos` (schema.sql:135)
   - `follows` (schema.sql:157-158) — both sides
   - `notifications` received by this user (schema.sql:167)
   - `user_rating_stats`, `bias_events`, `user_badges`, `restaurant_managers`, `rate_limits`, `jitter_profiles`, `jitter_samples`, `local_lists`

7. **Return success.** Client handles signOut + React Query clear + navigate.

### Error handling

- JWT invalid → 401 with `{ error: "Not authenticated" }`
- FK step fails on any table → 500 with table name, do NOT proceed to auth delete
- Notification cleanup fails → log error, continue (notifications are low-stakes)
- Storage list/remove fails → 500, do NOT proceed to auth delete (see step 5)
- `auth.admin.deleteUser` fails → 500 with specific error; previously-nulled FK columns stay nulled (acceptable — tables accept NULL `created_by`)

### Known race condition (skip with note)

Between the FK null/delete pass (step 3) and the final `auth.admin.deleteUser()` (step 6), the user's session is still valid and RLS still permits them to create new `restaurants`/`dishes`/`specials`/`events`/`invites`. If they do (extremely unlikely — they're on a "deleting my account" confirmation screen), the final auth delete will fail with a FK violation on the new row.

**Mitigation:** None. Window is milliseconds. On failure, user retries — the existing null/delete work is idempotent. Acceptable risk.

### Edge Function conventions

- Use `console.log` / `console.error` (NOT app's `logger` — Edge Functions don't import src/utils/logger)
- Match CORS headers and error response shape of `backfill-restaurants/index.ts`
- Deploy via Supabase CLI with token per memory note

### Env vars

Uses existing secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (for JWT verification)
- `SUPABASE_SERVICE_ROLE_KEY` (for destructive ops)

---

## Frontend

### API method

**File:** `src/api/authApi.js`

Use `supabase.functions.invoke()` — matches existing pattern in `src/api/placesApi.js:26`. Do NOT use raw `fetch` or reference `SUPABASE_URL` directly (it's not exported from `src/lib/supabase.js`).

```js
async deleteAccount() {
  try {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    })
    if (error) throw createClassifiedError(error)
    return data
  } catch (error) {
    logger.error('authApi.deleteAccount failed:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}
```

`supabase.functions.invoke()` automatically attaches the current session's Authorization header.

### AuthContext change

**File:** `src/context/AuthContext.jsx`

In the existing `signOut()` handler, add React Query cache clearing so the next user on the same browser doesn't inherit stale data (at least `useMyLocalList` is keyed without `user.id`):

```js
import { useQueryClient } from '@tanstack/react-query'

// inside AuthContext provider
const queryClient = useQueryClient()

const signOut = async () => {
  await supabase.auth.signOut()
  queryClient.clear()  // NEW — clears all cached queries
  // ...existing storage cleanup
}
```

This fix is not specific to account deletion — it helps any sign-out case.

### New component: DeleteAccountSection

**File:** `src/components/profile/DeleteAccountSection.jsx`

Lives at the bottom of `/profile`, visually separated.

**Layout (needs dedicated styling since `/profile` isn't a settings page):**
- Wrapper: `mt-16 pt-8 px-4` with `borderTop: 1px solid var(--color-divider)`
- Section header: "Delete Account" — `fontFamily: 'Amatic SC'`, `fontSize: 28px` to match page voice
- Explainer paragraph (one sentence): "This permanently removes your votes, reviews, photos, favorites, and profile. This can't be undone."
- Destructive button: red outline, white background, hover = solid red. `color: var(--color-danger)`. Label: "Delete My Account"
- Button opens confirmation modal

### Confirmation modal

Follow the `LoginModal` / `AddRestaurantModal` shell pattern (NOT DishModal):
- Fixed backdrop with semi-transparent black
- `role="dialog"`, `aria-modal="true"`
- Backdrop click closes (unless loading)
- Escape closes (unless loading)
- `useFocusTrap` ref attachment on the modal container

**Content:**
- Title: "Delete your account?"
- Copy: "This is permanent. We'll remove your votes, reviews, photos, favorites, and profile from What's Good Here. Dish rankings that included your votes will be recalculated without them."
- Text input: "Type DELETE to confirm" (placeholder), monospace font, autoFocus
- Buttons side-by-side:
  - Cancel (secondary, closes modal — disabled during loading)
  - Delete Account (disabled unless input === "DELETE", shows spinner during loading)
- Error surface: uses `getUserMessage()` error text below the button if deletion fails, via `toast.error` OR inline message (pick one — prefer toast since we already have `<Toaster />` mounted in `App.jsx:3`)

**Note:** Do NOT use the word "playlists" in copy — Food Playlists isn't shipped yet at time of this flow going live (or may or may not be; keep copy factual to schema).

### Post-delete flow

On success:
1. `toast.success('Your account has been deleted.')`
2. Call `signOut()` from `useAuth()` context (NOT `authApi.signOut()` — that method doesn't exist; the sign-out lives in AuthContext via `supabase.auth.signOut()`)
3. `navigate('/', { replace: true })` — back to anonymous home, don't let user press back into profile
4. AuthContext's `USER_DELETED` / `SIGNED_OUT` event fires (AuthContext.jsx:48)
5. React Query cache is cleared via the AuthContext change above
6. PostHog identity cleared (already wired in existing signOut path)

### Where in Profile.jsx

Append `<DeleteAccountSection />` after `<JournalFeed />` (Profile.jsx:273 area), before the modals are mounted. See "Layout" above for styling — don't let it look like a journal card.

---

## Privacy + ToS copy updates

### Privacy.jsx — TWO places to fix

**Replace lines 123-126 (Data Retention section):**
```
We retain your account information and votes as long as your account is active.
You can delete your account by contacting us, which will remove your personal
information. Aggregated voting data (like dish rankings) may be retained.
```

With:
```
You can delete your account anytime from your Profile page. Deletion is
permanent and removes your votes, reviews, photos, favorites, and profile.
Dish rankings that included your votes will be recalculated without them.
```

**Replace lines 133-137 (Your Rights section):**
```
You can access, update, or delete your profile information at any time through
the app. For data deletion requests or questions about your data, contact us
at the email below.
```

With:
```
You can access, update, or delete your profile information at any time through
the app — including a full account deletion from your Profile page. For
questions about your data, contact us at the email below.
```

**Update header:**
- Change `<p>Last updated: January 2025</p>` → `<p>Last updated: April 2026</p>`
- Add operator line at the top of Overview section (before first paragraph):
  ```
  What's Good Here is operated by Daniel Walsh. Contact: hello@whatsgoodhere.app, [physical address TBD]
  ```
  (Address placeholder — replace once Dan picks P.O. Box or registered agent.)

### Terms.jsx

No required changes for H1.

---

## Schema notes

**No schema changes required** — FK handling is at runtime. No NOT NULL constraints block us after the per-column strategy above.

**Do NOT** add a `deleted_users` audit table — Supabase auth logs provide audit. Extra data collection contradicts privacy intent.

**Consensus field staleness (accepted):** When votes cascade on user delete, `dishes.avg_rating` and `dishes.total_votes` are recomputed (per schema.sql:2038 trigger). But `consensus_rating`, `consensus_votes`, `consensus_ready` are only updated on vote INSERT, not DELETE. After a user deletes, these fields will be slightly stale on dishes they had voted on, until the next vote insert on each dish naturally refreshes them. Not worth building a recompute job for launch — consensus is a soft signal, self-heals on next vote. Note the known staleness; revisit if it becomes a user-facing problem.

---

## Testing plan

### Backend smoke
1. Deploy Edge Function to Denis's Supabase project
2. `supabase.functions.invoke('delete-account')` with a valid session → returns `{ success: true }`
3. Invoke without auth → returns 401
4. Invoke twice in quick succession → first succeeds, second returns 404 user not found

### Frontend happy path (normal user)
1. Log in as a test user with 5+ votes, 2+ photos, 1+ favorite, 1+ follow, 1+ follower
2. Navigate to `/profile`, scroll to Delete Account section
3. Click "Delete My Account"
4. Confirm modal appears
5. Type "DELETE" → button enables
6. Click Delete → loading state
7. Success → toast + redirect to `/`
8. Try to log in again with same credentials → "User not found"
9. Query Supabase DB directly — verify:
   - `profiles` row gone
   - `votes` rows gone
   - `dish_photos` rows gone
   - `favorites` gone
   - `follows` rows gone (both directions)
   - Storage bucket `dish-photos/<user.id>/` is empty
   - Any restaurants they created have `created_by = NULL`
   - Any restaurant_invites they created or used are gone (not present at all)
   - Follow notifications that OTHER users received from this user are gone
10. Check `dishes.avg_rating` recomputed on a dish they voted on
11. Check `dishes.consensus_*` may be slightly stale — this is expected

### Restaurant manager deletion
1. Create test user, grant manager role, have them create specials/events, create an invite token
2. Delete account
3. Verify:
   - Restaurant still exists with `created_by = NULL` (if they created it)
   - Specials/events they created have `created_by = NULL`
   - Invites they created (restaurant_invites + curator_invites) are deleted (not nulled)
   - Their `restaurant_managers` row is cascade-deleted
   - Restaurant isn't orphaned from other managers if any

### Error path (storage failure)
1. Temporarily revoke storage permissions or simulate bucket error
2. Trigger delete from UI
3. Confirm: user sees error, account NOT deleted, photos NOT deleted, state is recoverable on retry
4. Fix permissions, retry — deletion completes cleanly

### Error path (FK delete failure)
1. Simulate invite deletion failure
2. Confirm: auth user NOT deleted, user can retry

### React Query cache test
1. Log in as User A, load profile
2. Delete account
3. Log in as User B in same browser session
4. Verify User B's data is shown, no stale User A data in hooks like `useMyLocalList`

### Analytics verification
1. Before deletion: PostHog has user_id set
2. After deletion: user_id cleared, no orphaned events from deleted user

---

## Rollout steps

1. Add `queryClient.clear()` to AuthContext signOut (low-risk precursor)
2. Write Edge Function `delete-account`
3. Deploy to Denis's Supabase (via CLI token per memory)
4. Write `authApi.deleteAccount` using `supabase.functions.invoke`
5. Write `DeleteAccountSection` + add to Profile.jsx
6. Update `Privacy.jsx` (both sections + header)
7. Manual test on staging or prod with throwaway account
8. Commit + PR against `feat/binary-vote-removal` or main (per Dan's branch preference)
9. Merge + final verify with Dan's test account in prod

## Rollback

If critical post-deploy bug:
1. Remove `<DeleteAccountSection />` from `/profile` (hides UI immediately)
2. Edge Function stays deployed but unused
3. Fix, re-test, redeploy

Already-deleted users are gone one-way — rollback only protects future users.

---

## Risks

| Risk | Mitigation |
|---|---|
| `restaurants.created_by = NULL` leaves visually "ownerless" restaurants | By design. Tables accept NULL. Admin tooling can display "Created by: [deleted user]" or blank. |
| Storage deletion fails → no auth delete → user can't complete deletion | User retries. Edge Function is idempotent on the FK/storage/notification steps. |
| Race condition: user creates a new restaurant mid-delete | Window is ms; acceptable. On failure, user retries. |
| User on active manager session — restaurant "loses" its manager | `restaurant_managers` cascades. Restaurant stays, admin can reinvite. |
| Accidental delete | Typed "DELETE" + explicit button. Standard guard. |
| Consensus field staleness on dishes they voted on | Self-heals on next vote. Note + revisit only if user-visible problem. |
| Orphan photos in storage | Step 5 aborts whole operation if storage fails. No orphans. |
| Follow notifications from deleted user | Step 4 cleans them up. |
| React Query cache bleeds to next user | `queryClient.clear()` in signOut. |
| Auth admin API rate limit | One user at a time — not a concern at our scale. |

---

## Effort breakdown (revised)

- Edge Function (incl. FK strategy per column, storage, notifications): **5-6h**
- Frontend: API method + DeleteAccountSection + modal: **3-4h**
- AuthContext signOut change (queryClient.clear): **0.5h**
- Privacy.jsx copy (two sections + header): **0.5-1h**
- Testing (normal + manager + error paths + multi-user browser): **4-5h**
- PR + review + deploy: **1-2h**

**Total: 14-18.5h** (up from Codex's original 13-18h because we added several steps: NOT NULL handling, notification cleanup, strict storage failure handling, React Query clear, two Privacy sections, and additional QA paths).

---

## Dependencies

**Blocks:** None. Can start immediately.
**Blocked by:** None.
**Related:** L1 Privacy + ToS full update happens in parallel (same file). H2 SIWA revocation hook wires into this Edge Function post-launch.

---

## Revision log

**2026-04-13 v4 (after Codex final review of v3 fixes):**
- CRITICAL FIX: `purgeUserPhotos()` pagination was advancing `offset` while deleting underneath. At PAGE=1000 with 3500 files, pages would be skipped and files orphaned. Rewrote to always read from offset 0 and stop when the listing is empty (with a 1000-iteration safety cap).
- IMPORTANT FIX: `dish_suggestions` null op is now marked `optional: true`. If the table doesn't exist in an environment (e.g., rebuilt from schema.sql which doesn't yet include it), the function skips it instead of 500'ing. Schema drift between prod and schema.sql is a pre-existing issue — this fix keeps account deletion working regardless.
- IMPORTANT FIX: Dropped `[physical address TBD]` placeholder from Privacy.jsx — shipping a visible TODO in public legal copy is worse than not showing a mailing address at all. Email contact stays. Dan adds the P.O. Box in a follow-up one-line PR.
- SUGGESTION FIX: Modal backdrop uses inline style instead of `bg-neutral-900/60` (CLAUDE.md 1.3: no Tailwind color classes).
- ACCEPTED LIMITATION: Storage RLS only checks `auth.uid() = owner`, not whether the user exists in auth.users. A stale JWT (up to 1h expiry) could upload to Storage after deletion completes, creating orphans after step 7's re-purge. Mitigating this requires a custom RLS policy keyed on a "user_is_deleted" flag — schema change beyond this PR's scope. Risk is low (user is actively clicking delete, not uploading). Any orphan that does occur has no corresponding `dish_photos` DB row (FK violation on insert) so it's invisible to the app and can be cleaned up manually.

**2026-04-13 v3 (after live smoke test against Denis's Supabase):**
- CRITICAL DISCOVERY: `auth.admin.deleteUser()` returns 500 "Database error deleting user" on users with certain FK dependencies (specifically a row in `follows`), while raw `DELETE FROM auth.users` cascades cleanly. Worked around with a SECURITY DEFINER `public.delete_auth_user(uuid)` function (service_role only) that the Edge Function calls via `.rpc()`. Migration at `supabase/migrations/20260413_delete_auth_user.sql`.
- CRITICAL DISCOVERY: `dish_suggestions.reviewed_by` references `auth.users` with NO ACTION on delete, blocking user deletion for anyone who's ever reviewed a submission. Added to the Edge Function's null pass. Table is on the live DB but not yet in `schema.sql`.
- IMPORTANT: Edge Function now deployed with `verify_jwt = false` (via `supabase/config.toml`) — some valid user JWTs were being rejected at the Supabase gateway with 401 "Invalid JWT" before the function could run. The function does its own JWT verification internally via the anon client, so bypassing the gateway is safe.
- IMPORTANT: Follow notification cleanup now aborts on error (was log-and-continue) — leaving them keeps the deleted user's PII (`follower_id`, `follower_name`) visible on other users' notification feeds.
- Added `supabase/tests/account-deletion-smoke.mjs` — reusable end-to-end smoke test for future schema changes that might introduce new FKs to `auth.users`.
- Codex suggestions shipped: paginated storage purge (1000/page), post-auth-delete re-purge closes concurrent-upload race, authApi.deleteAccount requires explicit `data.success === true`, modal uses `trim().toUpperCase()`.

**2026-04-13 v2 (after Codex pressure-test):**
- CRITICAL: Changed restaurant_invites/curator_invites strategy from null → delete (NOT NULL constraint; also used_by nulling reactivates consumed tokens)
- CRITICAL: Corrected copy re: "aggregate voting data stays" — votes actually cascade; rankings get recalculated
- IMPORTANT: Rewrote frontend API snippet to use `supabase.functions.invoke` not raw fetch; corrected signOut path
- IMPORTANT: Added Edge Function convention notes (console.log, backfill-restaurants reference pattern)
- IMPORTANT: Added follow notification cleanup step
- IMPORTANT: Storage failure now aborts — no orphan photos
- IMPORTANT: Added React Query cache clear in AuthContext signOut
- IMPORTANT: Added second Privacy.jsx copy fix (lines 133-137)
- SUGGESTION: Modal shell now specs LoginModal pattern
- SUGGESTION: Dropped "playlists" from copy
- SUGGESTION: Profile layout spec'd as dedicated bordered section
- Documented known race condition + consensus staleness as acceptable skips
