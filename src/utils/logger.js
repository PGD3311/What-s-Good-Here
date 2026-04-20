/**
 * Centralized logger utility
 * Routes all logging through a single point for easy configuration
 * In production, errors could be sent to Sentry (already configured)
 */

const isDev = import.meta.env.DEV

// Error/Error-like objects stringify to `{}` because their properties aren't
// enumerable. Capacitor's console bridge then shows `[error] - {}` which
// hides the actual problem. Serialize defensively so native logs always
// surface .message + .stack + any classified .type.
function normalize(arg) {
  if (arg instanceof Error || (arg && typeof arg === 'object' && 'message' in arg && 'stack' in arg)) {
    return {
      message: arg.message,
      stack: arg.stack,
      name: arg.name,
      ...(arg.type ? { type: arg.type } : {}),
      ...(arg.code ? { code: arg.code } : {}),
      ...(arg.status ? { status: arg.status } : {}),
    }
  }
  return arg
}

export const logger = {
  /**
   * Log errors - always logged, sent to Sentry in production
   */
  error(message, ...args) {
    console.error(message, ...args.map(normalize))
  },

  /**
   * Log warnings - always logged
   */
  warn(message, ...args) {
    console.warn(message, ...args.map(normalize))
  },

  /**
   * Log info - only in development
   */
  info(message, ...args) {
    if (isDev) {
      console.log(message, ...args)
    }
  },

  /**
   * Log debug - only in development
   */
  debug(message, ...args) {
    if (isDev) {
      console.log(message, ...args)
    }
  },
}
