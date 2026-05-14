import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { capture } from '../lib/analytics'
import { favoritesApi } from '../api/favoritesApi'
import { logger } from '../utils/logger'

export function useFavorites(userId) {
  const queryClient = useQueryClient()

  const { data, isLoading: loading } = useQuery({
    queryKey: ['favorites', userId],
    queryFn: () => favoritesApi.getFavorites(),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const favoriteIds = data?.favoriteIds || []
  const favorites = data?.favorites || []

  const isFavorite = useCallback(
    (dishId) => favoriteIds.includes(dishId),
    [favoriteIds]
  )

  const addMutation = useMutation({
    mutationFn: (dishId) => favoritesApi.addFavorite(dishId),
    onMutate: async (dishId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['favorites', userId] })
      // Snapshot previous value for rollback
      const previous = queryClient.getQueryData(['favorites', userId])
      // Optimistic update
      queryClient.setQueryData(['favorites', userId], (old) => {
        if (!old) return old
        return {
          favoriteIds: [...old.favoriteIds, dishId],
          favorites: old.favorites,
        }
      })
      return { previous }
    },
    onError: (_err, _dishId, context) => {
      // Rollback on failure
      if (context?.previous) {
        queryClient.setQueryData(['favorites', userId], context.previous)
      }
    },
    onSettled: () => {
      // Refetch to get full dish data
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (dishId) => favoritesApi.removeFavorite(dishId),
    onMutate: async (dishId) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', userId] })
      const previous = queryClient.getQueryData(['favorites', userId])
      queryClient.setQueryData(['favorites', userId], (old) => {
        if (!old) return old
        return {
          favoriteIds: old.favoriteIds.filter((id) => id !== dishId),
          favorites: old.favorites.filter((d) => d.dish_id !== dishId),
        }
      })
      return { previous }
    },
    onError: (_err, _dishId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['favorites', userId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] })
    },
  })

  const addFavorite = async (dishId, dishData = null) => {
    if (!userId) return { error: 'Not logged in' }

    capture('dish_saved', {
      dish_id: dishId,
      dish_name: dishData?.dish_name,
      restaurant_name: dishData?.restaurant_name,
      category: dishData?.category,
    })

    try {
      await addMutation.mutateAsync(dishId)
      toast.success('Saved', { duration: 2000 })
      return { error: null }
    } catch (err) {
      toast.error('Could not save dish')
      return { error: err.message }
    }
  }

  const removeFavorite = async (dishId) => {
    if (!userId) return { error: 'Not logged in' }

    const dishToRemove = favorites.find((d) => d.dish_id === dishId)
    capture('dish_unsaved', {
      dish_id: dishId,
      dish_name: dishToRemove?.dish_name,
      restaurant_name: dishToRemove?.restaurant_name,
      category: dishToRemove?.category,
    })

    try {
      await removeMutation.mutateAsync(dishId)
      toast('Removed', { duration: 2000 })
      return { error: null }
    } catch (err) {
      toast.error('Could not remove dish')
      return { error: err.message }
    }
  }

  const toggleFavorite = async (dishId, dishData = null) => {
    if (isFavorite(dishId)) {
      return removeFavorite(dishId)
    } else {
      return addFavorite(dishId, dishData)
    }
  }

  const refetch = async () => {
    if (!userId) return
    try {
      await queryClient.invalidateQueries({ queryKey: ['favorites', userId] })
    } catch (err) {
      logger.error('Error refetching favorites:', err)
    }
  }

  return {
    favoriteIds,
    favorites,
    loading: userId ? loading : false,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refetch,
  }
}
