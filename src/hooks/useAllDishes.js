import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dishesApi } from '../api/dishesApi'
import { logger } from '../utils/logger'

/**
 * Cache all dishes for client-side search.
 * ~300 rows, ~50KB. Fetched once. A Supabase Realtime subscription on the
 * `dishes` table invalidates the cache on any INSERT/UPDATE/DELETE — so
 * newly-created dishes (manual add, menu-refresh cron, admin tools, cascade
 * delete on restaurant removal) become searchable within ~1s without
 * per-mutation invalidation plumbing at every write site.
 *
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - Pass false to defer fetching until needed (e.g. until user starts searching)
 * @returns {Object} { dishes, loading, error }
 */
export function useAllDishes({ enabled = true } = {}) {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['allDishes'],
    queryFn: () => dishesApi.getAllSearchable(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    enabled,
  })

  useEffect(() => {
    if (error) logger.error('Error loading dish cache:', error)
  }, [error])

  useEffect(() => {
    if (!enabled) return undefined

    // Invalidate immediately on (re)open: between teardown and reopen the
    // subscription was off, so any dish writes during that gap were missed.
    // Without this, React Query reuses the still-fresh cache on the next
    // search and never sees those changes (Codex review caught this).
    queryClient.invalidateQueries({ queryKey: ['allDishes'] })

    const unsubscribe = dishesApi.subscribeToChanges(() => {
      queryClient.invalidateQueries({ queryKey: ['allDishes'] })
    })
    return unsubscribe
  }, [enabled, queryClient])

  return {
    dishes: data || [],
    loading: isLoading,
    error,
  }
}
