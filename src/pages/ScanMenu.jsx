import { useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RestaurantConfirmChip, ScanSweep, XRayResults, DecideOverlay } from '../components/scan'
import { useMenuScan } from '../hooks/useMenuScan'
import { downscaleImage } from '../utils/imageDownscale'
import { capture } from '../lib/analytics'
import { logger } from '../utils/logger'

const MIN_SWEEP_MS = 1500

export function ScanMenu() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [restaurant, setRestaurant] = useState(state?.restaurant || null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [sweeping, setSweeping] = useState(false)
  const [decideOpen, setDecideOpen] = useState(false)
  const [localError, setLocalError] = useState(null)
  const { scan, result, scanning, error, reset } = useMenuScan()

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !restaurant) return
    setLocalError(null)
    setPhotoUrl(URL.createObjectURL(file))
    setSweeping(true)
    capture('scan_started', { restaurant_id: restaurant.id })
    const minSweep = new Promise(res => setTimeout(res, MIN_SWEEP_MS))
    try {
      const { base64, mediaType } = await downscaleImage(file)
      const [payload] = await Promise.all([scan({ restaurantId: restaurant.id, base64, mediaType }), minSweep])
      capture('scan_completed', {
        restaurant_id: restaurant.id,
        matched: payload?.summary?.matched ?? 0,
        ingested: payload?.summary?.ingested ?? 0,
        not_a_menu: !!payload?.not_a_menu,
      })
    } catch (err) {
      await minSweep // failures still get one full sweep — no sub-second flash
      logger.error('Scan failed:', err)
      setLocalError(err?.message || 'Scan failed — try again')
      capture('scan_failed', { restaurant_id: restaurant.id, reason: err?.message })
    } finally {
      setSweeping(false)
      e.target.value = ''
    }
  }

  const retake = () => { reset(); setLocalError(null); setPhotoUrl(null) }

  if (sweeping || scanning) return <ScanSweep photoUrl={photoUrl} />

  if (result && !result.not_a_menu && !result.unreadable) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3" style={{ background: 'var(--color-bg)' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-elevated)' }}>←</button>
          <button onClick={retake} className="text-sm font-semibold" style={{ color: 'var(--color-accent-gold)' }}>↻ Re-scan</button>
        </div>
        <XRayResults result={result} photoUrl={photoUrl} />
        {result.best && (
          <div className="fixed bottom-6 left-4 right-4 z-30">
            <button onClick={() => { setDecideOpen(true); capture('decide_opened', { restaurant_id: restaurant.id }) }}
              className="w-full py-4 rounded-2xl font-bold text-base"
              style={{ background: 'var(--color-rating)', color: '#fff', boxShadow: '0 8px 26px rgba(22,163,74,0.45)' }}>
              🎯 Just tell me what to get
            </button>
          </div>
        )}
        <DecideOverlay open={decideOpen} onClose={() => setDecideOpen(false)} result={result} />
      </div>
    )
  }

  const softMessage = result?.not_a_menu
    ? "That doesn't look like a menu 😄 — point at the food list and try again."
    : result?.unreadable
      ? "Couldn't read this menu — try more light or get closer."
      : (error?.message || localError)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 relative" style={{ background: 'var(--color-bg)' }}>
      <button onClick={() => navigate(-1)} aria-label="Back" className="absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-surface-elevated)' }}>←</button>
      <h1 className="text-4xl text-center" style={{ fontFamily: "'Amatic SC', cursive", fontWeight: 700 }}>
        Menu X-Ray
      </h1>
      <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
        Snap the menu — see what the crowd actually orders.
      </p>
      <RestaurantConfirmChip confirmed={restaurant} onConfirm={setRestaurant} />
      {softMessage && (
        <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>{softMessage}</p>
      )}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={!restaurant}
        className="px-8 py-4 rounded-2xl font-bold text-base disabled:opacity-40"
        style={{ background: 'var(--color-primary)', color: '#fff' }}
      >
        📷 {result || error ? 'Try again' : 'Scan the menu'}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  )
}
