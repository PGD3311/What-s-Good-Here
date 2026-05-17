# Follow List Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the followers/following popup as a tall, gesture-driven bottom sheet with sticky server-side search, inline follow buttons, and smooth infinite scroll — backed by a new `search_user_follows` RPC and threaded through React Query.

**Architecture:** New PL/pgSQL RPC for ranked, paginated search of a user's relationship. `followsApi` extended with `searchFollows` (routed via existing `getFollowers`/`getFollowing`) and `getFollowStatuses`. A new `useFollowList` hook centralizes React Query state for the modal. The modal itself is a full rewrite using `useInfiniteQuery`, `IntersectionObserver` rooted on the scroll container, and an extended `useFocusTrap` that accepts an `initialFocusRef`.

**Tech Stack:** React 19, React Query v5 (`@tanstack/react-query`), Vitest, Vite, Tailwind (layout-only per CLAUDE.md §1.3), Supabase PL/pgSQL + PostgREST RPC, sonner (toasts).

**Spec:** `docs/superpowers/specs/2026-05-16-follow-list-modal-redesign.md`

**Standing rule per Dan:** Every task runs through `/codex-cli` before commit (`npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "review <files> for CLAUDE.md violations and bugs"`). Address any blockers/highs before committing.

---

## Task 1: Add `search_user_follows` RPC migration

**Files:**
- Create: `supabase/migrations/20260516_search_user_follows.sql`
- Modify: `supabase/schema.sql` (append the same function definition)

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260516_search_user_follows.sql`:

```sql
-- search_user_follows: paginated alphabetical search of a user's
-- followers or following list. Mirrors the hardening pattern in
-- search_users_with_followers (input validation, limit clamp, security
-- definer + locked search_path).
--
-- Returns (display_name, id) tuple-ordered rows for stable cursor pagination.

CREATE OR REPLACE FUNCTION search_user_follows(
  p_user_id UUID,
  p_direction TEXT,
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

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS search_user_follows(UUID, TEXT, TEXT, TEXT, UUID, INT);
```

- [ ] **Step 2: Append same function to `supabase/schema.sql`**

Use `Read` to find the section near the existing `search_users_with_followers` function (`grep -n "search_users_with_followers" supabase/schema.sql`). Append the `CREATE OR REPLACE FUNCTION search_user_follows(...)` block from Step 1 directly below it (without the `-- ROLLBACK:` comment — schema.sql holds canonical state, not history).

- [ ] **Step 3: Run in Supabase SQL Editor**

Open the Denis Supabase project dashboard → SQL Editor → paste the contents of `20260516_search_user_follows.sql` → Run. Expected: "Success. No rows returned."

- [ ] **Step 4: Verify with a test call in SQL Editor**

In the SQL Editor, run:

```sql
SELECT * FROM search_user_follows(
  (SELECT id FROM profiles LIMIT 1),
  'followers',
  NULL,
  NULL,
  NULL,
  5
);
```

Expected: 0–5 rows or an empty result. **No error.** If the first profile has no followers, that's fine — confirms the function runs.

Then test invalid direction:

```sql
SELECT * FROM search_user_follows(
  '00000000-0000-0000-0000-000000000000',
  'bogus',
  NULL,
  NULL,
  NULL,
  5
);
```

Expected: ERROR `22023` "Invalid direction: bogus, must be followers or following".

- [ ] **Step 5: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review supabase/migrations/20260516_search_user_follows.sql for SQL bugs, planner concerns, missing validation, or differences from search_users_with_followers hardening." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260516_search_user_follows.sql supabase/schema.sql
git commit -m "feat(follows): add search_user_follows RPC for paginated relationship search"
```

---

## Task 2: Extend `useFocusTrap` with `initialFocusRef` option

**Files:**
- Modify: `src/hooks/useFocusTrap.js`

- [ ] **Step 1: Edit the hook signature and focus block**

In `src/hooks/useFocusTrap.js`, update the hook signature and the focus effect. Read the file first, then apply this edit pattern to the relevant section (the `useEffect` near line 23):

```js
export function useFocusTrap(isOpen, onClose, { initialFocusRef } = {}) {
  const containerRef = useRef(null)
  const previousActiveElement = useRef(null)

  // Store the previously focused element when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement
    }
  }, [isOpen])

  // Focus initialFocusRef if provided, else first focusable element
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus({ preventScroll: true })
        return
      }
      const focusableElements = getFocusableElements(containerRef.current)
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    })
  }, [isOpen, initialFocusRef])

  // … rest of hook unchanged
```

**Critical:** the `= {}` default on the third arg is what keeps every existing 2-arg call site working. Without it, callers passing `undefined` would crash on destructuring.

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: build succeeds. All existing modals using `useFocusTrap(isOpen, onClose)` continue to work because the new third arg defaults to `{}`.

- [ ] **Step 3: Smoke-check one existing caller**

```bash
grep -rn "useFocusTrap" src/components src/pages --include="*.jsx" | head -5
```

Open one existing caller (e.g. `src/components/ReportModal.jsx` or whatever appears first) in `Read`, confirm it still calls `useFocusTrap(isOpen, onClose)` with two args. No changes needed there — the third arg defaults.

- [ ] **Step 4: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review src/hooks/useFocusTrap.js changes for backwards compatibility, race conditions in the focus effect, and any subtle bugs in the initialFocusRef handling." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFocusTrap.js
git commit -m "feat(useFocusTrap): accept optional initialFocusRef to override auto-focus target"
```

---

## Task 3: Add `getFollowStatuses` to `followsApi` (TDD)

**Files:**
- Modify: `src/api/followsApi.js`
- Modify or Create: `src/api/followsApi.test.js` (check existence first with `ls src/api/followsApi.test.js`; if missing, create with the test module header pattern from `src/api/favoritesApi.test.js`)

- [ ] **Step 1: Write failing tests**

If `src/api/followsApi.test.js` doesn't exist, create it with:

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { followsApi } from './followsApi'

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

import { supabase } from '../lib/supabase'

describe('followsApi', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.resetAllMocks() })
})
```

Then either inside that file's outer `describe` (or in an existing file's appropriate location), add:

```js
describe('getFollowStatuses', () => {
  it('returns empty Set when userIds is empty', async () => {
    const result = await followsApi.getFollowStatuses([])
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('returns empty Set when not authenticated', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await followsApi.getFollowStatuses(['a', 'b'])
    expect(result.size).toBe(0)
  })

  it('returns Set of followed IDs for authenticated user', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    const inMock = vi.fn().mockResolvedValue({
      data: [{ followed_id: 'a' }, { followed_id: 'c' }],
      error: null,
    })
    const eqMock = vi.fn().mockReturnValue({ in: inMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    supabase.from.mockReturnValue({ select: selectMock })

    const result = await followsApi.getFollowStatuses(['a', 'b', 'c'])

    expect(supabase.from).toHaveBeenCalledWith('follows')
    expect(selectMock).toHaveBeenCalledWith('followed_id')
    expect(eqMock).toHaveBeenCalledWith('follower_id', 'me')
    expect(inMock).toHaveBeenCalledWith('followed_id', ['a', 'b', 'c'])
    expect(result.has('a')).toBe(true)
    expect(result.has('b')).toBe(false)
    expect(result.has('c')).toBe(true)
  })

  it('throws classified error on supabase error', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX' } })
    supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inMock }) }) })

    await expect(followsApi.getFollowStatuses(['a'])).rejects.toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm run test -- src/api/followsApi.test.js
```

Expected: 4 failing tests with `followsApi.getFollowStatuses is not a function`.

- [ ] **Step 3: Implement `getFollowStatuses`**

In `src/api/followsApi.js`, add the method inside the `followsApi` object (after `getFollowing`):

```js
/**
 * Batch-check which of the given user IDs the current user follows.
 * @param {string[]} userIds
 * @returns {Promise<Set<string>>}
 */
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
},
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- src/api/followsApi.test.js
```

Expected: 4 passing tests for `getFollowStatuses`.

- [ ] **Step 5: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review src/api/followsApi.js (just the new getFollowStatuses method) and src/api/followsApi.test.js for: error classification per CLAUDE.md §1.2, empty-input handling, auth gate correctness, test mock realism. Be ruthless." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Commit**

```bash
git add src/api/followsApi.js src/api/followsApi.test.js
git commit -m "feat(followsApi): add getFollowStatuses for batched follow-state lookup"
```

---

## Task 4: Add `searchFollows` to `followsApi` + route through `getFollowers`/`getFollowing` (TDD)

**Files:**
- Modify: `src/api/followsApi.js`
- Modify: `src/api/followsApi.test.js`

- [ ] **Step 1: Write failing tests**

Append to `src/api/followsApi.test.js`:

```js
describe('searchFollows via getFollowers/getFollowing', () => {
  it('returns empty result for empty query', async () => {
    const result = await followsApi.getFollowers('user-1', { searchQuery: '' })
    expect(result).toEqual({ users: [], hasMore: false })
  })

  it('returns empty result for whitespace-only query', async () => {
    const result = await followsApi.getFollowing('user-1', { searchQuery: '   ' })
    expect(result).toEqual({ users: [], hasMore: false })
  })

  it('returns empty result when sanitizer strips everything (e.g. %%)', async () => {
    const result = await followsApi.getFollowers('user-1', { searchQuery: '%%' })
    expect(result).toEqual({ users: [], hasMore: false })
  })

  it('calls RPC with correct args and maps rows for followers direction', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'a', display_name: 'Alice', avatar_url: null, follower_count: 5, followed_at: '2026-01-01' },
        { id: 'b', display_name: 'Bob', avatar_url: 'x.jpg', follower_count: 0, followed_at: '2026-01-02' },
      ],
      error: null,
    })

    const result = await followsApi.getFollowers('user-1', { searchQuery: 'al', limit: 1 })

    expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
      p_user_id: 'user-1',
      p_direction: 'followers',
      p_query: 'al',
      p_cursor_name: null,
      p_cursor_id: null,
      p_limit: 2, // limit + 1 for hasMore detection
    }))
    expect(result.users).toHaveLength(1)
    expect(result.users[0].id).toBe('a')
    expect(result.users[0].display_name).toBe('Alice')
    expect(result.hasMore).toBe(true)
  })

  it('calls RPC with following direction when invoked via getFollowing', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await followsApi.getFollowing('user-1', { searchQuery: 'al' })
    expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
      p_direction: 'following',
    }))
  })

  it('passes through cursor object as p_cursor_name + p_cursor_id', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await followsApi.getFollowers('user-1', {
      searchQuery: 'al',
      cursor: { display_name: 'Anna', id: 'cursor-id' },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
      p_cursor_name: 'Anna',
      p_cursor_id: 'cursor-id',
    }))
  })

  it('throws classified error on RPC failure', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42883' } })
    await expect(followsApi.getFollowers('user-1', { searchQuery: 'al' })).rejects.toBeDefined()
  })

  it('falls back to recency cursor when searchQuery is absent', async () => {
    // Verify it does NOT call rpc (uses .from('follows') instead)
    const orderMock = vi.fn().mockReturnThis()
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null })
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ order: orderMock, lt: vi.fn().mockReturnThis() }),
      }),
    })
    // Set up a chain that returns empty
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: limitMock }
    supabase.from.mockReturnValue(chain)

    await followsApi.getFollowers('user-1')
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledWith('follows')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm run test -- src/api/followsApi.test.js
```

Expected: the new test block fails (RPC tests fail because no routing exists; empty-query tests may pass if existing code happens to return empty, but most fail).

- [ ] **Step 3: Add `searchFollows` helper and route in `getFollowers`/`getFollowing`**

In `src/api/followsApi.js`, after the existing `_paginateFollows` helper, add:

```js
/**
 * Server-side ranked search of a user's followers/following list.
 * Uses search_user_follows RPC with (display_name, id) cursor pagination.
 */
async function _searchFollows(userId, direction, { query, cursor = null, limit = 20 } = {}) {
  try {
    if (!query?.trim()) return { users: [], hasMore: false }
    const sanitized = sanitizeSearchQuery(query, 50)
    if (!sanitized || sanitized.length < 1) return { users: [], hasMore: false }

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

Then change the existing `getFollowers` and `getFollowing` to route on `searchQuery`:

```js
async getFollowers(userId, options) {
  if (options?.searchQuery) {
    return _searchFollows(userId, 'followers', {
      query: options.searchQuery,
      cursor: options.cursor,
      limit: options.limit,
    })
  }
  return _paginateFollows(userId, 'followers', options)
},

async getFollowing(userId, options) {
  if (options?.searchQuery) {
    return _searchFollows(userId, 'following', {
      query: options.searchQuery,
      cursor: options.cursor,
      limit: options.limit,
    })
  }
  return _paginateFollows(userId, 'following', options)
},
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- src/api/followsApi.test.js
```

Expected: all `searchFollows via getFollowers/getFollowing` tests pass, plus existing tests still pass.

- [ ] **Step 5: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review the _searchFollows helper and getFollowers/getFollowing routing in src/api/followsApi.js. Check: sanitization correctness, cursor shape passthrough, error classification, hasMore detection, fallback to _paginateFollows when no searchQuery." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Commit**

```bash
git add src/api/followsApi.js src/api/followsApi.test.js
git commit -m "feat(followsApi): server-side search via search_user_follows RPC"
```

---

## Task 5: Create `useFollowList` hook

**Files:**
- Create: `src/hooks/useFollowList.js`

- [ ] **Step 1: Write the hook**

```js
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { followsApi } from '../api/followsApi'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { useAuth } from '../context/AuthContext'

/**
 * Centralizes server-state for FollowListModal.
 * - Cursor-paginated recency list when no search query.
 * - Alphabetical (display_name, id) cursor when searching.
 * - Batched follow-state lookup keyed on viewer + sorted user IDs.
 */
export function useFollowList({ userId, type, searchQuery }) {
  const direction = type // 'followers' | 'following'
  const sanitizedSearch = sanitizeSearchQuery(searchQuery ?? '', 50)
  const isSearching = !!sanitizedSearch && sanitizedSearch.length >= 1

  // List mode — recency cursor
  const listQuery = useInfiniteQuery({
    queryKey: ['followList', userId, direction],
    enabled: !isSearching && !!userId,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? followsApi.getFollowers(userId, { cursor: pageParam })
        : followsApi.getFollowing(userId, { cursor: pageParam }),
    getNextPageParam: (last) => {
      if (!last.hasMore || last.users.length === 0) return undefined
      return last.users[last.users.length - 1].followed_at
    },
  })

  // Search mode — alphabetical cursor
  const searchQueryResult = useInfiniteQuery({
    queryKey: ['followList', userId, direction, 'search', sanitizedSearch],
    enabled: isSearching && !!userId,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? followsApi.getFollowers(userId, { cursor: pageParam, searchQuery: sanitizedSearch })
        : followsApi.getFollowing(userId, { cursor: pageParam, searchQuery: sanitizedSearch }),
    getNextPageParam: (last) => {
      if (!last.hasMore || last.users.length === 0) return undefined
      const tail = last.users[last.users.length - 1]
      return { display_name: tail.display_name, id: tail.id }
    },
  })

  const active = isSearching ? searchQueryResult : listQuery
  const users = active.data?.pages.flatMap(p => p.users) ?? []

  // Follow statuses for visible users (sorted IDs + viewer for stable cache key)
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
    searching: isSearching && active.isFetching,
    error: active.error,
    hasMore: !!active.hasNextPage,
    fetchMore: active.fetchNextPage,
    refetch: active.refetch,
    isSearching,
  }
}
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: build succeeds. Hook file compiles; no consumers yet.

- [ ] **Step 3: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review src/hooks/useFollowList.js for: queryKey stability, useInfiniteQuery getNextPageParam correctness for both cursor shapes, sanitizer placement, and the followStatuses cache key (does it actually prevent cross-viewer leaks). Also check that useAuth is the correct hook import path." 2>/dev/null
```

Address blockers/highs. **Verify** `useAuth` is exported from `src/context/AuthContext.js` — if not, find the correct import path with `grep -rn "export.*useAuth" src/context src/hooks`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFollowList.js
git commit -m "feat(useFollowList): React Query hook for follow-list pagination + search"
```

---

## Task 6: Rewrite `FollowListModal` — structural skeleton + state

**Files:**
- Modify: `src/components/FollowListModal.jsx` (full rewrite)

This task drops in the full rewrite WITHOUT the gesture/drag logic — that lands in Task 8. Goal here is to have a working modal with React Query + search + infinite scroll, fixed at half detent (75vh).

- [ ] **Step 1: Replace the file**

Read the current `src/components/FollowListModal.jsx`, then replace its contents with the new structure. The file needs to:

1. Import `useFollowList`, `useFollowUser`, `useFocusTrap`, `useAuth`, `useNavigate`, `toast` from sonner, `sanitizeSearchQuery`.
2. Manage local UI state: `searchInput`, `debouncedQuery`, `optimisticToggles`.
3. Debounce `searchInput` → `debouncedQuery` (250ms).
4. Pass `debouncedQuery` to `useFollowList`.
5. Render: backdrop, fixed-height sheet (75vh), grabber, header with title + close, sticky search bar inside scroll container, list rows, sentinel for IntersectionObserver, states (loading/empty/error/search-no-results).

Full file body:

```jsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useFollowList } from '../hooks/useFollowList'
import { useFollowUser } from '../hooks/useFollowUser'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useAuth } from '../context/AuthContext'
import { getUserMessage } from '../utils/errorHandler'

export function FollowListModal({ userId, type, onClose }) {
  const navigate = useNavigate()
  const { user: viewer } = useAuth()
  const isFollowers = type === 'followers'
  const title = isFollowers ? 'Followers' : 'Following'

  // Local UI state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [optimisticToggles, setOptimisticToggles] = useState(() => new Set())

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const {
    users, followingSet, loading, loadingMore, searching,
    error, hasMore, fetchMore, refetch, isSearching,
  } = useFollowList({ userId, type, searchQuery: debouncedQuery })

  const isFollowing = useCallback((id) => {
    const base = followingSet.has(id)
    return optimisticToggles.has(id) ? !base : base
  }, [followingSet, optimisticToggles])

  // Follow mutations (invalidates ['followCounts'] caches)
  const { follow, unfollow } = useFollowUser()

  const handleFollowToggle = useCallback((user) => {
    if (!viewer) return
    const currentlyFollowing = isFollowing(user.id)
    // Optimistic flip
    setOptimisticToggles(prev => {
      const next = new Set(prev)
      if (next.has(user.id)) next.delete(user.id)
      else next.add(user.id)
      return next
    })
    const mutation = currentlyFollowing ? unfollow : follow
    mutation.mutate(user.id, {
      onError: (err) => {
        // Revert optimistic toggle
        setOptimisticToggles(prev => {
          const next = new Set(prev)
          if (next.has(user.id)) next.delete(user.id)
          else next.add(user.id)
          return next
        })
        toast.error(getUserMessage(err, currentlyFollowing ? 'unfollowing' : 'following'))
      },
    })
  }, [viewer, isFollowing, follow, unfollow])

  const handleUserClick = (user) => { onClose(); navigate(`/user/${user.id}`) }

  // Refs
  const scrollContainerRef = useRef(null)
  const sentinelRef = useRef(null)
  const searchInputRef = useRef(null)
  const modalRef = useFocusTrap(true, onClose, { initialFocusRef: searchInputRef })

  // Infinite scroll observer — root is the inner scroll container
  useEffect(() => {
    if (!scrollContainerRef.current || !sentinelRef.current) return
    if (error || !hasMore) return

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMore && !loadingMore && !error) {
        fetchMore()
      }
    }, {
      root: scrollContainerRef.current,
      rootMargin: '200px',
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, error, fetchMore, isSearching])

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-list-title"
        className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--color-surface-elevated)',
          height: '75vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div
          style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '8px auto 4px', flex: '0 0 auto' }}
          aria-hidden="true"
        />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-divider)', flex: '0 0 auto' }}
        >
          <h2 id="follow-list-title" className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-full"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {/* Sticky search bar */}
          <div
            className="sticky top-0 z-10 px-4 pt-3 pb-2"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <div
              className="flex items-center gap-2 px-3 rounded-full"
              style={{
                background: 'var(--color-bg)',
                height: 40,
                boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.05)',
              }}
            >
              {searching ? (
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                  style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-text-tertiary)' }}
                  aria-hidden="true"
                />
              ) : (
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}
                     fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10 17a7 7 0 100-14 7 7 0 000 14z" />
                </svg>
              )}
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isFollowers ? 'Search followers' : 'Search following'}
                className="flex-1 bg-transparent outline-none"
                style={{ color: 'var(--color-text-primary)', fontSize: 16 }}
                aria-label={`Search ${title.toLowerCase()}`}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); searchInputRef.current?.focus() }}
                  className="p-1 -mr-1 rounded-full"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" style={{ color: 'var(--color-text-tertiary)' }}
                       fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Body content */}
          {loading ? (
            <SkeletonRows />
          ) : error && users.length === 0 ? (
            <ErrorState onRetry={refetch} />
          ) : users.length === 0 ? (
            <EmptyState type={type} isSearching={isSearching} query={debouncedQuery} />
          ) : (
            <>
              <ul className="divide-y" style={{ borderColor: 'var(--color-divider)' }} aria-live="polite">
                {users.map((user) => (
                  <FollowRow
                    key={user.id}
                    user={user}
                    isFollowing={isFollowing(user.id)}
                    showFollowButton={!!viewer && viewer.id !== user.id}
                    onRowClick={() => handleUserClick(user)}
                    onFollowToggle={() => handleFollowToggle(user)}
                  />
                ))}
              </ul>
              {/* Sentinel for IntersectionObserver */}
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
              {loadingMore && <LoadingMoreIndicator />}
              {error && users.length > 0 && <LoadMoreErrorBanner onRetry={fetchMore} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FollowRow({ user, isFollowing, showFollowButton, onRowClick, onFollowToggle }) {
  const followerLabel = user.follower_count === 0
    ? 'No followers yet'
    : user.follower_count === 1
      ? '1 follower'
      : `${user.follower_count.toLocaleString()} followers`

  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        aria-label={`${user.display_name} profile`}
        onClick={onRowClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick() } }}
        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-black/[0.04] focus:outline-none focus-visible:bg-black/[0.04]"
        style={{ minHeight: 64 }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
          style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <span>{user.display_name?.charAt(0).toUpperCase() || '?'}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: 16 }}>
            {user.display_name || 'Anonymous'}
          </p>
          <p className="truncate" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            {followerLabel}
          </p>
        </div>

        {showFollowButton && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFollowToggle() }}
            aria-label={isFollowing ? `Unfollow ${user.display_name}` : `Follow ${user.display_name}`}
            className="px-4 rounded-full transition-colors flex-shrink-0"
            style={{
              height: 32,
              fontSize: 14,
              fontWeight: 600,
              background: isFollowing ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
              color: isFollowing ? 'var(--color-text-primary)' : 'var(--color-text-on-primary)',
              border: isFollowing ? '1px solid var(--color-divider)' : 'none',
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
    </li>
  )
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ minHeight: 64 }}>
          <div className="w-11 h-11 rounded-full skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded skeleton-shimmer" style={{ width: '60%' }} />
            <div className="h-3 rounded skeleton-shimmer" style={{ width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ type, isSearching, query }) {
  if (isSearching) {
    return (
      <div className="py-12 px-6 text-center">
        <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
          No one matches "{query}"
        </p>
        <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
          Try a different name.
        </p>
      </div>
    )
  }
  const isFollowers = type === 'followers'
  return (
    <div className="py-12 px-6 text-center">
      <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
        {isFollowers ? 'No followers yet' : 'Not following anyone yet'}
      </p>
      <p className="mt-1" style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>
        {isFollowers ? 'Share your profile to get discovered.' : 'Find people whose taste you trust on dish pages.'}
      </p>
    </div>
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="font-medium" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
        Couldn't load
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 px-4 py-2 rounded-full"
        style={{
          background: 'var(--color-primary)',
          color: 'var(--color-text-on-primary)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Tap to retry
      </button>
    </div>
  )
}

function LoadingMoreIndicator() {
  return (
    <div className="flex items-center justify-center py-4" aria-hidden="true">
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
      />
    </div>
  )
}

function LoadMoreErrorBanner({ onRetry }) {
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-divider)' }}>
      <button
        type="button"
        onClick={() => onRetry()}
        className="w-full py-2 rounded-lg text-sm font-medium"
        style={{
          background: 'var(--color-bg)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-divider)',
        }}
      >
        Couldn't load more. Tap to retry.
      </button>
    </div>
  )
}

export default FollowListModal
```

- [ ] **Step 2: Add skeleton shimmer CSS**

Open `src/index.css` and append (only if `.skeleton-shimmer` isn't already defined — check first):

```css
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-divider) 0%,
    var(--color-surface) 50%,
    var(--color-divider) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s linear infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 3: Verify build + lint pass**

```bash
npm run build && npm run lint
```

Expected: both succeed. No new color classes (CLAUDE.md §1.3 — all colors via `var(--color-*)`).

- [ ] **Step 4: Manual smoke — open the modal**

```bash
npm run dev
```

Navigate to `localhost:5173`, log in as a test user (see `SMOKE-TEST.md`), open `/profile`, tap "Followers" (or "Following"). Verify:
- Sheet opens at 75vh height.
- Search input has focus on open (cursor blinks in it without tapping).
- Type a name → after 250ms results filter.
- Tap a row → navigates to user profile.
- Tap Follow on a row whose user you don't follow → button becomes "Following" without navigation; parent profile's "Following N" count updates after closing the sheet (React Query invalidation).

If anything fails, stop and debug before continuing.

- [ ] **Step 5: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review src/components/FollowListModal.jsx and src/index.css changes for: CLAUDE.md §1.3 (no Tailwind color classes), button-in-button HTML, IntersectionObserver root correctness, sticky search bar inside scroll container behavior, accessibility, optimistic toggle correctness." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Commit**

```bash
git add src/components/FollowListModal.jsx src/index.css
git commit -m "feat(FollowListModal): rewrite with React Query, sticky search, infinite scroll, inline follow"
```

---

## Task 7: Add drag-gesture detents (half ↔ full ↔ closed)

**Files:**
- Modify: `src/components/FollowListModal.jsx`

- [ ] **Step 1: Add drag state + handlers**

In `FollowListModal.jsx`, add to the component body (above the JSX return):

```jsx
const [sheetState, setSheetState] = useState('half') // 'half' | 'full' | 'closing'
const [dragOffset, setDragOffset] = useState(0)
const dragStartRef = useRef({ y: 0, t: 0, state: 'half' })

const SHEET_HEIGHTS = { half: '75vh', full: '95vh' }
const DRAG_THRESHOLD_PX = 50
const DRAG_THRESHOLD_VELOCITY = 0.3 // px/ms

const handleDragStart = useCallback((clientY) => {
  dragStartRef.current = { y: clientY, t: performance.now(), state: sheetState }
  setDragOffset(0)
}, [sheetState])

const handleDragMove = useCallback((clientY) => {
  const delta = clientY - dragStartRef.current.y
  setDragOffset(delta)
}, [])

const handleDragEnd = useCallback((clientY) => {
  const delta = clientY - dragStartRef.current.y
  const elapsed = performance.now() - dragStartRef.current.t
  const velocity = elapsed > 0 ? Math.abs(delta) / elapsed : 0
  const startState = dragStartRef.current.state
  const crossed = Math.abs(delta) >= DRAG_THRESHOLD_PX || velocity >= DRAG_THRESHOLD_VELOCITY

  if (crossed) {
    if (delta < 0) {
      // Dragged up
      if (startState === 'half') setSheetState('full')
      // already full → stay full
    } else {
      // Dragged down
      if (startState === 'full') setSheetState('half')
      else if (startState === 'half') {
        setSheetState('closing')
        setTimeout(onClose, 220) // matches animation duration
      }
    }
  }
  setDragOffset(0)
}, [onClose])

// Touch handlers (drag is anchored on the grabber + header zone)
const onTouchStart = (e) => handleDragStart(e.touches[0].clientY)
const onTouchMove = (e) => handleDragMove(e.touches[0].clientY)
const onTouchEnd = (e) => handleDragEnd(e.changedTouches[0].clientY)

// Tap the grabber to toggle detent (non-gesture fallback)
const onGrabberClick = () => {
  setSheetState(prev => prev === 'half' ? 'full' : 'half')
}
```

- [ ] **Step 2: Update the sheet wrapper to use dynamic height + drag transform**

Replace the sheet `<div>` opening tag (`<div ref={modalRef} role="dialog" …>`) with:

```jsx
<div
  ref={modalRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="follow-list-title"
  className="absolute left-0 right-0 bottom-0 rounded-t-2xl flex flex-col"
  style={{
    background: 'var(--color-surface-elevated)',
    height: SHEET_HEIGHTS[sheetState === 'closing' ? 'half' : sheetState],
    transform: sheetState === 'closing'
      ? 'translateY(100%)'
      : `translateY(${Math.max(0, dragOffset)}px)`,
    transition: dragOffset === 0
      ? 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1), height 280ms cubic-bezier(0.32, 0.72, 0, 1)'
      : 'none',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  }}
  onClick={(e) => e.stopPropagation()}
>
```

And replace the grabber `<div>` with:

```jsx
<div
  onClick={onGrabberClick}
  onTouchStart={onTouchStart}
  onTouchMove={onTouchMove}
  onTouchEnd={onTouchEnd}
  style={{
    flex: '0 0 auto',
    padding: '8px 0 4px',
    cursor: 'grab',
    touchAction: 'none',
  }}
  aria-label="Drag to resize"
  role="separator"
>
  <div
    style={{ width: 40, height: 4, background: 'var(--color-divider)', borderRadius: 2, margin: '0 auto' }}
    aria-hidden="true"
  />
</div>
```

Also attach the same `onTouchStart/Move/End` handlers to the header `<div>` so users can grab the title area too.

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Manual smoke — gesture flow**

```bash
npm run dev
```

In a mobile-emulated browser (Chrome DevTools → Device Toolbar → iPhone 14 Pro, touch enabled):
- Open modal → opens at half (75vh).
- Drag grabber up → snaps to full (95vh).
- Drag grabber down from full → snaps back to half.
- Drag grabber down from half → snaps closed.
- Tap grabber → toggles between half and full.
- Tap backdrop → closes (existing behavior preserved via `onClose` on outer div).
- ESC key → closes (`useFocusTrap` still handles this).

If detent thresholds feel wrong on a real device, tune `DRAG_THRESHOLD_PX` or `DRAG_THRESHOLD_VELOCITY`. Default values are starting points.

- [ ] **Step 5: Codex review**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Review the drag-gesture handlers in src/components/FollowListModal.jsx for: race conditions between touchmove/touchend, dragOffset state thrashing on rapid drags, transition correctness, accessibility of the grabber as a drag-handle, and the closing animation timing (setTimeout vs CSS transition coupling)." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Commit**

```bash
git add src/components/FollowListModal.jsx
git commit -m "feat(FollowListModal): drag-gesture detents (half ↔ full ↔ closed)"
```

---

## Task 8: Full SMOKE-TEST golden path + accessibility check

**Files:**
- (None — verification only)

- [ ] **Step 1: Run unit tests**

```bash
npm run test -- src/api/followsApi.test.js
```

Expected: all pass.

- [ ] **Step 2: Run build + lint**

```bash
npm run build && npm run lint
```

Expected: both pass with no warnings on the touched files.

- [ ] **Step 3: SMOKE-TEST golden path**

Open `SMOKE-TEST.md`. Run through the followers/following sections (or, if no follower section exists, run the full social-related flows). Verify each manual case from the spec:

- Open Profile → tap Followers → sheet opens at half detent, search input is focused.
- Drag up → snaps to full.
- Drag down → snaps back to half, then closed.
- Type a name → results filter server-side after 250ms; alphabetical, paginated correctly past row 21+.
- Tap Follow on a row → button toggles to Following without page navigation; parent profile's "Following N" count increments after sheet closes (via `useFollowUser` cache invalidation).
- Scroll to bottom → next 20 rows load automatically.
- Disconnect network (DevTools → Network → Offline) mid-follow → button reverts, sonner toast appears.
- Disconnect mid-pagination → "Couldn't load" error state shows. Reconnect → tap retry button → resumes.

- [ ] **Step 4: Accessibility check**

In Chrome DevTools → Lighthouse → Accessibility, run an audit on the page with the modal open. Expected score ≥ 95. Verify with keyboard:
- Tab from search input goes through rows + follow buttons + close.
- ESC closes the modal.
- Screen reader (VoiceOver on Mac: Cmd+F5) announces "Followers, dialog" and reads each row as a link.

- [ ] **Step 5: Final codex review of all touched files**

```bash
npx @openai/codex exec --skip-git-repo-check -m gpt-5.3-codex --config model_reasoning_effort="high" --sandbox read-only "Final review pass on this branch's changes: src/components/FollowListModal.jsx, src/hooks/useFollowList.js, src/hooks/useFocusTrap.js, src/api/followsApi.js, src/api/followsApi.test.js, src/index.css, supabase/migrations/20260516_search_user_follows.sql, supabase/schema.sql. Look for: any remaining CLAUDE.md rule violations, dead code, leftover console.logs, unused imports, accessibility regressions, anything that wouldn't pass a senior code review." 2>/dev/null
```

Address blockers/highs.

- [ ] **Step 6: Final commit if any review fixes**

```bash
git add -A
git status
git commit -m "fix(FollowListModal): final review polish"
```

(Skip if no changes from the final review pass.)

---

## Self-review checklist (run before declaring done)

- [ ] Every spec section maps to a task above (RPC ✓ task 1, hook extension ✓ task 2, getFollowStatuses ✓ task 3, searchFollows ✓ task 4, useFollowList ✓ task 5, modal rewrite ✓ task 6, detents ✓ task 7, smoke ✓ task 8).
- [ ] No `TBD`/`TODO`/`fill in later` placeholders anywhere in the plan.
- [ ] Every code block is complete; nothing says "similar to above" without showing it.
- [ ] Function and prop names are consistent across tasks (`useFollowList`, `getFollowStatuses`, `searchFollows`, `initialFocusRef`, `sheetState`).
- [ ] Each task ends with codex review + commit.
- [ ] Migration filename matches existing convention (`YYYYMMDD_description.sql`).
- [ ] All new error paths use `throw error.type ? error : createClassifiedError(error)`.
- [ ] No Tailwind color classes introduced; all colors via `var(--color-*)`.
