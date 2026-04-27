import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { localListsApi } from '../api/localListsApi'
import { getUserMessage } from '../utils/errorHandler'

export function useMyLocalList() {
  var queryClient = useQueryClient()

  var { data, isLoading, error } = useQuery({
    queryKey: ['myLocalList'],
    queryFn: function () { return localListsApi.getMyList() },
    staleTime: 1000 * 60 * 2,
  })

  var saveMutation = useMutation({
    mutationFn: function (payload) {
      return localListsApi.saveMyList(payload)
    },
    onSuccess: function () {
      queryClient.invalidateQueries({ queryKey: ['myLocalList'] })
      queryClient.invalidateQueries({ queryKey: ['localLists'] })
      queryClient.invalidateQueries({ queryKey: ['localList'] })
    },
  })

  var addDishMutation = useMutation({
    mutationFn: function (dishId) {
      return localListsApi.addDishToMyList(dishId)
    },
    onSuccess: function () {
      queryClient.invalidateQueries({ queryKey: ['myLocalList'] })
      queryClient.invalidateQueries({ queryKey: ['localLists'] })
      queryClient.invalidateQueries({ queryKey: ['localList'] })
    },
  })

  // Parse the raw RPC rows into structured data
  var items = data || []
  var listMeta = items.length > 0 ? {
    listId: items[0].list_id,
    title: items[0].title,
    description: items[0].description,
    curatorTagline: items[0].curator_tagline,
    isActive: items[0].is_active,
  } : null

  // Filter out rows where dish_id is null (empty list returns 1 row with nulls due to LEFT JOIN)
  var dishes = items.filter(function (row) { return row.dish_id != null })

  return {
    listMeta: listMeta,
    dishes: dishes,
    loading: isLoading,
    error: error ? { message: getUserMessage(error, 'loading your list') } : null,
    saveList: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
    saveError: saveMutation.error
      ? { message: getUserMessage(saveMutation.error, 'saving your list') }
      : null,
    addDish: addDishMutation.mutateAsync,
    adding: addDishMutation.isPending,
  }
}
