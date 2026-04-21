import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { clearRateLimit } from '../lib/rateLimiter'
import { authApi } from '../api'

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
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

import { supabase } from '../lib/supabase'
import { capture } from '../lib/analytics'

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRateLimit('auth')
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
