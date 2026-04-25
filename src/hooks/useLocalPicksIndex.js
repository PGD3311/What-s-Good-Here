import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksIndex(enabled) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'index'],
    queryFn: function () { return localListsApi.getIndex() },
    enabled: !!enabled,
    staleTime: 1000 * 60 * 10,
  })

  return {
    index: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading index') } : null,
  }
}
