import { useQuery } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useLocalPicksCurators() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['localPicks', 'curators'],
    queryFn: function () { return localListsApi.getCurators() },
    staleTime: 1000 * 60 * 10,
  })

  return {
    curators: data || [],
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading curators') } : null,
  }
}
