import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { logger } from './logger'

// Canonical public origin for share/invite URLs. Inside the iOS Capacitor
// WebView, window.location.origin is 'WhatsGoodHere://localhost' (per the
// scheme set in capacitor.config.ts); Android uses 'https://localhost'.
// Neither is shareable — recipients can't open those schemes, so links
// silently fall back to the homepage. Always serve external links from
// the canonical public domain instead.
const CANONICAL_ORIGIN = 'https://wghapp.com'

/**
 * Build an absolute URL safe to share/copy. On Capacitor (native iOS/Android)
 * returns a wghapp.com URL; on web returns window.location.origin + path.
 * @param {string} path - Path beginning with '/', e.g. '/playlist/abc'.
 * @returns {string} Absolute URL.
 */
export function canonicalShareUrl(path) {
  if (Capacitor?.isNativePlatform?.()) {
    return `${CANONICAL_ORIGIN}${path}`
  }
  return `${window.location.origin}${path}`
}

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
  const url = canonicalShareUrl(`/dish/${dish.dish_id}`)
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
  const url = canonicalShareUrl(`/restaurants/${restaurant.id}`)
  return {
    url,
    title: restaurant.name,
    text: `Check out ${restaurant.name}${restaurant.town ? ` in ${restaurant.town}` : ''} on What's Good Here!`,
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Share an image File via the platform share sheet, with graceful fallback.
 * Ladder: Capacitor native file-share → Web Share API w/ files → download the
 * image + copy/share the link. Never throws; returns { method, success }.
 *
 * @param {{ file: File, blob: Blob, url: string, text?: string, dialogTitle?: string }} options
 * @returns {Promise<{ method: string, success: boolean }>}
 */
export async function shareImage({ file, blob, url, text, dialogTitle }) {
  // 0. Capacitor native (iOS/Android): write the PNG to cache, share the file URI
  if (Capacitor?.isNativePlatform?.()) {
    try {
      const base64 = await blobToBase64(blob || file)
      const written = await Filesystem.writeFile({
        path: 'wgh-share.png',
        data: base64,
        directory: Directory.Cache,
      })
      await Share.share({ files: [written.uri], url, dialogTitle: dialogTitle || 'Share to Instagram' })
      return { method: 'native_capacitor_file', success: true }
    } catch (err) {
      if (err && (err.message || '').toLowerCase().includes('cancel')) {
        return { method: 'native_capacitor_file', success: false }
      }
      logger.warn('Capacitor file share failed, falling back:', err)
    }
  }

  // 1. Web Share API with files (mobile browsers)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      const data = { files: [file] }
      if (text) data.text = text
      await navigator.share(data)
      return { method: 'web_share_file', success: true }
    } catch (err) {
      if (err && err.name === 'AbortError') return { method: 'web_share_file', success: false }
      logger.warn('Web file share failed, falling back:', err)
    }
  }

  // 2. Fallback: download the image, then copy/share the link
  try {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob || file)
    a.download = (file && file.name) || 'wgh-share.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (err) {
    logger.warn('Image download fallback failed:', err)
  }
  const link = await shareOrCopy({ url, text })
  return { method: 'download_copy', success: link.success }
}
