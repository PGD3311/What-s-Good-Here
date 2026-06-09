import { supabase } from '../lib/supabase'
import { checkPhotoUploadRateLimit } from '../lib/rateLimiter'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'
import { stripExifAndReencode } from '../utils/imageAnalysis'

// Upload constraints — mirrors dishPhotosApi exactly so both flows enforce
// the same rules.  HEIC is accepted here because stripExifAndReencode
// re-encodes to JPEG before upload, satisfying the edge function's
// png/jpeg/webp/gif requirement downstream.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Menu Photos API — upload menu photos and trigger server-side extraction.
 *
 * Upload path: `{uid}/{restaurantId}/{timestamp}-{index}.jpg`
 * Owner-first prefix matches the edge function's ownership check and the
 * owner-first RLS policy on the `menu-photos` bucket.
 *
 * Every file is validated (MIME type + size) then re-encoded via
 * stripExifAndReencode to strip GPS/EXIF metadata before reaching public
 * storage.  All uploads are stored as JPEG regardless of input format.
 */

export const menuPhotosApi = {
  /**
   * Upload one or more menu photo files to the `menu-photos` storage bucket.
   *
   * @param {string} restaurantId
   * @param {File[]} files
   * @returns {Promise<string[]>} Array of public URLs, one per uploaded file.
   */
  async uploadMenuPhotos(restaurantId, files) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be logged in to upload menu photos')
      }

      const rateLimit = checkPhotoUploadRateLimit()
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      // Validate every file before uploading any — mirrors dishPhotosApi.
      // Validate first so no files are uploaded if one is invalid.
      for (const file of files) {
        if (!file || !(file instanceof File)) {
          throw new Error('Invalid file provided')
        }
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          throw new Error('Invalid file type. Please upload a JPEG, PNG, WebP, or HEIC image.')
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error('File too large. Maximum size is 10MB.')
        }
      }

      const timestamp = Date.now()
      const publicUrls = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Re-encode to JPEG to strip EXIF metadata (GPS, timestamps, device
        // info) before storing in the public menu-photos bucket.
        let uploadFile
        try {
          uploadFile = await stripExifAndReencode(file)
        } catch (err) {
          logger.warn('EXIF strip / re-encode failed', { type: file.type, err })
          throw new Error("Couldn't process this image. Please try a different photo.")
        }

        // stripExifAndReencode always outputs JPEG, so the stored path always
        // uses .jpg regardless of the original file extension.
        const path = `${user.id}/${restaurantId}/${timestamp}-${i}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('menu-photos')
          .upload(path, uploadFile, { upsert: false, contentType: 'image/jpeg' })

        if (uploadError) {
          throw createClassifiedError(uploadError)
        }

        const { data: { publicUrl } } = supabase.storage
          .from('menu-photos')
          .getPublicUrl(path)

        publicUrls.push(publicUrl)
      }

      return publicUrls
    } catch (error) {
      logger.error('menuPhotosApi.uploadMenuPhotos:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Invoke the `extract-menu-from-photo` edge function to parse uploaded
   * menu photos into a structured dish list.  This function writes nothing —
   * the extraction result is ephemeral and survives only through the returned
   * `extractionId` until `commitDishes` is called.
   *
   * @param {{ restaurantId: string, restaurantName: string, photoUrls: string[] }} params
   * @returns {Promise<{ extractionId: string, dishes: object[], menu_section_order: string[] }>}
   */
  async extractFromPhotos({ restaurantId, restaurantName, photoUrls }) {
    try {
      const { data, error } = await supabase.functions.invoke('extract-menu-from-photo', {
        body: {
          photo_urls: photoUrls,
          restaurant_id: restaurantId,
          restaurant_name: restaurantName,
        },
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return {
        extractionId: data.extraction_id,
        dishes: data.dishes || [],
        menu_section_order: data.menu_section_order || [],
      }
    } catch (error) {
      logger.error('menuPhotosApi.extractFromPhotos:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Invoke the `commit-menu-dishes` edge function to persist a reviewed
   * subset of an extraction into the `dishes` table.
   *
   * Deliberately sends NO dish text fields — only:
   *   - `extraction_id` — which server-side extraction to read from
   *   - `includes` — which dish indices/ids the user confirmed
   *   - `price_overrides` — optional user-edited price corrections
   *
   * The server re-reads the trusted extraction record and writes; no
   * client-supplied dish names or categories reach the database.
   *
   * @param {{ extractionId: string, includes: (string|number)[], priceOverrides?: object }} params
   * @returns {Promise<{ inserted: number, updated: number, skipped: number }>}
   */
  async commitDishes({ extractionId, includes, priceOverrides }) {
    try {
      const { data, error } = await supabase.functions.invoke('commit-menu-dishes', {
        body: {
          extraction_id: extractionId,
          includes,
          price_overrides: priceOverrides || {},
        },
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('menuPhotosApi.commitDishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
