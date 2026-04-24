import { supabase } from '../lib/supabase'
import { checkPhotoUploadRateLimit } from '../lib/rateLimiter'
import { extractSafeFilename } from '../utils/sanitize'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'

// Upload constraints - enforced client-side and in Supabase Storage policies
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Dish Photos API - Centralized data fetching and mutation for dish photos
 */

export const dishPhotosApi = {
  /**
   * Upload a photo for a dish with quality metadata
   * @param {Object} params
   * @param {string} params.dishId - Dish ID
   * @param {File} params.file - Photo file to upload
   * @param {Object} params.analysisResults - Quality analysis results from imageAnalysis
   * @returns {Promise<Object>} Photo record
   */
  async uploadPhoto({ dishId, file, analysisResults }) {
    try {
      // SECURITY: Explicit file validation before upload
      if (!file || !(file instanceof File)) {
        throw new Error('Invalid file provided')
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or HEIC image.')
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error('File too large. Maximum size is 10MB.')
      }

      // Quick client-side check first (better UX)
      const clientRateLimit = checkPhotoUploadRateLimit()
      if (!clientRateLimit.allowed) {
        throw new Error(clientRateLimit.message)
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be logged in to upload photos')
      }

      // Server-side rate limit check (authoritative)
      const { data: serverRateLimit, error: rateLimitError } = await supabase
        .rpc('check_photo_upload_rate_limit')

      if (rateLimitError) {
        // SECURITY: Fail closed - if rate limit check fails, block the upload
        logger.error('Rate limit check failed:', rateLimitError)
        throw new Error('Unable to verify upload limit. Please try again.')
      } else if (serverRateLimit && !serverRateLimit.allowed) {
        throw new Error(serverRateLimit.message || 'Too many uploads. Please wait.')
      }

      // Generate unique filename with validated extension from MIME type (not user-provided filename)
      const mimeToExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
      const fileExt = mimeToExt[file.type] || 'jpg'
      const fileName = `${user.id}/${dishId}.${fileExt}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('dish-photos')
        .upload(fileName, file, {
          upsert: true, // Replace if exists
        })

      if (uploadError) {
        throw createClassifiedError(uploadError)
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('dish-photos')
        .getPublicUrl(fileName)

      // Pre-display moderation (Apple App Store guideline 1.2 — UGC filtering).
      // The file is in storage but not yet exposed via the dish_photos row.
      // If Sonnet vision rejects it, delete from storage and surface a clear
      // error to the user. Fail closed: any moderation outage rejects the upload.
      const { data: modResult, error: modError } = await supabase.functions.invoke(
        'photo-moderate',
        { body: { photo_url: publicUrl } }
      )
      const isUnsafe = modError || !modResult || modResult.is_unsafe === true || modResult.is_food_photo === false
      if (isUnsafe) {
        // Bucket is public, so a failed delete leaves a rejected photo accessible
        // by direct URL. Log loudly so monitoring catches the orphan; surface the
        // user-facing rejection regardless (we can't return success on rejected
        // content even if cleanup fails).
        const { error: removeError } = await supabase.storage.from('dish-photos').remove([fileName])
        if (removeError) {
          logger.error('photo-moderate: failed to remove rejected photo from storage', {
            fileName, removeError,
          })
        }
        const userMessage = modResult?.reason || "Couldn't verify your photo. Please try again."
        if (modError) logger.error('photo-moderate invoke failed:', modError)
        else logger.warn('photo rejected by moderation:', { reason: modResult.reason })
        throw new Error(userMessage)
      }

      // Build record with quality fields if analysis was provided
      const photoRecord = {
        dish_id: dishId,
        user_id: user.id,
        photo_url: publicUrl,
      }

      if (analysisResults) {
        photoRecord.width = analysisResults.width
        photoRecord.height = analysisResults.height
        photoRecord.mime_type = analysisResults.mimeType
        photoRecord.file_size_bytes = analysisResults.fileSize
        photoRecord.avg_brightness = analysisResults.avgBrightness
        photoRecord.bright_pixel_pct = analysisResults.brightPixelPct
        photoRecord.dark_pixel_pct = analysisResults.darkPixelPct
        photoRecord.quality_score = analysisResults.qualityScore
        photoRecord.status = analysisResults.status
        photoRecord.reject_reason = analysisResults.rejectReason
      }

      // Insert or update photo record
      const { data, error } = await supabase
        .from('dish_photos')
        .upsert(photoRecord, {
          onConflict: 'dish_id,user_id',
        })
        .select()
        .single()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error uploading photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all photos for a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Array>} Array of photo records
   */
  async getPhotosForDish(dishId) {
    try {
      const { data, error } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .order('created_at', { ascending: false })

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching dish photos:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get dishes that a user has photographed but not voted on
   * Limited to 100 most recent photos for performance
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of dishes with photos but no votes
   */
  async getUnratedDishesWithPhotos(userId) {
    try {
      if (!userId) {
        return []
      }

      // Fetch photos and votes in parallel (independent queries)
      const [
        { data: photos, error: photosError },
        { data: votes, error: votesError },
      ] = await Promise.all([
        supabase
          .from('dish_photos')
          .select(`
            id,
            photo_url,
            created_at,
            dishes (
              id,
              name,
              category,
              price,
              photo_url,
              restaurants (
                id,
                name
              )
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('votes')
          .select('dish_id')
          .eq('user_id', userId)
          .limit(500),
      ])

      if (photosError) {
        throw createClassifiedError(photosError)
      }

      if (!photos?.length) {
        return []
      }

      if (votesError) {
        throw createClassifiedError(votesError)
      }

      const votedDishIds = new Set((votes || []).map(v => v.dish_id))

      // Filter to only unrated dishes with valid data, then transform
      return photos
        .filter(photo => photo.dishes && photo.dishes.restaurants && !votedDishIds.has(photo.dishes.id))
        .map(photo => ({
          photo_id: photo.id,
          user_photo_url: photo.photo_url,
          photo_created_at: photo.created_at,
          dish_id: photo.dishes.id,
          dish_name: photo.dishes.name,
          category: photo.dishes.category,
          price: photo.dishes.price,
          photo_url: photo.dishes.photo_url,
          restaurant_id: photo.dishes.restaurants.id,
          restaurant_name: photo.dishes.restaurants.name,
        }))
    } catch (error) {
      logger.error('Error fetching unrated dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Check if user has uploaded a photo for a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object|null>} Photo record if exists
   */
  async getUserPhotoForDish(dishId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return null
      }

      const { data, error } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error fetching user photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Delete a photo
   * @param {string} photoId - Photo ID
   * @returns {Promise<Object>} Success status
   */
  async deletePhoto(photoId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      // Get photo record - fetch user_id to verify ownership explicitly
      const { data: photo, error: fetchError } = await supabase
        .from('dish_photos')
        .select('photo_url, dish_id, user_id')
        .eq('id', photoId)
        .single()

      if (fetchError || !photo) {
        throw new Error('Photo not found')
      }

      // Explicit ownership verification (defense in depth beyond RLS)
      if (photo.user_id !== user.id) {
        throw new Error('Access denied - you can only delete your own photos')
      }

      // Securely extract filename using URL parsing (prevents path traversal)
      const safeFilename = extractSafeFilename(photo.photo_url, user.id)
      if (!safeFilename) {
        throw new Error('Invalid photo URL format')
      }

      // Construct safe file path
      const filePath = `${user.id}/${safeFilename}`

      // Delete from storage
      await supabase.storage
        .from('dish-photos')
        .remove([filePath])

      // Delete record (with user_id check for defense in depth)
      const { error } = await supabase
        .from('dish_photos')
        .delete()
        .eq('id', photoId)
        .eq('user_id', user.id)

      if (error) {
        throw createClassifiedError(error)
      }

      return { success: true }
    } catch (error) {
      logger.error('Error deleting photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get count of unrated dishes with photos for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of unrated dishes
   */
  async getUnratedCount(userId) {
    try {
      if (!userId) {
        return 0
      }

      const unrated = await this.getUnratedDishesWithPhotos(userId)
      return unrated.length
    } catch (error) {
      logger.error('Error getting unrated count:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get the featured photo for a dish (highest quality or restaurant photo)
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object|null>} Featured photo or null
   */
  async getFeaturedPhoto(dishId) {
    try {
      // First check for restaurant photo
      const { data: restaurantPhoto, error: restError } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .eq('source_type', 'restaurant')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!restError && restaurantPhoto) {
        return restaurantPhoto
      }

      // Then get highest quality featured photo
      const { data, error } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .eq('status', 'featured')
        .order('quality_score', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error fetching featured photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get community photos for a dish (excludes featured and rejected)
   * @param {string} dishId - Dish ID
   * @returns {Promise<Array>} Array of community photos
   * @throws {Error} On API failure
   */
  async getCommunityPhotos(dishId) {
    try {
      const { data, error } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .eq('status', 'community')
        .order('quality_score', { ascending: false })

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching community photos:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all visible photos for a dish (featured, community, hidden)
   * @param {string} dishId - Dish ID
   * @returns {Promise<Array>} Array of photos ordered by status and quality
   * @throws {Error} On API failure
   */
  async getAllVisiblePhotos(dishId, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('dish_photos')
        .select('*')
        .eq('dish_id', dishId)
        .in('status', ['featured', 'community', 'hidden'])
        .order('quality_score', { ascending: false })
        .limit(limit)

      if (error) {
        throw createClassifiedError(error)
      }

      // Sort by status priority: featured > community > hidden
      const statusOrder = { featured: 0, community: 1, hidden: 2 }
      return (data || []).sort((a, b) => {
        const statusDiff = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
        if (statusDiff !== 0) return statusDiff
        return (b.quality_score || 0) - (a.quality_score || 0)
      })
    } catch (error) {
      logger.error('Error fetching all photos:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get photo counts by status for a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object>} Counts by status
   */
  async getPhotoCounts(dishId) {
    try {
      const { data, error } = await supabase
        .from('dish_photos')
        .select('status')
        .eq('dish_id', dishId)
        .in('status', ['featured', 'community', 'hidden'])

      if (error) {
        throw createClassifiedError(error)
      }

      const counts = { featured: 0, community: 0, hidden: 0, total: 0 }
      for (const photo of data || []) {
        counts[photo.status]++
        counts.total++
      }
      return counts
    } catch (error) {
      logger.error('Error fetching photo counts:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
