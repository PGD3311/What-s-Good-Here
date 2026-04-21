import { supabase } from '../lib/supabase'
import { capture } from '../lib/analytics'
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimiter'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { validateUserContent } from '../lib/reviewBlocklist'

/**
 * Auth API - Centralized authentication operations
 */

// Flow K (Apple SIWA provider_refresh_token persistence) retry policy
const APPLE_PERSIST_TRANSIENT_STATUSES = new Set([500, 502, 503, 504])
const APPLE_PERSIST_RETRY_DELAY_MS = 1000

/**
 * Validate redirect URL against allowlist to prevent open redirect attacks
 * Only allows same-origin URLs
 * @param {string|null} redirectUrl - URL to validate
 * @returns {string} Safe redirect URL (defaults to origin if invalid)
 */
function getSafeRedirectUrl(redirectUrl) {
  if (!redirectUrl) {
    return window.location.origin
  }

  try {
    const url = new URL(redirectUrl, window.location.origin)
    // Only allow same-origin redirects
    if (url.origin === window.location.origin) {
      return url.toString()
    }
    logger.warn('Blocked redirect to external origin:', url.origin)
    return window.location.origin
  } catch {
    // Invalid URL, fall back to origin
    return window.location.origin
  }
}

export const authApi = {
  /**
   * Get current auth session
   */
  async getSession() {
    return supabase.auth.getSession()
  },

  /**
   * Sign in with Google OAuth
   * @param {string|null} redirectUrl - Optional custom redirect URL (must be same-origin)
   * @returns {Promise<Object>} Auth response
   */
  async signInWithGoogle(redirectUrl = null) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', { method: 'google' })

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getSafeRedirectUrl(redirectUrl),
        },
      })
      if (error) {
        capture('login_failed', { method: 'google', error: error.message })
        throw createClassifiedError(error)
      }
      return { success: true }
    } catch (error) {
      logger.error('Error signing in with Google:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Sign in with Apple OAuth (web flow).
   *
   * Apple rule 4.8: any app with third-party social login must offer Sign in
   * with Apple as an equivalent option. The button that calls this is gated
   * on FEATURES.APPLE_SIGNIN_ENABLED and stays hidden in production until the
   * Supabase Apple provider is configured.
   *
   * Web flow uses signInWithOAuth → full-page redirect to Apple → Supabase
   * validates the ID token on the callback. Native (Capacitor) flow using
   * signInWithIdToken is deferred — see the H2 plan.
   *
   * Note: Apple's identity token does NOT include the user's name (unlike
   * Google), so display_name will be null on first sign-in via web. The
   * WelcomeModal handles that case by opening when display_name is missing.
   *
   * @param {string|null} redirectUrl - Optional custom redirect URL (must be same-origin)
   * @returns {Promise<Object>} Auth response
   */
  async signInWithApple(redirectUrl = null) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', { method: 'apple' })

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: getSafeRedirectUrl(redirectUrl),
        },
      })
      if (error) {
        capture('login_failed', { method: 'apple', error: error.message })
        throw createClassifiedError(error)
      }
      return { success: true }
    } catch (error) {
      logger.error('Error signing in with Apple:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Sign in with magic link via email
   * @param {string} email - User email
   * @param {string|null} redirectUrl - Optional custom redirect URL (must be same-origin)
   * @returns {Promise<Object>} Auth response
   */
  async signInWithMagicLink(email, redirectUrl = null) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', { method: 'magic_link' })

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getSafeRedirectUrl(redirectUrl),
        },
      })
      if (error) {
        capture('login_failed', { method: 'magic_link', error: error.message })
        throw createClassifiedError(error)
      }
      capture('magic_link_sent')
      return { success: true }
    } catch (error) {
      logger.error('Error sending magic link:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Sign up with email, password, and username
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} username - Display name (must be unique)
   * @returns {Promise<Object>} Auth response
   */
  async signUpWithPassword(email, password, username) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('signup_started', { method: 'password' })

      const contentError = validateUserContent(username, 'Display name')
      if (contentError) throw new Error(contentError)

      // Check if username is already taken
      // Sanitize username for safe database query
      const sanitizedUsername = sanitizeSearchQuery(username, 30)
      const { data: existingUser, error: usernameError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('display_name', sanitizedUsername)
        .maybeSingle()

      if (usernameError) {
        throw createClassifiedError(usernameError)
      }

      if (existingUser) {
        throw new Error('This username is already taken. Please choose another.')
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: username,
          },
        },
      })

      if (error) {
        capture('signup_failed', { method: 'password', error: error.message })
        throw createClassifiedError(error)
      }

      // Update the profile with the display name
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ display_name: username })
          .eq('id', data.user.id)

        if (profileError) {
          throw createClassifiedError(profileError)
        }
      }

      capture('signup_completed', { method: 'password' })
      return { success: true, user: data.user }
    } catch (error) {
      logger.error('Error signing up:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Auth response
   */
  async signInWithPassword(email, password) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', { method: 'password' })

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        capture('login_failed', { method: 'password', error: error.message })
        throw createClassifiedError(error)
      }

      capture('login_completed', { method: 'password' })
      return { success: true, user: data.user }
    } catch (error) {
      logger.error('Error signing in:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Send password reset email
   * @param {string} email - User email
   * @returns {Promise<Object>} Result
   */
  async resetPassword(email) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return { success: true }
    } catch (error) {
      logger.error('Error sending password reset:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update password (after clicking reset link)
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Result
   */
  async updatePassword(newPassword) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return { success: true }
    } catch (error) {
      logger.error('Error updating password:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Check if a username is available
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} True if available
   */
  async isUsernameAvailable(username) {
    try {
      // Sanitize username for safe database query
      const sanitizedUsername = sanitizeSearchQuery(username, 30)
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('display_name', sanitizedUsername)
        .maybeSingle()

      if (error) {
        logger.error('Error checking username:', error)
        throw createClassifiedError(error)
      }

      return !data
    } catch (error) {
      logger.error('Error checking username:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Permanently delete the current user's account and all their data.
   * Calls the `delete-account` Edge Function (service-role), which:
   *   - nulls created_by on restaurants/dishes/specials/events/admins/restaurant_managers
   *   - deletes restaurant_invites + curator_invites rows created or consumed by the user
   *   - deletes follow notifications this user generated
   *   - purges dish-photos storage for this user
   *   - calls auth.admin.deleteUser (cascades votes, profile, favorites, follows, etc.)
   *
   * On success the caller must signOut() and navigate the user off authenticated routes —
   * their JWT is now pointing at a deleted user.
   * @returns {Promise<{ success: true }>}
   */
  async deleteAccount() {
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      })

      if (error) {
        throw createClassifiedError(error)
      }

      // Edge Function may return 200 with an error body (functions.invoke doesn't always
      // treat non-2xx as an error — match placesApi pattern). Also require explicit success
      // flag: fall-through responses (e.g., empty 200) must not be treated as deletion.
      if (data?.error) {
        throw new Error(data.error)
      }
      if (!data || data.success !== true) {
        throw new Error('Account deletion did not complete. Please try again.')
      }

      return data
    } catch (error) {
      logger.error('Error deleting account:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * POST the Apple provider_refresh_token (from Supabase web OAuth callback)
   * to the apple-token-persist Edge Function. One retry on transient failure
   * after 1s. Never throws — Flow K is fire-and-forget from the auth context's
   * perspective. The token is only in memory briefly after SIGNED_IN; if we
   * lose it, Case B (unrevokable sentinel) picks up at delete time.
   *
   * @param {string|null} providerRefreshToken
   * @returns {Promise<{ ok: boolean, code?: string, status?: number }>}
   */
  async persistAppleRefreshToken(providerRefreshToken) {
    // Local safe side-effect helpers. PostHog and the logger transport can
    // themselves throw (storage full, network blocked, etc.). Flow K is
    // contract-bound to never reject, so wrap every side effect.
    const safeCapture = (event, props) => {
      try {
        // Avoid passing undefined — keeps toHaveBeenCalledWith assertions
        // simple and matches the 1-arg shape existing callsites use.
        if (props === undefined) capture(event)
        else capture(event, props)
      } catch { /* swallow — never block Flow K */ }
    }
    const safeWarn = (msg, meta) => {
      try { logger.warn(msg, meta) } catch { /* swallow */ }
    }

    if (!providerRefreshToken) {
      return { ok: false, reason: 'missing_token' }
    }

    // Retry-eligibility rule:
    //   - Server sent structured failure (data.ok === false): respect it.
    //     Retry ONLY if the body explicitly marks itself transient.
    //     (Our Edge Function sets `transient: true` on VAULT_UNAVAILABLE,
    //     TOKEN_LOOKUP_FAILED, UPSERT_FAILED, IDENTITY_LOOKUP_FAILED.)
    //   - Transport-level error (no structured body, only error.status):
    //     Retry on 5xx / 504 per APPLE_PERSIST_TRANSIENT_STATUSES.
    //   - Anything else: no retry.
    //
    // Without this guard, a body-only failure like NO_APPLE_IDENTITY (status
    // defaults to 500 when the SDK doesn't populate it) would incorrectly
    // hit the transient-retry branch.
    const isTransient = (data, error) => {
      if (data && data.ok === false) {
        return data.transient === true
      }
      if (error?.status && APPLE_PERSIST_TRANSIENT_STATUSES.has(error.status)) {
        return true
      }
      return false
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke('apple-token-persist', {
          method: 'POST',
          body: { provider_refresh_token: providerRefreshToken },
        })

        if (!error && data?.ok === true) {
          safeCapture('apple_token_persisted')
          return { ok: true }
        }

        const status = error?.status ?? null
        const code = data?.code

        if (!isTransient(data, error)) {
          safeWarn('apple-token-persist non-transient failure', { status, code })
          return { ok: false, code, status }
        }

        if (attempt === 2) {
          safeCapture('apple_token_persist_failed', { status, code })
          safeWarn('apple-token-persist failed after retry', { status, code })
          return { ok: false, code, status }
        }

        await new Promise((r) => setTimeout(r, APPLE_PERSIST_RETRY_DELAY_MS))
      } catch (err) {
        if (attempt === 2) {
          safeCapture('apple_token_persist_failed', { status: 0, error: err?.message })
          safeWarn('apple-token-persist threw after retry', err)
          return { ok: false, error: err?.message }
        }
        await new Promise((r) => setTimeout(r, APPLE_PERSIST_RETRY_DELAY_MS))
      }
    }

    return { ok: false }
  },

  /**
   * Get current user's vote for a dish
   * @param {string} dishId - Dish ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Vote data or null
   */
  async getUserVoteForDish(dishId, userId) {
    try {
      if (!userId) {
        return null
      }

      const { data, error } = await supabase
        .from('votes')
        .select('rating_10, review_text, review_created_at')
        .eq('dish_id', dishId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error fetching user vote:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
