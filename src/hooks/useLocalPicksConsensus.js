import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksConsensus() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'consensus'],
    queryFn: function () { return localListsApi.getConsensus() },
    staleTime: 1000 * 60 * 10,
  })

  return {
    consensus: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading consensus picks') } : null,
  }
}
