import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { logger } from './logger'

/**
 * Share or copy a URL with platform-appropriate behavior.
 *
 * Fallback strategy:
 * 1. Capacitor Share plugin (native iOS/Android — guaranteed under capacitor:// origin)
 * 2. Web Share API (mobile browsers)
 * 3. navigator.clipboard.writeText (modern desktop)
 * 4. Synchronous textarea + execCommand (last-resort fallback)
 *
 * Never throws. Returns { method, success, error? } so callers can toast accordingly.
 *
 * @param {{ url: string, title?: string, text?: string }} options
 * @returns {Promise<{ method: string, success: boolean, error?: unknown }>}
 */
export async function shareOrCopy({ url, title, text }) {
  // 1. Capacitor native share (iOS / Android shell)
  if (Capacitor?.isNativePlatform?.()) {
    try {
      const payload = { url }
      if (title) payload.title = title
      if (text) payload.text = text
      await Share.share(payload)
      return { method: 'native_capacitor', success: true }
    } catch (err) {
      // User cancellation throws too — surface as success:false but don't fall through
      // to clipboard, otherwise dismissing native sheet would still copy the link.
      if (err && (err.message || '').toLowerCase().includes('cancel')) {
        return { method: 'native_capacitor', success: false, error: err }
      }
      logger.warn('Capacitor Share failed, falling back:', err)
    }
  }

  // 2. Web Share API (mobile browsers)
  if (navigator.share) {
    const shareData = { url }
    if (title) shareData.title = title
    if (text) shareData.text = text

    if (!navigator.canShare || navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
        return { method: 'web_share', success: true }
      } catch (err) {
        if (err.name === 'AbortError') {
          return { method: 'web_share', success: false }
        }
        // Fall through to clipboard
      }
    }
  }

  // 3. Async clipboard API (desktop browsers)
  try {
    await navigator.clipboard.writeText(url)
    return { method: 'clipboard', success: true }
  } catch {
    // Fall through to execCommand
  }

  // 4. Synchronous textarea + execCommand (mobile Safari fallback)
  try {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return { method: 'execCommand', success }
  } catch (err) {
    logger.warn('All share methods failed:', err)
    return { method: 'execCommand', success: false, error: err }
  }
}

/**
 * Build share payload for a dish.
 * @param {{ dish_id: string, dish_name: string, restaurant_name: string }} dish
 * @returns {{ url: string, title: string, text: string }}
 */
export function buildDishShareData(dish) {
  const url = `${window.location.origin}/dish/${dish.dish_id}`
  return {
    url,
    title: `${dish.dish_name} at ${dish.restaurant_name}`,
    text: `Check out ${dish.dish_name} at ${dish.restaurant_name} on What's Good Here!`,
  }
}

/**
 * Build share payload for a restaurant.
 * @param {{ id: string, name: string, town?: string }} restaurant
 * @returns {{ url: string, title: string, text: string }}
 */
export function buildRestaurantShareData(restaurant) {
  const url = `${window.location.origin}/restaurants/${restaurant.id}`
  return {
    url,
    title: restaurant.name,
    text: `Check out ${restaurant.name}${restaurant.town ? ` in ${restaurant.town}` : ''} on What's Good Here!`,
  }
}
