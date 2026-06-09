import { supabase } from '../lib/supabase'
import { checkPhotoUploadRateLimit } from '../lib/rateLimiter'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'

/**
 * Menu Photos API — upload menu photos and trigger server-side extraction.
 *
 * Upload path: `{uid}/{restaurantId}/{timestamp}-{index}.{ext}`
 * Owner-first prefix matches the edge function's ownership check and the
 * owner-first RLS policy on the `menu-photos` bucket.
 *
 * NOTE: EXIF stripping / compression helpers in dishPhotosApi (stripExifAndReencode)
 * are not exported from that module, so this module does a plain
 * supabase.storage.from('menu-photos').upload() without pre-processing.
 * The tradeoff is noted here; a future pass can extract the helper to
 * src/utils/imageAnalysis.js and import it from both modules.
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

      const timestamp = Date.now()
      const publicUrls = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${restaurantId}/${timestamp}-${i}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('menu-photos')
          .upload(path, file, { upsert: false })

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
