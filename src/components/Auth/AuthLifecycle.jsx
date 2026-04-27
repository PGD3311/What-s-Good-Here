// Owns Capacitor App lifecycle listeners that affect auth state.
// Mounted inside AuthProvider so its effects live adjacent to the auth client.
//
// B2: appStateChange → on foreground, reconcile session via authApi.getSession()
// B4: appUrlOpen    → parse universal-link, exchangeCodeForSession, route by type
//
// Web (non-Capacitor): effect early-returns — nothing to mount.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { authApi } from '../../api/authApi'
import { parse as parseAuthUrl } from '../../lib/authUrl'
import { logger } from '../../utils/logger'

export function AuthLifecycle() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let stateHandle
    let urlHandle
    let mounted = true
    // Idempotency guard: dedupe concurrent appUrlOpen events for the same code.
    // Capacitor can fire the URL more than once (cold-launch + foreground), and
    // exchangeCodeForSession is one-time-use — a duplicate exchange returns
    // an error and would overwrite navigation with /login.
    const inFlightCodes = new Set()

    ;(async () => {
      const { App } = await import('@capacitor/app')
      if (!mounted) return

      stateHandle = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return
        try {
          await authApi.getSession()
        } catch (err) {
          logger.warn('AuthLifecycle getSession on foreground failed', err)
        }
      })

      urlHandle = await App.addListener('appUrlOpen', async ({ url }) => {
        const parsed = parseAuthUrl(url)
        if (!parsed) return // not an auth URL — leave it to the router / other handlers
        const { code, type } = parsed
        if (inFlightCodes.has(code)) return // duplicate event for the same code
        inFlightCodes.add(code)
        try {
          const { error } = await authApi.exchangeCodeForSession(code)
          if (error) {
            // Cross-device PKCE detection: when a user opens a link on a
            // device different from the one that initiated the auth flow,
            // the local code_verifier is missing. Supabase surfaces this
            // through error.message wording — brittle against SDK changes,
            // but error.code isn't yet exposed for this case. Re-check on
            // SDK upgrades. Falling through to /login if the heuristic
            // misses is the safe degrade (user retries from there).
            const msg = String(error.message || '').toLowerCase()
            if (msg.includes('code verifier') || msg.includes('verifier not found')) {
              navigate('/auth/cross-device', { state: { type } })
              return
            }
            logger.warn('AuthLifecycle exchangeCodeForSession failed', error)
            navigate('/login', { state: { authError: 'link_expired' } })
            return
          }
          // Route by type per spec Flow D:
          //   recovery  → password reset page
          //   confirm   → home (WelcomeModal auto-opens for new users)
          //   magiclink → home
          if (type === 'recovery') {
            navigate('/reset-password')
          } else {
            navigate('/')
          }
        } catch (err) {
          logger.warn('AuthLifecycle appUrlOpen handler threw', err)
          navigate('/login', { state: { authError: 'link_failed' } })
        }
      })
    })()

    return () => {
      mounted = false
      stateHandle?.remove?.()
      urlHandle?.remove?.()
    }
  }, [navigate])

  return null
}
