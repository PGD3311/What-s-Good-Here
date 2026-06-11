import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

export const menuScanApi = {
  /**
   * Scan a menu photo for a confirmed restaurant via the menu-xray Edge Function.
   * Works for guests (overlay only) and logged-in users (overlay + quiet ingest);
   * functions.invoke carries the session JWT automatically, so the function
   * decides which path applies.
   * @param {{ restaurantId: string, base64: string, mediaType: string }} params
   * @returns {Promise<object>} sections/best/summary payload, or { not_a_menu } / { unreadable }
   */
  async scanMenu({ restaurantId, base64, mediaType }) {
    try {
      const { data, error } = await supabase.functions.invoke('menu-xray', {
        method: 'POST',
        body: { restaurant_id: restaurantId, image_base64: base64, media_type: mediaType },
      })
      if (error) {
        // FunctionsHttpError carries the raw Response in error.context — pull
        // the server's friendly message and retry_after out before classifying,
        // otherwise the UI can only show generic copy.
        let serverBody = null
        if (error.context && typeof error.context.json === 'function') {
          serverBody = await error.context.json().catch(() => null)
        }
        const classified = createClassifiedError(
          serverBody?.error ? Object.assign(new Error(serverBody.error), { context: error.context }) : error
        )
        if (serverBody?.retry_after != null) classified.retryAfter = serverBody.retry_after
        throw classified
      }
      return data
    } catch (error) {
      logger.error('Menu scan failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
