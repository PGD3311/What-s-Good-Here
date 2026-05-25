import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '../../context/AuthContext'
import { LoginModal } from '../Auth/LoginModal'
import { CheckInSheet } from './CheckInSheet'

// Apple resolves a bare app-name URL to the unique match without an
// explicit ID. Avoids hardcoding an ID until we confirm the prod App
// Store identifier.
const APP_STORE_URL = 'https://apps.apple.com/app/whats-good-here'

/**
 * CheckInButton — entry point for the check-in flow on RestaurantDetail.
 *
 * Two render modes:
 *
 * - **Native iOS:** real button. Label switches between "Check in here" (when
 *   GPS shows we're within range of THIS restaurant via useNearbyRestaurant)
 *   and "I've been here" (otherwise — retroactive logged path). Tap mounts
 *   the bottom sheet.
 *
 * - **Web / PWA:** the interactive check-in UI is gated to native (see spec
 *   §6). Instead of silently hiding, we surface a small "in the iOS app"
 *   link so web-first users discover the feature exists. (Codex flagged
 *   silent-hide as a UX dead-end.)
 *
 * Anonymous users see nothing — there's no useful check-in flow without an
 * authed identity, and surfacing a login wall here would create noise on
 * every restaurant page.
 */
export function CheckInButton({ restaurant, nearbyRestaurant }) {
  const { user } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  // Lock the mode the sheet was opened with so GPS changes mid-entry
  // (e.g. user walks out of range while filling the note) don't flip
  // "Check in here" to "I've been here" under them.
  const [openedMode, setOpenedMode] = useState('logged')

  // Web/PWA path: check-ins are native-only by design. Render an
  // informational link (not a clickable action) so web-first users
  // discover the feature exists without hitting a dead silent-hide.
  if (!Capacitor.isNativePlatform()) {
    return (
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'Outfit, sans-serif',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-accent-gold)',
          textDecoration: 'none',
        }}
      >
        <span aria-hidden="true">📍</span>
        Check-ins live in the iOS app
      </a>
    )
  }

  const isHere = nearbyRestaurant && nearbyRestaurant.id === restaurant.id
  const label = isHere ? 'Check in here' : "I've been here"

  function handleClick() {
    // Match the codebase's engagement-action login-gate pattern (votes,
    // favorites, photos) — open LoginModal instead of silently hiding.
    if (!user) {
      setLoginModalOpen(true)
      return
    }
    setOpenedMode(isHere ? 'live' : 'logged')
    setSheetOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        className="inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        style={{
          padding: '12px 18px',
          minHeight: '48px',
          borderRadius: '14px',
          background: isHere ? 'var(--color-primary)' : 'var(--color-surface-elevated)',
          border: isHere
            ? '1.5px solid var(--color-primary)'
            : '1.5px solid var(--color-divider)',
          color: isHere ? 'var(--color-text-on-primary, #FFFFFF)' : 'var(--color-text-primary)',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: '14px',
          letterSpacing: '0.01em',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">📍</span>
        {label}
      </button>

      <CheckInSheet
        open={sheetOpen}
        restaurant={restaurant}
        mode={openedMode}
        onClose={function () { setSheetOpen(false) }}
      />

      <LoginModal
        isOpen={loginModalOpen}
        onClose={function () { setLoginModalOpen(false) }}
      />
    </>
  )
}
