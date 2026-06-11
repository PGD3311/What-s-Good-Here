# Shareable Local Lists — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let recipients share a Local List via URL and one-tap save it as their own private playlist.

**Architecture:**
- Local Lists (`local_lists` + `local_list_items`) are curator Top-10s, already public at `/locals/:userId`.
- "Connect to your list" = clone into the existing playlist system (`user_playlists` + `user_playlist_items`) via a single SECURITY DEFINER RPC. No schema changes to existing tables.
- Share infra reuses the same `shareOrCopy` + `canonicalShareUrl` + bot-rewrite pipeline that dishes/restaurants already use.

**Tech Stack:** Supabase Postgres + RLS, React 19, Vite, React Router v7, Capacitor (iOS), Vercel serverless (TypeScript) for bot rewrite, sonner toasts, PostHog analytics.

---

## File Structure

**Create:**
- `supabase/migrations/2026-05-27-save-local-list-to-playlist.sql` — new RPC + grants
- `src/components/locals/SaveLocalListButton.jsx` — auth-gated clone-to-playlist button
- `src/components/locals/ShareLocalListButton.jsx` — wraps `shareOrCopy` for `/locals/:userId`
- `e2e/pioneer/save-local-list.spec.ts` — single happy-path E2E

**Modify:**
- `supabase/schema.sql` — append the new RPC (source of truth)
- `src/api/userPlaylistsApi.js` — add `cloneLocalList(curatorUserId)` method
- `src/pages/LocalsCurator.jsx` — wire Share + Save buttons into the NAV_ROW
- `api/share.ts` — add `type=local_list` branch with OG tags
- `vercel.json` — add bot rewrite for `/locals/:userId`

**No changes:** `local_lists` / `local_list_items` / `user_playlists` / `user_playlist_items` tables. Pure additive migration.

---

## Task 1: New RPC `clone_local_list_to_playlist`

**Files:**
- Create: `supabase/migrations/2026-05-27-save-local-list-to-playlist.sql`
- Modify: `supabase/schema.sql` (append at the local-lists RPC section, near line 5638)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/2026-05-27-save-local-list-to-playlist.sql`:

```sql
-- Clone a curator's Local List into the caller's playlists as a new private playlist.
-- 2026-05-27
-- Additive only: no schema changes. Single atomic copy avoids 10 round-trips
-- + per-add rate limits when the recipient clones a full Top 10.

CREATE OR REPLACE FUNCTION clone_local_list_to_playlist(p_curator_user_id UUID)
RETURNS TABLE (playlist_id UUID, copied_count INT, slug TEXT, title TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_curator_name TEXT;
  v_new_playlist user_playlists;
  v_copied INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_user = p_curator_user_id THEN
    RAISE EXCEPTION 'Cannot clone your own list' USING ERRCODE = '22023';
  END IF;
  IF is_blocked_pair(v_user, p_curator_user_id) THEN
    RAISE EXCEPTION 'Cannot clone this list' USING ERRCODE = '42501';
  END IF;

  -- Curator's display_name drives the new playlist title.
  SELECT p.display_name INTO v_curator_name
  FROM profiles p WHERE p.id = p_curator_user_id;
  IF v_curator_name IS NULL THEN
    RAISE EXCEPTION 'Curator not found' USING ERRCODE = 'P0002';
  END IF;

  -- Verify the curator has an active list. Defensive: client should already
  -- know this from get_local_list_by_user, but RLS allows arbitrary user IDs.
  PERFORM 1 FROM local_lists ll
   WHERE ll.user_id = p_curator_user_id AND ll.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curator has no active list' USING ERRCODE = 'P0002';
  END IF;

  -- Create the destination playlist (private by default — recipient can publish later).
  INSERT INTO user_playlists (user_id, title, description, is_public, slug)
  VALUES (
    v_user,
    LEFT(v_curator_name || '''s picks', 60),
    'Saved from ' || v_curator_name || '''s Local List',
    false,
    fn_playlist_slug_from_title(LEFT(v_curator_name || '''s picks', 60), v_user)
  )
  RETURNING * INTO v_new_playlist;

  -- Copy items in curator's order. We renumber positions starting at 1 in case
  -- the curator's list has gaps (constraint is 1..10, so usually 1..N already).
  WITH src AS (
    SELECT li.dish_id, li.note,
           ROW_NUMBER() OVER (ORDER BY li."position") AS new_pos
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    WHERE ll.user_id = p_curator_user_id AND ll.is_active = true
  )
  INSERT INTO user_playlist_items (playlist_id, dish_id, position, note)
  SELECT v_new_playlist.id, src.dish_id, src.new_pos, src.note
  FROM src;

  GET DIAGNOSTICS v_copied = ROW_COUNT;

  RETURN QUERY SELECT v_new_playlist.id, v_copied, v_new_playlist.slug, v_new_playlist.title;
END;
$$;

REVOKE EXECUTE ON FUNCTION clone_local_list_to_playlist(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION clone_local_list_to_playlist(UUID) TO authenticated, service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS clone_local_list_to_playlist(UUID);
```

- [ ] **Step 2: Copy the same RPC into `supabase/schema.sql`**

Append the entire `CREATE OR REPLACE FUNCTION clone_local_list_to_playlist(...)` block (including the REVOKE + GRANT) after `get_local_list_by_user`'s GRANT line (~`supabase/schema.sql:5661`). Schema.sql is the source of truth — every RPC that lives in a migration must also live here.

- [ ] **Step 3: Run the migration in Supabase SQL Editor**

```bash
cat supabase/migrations/2026-05-27-save-local-list-to-playlist.sql | pbcopy
# Open https://supabase.com/dashboard/project/vpioftosgdkyiwvhxewy/sql/new
# Paste, click Run. Expect: "Success. No rows returned."
```

- [ ] **Step 4: Smoke test the RPC manually**

In Supabase SQL Editor, paste & run (replace `<curator>` with a real user_id that has an active local_list — find one via `SELECT user_id FROM local_lists WHERE is_active = true LIMIT 1;`):

```sql
-- As any authenticated user (use the SQL Editor's "Run as" → your dev account)
SELECT * FROM clone_local_list_to_playlist('<curator_user_id>'::UUID);
-- Expect a row: (playlist_id, copied_count, slug, title)
-- copied_count should match the curator's local_list_items count.

-- Verify the playlist exists and items copied with correct positions:
SELECT p.title, p.is_public, p.item_count,
       array_agg(pi.position ORDER BY pi.position) AS positions
FROM user_playlists p
LEFT JOIN user_playlist_items pi ON pi.playlist_id = p.id
WHERE p.id = '<returned_playlist_id>'
GROUP BY p.id;
-- Expect positions = {1,2,3,...,N} with no gaps.

-- Cleanup:
DELETE FROM user_playlists WHERE id = '<returned_playlist_id>';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-27-save-local-list-to-playlist.sql supabase/schema.sql
git commit -m "feat(local-lists): add clone_local_list_to_playlist RPC"
```

---

## Task 2: Frontend API method `cloneLocalList`

**Files:**
- Modify: `src/api/userPlaylistsApi.js` (append a new method to the exported object)

- [ ] **Step 1: Add the method**

Open `src/api/userPlaylistsApi.js`. Inside the `userPlaylistsApi` object (after `addDish`, before `removeDish`), add:

```js
  async cloneLocalList(curatorUserId) {
    if (!curatorUserId) throw contentError('Missing curator')
    const rl = checkPlaylistCreateRateLimit()
    if (!rl.allowed) throw rateLimitError(rl.retryAfterMs)
    try {
      const { data, error } = await supabase.rpc('clone_local_list_to_playlist', {
        p_curator_user_id: curatorUserId,
      })
      if (error) throw createClassifiedError(error)
      const row = Array.isArray(data) ? data[0] : data
      return {
        playlistId: row?.playlist_id,
        copiedCount: row?.copied_count ?? 0,
        slug: row?.slug,
        title: row?.title,
      }
    } catch (error) {
      logger.error('userPlaylistsApi.cloneLocalList:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
```

The RPC is `RETURNS TABLE`, so PostgREST returns an array of one row. We normalize to a single object.

- [ ] **Step 2: Sanity-check the build**

```bash
npm run build
# Expect: build succeeds.
```

- [ ] **Step 3: Commit**

```bash
git add src/api/userPlaylistsApi.js
git commit -m "feat(api): add cloneLocalList method on userPlaylistsApi"
```

---

## Task 3: `SaveLocalListButton` component

**Files:**
- Create: `src/components/locals/SaveLocalListButton.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/locals/SaveLocalListButton.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { userPlaylistsApi } from '../../api/userPlaylistsApi'
import { useAuth } from '../../context/AuthContext'
import { capture } from '../../lib/analytics'
import { getUserMessage } from '../../utils/errorHandler'

/**
 * SaveLocalListButton — clone a curator's Local List into the viewer's playlists.
 * Logged-out viewers are redirected to /login with a return URL.
 *
 * Props:
 *   curatorUserId   - the curator whose list we're saving
 *   curatorName     - display name (for toast + share text)
 */
export function SaveLocalListButton({ curatorUserId, curatorName }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (!user) {
      navigate('/login?next=' + encodeURIComponent('/locals/' + curatorUserId))
      return
    }
    if (pending) return
    setPending(true)
    try {
      const result = await userPlaylistsApi.cloneLocalList(curatorUserId)
      capture('local_list_cloned', {
        curator_id: curatorUserId,
        copied_count: result.copiedCount,
      })
      toast.success('Saved ' + result.copiedCount + ' dishes', { duration: 2500 })
      navigate('/playlist/' + result.playlistId)
    } catch (error) {
      toast.error(getUserMessage(error, 'saving this list'))
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--color-primary)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: pending ? 'wait' : 'pointer',
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? 'Saving…' : 'Save to my list'}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locals/SaveLocalListButton.jsx
git commit -m "feat(local-lists): add SaveLocalListButton component"
```

---

## Task 4: `ShareLocalListButton` component

**Files:**
- Create: `src/components/locals/ShareLocalListButton.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/locals/ShareLocalListButton.jsx`. Modeled after `src/components/profile/SharePicksButton.jsx`:

```jsx
import { toast } from 'sonner'
import { shareOrCopy, canonicalShareUrl } from '../../utils/share'
import { capture } from '../../lib/analytics'

/**
 * ShareLocalListButton — share a curator's Local List URL via OS share sheet
 * or clipboard fallback. Uses canonicalShareUrl so iOS Capacitor links resolve
 * to https://wghapp.com instead of the WhatsGoodHere:// scheme.
 *
 * Props:
 *   curatorUserId - the curator whose list we're sharing
 *   curatorName   - display name for share title/text
 */
export function ShareLocalListButton({ curatorUserId, curatorName }) {
  async function handleClick() {
    const url = canonicalShareUrl('/locals/' + curatorUserId)
    const name = curatorName || 'a local'
    const result = await shareOrCopy({
      url: url,
      title: name + "'s picks on What's Good Here",
      text: 'Check out ' + name + "'s Top 10 dishes on What's Good Here!",
    })
    capture('share_local_list', {
      curator_id: curatorUserId,
      method: result.method,
      success: result.success,
    })
    if (result.success && result.method !== 'native_capacitor' && result.method !== 'web_share') {
      toast.success('Link copied!', { duration: 2000 })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--color-accent-gold)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      Share
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/locals/ShareLocalListButton.jsx
git commit -m "feat(local-lists): add ShareLocalListButton component"
```

---

## Task 5: Wire buttons into LocalsCurator

**Files:**
- Modify: `src/pages/LocalsCurator.jsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/LocalsCurator.jsx`, alongside the existing imports, add:

```jsx
import { ShareLocalListButton } from '../components/locals/ShareLocalListButton'
import { SaveLocalListButton } from '../components/locals/SaveLocalListButton'
```

- [ ] **Step 2: Replace the NAV_ROW block with action buttons**

Find the existing NAV_ROW JSX (around `src/pages/LocalsCurator.jsx:104-128`):

```jsx
        <div style={NAV_ROW}>
          <button type="button" style={CLOSE} onClick={function () { navigate('/locals') }}>&larr; All locals</button>
          {isOwner ? (
            <button
              type="button"
              onClick={function () { navigate('/my-list') }}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--color-accent-gold)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Edit &rarr;
            </button>
          ) : (
            <span style={PAGENO}>the menu</span>
          )}
        </div>
```

Replace it with:

```jsx
        <div style={NAV_ROW}>
          <button type="button" style={CLOSE} onClick={function () { navigate('/locals') }}>&larr; All locals</button>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <ShareLocalListButton curatorUserId={userId} curatorName={first.display_name} />
            {isOwner ? (
              <button
                type="button"
                onClick={function () { navigate('/my-list') }}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--color-accent-gold)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                Edit &rarr;
              </button>
            ) : (
              <SaveLocalListButton curatorUserId={userId} curatorName={first.display_name} />
            )}
          </div>
        </div>
```

Owner sees `Share + Edit`. Visitor sees `Share + Save to my list`.

- [ ] **Step 3: Visual smoke test**

```bash
npm run dev
# Open http://localhost:5173/locals/<any-active-curator-userId>
# Verify: Share + Save to my list buttons visible in the top nav.
# Sign out, tap Save → expect /login?next=/locals/...
# Sign in, tap Save → expect toast + navigation to /playlist/<new-id>
# Tap Share → expect OS share sheet (mobile) or "Link copied!" toast (desktop)
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/LocalsCurator.jsx
git commit -m "feat(local-lists): wire Share + Save buttons into LocalsCurator"
```

---

## Task 6: OG preview for `/locals/:userId`

**Files:**
- Modify: `api/share.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Add `local_list` branch to `api/share.ts`**

In `api/share.ts`:

1. Update the `ALLOWED_TYPES` map (around line 44):

```ts
  const ALLOWED_TYPES: Record<string, string> = {
    dish: 'dish',
    restaurant: 'restaurants',
    local_list: 'locals',
  }
```

2. Change the UUID validation gate to also accept the `local_list` type's `:userId` (still a UUID — `auth.users.id`). The existing regex already matches UUIDs, so no change needed.

3. Inside the try block, after the `else if (type === 'restaurant')` branch, add:

```ts
    } else if (type === 'local_list') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', id)
        .maybeSingle()

      if (profile) {
        const name = profile.display_name || 'A local'
        title = `${name}'s picks on What's Good Here`
        description = `${name}'s Top 10 dishes on Martha's Vineyard`
        if (profile.avatar_url) imageUrl = profile.avatar_url
        else imageUrl = `${BASE_URL}/og-image.png`
      }
```

- [ ] **Step 2: Add bot rewrite in `vercel.json`**

In the `rewrites` array, after the existing `/restaurants/:id` block and before the catch-all SPA rewrite, add:

```json
    {
      "source": "/locals/:id",
      "has": [{ "type": "header", "key": "user-agent", "value": "(?i).*(facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot|Applebot|Pinterestbot|redditbot|Googlebot|bingbot|Embedly|vkShare).*" }],
      "destination": "/api/share?type=local_list&id=:id"
    },
```

- [ ] **Step 3: Verify share preview after deploy**

After this PR ships to a preview URL (Vercel), run:

```bash
# Replace <preview-url> with the Vercel preview deployment URL
curl -sA "facebookexternalhit/1.1" "<preview-url>/locals/<active-curator-userId>" | grep -E 'og:(title|description|image)'
# Expect three meta tags with the curator's display_name in title.
```

For browsers (no bot UA), the route still serves the SPA — verify by visiting `/locals/<id>` directly.

- [ ] **Step 4: Commit**

```bash
git add api/share.ts vercel.json
git commit -m "feat(share): OG preview for Local List share links"
```

---

## Task 7: E2E happy-path test

**Files:**
- Create: `e2e/pioneer/save-local-list.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/pioneer/save-local-list.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { signInAsFoodie } from '../fixtures/auth'

// Before running: set E2E_CURATOR_ID to a real userId that has an active
// local_list with ≥3 items. Find one via Supabase SQL Editor:
//   SELECT user_id FROM local_lists WHERE is_active = true LIMIT 1;

test.describe('Save a Local List into my playlists', () => {
  test('signed-in user clones a curator list and lands on the new playlist', async ({ page }) => {
    const CURATOR_ID = process.env.E2E_CURATOR_ID
    test.skip(!CURATOR_ID, 'set E2E_CURATOR_ID env var to a seeded curator with an active list')

    await signInAsFoodie(page)
    await page.goto(`/locals/${CURATOR_ID}`)
    await expect(page.getByRole('button', { name: /save to my list/i })).toBeVisible()

    await page.getByRole('button', { name: /save to my list/i }).click()

    // Toast appears + we navigate to /playlist/<id>
    await expect(page.getByText(/saved \d+ dishes/i)).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(/\/playlist\/[0-9a-f-]{36}/)

    // Cleanup: delete the playlist so re-runs are idempotent (relies on
    // a UI Delete control on /playlist/:id, or hit the API directly).
  })

  test('signed-out user is redirected to /login with a return URL', async ({ page }) => {
    const CURATOR_ID = process.env.E2E_CURATOR_ID
    test.skip(!CURATOR_ID, 'set E2E_CURATOR_ID env var to a seeded curator with an active list')

    await page.goto(`/locals/${CURATOR_ID}`)
    await page.getByRole('button', { name: /save to my list/i }).click()

    await expect(page).toHaveURL(/\/login\?next=/)
    expect(page.url()).toContain(encodeURIComponent(`/locals/${CURATOR_ID}`))
  })
})
```

- [ ] **Step 2: Run the test locally**

```bash
E2E_CURATOR_ID=<seeded-curator-userId> npm run test:e2e:pioneer -- save-local-list
# Expect: both tests pass.
```

If the cleanup-on-rerun matters, follow the pattern in `e2e/pioneer/playlist.spec.ts` for tearing down via API.

- [ ] **Step 3: Commit**

```bash
git add e2e/pioneer/save-local-list.spec.ts
git commit -m "test(e2e): save local list clones to playlist + handles signed-out"
```

---

## Task 8: Ship integration

- [ ] **Step 1: Run the full local verification**

```bash
npm run lint
npm run build
npm run test
```

All three must pass. If any fail, fix before moving on.

- [ ] **Step 2: Push and open the PR against `release/v1.5-bundle`**

```bash
git push origin release/v1.5-bundle
gh pr create --base release/v1.5-bundle --head release/v1.5-bundle \
  --title "feat(local-lists): shareable + save-to-my-list" \
  --body "$(cat <<'EOF'
## Summary
- New SECURITY DEFINER RPC `clone_local_list_to_playlist` atomically copies a curator's Local List into the caller's playlists as a private playlist.
- Adds Share + Save buttons to `/locals/:userId`. Signed-out users redirect to `/login?next=...`.
- Extends `api/share.ts` + `vercel.json` so iMessage/Slack/Twitter previews render the curator's name + avatar.

## Test plan
- [ ] RPC smoke from Supabase SQL Editor returns correct `copied_count` + private playlist
- [ ] Logged-in user taps Save → toast + navigates to `/playlist/:id`
- [ ] Logged-out user taps Save → `/login?next=/locals/:id`
- [ ] Tap Share on iOS → native share sheet with wghapp.com URL
- [ ] Tap Share on web → "Link copied!" toast
- [ ] `curl -A facebookexternalhit /locals/:id` returns OG meta tags

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Note: branch already pushed in an earlier commit; the create-pr command may need adjustment if a PR already exists for this branch — use `gh pr view` first.)

---

## Landmines

- **RPC RLS:** `clone_local_list_to_playlist` is `SECURITY DEFINER` so it bypasses the caller's RLS on `local_lists`. The RPC manually re-checks `is_blocked_pair` and `is_active = true` to compensate.
- **iOS Capacitor share URL:** `window.location.origin` is `WhatsGoodHere://localhost` inside the WebView. `canonicalShareUrl()` already handles this — do not build URLs with `window.location.origin` directly.
- **Cache invalidation:** After clone, the recipient's `['user-playlists', userId]` React Query cache is stale. If `Profile.jsx` shows the new playlist on next visit, this is fine; if you want it immediate, add `queryClient.invalidateQueries(['user-playlists', user.id])` in `SaveLocalListButton.handleClick`.
- **Slug collisions:** `fn_playlist_slug_from_title` already disambiguates per-user. Cloning the same curator's list twice gives `{name}s-picks` and `{name}s-picks-2`.
- **One-per-user constraint:** `local_lists` has `UNIQUE (user_id)`. Cloning copies into `user_playlists` (no such constraint), so a recipient can save the same curator's list repeatedly — toast or guard if you want to dedupe in v1.7.
- **iOS deep link after Save:** `navigate('/playlist/' + id)` on Capacitor stays inside the app shell. No further plumbing required.
- **OG image fallback:** If the curator has no `avatar_url`, we fall back to `og-image.png`. Acceptable for v1.6; a dynamic per-list OG card is a v1.7 follow-up.
- **E2E setup is currently broken on main** per the project memory note (geolocation permission not granted in `playwright.config.js`). Task 7 may fail to bring up the homepage even before reaching `/locals/:id`. Verify `signInAsFoodie` from `e2e/fixtures/auth` actually exists and the foodie persona can navigate before relying on the new spec; fall back to a manual smoke checklist if not. The Task 7 commit can be split out of the v1.6 PR if E2E infra fixes are out of scope.

---

## Out of scope (intentionally deferred)

- Pretty slugs like `/lists/cool-summer-picks` — requires a `slug` column on `local_lists` and a redirect from the userId form. Defer to v1.7.
- "Follow this list" subscribe semantics — Local Lists are 1-per-user editorial Top 10s; recipients want to mutate their saved copy, not subscribe to live updates.
- Per-list OG card image generation (analogous to `api/og-image.ts` for dishes) — v1.7.
- Dedupe of repeated saves from the same curator — v1.7.
- Allowing the curator to "save" their own list — explicitly blocked at the RPC for now (returns `22023`).
