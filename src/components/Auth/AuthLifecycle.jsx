// Owns Capacitor App lifecycle listeners that affect auth state.
// Must be rendered inside <BrowserRouter> — uses useNavigate() for B4
// deep-link routing. Provider order is AuthProvider > LocationProvider >
// BrowserRouter, so this is mounted in App.jsx alongside the Routes,
// not inside AuthProvider.
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
        if (!parsed) {
          // Non-auth Universal Link: iOS launched (or foregrounded) the app
          // via apple-app-site-association after the user tapped a wghapp.com
          // link in iMessage / Mail / Safari. Without explicit navigation here,
          // React Router stays on whatever route was last loaded (home on cold
          // launch), so every shared /dish, /restaurants, /locals link looks
          // broken. Custom-scheme URLs (WhatsGoodHere://) are auth-only and
          // already handled above; only forward http(s) Universal Links.
          try {
            const u = new URL(url)
            if (u.protocol === 'https:' || u.protocol === 'http:') {
              // Strip extra leading slashes so a malformed link like
              // https://wghapp.com//evil.com can't masquerade as an external
              // path; React Router will then 404 cleanly on the bogus route.
              const path = '/' + (u.pathname || '/').replace(/^\/+/, '')
              const target = path + (u.search || '') + (u.hash || '')
              if (target && target !== '/') {
                // replace: true so the deep link doesn't leave '/' in the
                // history stack underneath a cold-launched destination.
                navigate(target, { replace: true })
              }
            }
          } catch (err) {
            logger.warn('AuthLifecycle non-auth deep link parse failed', err)
          }
          return
        }
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
