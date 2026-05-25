import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '../../context/AuthContext'
import { useNearbyRestaurant } from '../../hooks/useNearbyRestaurant'
import { getStorageItem, setStorageItem } from '../../lib/storage'

/**
 * ProximityCheckInBanner — homepage nudge when GPS shows the user is at a
 * restaurant. Locked design decision #6: "Live entry point: proximity banner
 * (useNearbyRestaurant ≤150m, dismissible, 4h per-restaurant cooldown)."
 *
 * Gating:
 *   - Native iOS only (Capacitor — same as the check-in flow itself).
 *   - Logged-in users only — a check-in nudge to an anon user just creates
 *     friction; let them sign up through any other surface first.
 *   - Suppressed for 4h per restaurant after a dismiss (per-restaurant key
 *     so dismissing Atria doesn't suppress Offshore Ale).
 *   - Suppressed when no nearby restaurant.
 *
 * Tap → routes to /restaurants/<id> where CheckInButton picks up. We don't
 * try to open the sheet directly from here because the restaurant page also
 * surfaces context (menu, hours, friends-here) that frames the action.
 */

// Per-restaurant key, set whenever the user dismisses the banner for THAT
// restaurant. 4h later the banner is allowed to fire again.
const DISMISS_KEY_PREFIX = 'wgh_proximity_dismissed_'
const COOLDOWN_MS = 4 * 60 * 60 * 1000  // 4 hours

export function ProximityCheckInBanner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Same 150m radius as the server-side live check-in gate so the banner's
  // promise matches what the user can actually do. The hook's default is
  // 500m which is too generous for "you're here."
  const { nearbyRestaurant } = useNearbyRestaurant(150)
  const [hidden, setHidden] = useState(true)

  // Decide whether to show on every change of which restaurant is nearby.
  // Depend on nearbyRestaurant?.id (stable scalar) rather than the whole
  // object, which can churn references on each location tick.
  //
  // Platform gate is strict iOS — locked design decision #7 says iOS-only;
  // `isNativePlatform()` would also be true for Android if/when we ship
  // there. Matching the spec literally here so a future Android cut
  // doesn't silently inherit unfinished check-in UX.
  const nearbyRestaurantId = nearbyRestaurant?.id || null
  useEffect(function () {
    if (Capacitor.getPlatform() !== 'ios') { setHidden(true); return }
    if (!user) { setHidden(true); return }
    if (!nearbyRestaurantId) { setHidden(true); return }

    const dismissedAt = Number(getStorageItem(DISMISS_KEY_PREFIX + nearbyRestaurantId)) || 0
    const cooldownActive = Date.now() - dismissedAt < COOLDOWN_MS
    setHidden(cooldownActive)
  }, [user, nearbyRestaurantId])

  if (hidden || !nearbyRestaurant) return null

  function handleCheckIn() {
    navigate('/restaurants/' + nearbyRestaurant.id)
  }

  function handleDismiss() {
    setStorageItem(DISMISS_KEY_PREFIX + nearbyRestaurant.id, String(Date.now()))
    setHidden(true)
  }

  return (
    <div
      role="region"
      aria-label="Check-in nudge"
      style={{
        // Known v1 trade-off: at zIndex 50 this can briefly overlap the
        // map-mode floating search bar (zIndex 15) when both are visible.
        // The banner is dismissible + 4h-cooldown, so the overlap window
        // is short in practice. Revisit if usage reports it as annoying.
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        zIndex: 50,
        margin: '8px 12px 0',
        padding: '12px 14px',
        borderRadius: '14px',
        background: 'var(--color-surface-elevated)',
        border: '1.5px solid var(--color-primary)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '20px' }}>📍</span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
          fontSize: '14px',
          color: 'var(--color-text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          At {nearbyRestaurant.name}?
        </p>
        <p style={{
          margin: 0,
          fontFamily: 'Outfit, sans-serif',
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
        }}>
          Check in to log the visit.
        </p>
      </div>
      <button
        type="button"
        onClick={handleCheckIn}
        style={{
          flex: '0 0 auto',
          padding: '8px 14px',
          borderRadius: '10px',
          background: 'var(--color-primary)',
          border: '1.5px solid var(--color-primary)',
          color: 'var(--color-text-on-primary, #FFFFFF)',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        Check in
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          flex: '0 0 auto',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  )
}
