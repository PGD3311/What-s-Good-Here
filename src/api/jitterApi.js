import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import { jitterTrustVisible } from '../utils/jitterTrust'

export const jitterApi = {
  /**
   * Get the current user's jitter profile (confidence level, consistency score)
   */
  async getMyProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase.rpc('get_my_jitter_profile')

      if (error) throw createClassifiedError(error)
      // RPC returns an array (RETURNS TABLE) — take first row
      return data?.[0] || null
    } catch (error) {
      logger.error('Failed to get jitter profile:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get jitter badges for a list of user IDs.
   * Returns array of badge objects from the RPC.
   */
  async getJitterBadges(userIds) {
    try {
      const { data, error } = await supabase.rpc('get_jitter_badges', { p_user_ids: userIds })
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to get jitter badges:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get trust badge type for a given user based on their jitter profile.
   * Returns: 'trusted_reviewer' | 'human_verified' | 'building' | null
   */
  /**
   * Attest a review — sends WAR score to JITTEr attestation server, returns badge_hash.
   * Non-blocking, non-critical. Returns null on any failure.
   */
  async attestReview({ userId, warScore, classification, flags, meta }) {
    try {
      const attestUrl = import.meta.env.VITE_JITTER_ATTEST_URL
      if (!attestUrl || !userId || warScore == null) return null

      const res = await fetch(attestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          site_key: 'wgh',
          war_score: warScore,
          classification,
          flags: flags || [],
          meta: meta || {},
        }),
      })

      if (!res.ok) return null
      const data = await res.json()
      return {
        badge_hash: data.badge_hash || null,
        verifyUrl: data.badge_hash
          ? attestUrl.replace('/attest', '/verify') + '?hash=' + data.badge_hash
          : null,
        profile: data.profile || null,
      }
    } catch (err) {
      // Escalate to error so a sustained JITTEr server outage surfaces in
      // Sentry — otherwise we'd ship un-attested votes silently for hours.
      // Callers still treat null as non-blocking; the badge_hash is optional.
      logger.error('Attestation failed (non-critical):', err)
      return null
    }
  },

  /**
   * Join the Jitter waitlist (public landing page).
   * No auth required — anonymous insert.
   */
  async joinWaitlist(email, source) {
    try {
      var { error } = await supabase
        .from('jitter_waitlist')
        .insert({ email: email, source: source || 'general' })
      if (error) throw createClassifiedError(error)
      return true
    } catch (err) {
      logger.error('Waitlist insert failed:', err)
      throw err.type ? err : createClassifiedError(err)
    }
  },

  getTrustBadgeType(jitterProfile) {
    if (!jitterProfile) return null
    if (jitterProfile.flagged) return null

    if (jitterProfile.confidence_level === 'high' && jitterProfile.consistency_score >= 0.6) {
      return 'trusted_reviewer'
    }
    if (jitterProfile.confidence_level === 'medium' && jitterProfile.consistency_score >= 0.4) {
      return 'human_verified'
    }
    if (jitterProfile.review_count > 0) {
      // The "building" state is a dead-end on iOS (rhythm can't be captured on
      // the soft keyboard), so we don't surface it there. See jitterTrust.js.
      return jitterTrustVisible() ? 'building' : null
    }
    return null
  },
}
