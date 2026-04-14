/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { capture, identify, reset } from '../lib/analytics'
import { clearPendingVoteStorage, clearCache, removeStorageItem, removeSessionItem, STORAGE_KEYS } from '../lib/storage'
import { logger } from '../utils/logger'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const prevUserRef = useRef(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    // Restore session from localStorage (instant, works offline)
    // This is faster than getUser() which makes a network request
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        logger.error('Error restoring session:', error)
      }
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      prevUserRef.current = sessionUser

      if (sessionUser) {
        // Identify user in PostHog (no PII - just auth provider for segmentation)
        identify(sessionUser.id, {
          auth_provider: sessionUser.app_metadata?.provider || 'unknown',
        })
      }
      setLoading(false)
    })

    // Listen for auth changes (handles token refresh, sign in/out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null

      // Handle different auth events
      if (event === 'SIGNED_IN' && newUser && !prevUserRef.current) {
        // User just signed in
        identify(newUser.id, {
          auth_provider: newUser.app_metadata?.provider || 'unknown',
        })
        capture('login_completed', {
          method: newUser.app_metadata?.provider || 'unknown',
        })
      } else if (event === 'SIGNED_OUT') {
        // User signed out
        capture('logout')
        reset()
      } else if (event === 'TOKEN_REFRESHED') {
        // Token was refreshed - session is still valid, user stays logged in
        // Update state to ensure we have fresh user data
      } else if (event === 'USER_DELETED' || !session) {
        // User was deleted or session is invalid - clear state
        if (prevUserRef.current) {
          capture('session_expired')
          reset()
        }
      }

      setUser(newUser)
      setLoading(false)
      prevUserRef.current = newUser
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    // Clear all sensitive localStorage/sessionStorage data before signing out
    clearPendingVoteStorage()
    clearCache()
    // SECURITY: Clear any cached PII (email was previously stored for convenience)
    removeSessionItem(STORAGE_KEYS.EMAIL_CACHE)
    removeStorageItem(STORAGE_KEYS.EMAIL_CACHE)
    await supabase.auth.signOut()
    // Clear React Query cache so the next user on this browser doesn't inherit stale data
    queryClient.clear()
    setUser(null)
  }, [queryClient])

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    user,
    loading,
    signOut
  }), [user, loading, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
