import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { clearRateLimit } from '../lib/rateLimiter'
import { authApi } from '../api'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      signInWithIdToken: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function() { return this }),
        single: vi.fn(),
      })),
    })),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

// Mock analytics so we can assert on capture() calls for Flow K
vi.mock('../lib/analytics', () => ({
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}))

// Mock logger so transient-failure warnings don't spam test output
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Capacitor — default to web (isNativePlatform returns false)
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

// Mock nativeAuth bridge
vi.mock('../lib/nativeAuth', () => ({
  signInWithGoogleNative: vi.fn(),
  signInWithAppleNative: vi.fn(),
  logoutNative: vi.fn(),
}))

import { supabase } from '../lib/supabase'
import { capture } from '../lib/analytics'
import { Capacitor } from '@capacitor/core'
import { signInWithGoogleNative, signInWithAppleNative, logoutNative } from '../lib/nativeAuth'

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRateLimit('auth')
    // Default to web platform for existing tests
    Capacitor.isNativePlatform.mockReturnValue(false)
    logoutNative.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('signInWithGoogle', () => {
    it('should call signInWithOAuth with correct params', async () => {
      supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })

      await authApi.signInWithGoogle()

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
    })

    it('should use same-origin redirect URL if provided', async () => {
      supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })

      await authApi.signInWithGoogle(`${window.location.origin}/callback`)

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/callback`,
        },
      })
    })

    it('should block external redirect URLs', async () => {
      supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })

      await authApi.signInWithGoogle('https://evil-site.com')

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: window.location.origin, // Falls back to origin
        },
      })
    })

    it('should throw error if OAuth fails', async () => {
      const error = new Error('OAuth error')
      supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error })

      await expect(authApi.signInWithGoogle()).rejects.toThrow('OAuth error')
    })
  })

  describe('signInWithMagicLink', () => {
    it('should call signInWithOtp with correct params', async () => {
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: null })

      await authApi.signInWithMagicLink('user@example.com')

      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
    })

    it('should use same-origin redirect URL if provided', async () => {
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: null })

      // Only same-origin URLs are allowed (security: prevents open redirect)
      await authApi.signInWithMagicLink('user@example.com', `${window.location.origin}/callback`)

      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: {
          emailRedirectTo: `${window.location.origin}/callback`,
        },
      })
    })

    it('should block external redirect URLs', async () => {
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: null })

      // External URLs should be blocked and fall back to origin
      await authApi.signInWithMagicLink('user@example.com', 'https://evil-site.com')

      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'user@example.com',
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
    })

    it('should throw error if OTP fails', async () => {
      const error = new Error('OTP error')
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error })

      await expect(authApi.signInWithMagicLink('user@example.com')).rejects.toThrow('OTP error')
    })
  })

  describe('getUserVoteForDish', () => {
    it('should return null if no user ID', async () => {
      const result = await authApi.getUserVoteForDish('dish-1', null)
      expect(result).toBeNull()
    })

    it('should fetch user vote successfully', async () => {
      const mockVote = { rating_10: 8, review_text: null, review_created_at: null }
      const selectFn = vi.fn((fields) => {
        // Ensure binary vote field is not projected any more.
        expect(fields).not.toMatch(/would_order_again/)
        return {
          eq: vi.fn(function() { return this }),
          maybeSingle: vi.fn().mockResolvedValueOnce({ data: mockVote, error: null }),
        }
      })

      supabase.from.mockReturnValueOnce({ select: selectFn })

      const result = await authApi.getUserVoteForDish('dish-1', 'user-1')

      expect(result).toEqual(mockVote)
    })

    it('should return null if vote not found', async () => {
      const selectFn = vi.fn(() => ({
        eq: vi.fn(function() { return this }),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
      }))

      supabase.from.mockReturnValueOnce({ select: selectFn })

      const result = await authApi.getUserVoteForDish('dish-1', 'user-1')

      expect(result).toBeNull()
    })
  })

  describe('persistAppleRefreshToken (Flow K)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns ok on 200 + fires PostHog apple_token_persisted', async () => {
      supabase.functions.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null })

      const r = await authApi.persistAppleRefreshToken('rt.abc')

      expect(r).toEqual({ ok: true })
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
      expect(supabase.functions.invoke).toHaveBeenCalledWith('apple-token-persist', {
        method: 'POST',
        body: { provider_refresh_token: 'rt.abc' },
      })
      expect(capture).toHaveBeenCalledWith('apple_token_persisted')
    })

    it('retries once on transient 503, then succeeds', async () => {
      supabase.functions.invoke
        .mockResolvedValueOnce({ data: null, error: { status: 503 } })
        .mockResolvedValueOnce({ data: { ok: true }, error: null })

      const promise = authApi.persistAppleRefreshToken('rt.abc')
      await vi.advanceTimersByTimeAsync(1000)
      const r = await promise

      expect(r).toEqual({ ok: true })
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
    })

    it('does NOT retry on 409 NO_APPLE_IDENTITY', async () => {
      supabase.functions.invoke.mockResolvedValueOnce({
        data: { ok: false, code: 'NO_APPLE_IDENTITY' },
        error: { status: 409 },
      })

      const r = await authApi.persistAppleRefreshToken('rt.abc')

      expect(r.ok).toBe(false)
      expect(r.code).toBe('NO_APPLE_IDENTITY')
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
    })

    it('fires PostHog failure event after two transient 503s', async () => {
      supabase.functions.invoke
        .mockResolvedValueOnce({ data: null, error: { status: 503 } })
        .mockResolvedValueOnce({ data: null, error: { status: 503 } })

      const promise = authApi.persistAppleRefreshToken('rt.abc')
      await vi.advanceTimersByTimeAsync(1000)
      const r = await promise

      expect(r.ok).toBe(false)
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
      expect(capture).toHaveBeenCalledWith(
        'apple_token_persist_failed',
        expect.objectContaining({ status: 503 })
      )
    })

    it('no-ops on missing token', async () => {
      const r = await authApi.persistAppleRefreshToken(null)

      expect(r.ok).toBe(false)
      expect(supabase.functions.invoke).not.toHaveBeenCalled()
    })

    it('does NOT retry on body-only failure without transient marker', async () => {
      // Regression guard for the "default status to 500 → retry" bug caught
      // in Codex review: a structured failure body like NO_APPLE_IDENTITY
      // without transient:true must NOT be retried, even when error.status is
      // missing (which is the case for supabase.functions.invoke body-only
      // failures in some SDK versions).
      supabase.functions.invoke.mockResolvedValueOnce({
        data: { ok: false, code: 'NO_APPLE_IDENTITY' },
        error: null,
      })

      const r = await authApi.persistAppleRefreshToken('rt.abc')

      expect(r.ok).toBe(false)
      expect(r.code).toBe('NO_APPLE_IDENTITY')
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
    })

    it('retries on body-marked transient failure', async () => {
      // Inverse of the above — when the Edge Function returns
      // { ok: false, transient: true } (e.g., VAULT_UNAVAILABLE), we DO retry.
      supabase.functions.invoke
        .mockResolvedValueOnce({
          data: { ok: false, code: 'VAULT_UNAVAILABLE', transient: true },
          error: null,
        })
        .mockResolvedValueOnce({ data: { ok: true }, error: null })

      const promise = authApi.persistAppleRefreshToken('rt.abc')
      await vi.advanceTimersByTimeAsync(1000)
      const r = await promise

      expect(r.ok).toBe(true)
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(2)
    })
  })
})

// ─── B2.5 native branch tests ─────────────────────────────────────────────────

describe('authApi.signInWithGoogle on native (B2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRateLimit('auth')
    logoutNative.mockResolvedValue(undefined)
  })

  it('calls signInWithIdToken with plugin tokens', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    signInWithGoogleNative.mockResolvedValueOnce({ idToken: 'g-id', accessToken: 'g-access' })
    supabase.auth.signInWithIdToken.mockResolvedValueOnce({ error: null })

    const r = await authApi.signInWithGoogle()

    expect(r).toEqual({ success: true })
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'g-id',
      access_token: 'g-access',
    })
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('returns cancelled shape on user cancel (no throw)', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    signInWithGoogleNative.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { code: 'AUTH_USER_CANCELLED' }),
    )

    const r = await authApi.signInWithGoogle()

    expect(r).toEqual({ success: false, cancelled: true, code: 'AUTH_USER_CANCELLED' })
  })
})

describe('authApi.signInWithGoogle on web (B2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRateLimit('auth')
  })

  it('falls back to signInWithOAuth on web', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)
    supabase.auth.signInWithOAuth.mockResolvedValueOnce({ error: null })

    await authApi.signInWithGoogle()

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalled()
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled()
  })
})

describe('authApi.signInWithApple on native (B2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRateLimit('auth')
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  })

  it('calls signInWithIdToken with identityToken and rawNonce', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    signInWithAppleNative.mockResolvedValueOnce({
      identityToken: 'a-id',
      authorizationCode: 'a-code',
      appleSub: '000.abc',
      givenName: null,
      familyName: null,
      rawNonce: 'a'.repeat(64),
    })
    supabase.auth.signInWithIdToken.mockResolvedValueOnce({ error: null })

    const r = await authApi.signInWithApple()

    expect(r).toEqual({ success: true })
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'a-id',
      nonce: 'a'.repeat(64),
    })
  })

  it('returns cancelled shape on user cancel (no throw)', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)
    signInWithAppleNative.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { code: 'AUTH_USER_CANCELLED' }),
    )

    const r = await authApi.signInWithApple()

    expect(r).toEqual({ success: false, cancelled: true, code: 'AUTH_USER_CANCELLED' })
  })
})

describe('authApi.signOutNative (B2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logoutNative.mockResolvedValue(undefined)
  })

  it('no-ops on web', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)

    await authApi.signOutNative()

    expect(logoutNative).not.toHaveBeenCalled()
  })

  it('logs out both providers on native', async () => {
    Capacitor.isNativePlatform.mockReturnValue(true)

    await authApi.signOutNative()

    expect(logoutNative).toHaveBeenCalledWith('google')
    expect(logoutNative).toHaveBeenCalledWith('apple')
  })
})
