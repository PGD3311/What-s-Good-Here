// Owns Capacitor App lifecycle listeners that affect auth state.
// Mounted inside AuthProvider so its effects live adjacent to the auth client.
//
// B2: appStateChange → on foreground, reconcile session via authApi.getSession()
// B4: appUrlOpen    → hand off to authUrl.parse → exchangeCodeForSession
//
// Web (non-Capacitor): effect early-returns — nothing to mount.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { authApi } from '../../api/authApi'
import { logger } from '../../utils/logger'

export function AuthLifecycle() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let stateHandle
    let mounted = true

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
    })()

    return () => {
      mounted = false
      stateHandle?.remove?.()
    }
  }, [])

  return null
}
