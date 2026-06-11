import { useRef, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RestaurantConfirmChip, ScanSweep, XRayResults, DecideOverlay, XRayDemoCard } from '../components/scan'
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
    <div className="min-h-screen flex flex-col items-center px-6 pb-12 relative" style={{ background: 'var(--color-bg)' }}>
      <button onClick={() => navigate(-1)} aria-label="Back" className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center z-10"
        style={{ background: 'var(--color-surface-elevated)', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>←</button>

      <div className="w-full max-w-sm flex flex-col items-center gap-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
        {/* Title */}
        <div className="text-center">
          <h1 style={{ fontFamily: "'Amatic SC', cursive", fontWeight: 700, fontSize: '46px', lineHeight: 0.95, color: 'var(--color-text-primary)' }}>
            Menu X-Ray
          </h1>
          <p className="text-[15px] mt-1.5 px-2" style={{ color: 'var(--color-text-secondary)' }}>
            Point your phone at any menu — see what the island <em>actually</em> orders.
          </p>
        </div>

        {/* Show, don't tell: the trick on loop */}
        <XRayDemoCard />

        {/* How it works — three beats, editorial numbers */}
        <div className="flex items-start w-full gap-1 px-1">
          {[
            ['1', 'Tell us where you are'],
            ['2', 'Snap the menu'],
            ['3', 'The good stuff lights up'],
          ].map(([n, label]) => (
            <div key={n} className="flex-1 flex flex-col items-center text-center gap-1.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--color-text-primary)', color: 'var(--color-surface-elevated)' }}>
                {n}
              </span>
              <span className="text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Step 1 — anchor the scan to a restaurant */}
        <div className="w-full rounded-2xl px-4 py-4 flex flex-col items-center gap-3 transition-all"
          style={{
            background: 'var(--color-surface-elevated)',
            border: restaurant ? '1.5px solid var(--color-rating)' : '1.5px dashed var(--color-accent-gold)',
            boxShadow: '0 2px 10px rgba(40,30,20,0.06)',
          }}>
          {!restaurant && (
            <p className="text-[11px] font-bold uppercase" style={{ color: 'var(--color-accent-gold)', letterSpacing: '0.16em' }}>
              Step 1 · Where are you eating?
            </p>
          )}
          <RestaurantConfirmChip confirmed={restaurant} onConfirm={setRestaurant} />
        </div>

        {softMessage && (
          <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>{softMessage}</p>
        )}

        {/* The shutter — visibly locked until a restaurant is confirmed */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!restaurant}
            aria-label="Open the camera and scan the menu"
            className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={restaurant
              ? { background: 'var(--color-primary)', color: '#fff', boxShadow: '0 10px 28px rgba(228,68,10,0.38)', animation: 'shutter-ready 2.6s ease-in-out infinite' }
              : { background: 'var(--color-surface-elevated)', color: 'var(--color-text-tertiary)', border: '2px dashed var(--color-text-tertiary)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-9 h-9">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
          </button>
          <p className="text-xs font-semibold" style={{ color: restaurant ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
            {restaurant
              ? (result || error ? 'Try another shot' : 'Snap the menu')
              : 'Pick your spot to unlock the camera'}
          </p>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange} style={{ display: 'none' }} />
      <style>{`
        @keyframes shutter-ready {
          0%, 100% { box-shadow: 0 10px 28px rgba(228,68,10,0.38); }
          50% { box-shadow: 0 10px 36px rgba(228,68,10,0.6), 0 0 0 8px rgba(228,68,10,0.08); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes shutter-ready { 0%, 100% { box-shadow: 0 10px 28px rgba(228,68,10,0.38); } }
        }
      `}</style>
    </div>
  )
}
