import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { restaurantManagerApi } from '../api/restaurantManagerApi'
import { logger } from '../utils/logger'

export function useRestaurantManager() {
  const { user } = useAuth()

  const { data: result, isLoading: loading } = useQuery({
    queryKey: ['restaurantManager', user?.id],
    queryFn: () => restaurantManagerApi.getMyRestaurant(),
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes — manager status rarely changes
  })

  // Rules of Hooks: all hook calls must run every render in the same order.
  // The early-return MUST come AFTER the last hook, not before. Previously
  // useEffect was below the `if (!user) return`, so hook count changed
  // from 1 → 2 the moment user signed in, and React's reconciler crashed
  // with `undefined is not an object (evaluating 'e.length')` in
  // areHookInputsEqual. Crash was iOS/Capacitor-only because fresh-launch
  // starts with user=null briefly; on web, session restore from
  // localStorage made user truthy from the first render.
  useEffect(() => {
    if (user && result === undefined && !loading) {
      logger.error('Unexpected null result from getMyRestaurant')
    }
  }, [user, result, loading])

  if (!user) {
    return { isManager: false, restaurant: null, loading: false }
  }

  const isManager = !!result?.restaurant
  const restaurant = result?.restaurant ?? null

  return { isManager, restaurant, loading }
}
