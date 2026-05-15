import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '../api/profileApi'
import { getUserMessage } from '../utils/errorHandler'
import { logger } from '../utils/logger'

export function useProfile(userId) {
  const queryClient = useQueryClient()

  const { data: profile, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      // API uses auth.getUser() internally for security
      return profileApi.getOrCreateProfile()
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  if (!userId) {
    // Match original behavior: return null profile when not logged in
  }

  const updateProfile = useCallback(async (updates) => {
    if (!userId) return { error: 'Not logged in' }

    try {
      // API uses auth.getUser() internally for security
      const data = await profileApi.updateProfile(updates)
      // Update cache immediately so UI reflects the change
      queryClient.setQueryData(['profile', userId], data)
      return { data, error: null }
    } catch (error) {
      logger.error('Error updating profile:', error)
      return { data: null, error }
    }
  }, [userId, queryClient])

  return {
    profile: profile ?? null,
    loading: userId ? loading : false,
    error: error ? { message: getUserMessage(error, 'loading profile') } : null,
    refetch,
    updateProfile,
  }
}
