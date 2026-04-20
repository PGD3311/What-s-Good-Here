/**
 * Error Handler Utilities
 * Centralized error handling, classification, and user messaging
 */

// Sentry is lazy-loaded in main.jsx - access it dynamically to avoid bundling
function getSentry() {
  return import.meta.env.PROD ? import('@sentry/react') : Promise.resolve(null)
}

export const ErrorTypes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  AUTH_ERROR: 'AUTH_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
}

/**
 * Classify an error into a standard error type
 * @param {Error} error - The error to classify
 * @returns {string} Error type from ErrorTypes
 */
export function classifyError(error) {
  if (!error) {
    return ErrorTypes.UNKNOWN
  }

  // If already classified (e.g. by createClassifiedError), trust it —
  // otherwise getUserMessage re-classifies the wrapper and loses the type.
  if (error.type && Object.prototype.hasOwnProperty.call(ErrorTypes, error.type)) {
    return error.type
  }

  const message = (error.message || '').toLowerCase()
  // Supabase FunctionsHttpError stashes the HTTP status on error.context.status
  // rather than error.status; check both so edge-function errors classify
  // correctly (429 → RATE_LIMIT, 401 → AUTH_ERROR, 5xx → SERVER_ERROR).
  const code = error.code || error.status || error.context?.status

  // Network errors
  if (message.includes('network') || message.includes('failed to fetch')) {
    return ErrorTypes.NETWORK_ERROR
  }

  // Timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return ErrorTypes.TIMEOUT
  }

  // Auth errors
  if (code === 401 || message.includes('unauthorized') || message.includes('not authenticated')) {
    return ErrorTypes.AUTH_ERROR
  }

  if (code === 403 || message.includes('forbidden')) {
    return ErrorTypes.UNAUTHORIZED
  }

  // Not found
  if (code === 404 || message.includes('not found')) {
    return ErrorTypes.NOT_FOUND
  }

  // Conflict
  if (code === 409 || message.includes('conflict') || message.includes('already exists')) {
    return ErrorTypes.CONFLICT
  }

  // Validation
  if (code === 400 || message.includes('invalid') || message.includes('validation')) {
    return ErrorTypes.VALIDATION_ERROR
  }

  // Rate limit
  if (code === 429 || message.includes('too many')) {
    return ErrorTypes.RATE_LIMIT
  }

  // Server errors
  if (code >= 500) {
    return ErrorTypes.SERVER_ERROR
  }

  return ErrorTypes.UNKNOWN
}

/**
 * Get a user-friendly error message
 * @param {Error} error - The error
 * @param {string} context - Optional context (e.g., 'voting', 'loading dishes')
 * @returns {string} User-friendly message
 */
export function getUserMessage(error, context = '') {
  const errorType = classifyError(error)
  const contextStr = context ? ` while ${context}` : ''

  switch (errorType) {
    case ErrorTypes.NETWORK_ERROR:
      return `No internet connection${contextStr}. Check your WiFi and try again.`
    case ErrorTypes.TIMEOUT:
      return `Request timed out${contextStr}. Please try again.`
    case ErrorTypes.AUTH_ERROR:
      return `You're not logged in. Please sign in and try again.`
    case ErrorTypes.UNAUTHORIZED:
      return `You don't have permission to do that.`
    case ErrorTypes.NOT_FOUND:
      return `This item is no longer available.`
    case ErrorTypes.CONFLICT:
      return `This item already exists. Try refreshing the page.`
    case ErrorTypes.VALIDATION_ERROR:
      return `Please check your input and try again.`
    case ErrorTypes.RATE_LIMIT:
      return `Too many requests. Please wait a moment and try again.`
    case ErrorTypes.SERVER_ERROR:
      return `Server error${contextStr}. Please try again later.`
    default:
      return `Something went wrong${contextStr}. Please try again.`
  }
}

/**
 * Create an Error with a classified .type property attached
 * @param {Error} error - The original error
 * @returns {Error} New error with .type and .originalError
 */
export function createClassifiedError(error) {
  const classifiedError = new Error(error.message || 'An error occurred')
  classifiedError.type = classifyError(error)
  classifiedError.originalError = error
  return classifiedError
}

/**
 * Determine if an error is retryable
 * @param {Error} error - The error
 * @returns {boolean} Whether the error is retryable
 */
export function isRetryable(error) {
  const errorType = classifyError(error)

  const retryableErrors = [
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.TIMEOUT,
    ErrorTypes.RATE_LIMIT,
    ErrorTypes.SERVER_ERROR,
  ]

  return retryableErrors.includes(errorType)
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Max attempts (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Max delay in ms (default: 10000)
 * @param {Function} options.onRetry - Called when retrying
 * @returns {Promise} Result of function
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry = null,
  } = options

  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry non-retryable errors
      if (!isRetryable(error)) {
        getSentry().then(Sentry => {
          if (Sentry) {
            Sentry.captureException(error, {
              tags: {
                errorType: classifyError(error),
                retryable: false,
              },
            })
          }
        })
        throw error
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        getSentry().then(Sentry => {
          if (Sentry) {
            Sentry.captureException(error, {
              tags: {
                errorType: classifyError(error),
                retriesExhausted: true,
              },
              contexts: {
                retry: {
                  attempts: maxAttempts,
                },
              },
            })
          }
        })
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay
      const totalDelay = delay + jitter

      if (onRetry) {
        onRetry(attempt, totalDelay, error)
      }

      await new Promise(resolve => setTimeout(resolve, totalDelay))
    }
  }

  throw lastError
}
