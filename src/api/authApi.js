import { Capacitor } from '@capacitor/core'
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
 * Resolve a caller-supplied return path (relative path or absolute URL) into a
 * same-origin absolute URL safe to hand Supabase as `redirectTo`. Strips any
 * cross-origin override to prevent open-redirect attacks. Web-only — native
 * (Capacitor) flows skip this entirely.
 *
 * @param {string|null} returnPath - Path like `/dish/123?q=foo#bar`, an absolute
 *   same-origin URL, or null. Cross-origin URLs are rejected and fall back to origin.
 * @returns {string} Same-origin absolute URL.
 */
function buildWebRedirectUrl(returnPath) {
  if (!returnPath) {
    return window.location.origin
  }

  try {
    const url = new URL(returnPath, window.location.origin)
    if (url.origin === window.location.origin) {
      return url.toString()
    }
    logger.warn('Blocked redirect to external origin:', url.origin)
    return window.location.origin
  } catch {
    return window.location.origin
  }
}

/**
 * Build a deterministic placeholder display name for a user who has no other
 * source. Used when Apple's SIWA picker had "Hide My Name" selected (no first/
 * last shared), the OAuth provider didn't populate user_metadata.full_name, and
 * email signup never happened. Format: `eater-{8charsOfUserIdHex}`.
 *
 * Collision space is 16^8 ≈ 4.3B; with <10k users this is effectively unique.
 * The user can rename in Profile settings whenever they want.
 */
function generatePlaceholderName(userId) {
  const short = String(userId).replace(/-/g, '').slice(0, 8).toLowerCase()
  return `eater-${short}`
}

/**
 * Ensure the signed-in user has a non-empty `profiles.display_name`. The
 * broken invariant before this function existed: SIWA users who chose "Hide
 * My Name" landed in the app with display_name=NULL, which makes them
 * invisible to other users (RLS policy `profiles_select_public_or_own`
 * requires display_name IS NOT NULL for public reads).
 *
 * Two call sites:
 *   1. `signInWithApple` (native branch) — passes Apple-provided given/family
 *      name when SIWA shared it on first sign-in.
 *   2. `AuthContext` SIGNED_IN listener — universal safety net (no args). Catches
 *      web Apple OAuth, legacy users with NULL display_name, and any provider
 *      edge case where the `handle_new_user` trigger left display_name empty.
 *
 * Race-safe by design (the two call sites fire concurrently on native Apple):
 *   - **Path A** (Apple name supplied) is conditional on `display_name IS NULL`
 *     OR matching the `eater-%` placeholder pattern. So Apple's real name
 *     beats a placeholder written by a concurrent safety-net call, but never
 *     overwrites a name the user picked themselves.
 *   - **Path B** (no Apple name) is conditional on `display_name IS NULL`. Pure
 *     backfill — fills empty profiles, never overwrites anything.
 *
 * Final state on native Apple with shared name:
 *   - If Path A wins the race: `display_name = "Given Family"`. Path B's
 *     `IS NULL` filter no-matches; no-op.
 *   - If Path B wins the race: `display_name = "eater-{8char}"` (Apple's
 *     id_token has no metadata.full_name, so Path B falls to placeholder).
 *     Path A's `IS NULL OR LIKE eater-%` filter matches; overwrites with
 *     `"Given Family"`.
 *
 * Either way, terminal state is Apple's name. Same logic ensures returning
 * Apple users (whose display_name is already custom-set) are never clobbered.
 *
 * Never throws — display_name persistence is best-effort. All failures logged.
 */
async function ensureDisplayName({ appleGivenName = null, appleFamilyName = null } = {}) {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      logger.warn('ensureDisplayName: getSession failed', sessionError)
      return
    }
    const user = sessionData?.session?.user
    if (!user) return

    // Path A: Apple shared a name on first sign-in. Conditional on existing
    // value being either empty or our placeholder pattern.
    if (appleGivenName || appleFamilyName) {
      const appleName = [appleGivenName, appleFamilyName].filter(Boolean).join(' ').trim()
      if (appleName) {
        const contentError = validateUserContent(appleName, 'Display name')
        if (contentError) {
          logger.warn('ensureDisplayName: Apple-supplied name rejected by blocklist', {
            reason: contentError,
          })
          // Fall through to Path B so user still gets a usable placeholder.
        } else {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ display_name: appleName })
            .eq('id', user.id)
            .or('display_name.is.null,display_name.like.eater-*')
          if (updateError) {
            logger.warn('ensureDisplayName: Apple-name update failed', updateError)
          }
          return
        }
      }
    }

    // Path B: No Apple name (or it was blocklisted). Pure backfill.
    const metaName = user.user_metadata?.full_name?.trim()
      || user.user_metadata?.name?.trim()
      || null
    const candidate = metaName || generatePlaceholderName(user.id)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: candidate })
      .eq('id', user.id)
      .is('display_name', null)
    if (updateError) {
      logger.warn('ensureDisplayName: backfill update failed', updateError)
    }
  } catch (err) {
    logger.warn('ensureDisplayName: unexpected error', err)
  }
}

export const authApi = {
  /**
   * Backfill missing `profiles.display_name`. See ensureDisplayName helper
   * docstring for the race-safety design and call sites.
   */
  ensureDisplayName,

  /**
   * Get current auth session
   */
  async getSession() {
    return supabase.auth.getSession()
  },

  /**
   * Subscribe to auth state changes. Synchronous passthrough — returns the
   * { data: { subscription } } shape directly so callers can call
   * subscription.unsubscribe() in cleanup.
   */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  /**
   * Exchange an auth code (from a universal-link / deep-link return) for a
   * Supabase session. Used by AuthLifecycle on appUrlOpen (B4).
   *
   * Returns Supabase's raw `{ data, error }` shape so callers can branch on
   * cross-device PKCE failures (`error.message` containing "code verifier")
   * without us collapsing the error into an opaque classified throw.
   */
  async exchangeCodeForSession(code) {
    return supabase.auth.exchangeCodeForSession(code)
  },

  /**
   * Sign in with Google. On web, performs an OAuth redirect dance and returns
   * the user to `returnPath` after auth. On native (Capacitor), uses the Capgo
   * plugin's ID-token flow — no browser redirect, no `returnPath` needed
   * (React Router state survives the in-WKWebView sign-in).
   *
   * @param {{ returnPath?: string|null }} [options]
   * @param {string|null} [options.returnPath] - Web only: path to return to
   *   post-auth (e.g. `/dish/123?votingDish=abc`). Cross-origin values are rejected.
   *   Ignored on native.
   * @returns {Promise<Object>} Auth response
   */
  async signInWithGoogle({ returnPath = null } = {}) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', {
        method: 'google',
        platform: Capacitor.isNativePlatform() ? 'native' : 'web',
      })

      if (Capacitor.isNativePlatform()) {
        // Native: Capgo plugin → Google ID token → Supabase. No redirect dance,
        // no `returnPath` needed — the WKWebView keeps the same JS context, so
        // React Router state set by the caller survives sign-in.
        const { signInWithGoogleNative } = await import('../lib/nativeAuth')
        let tokens
        try {
          tokens = await signInWithGoogleNative()
        } catch (err) {
          if (err?.code === 'AUTH_USER_CANCELLED') {
            return { success: false, cancelled: true, code: err.code }
          }
          throw err
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: tokens.idToken,
        })
        if (error) {
          capture('login_failed', { method: 'google', error: error.message })
          throw createClassifiedError(error)
        }
        return { success: true }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: buildWebRedirectUrl(returnPath) },
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
   * validates the ID token on the callback. Native (Capacitor) flow uses the
   * Capgo plugin's ID-token flow — no redirect dance.
   *
   * Note: Apple's identity token does NOT include the user's name (unlike
   * Google), so display_name may be null on first sign-in. Per App Store
   * Guideline 4, the UI must NOT prompt for name/email after SIWA — Apple's
   * Authentication Services framework owns that contract. See WelcomeModal.
   *
   * @param {{ returnPath?: string|null }} [options]
   * @param {string|null} [options.returnPath] - Web only: path to return to
   *   post-auth. Cross-origin values are rejected. Ignored on native.
   * @returns {Promise<Object>} Auth response
   */
  async signInWithApple({ returnPath = null } = {}) {
    try {
      const rateLimit = checkRateLimit('auth', RATE_LIMITS.auth)
      if (!rateLimit.allowed) {
        throw new Error(rateLimit.message)
      }

      capture('login_started', {
        method: 'apple',
        platform: Capacitor.isNativePlatform() ? 'native' : 'web',
      })

      if (Capacitor.isNativePlatform()) {
        // Native: Capgo plugin → Apple identity token → Supabase. No redirect
        // dance, no `returnPath` needed — same WKWebView JS context survives.
        const { signInWithAppleNative } = await import('../lib/nativeAuth')
        let appleRes
        try {
          appleRes = await signInWithAppleNative()
        } catch (err) {
          if (err?.code === 'AUTH_USER_CANCELLED') {
            return { success: false, cancelled: true, code: err.code }
          }
          throw err
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: appleRes.identityToken,
          nonce: appleRes.rawNonce,
        })
        if (error) {
          capture('login_failed', { method: 'apple', error: error.message })
          throw createClassifiedError(error)
        }

        // Persist display_name from Apple-shared given/family name when SIWA
        // shared it. Awaited so the modal/UI sees the populated name. Helper
        // never throws — failures are logged. AuthContext also runs
        // ensureDisplayName() as a universal safety net; both calls are
        // race-safe (see ensureDisplayName for the conditional-UPDATE design).
        await ensureDisplayName({
          appleGivenName: appleRes.givenName,
          appleFamilyName: appleRes.familyName,
        }).catch((e) => {
          logger.warn('ensureDisplayName failed', e)
        })

        if (typeof appleRes.authorizationCode === 'string' && appleRes.authorizationCode.length > 0) {
          try {
            const { data, error } = await supabase.functions.invoke('apple-token-exchange', {
              method: 'POST',
              body: { authorization_code: appleRes.authorizationCode },
            })
            if (error || !data?.ok) {
              // Non-blocking. Flow H heals on next sign-in.
              // Status lives on FunctionsHttpError.context.status, not error.status.
              const status = error?.context?.status ?? error?.status
              const code = data?.code ?? error?.context?.code
              capture('apple_token_exchange_failed', { status, code })
              logger.warn('apple-token-exchange failed', { status, code })
            } else {
              capture('apple_token_exchanged')
            }
          } catch (e) {
            capture('apple_token_exchange_failed', { error: e?.message })
            logger.warn('apple-token-exchange threw', e)
          }
        }

        return { success: true }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: buildWebRedirectUrl(returnPath) },
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
          emailRedirectTo: buildWebRedirectUrl(redirectUrl),
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
   * Native-only: clear the Capgo social-login session for any providers that
   * may have been used. Called from AuthContext.signOut before the Supabase
   * sign-out so the next native sign-in doesn't silently reuse a cached
   * provider identity. No-op on web (Capacitor.isNativePlatform() returns false).
   *
   * Best-effort: logs but never throws. Sign-out must not fail because the
   * plugin couldn't log out a provider we may not even have used.
   */
  async signOutNative() {
    if (!Capacitor.isNativePlatform()) return
    try {
      const { logoutNative } = await import('../lib/nativeAuth')
      // Clear both providers — cheap and avoids branching on which one we used.
      await Promise.all([logoutNative('google'), logoutNative('apple')])
    } catch (err) {
      logger.warn('signOutNative failed', err)
    }
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
