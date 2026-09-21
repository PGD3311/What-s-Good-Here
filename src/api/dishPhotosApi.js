import { supabase } from '../lib/supabase'
import { checkPhotoUploadRateLimit } from '../lib/rateLimiter'
import { extractSafeFilename } from '../utils/sanitize'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'
import { stripExifAndReencode } from '../utils/imageAnalysis'

// Upload constraints - enforced client-side and in Supabase Storage policies
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Dish Photos API - Centralized data fetching and mutation for dish photos
 */

// Storage layout is `{user_id}/{dish_id}.jpg` — one file per user per dish,
// mirroring the dish_photos UNIQUE(dish_id, user_id) constraint.
function photoStoragePath(userId, dishId) {
  return `${userId}/${dishId}.jpg`
}

const VISIBLE_STATUSES = ['featured', 'community', 'hidden']

function buildPhotoRecord({ dishId, userId, publicUrl, analysisResults }) {
  const record = { dish_id: dishId, user_id: userId, photo_url: publicUrl }
  if (analysisResults) {
    record.width = analysisResults.width
    record.height = analysisResults.height
    record.mime_type = analysisResults.mimeType
    record.file_size_bytes = analysisResults.fileSize
    record.avg_brightness = analysisResults.avgBrightness
    record.bright_pixel_pct = analysisResults.brightPixelPct
    record.dark_pixel_pct = analysisResults.darkPixelPct
    record.quality_score = analysisResults.qualityScore
    // Client-supplied tier: only the visible tiers are storable. 'rejected'
    // never reaches upload (the hook stops it), and anything else is noise.
    record.status = VISIBLE_STATUSES.includes(analysisResults.status) ? analysisResults.status : 'community'
    record.reject_reason = analysisResults.rejectReason
  }
  return record
}

// The dish_photos row is what makes a photo visible to other users. Insert
// (or replace this user's row for the dish) and return it.
async function insertPhotoRecord(record) {
  const { data, error } = await supabase
    .from('dish_photos')
    .upsert(record, { onConflict: 'dish_id,user_id' })
    .select()
    .single()
  if (error) throw createClassifiedError(error)
  return data
}

// A "pending" handle is what uploadPhoto returns when the dish check says the
// photo contradicts the named dish: the file is in storage, no row exists yet,
// and the user decides what happens next (confirm / reassign / discard).
//
// SECURITY: the handle is client-held, so nothing in it is trusted for
// storage. The only file a pending handle may refer to is this user's own
// slot for that dish — `{uid}/{dishId}.jpg` — and the URL written to the row
// is re-derived from that path, never taken from the handle.
function trustedPendingPath(pending, userId) {
  if (!pending || !pending.pending || typeof pending.dishId !== 'string' || !pending.dishId) {
    throw new Error('Invalid pending photo')
  }
  const expected = photoStoragePath(userId, pending.dishId)
  if (pending.fileName !== expected) {
    throw new Error('Access denied - you can only manage your own photos')
  }
  return expected
}

export const dishPhotosApi = {
  /**
   * Upload a photo for a dish with quality metadata
   * @param {Object} params
   * @param {string} params.dishId - Dish ID
   * @param {File} params.file - Photo file to upload
   * @param {Object} params.analysisResults - Quality analysis results from imageAnalysis
   * @param {string} [params.dishName] - Dish name, enables the upload-time dish check
   * @param {string} [params.category]
   * @param {string} [params.restaurantName]
   * @param {boolean} [params.allowMismatch] - Insert even if the dish check says
   *   'contradicts' (batch flows that can't show a prompt). Default false.
   * @returns {Promise<Object>} Photo record, OR a pending handle
   *   `{ pending: true, mismatch: { seen }, dishId, fileName, publicUrl, analysisResults }`
   *   when the photo clearly shows a different kind of food than the dish. The
   *   caller must then confirmPendingPhoto / reassignPendingPhoto / discardPendingPhoto.
   */
  async uploadPhoto({ dishId, file, analysisResults, dishName = null, category = null, restaurantName = null, allowMismatch = false }) {
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

      // Re-encode to strip EXIF metadata (GPS, timestamps, device info).
      // The browser applies EXIF orientation when drawing to canvas, so
      // portrait photos stay correctly oriented after the strip. Output is
      // always JPEG, so the stored filename always uses .jpg.
      let uploadFile
      try {
        uploadFile = await stripExifAndReencode(file)
      } catch (err) {
        logger.warn('EXIF strip / re-encode failed', { type: file.type, err })
        throw new Error("Couldn't process this image. Please try a different photo.")
      }

      const fileName = photoStoragePath(user.id, dishId)

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('dish-photos')
        .upload(fileName, uploadFile, {
          upsert: true, // Replace if exists
          contentType: 'image/jpeg',
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
      // With a dish name, the same call also answers "is this the dish they
      // say it is?" — see dish_match handling below. It never rejects.
      const modBody = { photo_url: publicUrl }
      if (dishName) {
        modBody.dish_name = dishName
        modBody.category = category || ''
        modBody.restaurant_name = restaurantName || ''
      }
      const { data: modResult, error: modError } = await supabase.functions.invoke(
        'photo-moderate',
        { body: modBody }
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

      // Dish check: the model says this is clearly a different kind of food
      // than the named dish. Hold the photo (file stays, no row yet) and let
      // the user decide — it may be a fancy version of exactly that dish.
      if (dishName && !allowMismatch && modResult.dish_match === 'contradicts') {
        logger.info('photo dish check: contradiction, holding for user decision', { dishId, seen: modResult.seen })
        return {
          pending: true,
          mismatch: { seen: typeof modResult.seen === 'string' ? modResult.seen : '' },
          dishId,
          fileName,
          publicUrl,
          analysisResults,
        }
      }

      return await insertPhotoRecord(buildPhotoRecord({ dishId, userId: user.id, publicUrl, analysisResults }))
    } catch (error) {
      logger.error('Error uploading photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * User confirmed a held photo really is the dish they picked.
   * @param {Object} pending - handle returned by uploadPhoto
   * @returns {Promise<Object>} Photo record
   */
  async confirmPendingPhoto(pending) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in to upload photos')
      const fileName = trustedPendingPath(pending, user.id)
      const { data: { publicUrl } } = supabase.storage.from('dish-photos').getPublicUrl(fileName)
      return await insertPhotoRecord(buildPhotoRecord({
        dishId: pending.dishId, userId: user.id, publicUrl, analysisResults: pending.analysisResults,
      }))
    } catch (error) {
      logger.error('Error confirming pending photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * User says the held photo is a different dish. Move the file to that
   * dish's path (no re-upload, no second moderation) and insert its row.
   * @param {Object} pending - handle returned by uploadPhoto
   * @param {string} toDishId - dish to attach the photo to instead
   * @returns {Promise<Object>} Photo record on the new dish
   */
  async reassignPendingPhoto(pending, toDishId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in to upload photos')
      const fromName = trustedPendingPath(pending, user.id)
      if (!toDishId || typeof toDishId !== 'string' || toDishId === pending.dishId) throw new Error('Pick a different dish')

      const newName = photoStoragePath(user.id, toDishId)
      const bucket = supabase.storage.from('dish-photos')
      // Try the move first. Only if the destination already exists (the
      // user's earlier photo of that dish) do we clear it and retry — same
      // replace semantics as uploadPhoto's upsert, but we never delete the
      // old file unless we're about to succeed at putting the new one there.
      let { error: moveError } = await bucket.move(fromName, newName)
      if (moveError && /exist|duplicate|409/i.test(moveError.message || String(moveError.statusCode || ''))) {
        const { error: rmError } = await bucket.remove([newName])
        if (rmError) throw createClassifiedError(rmError)
        ;({ error: moveError } = await bucket.move(fromName, newName))
      }
      if (moveError) throw createClassifiedError(moveError)

      const { data: { publicUrl } } = supabase.storage.from('dish-photos').getPublicUrl(newName)
      return await insertPhotoRecord(buildPhotoRecord({
        dishId: toDishId, userId: user.id, publicUrl, analysisResults: pending.analysisResults,
      }))
    } catch (error) {
      logger.error('Error reassigning pending photo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * User doesn't want the held photo at all. Remove the file.
   * @param {Object} pending - handle returned by uploadPhoto
   */
  async discardPendingPhoto(pending) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in to upload photos')
      const fileName = trustedPendingPath(pending, user.id)
      const { error } = await supabase.storage.from('dish-photos').remove([fileName])
      if (error) throw createClassifiedError(error)
      return { success: true }
    } catch (error) {
      logger.error('Error discarding pending photo:', error)
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
   * Batched lookup of a specific user's own photos for a set of dishes.
   * Used by the profile grid to show "their" photo (not the shared
   * dishes.photo_url). Quality tier decides gallery ranking, not whether
   * the photo exists on the user's own profile — so 'hidden' (low quality)
   * is included. Only moderation-rejected photos never become a tile.
   * @param {string} userId
   * @param {string[]} dishIds
   * @returns {Promise<Object>} { [dishId]: photo_url }
   */
  async getUserPhotoMap(userId, dishIds) {
    try {
      if (!userId || !dishIds || dishIds.length === 0) return {}
      var CHUNK_SIZE = 150
      var map = {}
      for (var i = 0; i < dishIds.length; i += CHUNK_SIZE) {
        var batch = dishIds.slice(i, i + CHUNK_SIZE)
        const { data, error } = await supabase
          .from('dish_photos')
          .select('dish_id, photo_url, status')
          .eq('user_id', userId)
          .in('status', ['featured', 'community', 'hidden'])
          .in('dish_id', batch)
        if (error) throw createClassifiedError(error)
        // dish_photos is UNIQUE(dish_id, user_id) -> at most one row per dish.
        for (const row of data || []) {
          map[row.dish_id] = row.photo_url
        }
      }
      return map
    } catch (error) {
      logger.error('Error fetching user photo map:', error)
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
