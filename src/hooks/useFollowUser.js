import { useMutation, useQueryClient } from '@tanstack/react-query'
import { followsApi } from '../api/followsApi'

/**
 * follow/unfollow mutations that invalidate the followCounts cache for BOTH
 * sides of the relationship. Without this, following someone on UserProfile
 * leaves your own /profile page showing a stale count until you hard-refresh.
 *
 * Callers should still drive their own optimistic UI updates for the
 * displayed profile's follower_count (that state lives in component state,
 * not React Query). This hook handles the React Query layer only.
 */
export function useFollowUser() {
  const qc = useQueryClient()

  const invalidateOnFollowChange = () => {
    // Prefix match: invalidates ['followCounts', currentUserId] AND
    // ['followCounts', targetUserId] without needing either id in scope.
    qc.invalidateQueries({ queryKey: ['followCounts'] })
    // Also invalidate batched follow-status lookups (FollowListModal etc.).
    // Without this, follow buttons inside the modal stay stale until staleTime
    // expires (30s) or window refocuses.
    qc.invalidateQueries({ queryKey: ['followStatuses'] })
  }

  return {
    follow: useMutation({
      mutationFn: (targetUserId) => followsApi.follow(targetUserId),
      onSuccess: invalidateOnFollowChange,
    }),
    unfollow: useMutation({
      mutationFn: (targetUserId) => followsApi.unfollow(targetUserId),
      onSuccess: invalidateOnFollowChange,
    }),
  }
}
