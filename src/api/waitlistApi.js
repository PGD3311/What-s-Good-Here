import { supabase } from '../lib/supabase'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WAITLIST_EMAIL_UNIQUE = 'waitlist_email_unique'

/**
 * Validation errors thrown from join() that the UI should surface verbatim
 * (vs. routing through generic getUserMessage()). Detect by `error.kind`.
 */
class WaitlistValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WaitlistValidationError'
    this.kind = 'validation'
  }
}

export const waitlistApi = {
  WaitlistValidationError,

  /**
   * Join the pre-launch waitlist.
   * @param {Object} params
   * @param {string} params.email - Subscriber email address
   * @param {string} [params.source] - Optional campaign / referral source ('web', 'instagram', etc.)
   * @returns {Promise<{ success: true, email: string }>}
   */
  async join({ email, source = 'web' }) {
    if (!email?.trim()) {
      throw new WaitlistValidationError('Please enter your email address')
    }
    const normalized = email.trim().toLowerCase()

    if (!EMAIL_REGEX.test(normalized)) {
      throw new WaitlistValidationError('Please enter a valid email address')
    }

    try {
      const { error } = await supabase
        .from('waitlist')
        .insert([{ email: normalized, source }])

      // Treat "already on the list" as success without leaking enumeration.
      // Narrow the swallow to the EMAIL unique constraint specifically — a
      // future unique constraint on another column shouldn't be silently
      // hidden.
      if (error && !isAlreadyOnWaitlist(error)) {
        throw createClassifiedError(error)
      }

      return { success: true, email: normalized }
    } catch (error) {
      if (error?.kind === 'validation') throw error
      logger.error('waitlistApi.join:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}

function isAlreadyOnWaitlist(error) {
  if (error?.code !== '23505') return false
  // Postgres error includes constraint info in either `details` or
  // `message`; check both because PostgREST surfaces them inconsistently.
  const haystack = `${error.details || ''} ${error.message || ''}`
  return haystack.includes(WAITLIST_EMAIL_UNIQUE)
}
