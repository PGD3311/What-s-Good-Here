import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { validateUserContent } from '../lib/reviewBlocklist'
import { logger } from '../utils/logger'
import { resizeToSquareJpeg } from '../utils/imageAnalysis'

const AVATAR_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_MAX_EDGE = 400

/**
 * Profile API - Centralized data fetching and mutation for user profiles
 */

export const profileApi = {
  /**
   * Get a user's profile by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Profile object or null
   */
  async getProfile(userId) {
    try {
      if (!userId) {
        return null
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error fetching profile:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Create a new profile for current authenticated user
   * @param {string} displayName - Display name (optional)
   * @returns {Promise<Object>} Created profile object
   */
  async createProfile(displayName = null) {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be logged in to create a profile')
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: displayName,
          has_onboarded: false,
        })
        .select()
        .single()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error creating profile:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update current authenticated user's profile
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated profile object
   */
  async updateProfile(updates) {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be logged in to update your profile')
      }

      // Validate display name against content blocklist
      if (updates.display_name) {
        const contentError = validateUserContent(updates.display_name, 'Display name')
        if (contentError) throw new Error(contentError)
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error updating profile:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get per-category taste stats for a user (bias relative to consensus).
   * Uses the existing get_badge_evaluation_stats RPC which returns categoryStats.
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of { category, total_ratings, consensus_ratings, bias }
   */
  async getTasteStats(userId) {
    try {
      if (!userId) return []

      const { data, error } = await supabase.rpc('get_badge_evaluation_stats', {
        p_user_id: userId,
      })

      if (error) throw createClassifiedError(error)

      return data?.categoryStats || []
    } catch (error) {
      logger.error('Error fetching taste stats:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get user's overall rating bias (deviation from consensus).
   * @param {string} userId - User ID
   * @returns {Promise<Object>} { ratingBias, biasLabel, votesWithConsensus }
   */
  async getRatingBias(userId) {
    try {
      if (!userId) return { ratingBias: 0, biasLabel: 'New Voter', votesWithConsensus: 0 }

      const { data, error } = await supabase.rpc('get_user_rating_identity', {
        target_user_id: userId,
      })

      if (error) throw createClassifiedError(error)

      const row = data?.[0] || data
      return {
        ratingBias: row?.rating_bias ?? 0,
        biasLabel: row?.bias_label ?? 'New Voter',
        votesWithConsensus: row?.votes_with_consensus ?? 0,
      }
    } catch (error) {
      logger.error('Error fetching rating bias:', error)
      return { ratingBias: 0, biasLabel: 'New Voter', votesWithConsensus: 0 }
    }
  },

  /**
   * Get or create a profile for current authenticated user
   * @returns {Promise<Object>} Profile object
   */
  async getOrCreateProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return null
      }

      // Try to get existing profile
      const existing = await this.getProfile(user.id)
      if (existing) {
        return existing
      }

      // For OAuth users (Google), use their provider name as default display_name
      // This lets WelcomeModal skip the name step for Google sign-ins
      const providerName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || null
      return await this.createProfile(providerName)
    } catch (error) {
      logger.error('Error getting or creating profile:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Upload a new avatar for the current authenticated user. Strips EXIF,
   * center-crops to a square, resizes to AVATAR_MAX_EDGE, uploads to the
   * 'avatars' bucket at `<user_id>/avatar.jpg`, runs the upload through the
   * photo-moderate Edge Function (only the `is_unsafe` flag — `is_food_photo`
   * is dish-specific), then updates profiles.avatar_url with a cache-busted
   * public URL so browsers and the service worker don't shadow the new file.
   * Fail-closed: any moderation error rejects the upload and removes the
   * orphan from storage.
   *
   * @param {File} file - Image file from <input type="file"> or drop
   * @returns {Promise<{ url: string }>} The new avatar URL (cache-busted)
   */
  async uploadAvatar(file) {
    try {
      if (!file || !(file instanceof File)) {
        throw new Error('Invalid file provided')
      }
      if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
        throw new Error('Please choose a JPEG, PNG, WebP, or HEIC image.')
      }
      if (file.size > AVATAR_MAX_BYTES) {
        throw new Error('That image is over 5MB. Please choose a smaller photo.')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be logged in to upload an avatar.')
      }

      // resizeToSquareJpeg does both: canvas drawing strips EXIF metadata
      // and applies EXIF orientation, then re-encodes as JPEG. No need for a
      // separate strip pass — avoids double-encoding quality loss.
      let processed
      try {
        processed = await resizeToSquareJpeg(file, AVATAR_MAX_EDGE)
      } catch (err) {
        logger.warn('Avatar processing failed', { type: file.type, err })
        throw new Error("Couldn't process this image. Please try a different photo.")
      }

      const path = `${user.id}/avatar.jpg`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, processed, {
          upsert: true,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        throw createClassifiedError(uploadError)
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // Cache-bust on every upload. Two roles:
      //   1) When stored in profiles.avatar_url, the query param prevents
      //      browsers and the service worker from showing the prior file.
      //   2) Handed to the photo-moderate Edge Function below, the same
      //      unique-per-upload URL prevents Sonnet from receiving a stale
      //      cached copy from the storage CDN at the (stable) path.
      const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`

      // Pre-display moderation. For avatars we ONLY enforce `is_unsafe` —
      // the is_food_photo flag is a dish-specific check and would obviously
      // reject every selfie.
      //
      // Fail closed: only accept when modResult.is_unsafe is STRICTLY
      // `false`. A missing field, a wrong type, an empty object, or any
      // invoke error are all treated as unsafe. Better to refuse than
      // publish an unmoderated avatar.
      const { data: modResult, error: modError } = await supabase.functions.invoke(
        'photo-moderate',
        { body: { photo_url: cacheBustedUrl } }
      )
      const passedModeration = !modError
        && modResult
        && typeof modResult.is_unsafe === 'boolean'
        && modResult.is_unsafe === false
      if (!passedModeration) {
        const { error: removeError } = await supabase.storage.from('avatars').remove([path])
        if (removeError) {
          logger.error('photo-moderate: failed to remove rejected avatar from storage', {
            path, removeError,
          })
        }
        const userMessage = (modResult && typeof modResult.reason === 'string' && modResult.reason)
          || "Couldn't verify your photo. Please try a different one."
        if (modError) logger.error('photo-moderate invoke failed (avatar):', modError)
        else logger.warn('avatar rejected by moderation:', { reason: modResult?.reason })
        throw new Error(userMessage)
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: cacheBustedUrl })
        .eq('id', user.id)

      if (updateError) {
        // Compensating delete — without this we leak a storage object every time
        // the DB update fails (network blip, RLS misconfig). Best-effort: log on
        // failure but still surface the original DB error to the user.
        const { error: cleanupError } = await supabase.storage
          .from('avatars')
          .remove([path])
        if (cleanupError) {
          logger.error('Avatar storage cleanup after DB failure failed', {
            path,
            cleanupError,
            updateError,
          })
        }
        throw createClassifiedError(updateError)
      }

      return { url: cacheBustedUrl }
    } catch (error) {
      logger.error('Error uploading avatar:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
