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

  const invalidateFollowCounts = () => {
    // Prefix match: invalidates ['followCounts', currentUserId] AND
    // ['followCounts', targetUserId] without needing either id in scope.
    qc.invalidateQueries({ queryKey: ['followCounts'] })
  }

  return {
    follow: useMutation({
      mutationFn: (targetUserId) => followsApi.follow(targetUserId),
      onSuccess: invalidateFollowCounts,
    }),
    unfollow: useMutation({
      mutationFn: (targetUserId) => followsApi.unfollow(targetUserId),
      onSuccess: invalidateFollowCounts,
    }),
  }
}
