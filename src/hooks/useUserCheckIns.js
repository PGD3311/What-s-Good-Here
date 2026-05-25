import { useQuery } from '@tanstack/react-query'
import { checkInsApi } from '../api/checkInsApi'
import { getUserMessage } from '../utils/errorHandler'

/**
 * useUserCheckIns — fetch a user's check-ins, most-recent first.
 *
 * Reads from the get_user_check_ins RPC which RLS-filters for public
 * profiles + the block list. Own user always sees everything.
 *
 * The cache key is intentionally `['checkIns', 'user', userId]` so
 * useCheckIn can broadly invalidate `['checkIns']` after a submit/delete
 * and refresh every user's view in one shot.
 */
export function useUserCheckIns(userId, limit = 50) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['checkIns', 'user', userId, limit],
    queryFn: () => checkInsApi.getUserCheckIns(userId, limit),
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 min — check-ins don't churn that fast
  })

  return {
    checkIns: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading check-ins') } : null,
    refetch,
  }
}
