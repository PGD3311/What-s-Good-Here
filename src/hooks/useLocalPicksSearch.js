import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksSearch(query, enabled) {
  const trimmed = (query || '').trim()
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'search', trimmed],
    queryFn: function () { return localListsApi.searchPicks(trimmed) },
    enabled: !!enabled && trimmed.length > 0,
    staleTime: 1000 * 60 * 5,
  })

  return {
    results: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'searching picks') } : null,
  }
}
