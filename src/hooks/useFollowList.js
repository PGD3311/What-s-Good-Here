import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { followsApi } from '../api/followsApi'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { useAuth } from '../context/AuthContext'

/**
 * Centralizes server-state for FollowListModal.
 * - Cursor-paginated recency list when no search query.
 * - Alphabetical (display_name, id) cursor when searching.
 * - Batched follow-state lookup keyed on viewer + sorted user IDs.
 *
 * @param {{ userId: string, type: 'followers' | 'following', searchQuery: string }} params
 */
export function useFollowList({ userId, type, searchQuery }) {
  const direction = type // 'followers' | 'following'
  // Sanitizer is used here ONLY to decide whether the input contains anything
  // searchable (after trim + LIKE-escape, is there real content?). The raw
  // trimmed query is what we pass to the API — `_searchFollows` sanitizes
  // again before hitting Postgres, and double-sanitizing would over-escape
  // backslashes (`a_b` → `a\_b` → `a\\\_b`).
  const trimmedSearch = (searchQuery ?? '').trim()
  const sanitizedProbe = sanitizeSearchQuery(trimmedSearch, 50)
  // Strip escaped LIKE metachars: if nothing is left, the input was purely
  // wildcards like `%%` — treat as not-searching and fall back to recency.
  const searchableProbe = sanitizedProbe.replace(/\\[%_\\]/g, '')
  const isSearching = !!searchableProbe && searchableProbe.length >= 1

  // Recency list mode (no search) — cursor on followed_at
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

  // Search mode — alphabetical (display_name, id) cursor. Pass the TRIMMED
  // (un-escaped) query — API sanitizes for LIKE before hitting Postgres.
  const searchQueryResult = useInfiniteQuery({
    queryKey: ['followList', userId, direction, 'search', trimmedSearch],
    enabled: isSearching && !!userId,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      direction === 'followers'
        ? followsApi.getFollowers(userId, { cursor: pageParam, searchQuery: trimmedSearch })
        : followsApi.getFollowing(userId, { cursor: pageParam, searchQuery: trimmedSearch }),
    getNextPageParam: (last) => {
      if (!last.hasMore || last.users.length === 0) return undefined
      const tail = last.users[last.users.length - 1]
      return { display_name: tail.display_name, id: tail.id }
    },
  })

  const active = isSearching ? searchQueryResult : listQuery
  const users = active.data?.pages.flatMap(p => p.users) ?? []

  // Follow statuses for visible users — keyed on viewer + sorted IDs for stable cache
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
