import { useState, useEffect, useRef } from 'react'
import { renderShareCardToFile } from './renderShareCardToFile'
import { shareImage } from '../../utils/share'
import { FEATURES } from '../../constants/features'
import { capture } from '../../lib/analytics'
import { logger } from '../../utils/logger'
import { toast } from 'sonner'

/**
 * Share an on-brand card image of a playlist / locals list to Instagram.
 *
 * Pre-generates the image on mount: iOS Safari/WKWebView invalidate share()
 * if you await after the tap, so the File must be ready BEFORE the gesture.
 *
 * Props:
 *   surface   - 'playlist' | 'locals_list' (analytics)
 *   id        - playlist id or user id (analytics + key)
 *   url       - canonical share URL (rides along as link)
 *   cardData  - { title, byline, emojis[], topItems[], footerUrl }
 *   shareText - optional text for the share payload
 */
export function ShareToInstagramButton({ surface, id, url, cardData, shareText }) {
  const [busy, setBusy] = useState(false)
  const assetRef = useRef(null)

  useEffect(() => {
    if (!FEATURES.IG_SHARE_ENABLED) return undefined
    let cancelled = false
    renderShareCardToFile(cardData)
      .then((asset) => { if (!cancelled) assetRef.current = asset })
      .catch((err) => logger.warn('Share card pre-render failed:', err))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!FEATURES.IG_SHARE_ENABLED) return null

  async function handleShare() {
    setBusy(true)
    try {
      let asset = assetRef.current
      if (!asset) asset = await renderShareCardToFile(cardData) // safety net (rare)
      const result = await shareImage({ file: asset.file, blob: asset.blob, url, text: shareText })
      capture('share_to_instagram', { surface, id, method: result.method, success: result.success })
      if (result.success && result.method === 'download_copy') {
        toast.success('Image saved — open Instagram to post', { duration: 2500 })
      }
    } catch (err) {
      logger.warn('Share to Instagram failed:', err)
      toast.error('Could not prepare the image. Please try again.', { duration: 2500 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={busy}
      className="px-5 py-2 rounded-full font-semibold transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
      style={{
        background: 'var(--color-primary)',
        color: 'var(--color-text-on-primary)',
        fontSize: '13px',
      }}
    >
      {busy ? 'Preparing…' : 'Share to Instagram'}
    </button>
  )
}
