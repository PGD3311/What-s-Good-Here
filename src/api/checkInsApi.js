import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import { validateUserContent } from '../lib/reviewBlocklist'

/**
 * Check-ins API — backs the native-iOS "I've been here" feature.
 * Spec: docs/superpowers/specs/2026-05-25-check-ins-v1-spec.md
 */
export const checkInsApi = {
  /**
   * Submit a check-in (live or logged).
   *
   * Live: server verifies GPS is within 150m of the restaurant pin and
   * the user hasn't checked in here in the last hour. Logged: user
   * supplies a past visited_at. Dish tagging is optional — IDs that
   * don't belong to the restaurant are silently dropped server-side.
   *
   * @param {Object} params
   * @param {string} params.restaurantId
   * @param {'live'|'logged'} params.kind
   * @param {string|null} params.visitedAt - ISO timestamp, required for logged
   * @param {number|null} params.lat - Required for live
   * @param {number|null} params.lng - Required for live
   * @param {string|null} params.note - Max 280 chars
   * @param {string[]|null} params.dishIds
   */
  async submitCheckIn({ restaurantId, kind, visitedAt = null, lat = null, lng = null, note = null, dishIds = null }) {
    try {
      // API-boundary validation: enforce the content blocklist even when
      // a caller bypasses the sheet UI (e.g. a future direct-API path).
      // The sheet pre-validates for UX; this is defense in depth.
      if (note) {
        const contentError = validateUserContent(note, 'Note')
        if (contentError) {
          throw new Error(contentError)
        }
      }

      const { data, error } = await supabase.rpc('submit_check_in', {
        p_restaurant_id: restaurantId,
        p_kind: kind,
        p_visited_at: visitedAt,
        p_lat: lat,
        p_lng: lng,
        p_note: note,
        p_dish_ids: dishIds,
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Error submitting check-in:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async deleteCheckIn(checkInId) {
    try {
      const { data, error } = await supabase.rpc('delete_check_in', {
        p_check_in_id: checkInId,
      })
      if (error) throw createClassifiedError(error)
      return data === true
    } catch (error) {
      logger.error('Error deleting check-in:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Fetch a user's check-ins, most recent first. Respects RLS: own user
   * sees everything; others see only public-profile rows that pass the
   * block filter.
   */
  async getUserCheckIns(userId, limit = 50) {
    try {
      if (!userId) return []
      const { data, error } = await supabase.rpc('get_user_check_ins', {
        p_user_id: userId,
        p_limit: limit,
      })
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Error fetching user check-ins:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
