import { useQuery } from '@tanstack/react-query'
import { dishPhotosApi } from '../api/dishPhotosApi'

/**
 * Returns { [dishId]: ownPhotoUrl } for a given user across the supplied dish
 * IDs. Used by the profile grid to render the profile user's OWN photo.
 */
export function useUserDishPhotos(userId, dishIds) {
  const ids = dishIds || []
  const { data } = useQuery({
    queryKey: ['userDishPhotos', userId, ids.slice().sort()],
    queryFn: () => dishPhotosApi.getUserPhotoMap(userId, ids),
    enabled: !!userId && ids.length > 0,
    staleTime: 1000 * 60 * 5,
  })
  return data || {}
}
