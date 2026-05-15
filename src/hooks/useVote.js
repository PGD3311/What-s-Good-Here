import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { votesApi } from '../api/votesApi'
import { logger } from '../utils/logger'

export function useVote() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  // Track in-flight requests per dish to prevent double submissions
  const inFlightRef = useRef(new Set())
  const queryClient = useQueryClient()

  // Submit rating_10 and optional review text in one call.
  // Binary "would order again" vote was removed Apr 2026 — rating alone is the signal.
  const submitVote = useCallback(async (dishId, rating10, reviewText = null, purityData = null, jitterData = null, jitterScore = null, badgeHash = null) => {
    // Prevent duplicate submissions for the same dish
    if (inFlightRef.current.has(dishId)) {
      return { success: false, error: 'Vote already in progress' }
    }

    try {
      inFlightRef.current.add(dishId)
      setSubmitting(true)
      setError(null)

      await votesApi.submitVote({
        dishId,
        rating10,
        reviewText,
        purityData,
        jitterData,
        jitterScore,
        badgeHash,
      })

      // Vote success — invalidate dependent caches so rankings, dish detail,
      // user vote lists, client-side dish search, and community-average
      // stats reflect the new state without a manual page refresh. React
      // Query treats these prefixes as parents, so all child queries
      // (e.g. ['dishes', 'ranked', ...]) refetch.
      //
      // communityAvgs has a 30-min staleTime in useUserVotes and feeds the
      // profile standout picks / category comparison. Updating an existing
      // rating doesn't change the user's ratedDishIds, so without explicit
      // invalidation here profile stats can lag a vote by half an hour.
      queryClient.invalidateQueries({ queryKey: ['dishes'] })
      queryClient.invalidateQueries({ queryKey: ['dish'] })
      queryClient.invalidateQueries({ queryKey: ['userVotes'] })
      queryClient.invalidateQueries({ queryKey: ['allDishes'] })
      queryClient.invalidateQueries({ queryKey: ['communityAvgs'] })

      return { success: true }
    } catch (err) {
      logger.error('Error submitting vote:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      inFlightRef.current.delete(dishId)
      setSubmitting(inFlightRef.current.size > 0)
    }
  }, [queryClient])

  const getUserVotes = async () => {
    try {
      return await votesApi.getUserVotes()
    } catch (err) {
      logger.error('Error fetching user votes:', err)
      return {}
    }
  }

  return {
    submitVote,
    getUserVotes,
    submitting,
    error,
  }
}
