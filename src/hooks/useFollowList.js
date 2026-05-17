import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { followsApi } from '../api/followsApi'
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
  const direction = type
  // We pass the trimmed (un-escaped) query to the API; _searchFollows is the
  // single source of truth for LIKE-escape and wildcard-only short-circuit.
  // Double-sanitizing would over-escape backslashes (`a_b` → `a\_b` → `a\\\_b`).
  const trimmedSearch = (searchQuery ?? '').trim()
  const isSearching = trimmedSearch.length > 0

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

  // Search mode — alphabetical (display_name, id) cursor
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
  const pages = active.data?.pages
  const users = useMemo(() => pages?.flatMap(p => p.users) ?? [], [pages])

  // Follow statuses for visible users — keyed on viewer + sorted IDs so the
  // cache key is stable across result reorderings.
  const { user: viewer } = useAuth()
  const viewerId = viewer?.id ?? 'anon'
  const sortedUserIds = useMemo(() => users.map(u => u.id).sort(), [users])
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
    searchFetching: isSearching && active.isFetching,
    error: active.error,
    hasMore: !!active.hasNextPage,
    fetchMore: active.fetchNextPage,
    refetch: active.refetch,
    isSearching,
  }
}
