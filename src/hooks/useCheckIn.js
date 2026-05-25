import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { checkInsApi } from '../api/checkInsApi'
import { logger } from '../utils/logger'

/**
 * useCheckIn — submit or delete a check-in.
 *
 * Mirrors useVote's shape: in-flight dedup via useRef so a double-tap
 * doesn't fire two RPCs, success invalidates downstream caches.
 */
export function useCheckIn() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const inFlightRef = useRef(new Set())
  const queryClient = useQueryClient()

  const submitCheckIn = useCallback(async (params) => {
    const dedupKey = `${params.restaurantId}|${params.kind}`
    if (inFlightRef.current.has(dedupKey)) {
      return { success: false, error: 'Check-in already in progress' }
    }

    try {
      inFlightRef.current.add(dedupKey)
      setSubmitting(true)
      setError(null)

      const data = await checkInsApi.submitCheckIn(params)

      // Refresh anything that depends on check-in state. The v1 retrieval
      // surface (restaurant-detail "You've checked in N times") reads
      // from useUserCheckIns, so this is the primary cache to bust.
      queryClient.invalidateQueries({ queryKey: ['checkIns'] })

      return { success: true, checkIn: data }
    } catch (err) {
      logger.error('Error submitting check-in:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      inFlightRef.current.delete(dedupKey)
      setSubmitting(inFlightRef.current.size > 0)
    }
  }, [queryClient])

  const deleteCheckIn = useCallback(async (checkInId) => {
    // Same in-flight dedup as submit — a double-tap on a delete button
    // could otherwise fire two RPCs where the second returns "not found"
    // and surfaces as a noisy error after the first succeeded.
    if (inFlightRef.current.has(checkInId)) {
      return { success: false, error: 'Delete already in progress' }
    }

    try {
      inFlightRef.current.add(checkInId)
      setSubmitting(true)
      setError(null)
      const ok = await checkInsApi.deleteCheckIn(checkInId)
      queryClient.invalidateQueries({ queryKey: ['checkIns'] })
      return { success: ok }
    } catch (err) {
      logger.error('Error deleting check-in:', err)
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      inFlightRef.current.delete(checkInId)
      setSubmitting(inFlightRef.current.size > 0)
    }
  }, [queryClient])

  return {
    submitCheckIn,
    deleteCheckIn,
    submitting,
    error,
  }
}
