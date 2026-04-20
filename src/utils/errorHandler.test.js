import { describe, it, expect } from 'vitest'
import {
  classifyError,
  getUserMessage,
  isRetryable,
  withRetry,
  ErrorTypes,
} from '../utils/errorHandler'

describe('Error Handler Utilities', () => {
  describe('classifyError', () => {
    it('should classify network errors', () => {
      expect(classifyError({ message: 'Network error' })).toBe(ErrorTypes.NETWORK_ERROR)
      expect(classifyError({ message: 'Failed to fetch' })).toBe(ErrorTypes.NETWORK_ERROR)
    })

    it('should classify timeout errors', () => {
      expect(classifyError({ message: 'Request timeout' })).toBe(ErrorTypes.TIMEOUT)
      expect(classifyError({ message: 'timed out' })).toBe(ErrorTypes.TIMEOUT)
    })

    it('should classify auth errors', () => {
      expect(classifyError({ status: 401 })).toBe(ErrorTypes.AUTH_ERROR)
      expect(classifyError({ message: 'Not authenticated' })).toBe(ErrorTypes.AUTH_ERROR)
    })

    it('should classify permission errors', () => {
      expect(classifyError({ status: 403 })).toBe(ErrorTypes.UNAUTHORIZED)
      expect(classifyError({ message: 'Forbidden' })).toBe(ErrorTypes.UNAUTHORIZED)
    })

    it('should classify not found errors', () => {
      expect(classifyError({ status: 404 })).toBe(ErrorTypes.NOT_FOUND)
      expect(classifyError({ message: 'not found' })).toBe(ErrorTypes.NOT_FOUND)
    })

    it('should classify conflict errors', () => {
      expect(classifyError({ status: 409 })).toBe(ErrorTypes.CONFLICT)
      expect(classifyError({ message: 'already exists' })).toBe(ErrorTypes.CONFLICT)
    })

    it('should classify validation errors', () => {
      expect(classifyError({ status: 400 })).toBe(ErrorTypes.VALIDATION_ERROR)
      expect(classifyError({ message: 'Invalid input' })).toBe(ErrorTypes.VALIDATION_ERROR)
    })

    it('should classify rate limit errors', () => {
      expect(classifyError({ status: 429 })).toBe(ErrorTypes.RATE_LIMIT)
      expect(classifyError({ message: 'too many requests' })).toBe(ErrorTypes.RATE_LIMIT)
    })

    it('should classify server errors', () => {
      expect(classifyError({ status: 500 })).toBe(ErrorTypes.SERVER_ERROR)
      expect(classifyError({ status: 503 })).toBe(ErrorTypes.SERVER_ERROR)
    })

    it('should return unknown for unclassified errors', () => {
      expect(classifyError({})).toBe(ErrorTypes.UNKNOWN)
      expect(classifyError(null)).toBe(ErrorTypes.UNKNOWN)
    })

    it('should honor pre-set .type (createClassifiedError wrapper)', () => {
      const wrapped = new Error('Edge Function returned a non-2xx status code')
      wrapped.type = ErrorTypes.RATE_LIMIT
      expect(classifyError(wrapped)).toBe(ErrorTypes.RATE_LIMIT)
    })

    it('should classify Supabase FunctionsHttpError via context.status', () => {
      // Supabase stashes HTTP status on error.context.status, not error.status
      expect(classifyError({ context: { status: 429 } })).toBe(ErrorTypes.RATE_LIMIT)
      expect(classifyError({ context: { status: 401 } })).toBe(ErrorTypes.AUTH_ERROR)
      expect(classifyError({ context: { status: 500 } })).toBe(ErrorTypes.SERVER_ERROR)
    })
  })

  describe('getUserMessage', () => {
    it('should return network error message', () => {
      const msg = getUserMessage({ message: 'Network error' })
      expect(msg).toContain('internet connection')
    })

    it('should return timeout message', () => {
      const msg = getUserMessage({ message: 'timeout' })
      expect(msg).toContain('timed out')
    })

    it('should return auth error message', () => {
      const msg = getUserMessage({ status: 401 })
      expect(msg).toContain('not logged in')
    })

    it('should include context in message', () => {
      const msg = getUserMessage({ message: 'Network error' }, 'voting')
      expect(msg).toContain('while voting')
    })

    it('should handle missing context gracefully', () => {
      const msg = getUserMessage({ message: 'Unknown error' })
      expect(msg).toBeTruthy()
    })
  })

  describe('isRetryable', () => {
    it('should mark network errors as retryable', () => {
      expect(isRetryable({ message: 'Network error' })).toBe(true)
    })

    it('should mark timeout errors as retryable', () => {
      expect(isRetryable({ message: 'timeout' })).toBe(true)
    })

    it('should mark rate limit errors as retryable', () => {
      expect(isRetryable({ status: 429 })).toBe(true)
    })

    it('should mark server errors as retryable', () => {
      expect(isRetryable({ status: 500 })).toBe(true)
    })

    it('should not mark auth errors as retryable', () => {
      expect(isRetryable({ status: 401 })).toBe(false)
    })

    it('should not mark validation errors as retryable', () => {
      expect(isRetryable({ status: 400 })).toBe(false)
    })

    it('should not mark unknown errors as retryable', () => {
      expect(isRetryable({})).toBe(false)
    })
  })

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValueOnce('success')
      const result = await withRetry(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on retryable errors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ message: 'Network error' })
        .mockRejectedValueOnce({ message: 'Network error' })
        .mockResolvedValueOnce('success')

      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValueOnce({ status: 401 })

      await expect(withRetry(fn)).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn()
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ message: 'Network error' })
        .mockResolvedValueOnce('success')

      await withRetry(fn, { maxAttempts: 2, initialDelay: 10, onRetry })

      expect(onRetry).toHaveBeenCalled()
      const args = onRetry.mock.calls[0]
      expect(args[0]).toBe(1) // attempt number
      expect(args[1]).toBeGreaterThan(0) // delay
    })

    it('should throw after maxAttempts', async () => {
      const fn = vi.fn().mockRejectedValue({ message: 'Network error' })

      await expect(withRetry(fn, { maxAttempts: 2, initialDelay: 10 })).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})

// Add vitest import for vi.fn() mocking in test
import { vi } from 'vitest'
