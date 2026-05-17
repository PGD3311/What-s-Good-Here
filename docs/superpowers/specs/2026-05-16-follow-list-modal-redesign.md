# Follow List Modal Redesign

**Date:** 2026-05-16 (revised after codex review)
**Author:** Dan (with Claude)
**Status:** Spec — pending implementation plan
**Target:** Pre-Memorial Day polish (1.1 punch list)

## Problem

The current followers / following popup (`src/components/FollowListModal.jsx`) feels awkward:

- A manual "Load More" button breaks scroll momentum every 20 rows.
- No way to search — once a user has 50+ followers, finding one specific person means scroll-loading through every page.
- Rows are minimal (avatar + name + chevron) with no inline action — you can't follow/unfollow without navigating to the user's profile.
- Sheet is a static 85vh box with no drag affordance, despite the grabber suggesting otherwise.

For a launch where social discovery matters, this surface needs to feel finished.

## Goals

1. Replace the Load More button with smooth infinite scroll.
2. Add a sticky search bar that queries server-side across the user's entire follower/following list (paginated, fully reachable — no hidden tail).
3. Allow follow / unfollow directly from a row, no navigation required.
4. Make the sheet gesture-driven with snap detents (half / full / closed).
5. Surface follower count per row as cheap social-proof signal.

## Non-Goals (Deferred)

- Taste compatibility % per row (needs batched RPC — Launch 2.0).
- Mutual follows badge ("Followed by Jess + 3 others") — Launch 2.0.
- Removing followers (admin-style eviction) — out of scope.
- Refactor of unrelated profile screens — only this modal and its API + RPC.

## Architecture

### Files Touched

- `src/components/FollowListModal.jsx` — full rewrite.
- `src/api/followsApi.js` — extend `getFollowers` / `getFollowing` with `searchQuery` + cursor; add `getFollowStatuses`.
- `src/hooks/useFollowList.js` — **NEW**. Wraps React Query for list + search.
- `src/hooks/useFocusTrap.js` — small additive extension to accept `{ initialFocusRef }`.
- `supabase/schema.sql` — add `search_user_follows` RPC.
- `supabase/migrations/20260516_search_user_follows.sql` — **NEW**. Migration to deploy the RPC.

No new routes. No new pages. No changes to provider hierarchy.

### Schema Change — new RPC

**Why:** existing two-query patterns (fetch IDs → `.in()` → `.ilike()`) break for two reasons codex flagged:

1. PostgREST URL length cap means `.in('id', ids)` will fail once a user has more than a few hundred follows.
2. Substring filter then `LIMIT 20` then alphabetical order reintroduces the exact bug `searchUsers` already fixed (a high-signal user is invisible if 20 lower-signal users sort alphabetically earlier).

The new RPC mirrors `search_users_with_followers` (already in schema) but constrained to one user's relationship.

```sql
CREATE OR REPLACE FUNCTION search_user_follows(
  p_user_id UUID,
  p_direction TEXT,           -- 'followers' | 'following'
  p_query TEXT,
  p_cursor_name TEXT DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  follower_count INT,
  followed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_query TEXT := NULLIF(TRIM(COALESCE(p_query, '')), '');
BEGIN
  IF p_direction NOT IN ('followers', 'following') THEN
    RAISE EXCEPTION 'Invalid direction: %, must be followers or following', p_direction
      USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Two explicit branches (planner-friendly). Aliases qualify every column
  -- (CLAUDE.md §1.5: RETURNS TABLE columns become variables inside the body).
  IF p_direction = 'followers' THEN
    RETURN QUERY
      SELECT p.id, p.display_name, p.avatar_url, p.follower_count,
             f.created_at AS followed_at
      FROM follows f
      JOIN profiles p ON p.id = f.follower_id
      WHERE f.followed_id = p_user_id
        AND (v_query IS NULL OR p.display_name ILIKE '%' || v_query || '%')
        AND (p_cursor_name IS NULL
             OR (p.display_name, p.id) > (p_cursor_name, p_cursor_id))
      ORDER BY p.display_name ASC, p.id ASC
      LIMIT v_limit;
  ELSE
    RETURN QUERY
      SELECT p.id, p.display_name, p.avatar_url, p.follower_count,
             f.created_at AS followed_at
      FROM follows f
      JOIN profiles p ON p.id = f.followed_id
      WHERE f.follower_id = p_user_id
        AND (v_query IS NULL OR p.display_name ILIKE '%' || v_query || '%')
        AND (p_cursor_name IS NULL
             OR (p.display_name, p.id) > (p_cursor_name, p_cursor_id))
      ORDER BY p.display_name ASC, p.id ASC
      LIMIT v_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION search_user_follows(UUID, TEXT, TEXT, TEXT, UUID, INT) TO anon, authenticated;
```

**Hardening parity with existing `search_users_with_followers` RPC:** input validation, `p_limit` clamp to `[1, 100]`, empty-string `p_query` treated as NULL.

**Index reality for `ILIKE '%q%'`:** the existing `lower(display_name)` btree index does NOT accelerate substring search. v1 ships with a planned `Seq Scan` over `profiles` (filtered first by the `follows` JOIN — that's the actual selectivity gate). At current user volume (<2K profiles in prod) this is fast enough. **If the table grows past ~50K profiles**, add a trigram index in a follow-up migration:

```sql
-- Deferred — only when sequential ILIKE becomes slow:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_profiles_display_name_trgm ON profiles USING gin (display_name gin_trgm_ops);
```

Not part of this spec's deploy step.

**Note on ordering:** in cursor (non-search) mode we keep the existing `created_at DESC` recency order from `_paginateFollows`. The new RPC only powers search, where alphabetical is the better affordance ("find Jess").

**Rollback:**
```sql
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS search_user_follows(UUID, TEXT, TEXT, TEXT, UUID, INT);
```

(Pure additive — drop and revert client to non-search mode.)

**Deploy step:** per CLAUDE.md §1.5, after `schema.sql` update, the function must be run in Supabase SQL Editor on Denis's project (`vpioftosgdkyiwvhxewy`) and verified with a test call before client work merges.

### API Changes (`followsApi.js`)

**1. `_paginateFollows` stays the recency cursor path** (no `searchQuery` parameter). Untouched behavior.

**2. New `searchFollows(userId, direction, { query, cursor, limit })`** — thin RPC wrapper:

```js
async function searchFollows(userId, direction, { query, cursor = null, limit = 20 } = {}) {
  try {
    if (!query?.trim() || query.trim().length < 1) return { users: [], hasMore: false }
    const sanitized = sanitizeSearchQuery(query, 50)
    if (!sanitized) return { users: [], hasMore: false }

    const { data, error } = await supabase.rpc('search_user_follows', {
      p_user_id: userId,
      p_direction: direction,
      p_query: sanitized,
      p_cursor_name: cursor?.display_name || null,
      p_cursor_id: cursor?.id || null,
      p_limit: limit + 1,
    })
    if (error) throw createClassifiedError(error)

    const rows = data || []
    const hasMore = rows.length > limit
    const users = (hasMore ? rows.slice(0, limit) : rows).map(r => ({
      id: r.id,
      display_name: r.display_name || 'Anonymous',
      avatar_url: r.avatar_url || null,
      follower_count: r.follower_count || 0,
      followed_at: r.followed_at,
    }))
    return { users, hasMore }
  } catch (error) {
    logger.error('searchFollows error:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}
```

**3. `getFollowers` / `getFollowing` route on `searchQuery` presence:**

```js
async getFollowers(userId, { cursor, searchQuery, limit } = {}) {
  if (searchQuery) return searchFollows(userId, 'followers', { query: searchQuery, cursor, limit })
  return _paginateFollows(userId, 'followers', { cursor, limit })
},
```

(The `cursor` shape differs between modes: recency-cursor is a `created_at` timestamp; search-cursor is `{ display_name, id }`. The hook owns translating between them.)

**4. New `getFollowStatuses(userIds)`** — returns `Set<string>` of IDs the current user follows:

```js
async getFollowStatuses(userIds) {
  if (!userIds?.length) return new Set()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Set()
    const { data, error } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', user.id)
      .in('followed_id', userIds)
    if (error) throw createClassifiedError(error)
    return new Set((data || []).map(r => r.followed_id))
  } catch (error) {
    logger.error('getFollowStatuses error:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}
```

Followed list size for this call is bounded by the React Query page size (20–40), well under PostgREST limits. This `.in()` is safe.

All new catch blocks use the `throw error.type ? error : createClassifiedError(error)` pattern per CLAUDE.md §1.2.

### React Query Wiring (CLAUDE.md §1.4)

**New hook `src/hooks/useFollowList.js`** owns all server-state for this modal. Component no longer holds `useState/useEffect` fetch state machines.

```js
export function useFollowList({ userId, type, searchQuery }) {
  const direction = type // 'followers' | 'following'
  // Sanitize once. Only enter search mode if there's still content after
  // sanitization — '%%' becomes empty and falls back to recency list mode.
  const sanitizedSearch = sanitizeSearchQuery(searchQuery ?? '', 50)
  const isSearching = !!sanitizedSearch && sanitizedSearch.length >= 1

  // List mode — recency cursor, infinite
  const listQuery = useInfiniteQuery({
    queryKey: ['followList', userId, direction],
    enabled: !isSearching && !!userId,
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? followsApi.getFollowers(userId, { cursor: pageParam })
        : followsApi.getFollowing(userId, { cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => {
      if (!last.hasMore || last.users.length === 0) return undefined
      return last.users[last.users.length - 1].followed_at
    },
  })

  // Search mode — alphabetical cursor, infinite. Pass the SANITIZED query.
  const searchQueryResult = useInfiniteQuery({
    queryKey: ['followList', userId, direction, 'search', sanitizedSearch],
    enabled: isSearching && !!userId,
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? followsApi.getFollowers(userId, { cursor: pageParam, searchQuery: sanitizedSearch })
        : followsApi.getFollowing(userId, { cursor: pageParam, searchQuery: sanitizedSearch }),
    initialPageParam: null,
    getNextPageParam: (last) => {
      if (!last.hasMore || last.users.length === 0) return undefined
      const tail = last.users[last.users.length - 1]
      return { display_name: tail.display_name, id: tail.id }
    },
  })

  const active = isSearching ? searchQueryResult : listQuery
  const users = active.data?.pages.flatMap(p => p.users) ?? []

  // Follow statuses for visible users (batched, single round-trip per page set).
  // Key includes viewer identity (auth state) AND sorted IDs (stable on reorder).
  const { user: viewer } = useAuth()
  const viewerId = viewer?.id ?? 'anon'
  const sortedUserIds = users.map(u => u.id).slice().sort()
  const statusesQuery = useQuery({
    queryKey: ['followStatuses', viewerId, sortedUserIds],
    enabled: sortedUserIds.length > 0 && !!viewer,
    queryFn: () => followsApi.getFollowStatuses(sortedUserIds),
    staleTime: 30_000,
  })

  return {
    users,
    followingSet: statusesQuery.data ?? new Set(),
    loading: active.isLoading,
    loadingMore: active.isFetchingNextPage,
    error: active.error,
    hasMore: !!active.hasNextPage,
    fetchMore: active.fetchNextPage,
    refetch: active.refetch,
  }
}
```

**Race control is free:** React Query keys debounced search by `searchQuery` — older response from a previous query doesn't write to current cache because the queryKey already changed.

**Follow mutations use the existing `useFollowUser` hook** (`src/hooks/useFollowUser.js`). That hook already invalidates `['followCounts']` so the parent profile page's count updates after a follow toggle. The modal calls `follow.mutate(userId)` / `unfollow.mutate(userId)` and additionally updates a local `followingSet` for optimistic button state. On error, the mutation's `onError` callback reverts the local `followingSet` and shows a `toast.error()` (sonner, already used in `ReportModal.jsx`).

### Component State

With React Query owning server state, the component holds only UI state:

```js
const [searchInput, setSearchInput] = useState('')        // raw input
const [debouncedQuery, setDebouncedQuery] = useState('')  // 250ms behind
const [optimisticToggles, setOptimisticToggles] = useState(new Set())
                                          // overlay on top of followingSet
const [sheetState, setSheetState] = useState('half')      // 'half' | 'full' | 'closing'
const [dragOffset, setDragOffset] = useState(0)
```

The effective `isFollowing(userId)` = `followingSet.has(id) XOR optimisticToggles.has(id)`.

## UX & Visual

### Sheet Form Factor

- **Half detent (default):** `height: 75vh`, opens from bottom with `translateY` spring.
- **Full detent:** `height: 95vh`, reached by dragging the grabber/header up past a 50px distance threshold OR a 0.3 px/ms velocity threshold (whichever fires first). Same threshold applies symmetrically to close gestures.
- **Closed:** dragging down past threshold (or tapping backdrop, or ESC) closes the sheet.
- **From full to closed:** requires two drags — full → half → closed. Prevents accidental dismissal.
- **Animation:** CSS `transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1)` (iOS-feel). During active drag, transition is off and `transform` follows finger 1:1.
- **Backdrop opacity:** scales linearly from 0.6 (at half/full) → 0 (at closed position) during drag.
- **Grabber:** existing 40×4 pill stays; doubles as a tappable detent-toggle as a non-gesture fallback.

### Sticky Search Bar

- Sits just below the grabber, above the row list. `position: sticky; top: 0` inside the scroll container so it stays pinned during scroll. (The sheet's outer `flex flex-col` wraps a header chunk + a `flex-1 min-h-0 overflow-y-auto` scroll body. The search bar lives inside that scroll body as the first child with `sticky top-0` — verified to work; this is the same pattern used by Tailwind's own docs in nested-scroll modals.)
- Visual: rounded-full pill, `background: var(--color-bg)`, soft inset shadow (1px inset top, no outer shadow), Outfit 400 16px input.
- Left: inline search SVG (24-line stroke icon). The project does not depend on `lucide-react`; icons are inline SVG per existing pattern in `FollowListModal.jsx` close button.
- Right: clear `×` button — visible only when `searchInput !== ''`; tapping clears and refocuses input.
- Placeholder: `"Search followers"` / `"Search following"` depending on `type`.
- Searching indicator: when `searchQueryResult.isFetching && isSearching`, replace the left icon with a 14px spinning ring; same color as text-tertiary.

### Row Markup (HTML semantics fix)

**Cannot nest `<button>` inside `<button>`.** Current row is `<button>`; new row needs an explicitly interactive wrapper that's not a button:

```jsx
<div
  role="link"
  tabIndex={0}
  aria-label={`${user.display_name} profile`}
  onClick={() => handleUserClick(user)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleUserClick(user); } }}
  className="…"
>
  <Avatar … />
  <IdentityBlock … />
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); handleFollowToggle(user); }}
    aria-label={isFollowing(user.id) ? `Unfollow ${user.display_name}` : `Follow ${user.display_name}`}
  >
    {isFollowing(user.id) ? 'Following' : 'Follow'}
  </button>
</div>
```

The `<div role="link">` is keyboard-focusable and announces as a link. The inner `<button>` is a real interactive button. No nested buttons. Tap target on the wrapper covers most of the row; the button has its own tap target on the right.

### Row Visual

- Height: 64px. Padding: `py-3.5 px-4`.
- Layout: `flex items-center gap-3`.
- **Avatar:** 44px circle. Existing avatar logic kept (image if present, otherwise primary-color circle with initial).
- **Identity block (flex-1):**
  - Display name: Outfit 500, 16px, `--color-text-primary`, truncate.
  - Follower count: Outfit 400, 13px, `--color-text-tertiary`. Format: `"1 follower"` (singular) / `"87 followers"` (plural) / `"No followers yet"` (zero).
- **Action button (right):** 32px-tall pill, padded `px-4`, Outfit 600 14px.
  - `"Follow"` — filled `--color-primary`, `--color-text-on-primary`.
  - `"Following"` — outline (1px `--color-divider`), `--color-text-primary`, background `--color-surface-elevated`.
  - Hidden when the row IS the current user (can't follow yourself) or when not authenticated.
- **No chevron** — the inline button makes intent clear; chevron felt clinical.
- Hover: subtle warm-stone tint `rgba(0,0,0,0.04)` on the wrapper.
- All colors via `var(--color-*)` per CLAUDE.md §1.3. No Tailwind color classes anywhere.

### Infinite Scroll (replaces Load More button)

- `IntersectionObserver` created in a `useEffect`.
- **`root: scrollContainerRef.current`** — required, because the list scrolls inside the modal, not the viewport. Without this, intersection never fires reliably in the sheet.
- `rootMargin: '200px'` — start fetching 200px before sentinel reaches the bottom edge.
- Sentinel `<div ref={sentinelRef} aria-hidden />` placed after the last row.
- Effect re-creates the observer when `scrollContainerRef.current` exists and on `isSearching` change (different mode, different pagination semantics).
- Callback: when intersecting AND `hasMore` AND `!loadingMore` AND `!error` → `fetchMore()`. The `!error` gate prevents thrash on persistent failure: once a fetch fails, we mark `error` and DO NOT auto-retry from the observer. The user must scroll up and back down OR tap a manual "Tap to retry" pill that appears below the list, which clears the error and re-fires.
- React Query's `fetchNextPage` is idempotent — calling it while `isFetchingNextPage` is true is a no-op, so the observer re-firing on append doesn't cause duplicate requests.

### Focus Management

**Hook extension required.** `useFocusTrap` currently calls `focusableElements[0].focus()` in a `requestAnimationFrame` on mount — that lands on the close button, which is wrong here. Racing it with a second `rAF` from the modal is fragile timing coupling. Cleaner fix:

- Extend `useFocusTrap` to accept an optional `initialFocusRef`. **Critical: default the destructured options object so existing 2-arg callers don't break:**
  ```js
  export function useFocusTrap(isOpen, onClose, { initialFocusRef } = {}) { … }
  ```
  If `initialFocusRef` is provided, the auto-focus `rAF` calls `initialFocusRef.current?.focus({ preventScroll: true })` instead of `focusableElements[0].focus()`. Falls back to the original behavior when the ref is absent or its `.current` is null. No other behavior changes. All existing 2-arg call sites (e.g., other modals using the hook) keep working unchanged because the third arg defaults to `{}`.
- Modal passes `{ initialFocusRef: searchInputRef }`. On open, focus lands on the search input. Skeleton + sticky bar guarantees the input exists at mount.
- **DOM order fix:** the current modal has the close button in the header before the scroll body. To make Tab progression intuitive (search → results → close), the scroll body needs to come before the close button in DOM, or — simpler — move the close button into the header AFTER the rest of the header content with `order` CSS only being layout (not tab). Easiest path: keep DOM order as-is and accept that Tab from search goes through rows then loops back via the trap to close. Document this rather than over-engineer.
- Tab cycle still trapped within modal via the hook's existing Shift+Tab/Tab boundary handling.

### States

- **Initial load:** 5 shimmering skeleton rows. Skeleton = `--color-divider` base block with a horizontal gradient sweep animation (1.2s linear loop). Avoids dead spinner-in-void feel.
- **Empty followers:** centered editorial text. Headline (Outfit 500): `"No followers yet"`. Body (Outfit 400, tertiary): `"Share your profile to get discovered."` No emoji.
- **Empty following:** Headline: `"Not following anyone yet"`. Body: `"Find people whose taste you trust on dish pages."`
- **Search no results:** Headline: `"No one matches \"<query>\""`. Body: `"Try a different name."`
- **Error (initial):** Headline: `"Couldn't load"`. Tappable pill beneath: `"Tap to retry"`. On tap, `refetch()`.
- **Error (load more):** banner pill at list bottom: `"Couldn't load more. Tap to retry."` Tap re-fires `fetchMore()`. Auto-retry from observer disabled while error is set.

### Accessibility

- `useFocusTrap` retained with override (above).
- `aria-live="polite"` region announces page loads ("Loaded 20 more followers").
- ESC closes. Drag has tap-grabber fallback to toggle detents.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` retained.
- Inner Follow buttons have full `aria-label`.

## Edge Cases

- **Empty `userIds` in `getFollowStatuses`:** returns empty Set without querying.
- **Not authenticated viewing someone else's followers:** list renders (public), but Follow buttons hidden — `followingSet` is empty (current user is null).
- **Viewing your own follower list:** Follow buttons appear on rows for users you don't follow; "Following" buttons on rows for users you do. Tapping unfollow on YOUR followers list does NOT remove them as a follower (deferred eviction feature) — it only changes whether you follow them back.
- **Self-row in your following list:** impossible (you can't follow yourself) — no special handling needed.
- **Self-row in your followers list:** also impossible.
- **Profile fetch failure inside `_paginateFollows`:** existing fallback to `'Anonymous'` is retained.
- **Sanitize search input:** route through `sanitizeSearchQuery` from `src/utils/sanitize.js` before passing to RPC.
- **Toast for follow error rollback:** uses `sonner`'s `toast.error()` — the existing pattern in `ReportModal.jsx` and other modals.
- **RPC not deployed yet on remote project:** during local dev before Dan runs the SQL, search calls will return `function does not exist`. Hook catches `error.code === '42883'` (undefined_function) specifically and falls back to a banner: "Search isn't available yet — try the full list." Removed once RPC is verified in production. (Implementation plan owns the timing.)
- **Search query with only sanitizer-stripped chars (e.g. `%%`):** `useFollowList` sanitizes the input before deciding `isSearching`. If the sanitized output is empty, the hook stays in recency-list mode rather than entering an empty search state.

## Performance Notes

- New RPC is single-statement, indexed on `(follower_id)` and `(followed_id)` (existing) + `display_name` (need to verify; if missing, add `CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower ON profiles ((lower(display_name)))` and adjust RPC to use `lower()`).
- `getFollowStatuses` queries up to ~40 IDs at a time (two pages worth). Indexed lookup, sub-10ms.
- Skeleton rendering means LCP for the sheet is near-instant; real rows fade in on data arrival.

## Testing

- **Vitest unit:** extend `src/api/followsApi.test.js` (or create) covering: `searchFollows` happy path, empty query short-circuit, sanitizer-stripped query, RPC error classification.
- **Manual smoke (per SMOKE-TEST.md):**
  - Open Profile → tap Followers → sheet opens at half detent, search input is focused.
  - Drag up → snaps to full.
  - Drag down → snaps back to half, then closed.
  - Type a name → results filter server-side after 250ms; alphabetical, paginated correctly through 21+.
  - Tap Follow on a row → button toggles to Following without page navigation; parent profile's "Following N" count increments (via `useFollowUser` cache invalidation).
  - Scroll to bottom → next 20 rows load automatically.
  - Disconnect network mid-follow → button reverts, sonner toast appears.
  - Disconnect mid-pagination → "Couldn't load more. Tap to retry." banner shows; tapping refires.

## Open Questions Resolved During Brainstorm + Codex Review

| Question | Decision |
|---|---|
| Search scope | Server-side, ranked, paginated, via new RPC `search_user_follows`. |
| Row actions | Inline Follow/Unfollow button, separate from row wrapper (no nested `<button>`). |
| Form factor | Tall bottom sheet with half/full detents, drag-driven. |
| Row content | Avatar + name + follower count (singular/plural). |
| Pagination | Infinite scroll via `IntersectionObserver` with `root` = scroll container. |
| Data layer | React Query throughout (`useInfiniteQuery` + `useQuery` + `useMutation` via `useFollowUser`). |
| Search result limit | Paginated alphabetically with `(display_name, id)` cursor — fully reachable, no hidden tail. |
| Error retry on observer | Manual via "Tap to retry"; no auto-retry to prevent thrash. |
| Focus on open | Override hook to land on search input. |

## Implementation Order (preview for the plan)

1. Add `search_user_follows` to `supabase/schema.sql` and `supabase/migrations/20260516_search_user_follows.sql`. Run in Supabase SQL Editor. Verify with test call.
2. Extend `useFocusTrap` to accept `{ initialFocusRef }` option (additive).
3. Extend `followsApi.js` — `searchFollows`, route in `getFollowers/getFollowing`, add `getFollowStatuses`. Each method uses the `throw error.type ? error : createClassifiedError(error)` catch pattern.
4. Create `src/hooks/useFollowList.js` (React Query wrapper).
5. Rewrite `FollowListModal.jsx` skeleton + state, hooked to `useFollowList`.
6. Wire search bar + debounce + sanitize.
7. Wire infinite scroll observer with `root: scrollContainerRef.current`.
8. Wire follow/unfollow inline button via `useFollowUser` + optimistic `optimisticToggles` set.
9. Wire detent gestures + animations.
10. Add skeleton loading + empty/error states.
11. Pass `initialFocusRef={searchInputRef}` to `useFocusTrap`.
12. Manual smoke against SMOKE-TEST.md.

Each step runs through `/codex-cli` individually before commit, per Dan's standing rule.
