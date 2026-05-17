import { logger } from '../utils/logger'

/**
 * Cached localStorage / sessionStorage wrapper.
 *
 * Two responsibilities:
 *   1. In-memory cache so repeated reads avoid synchronous storage I/O.
 *   2. Graceful degradation when storage is unavailable (private browsing,
 *      Safari quota, sandboxed iframes). On the FIRST failure we log once
 *      and stay silent for the rest of the session — otherwise a single
 *      root cause would flood Sentry with thousands of duplicate events
 *      from the same interaction loop. We DO keep trying the underlying
 *      storage on each call so that a transient quota error doesn't lock
 *      reads permanently for the session; only the logging is deduped.
 *
 * The cache is updated even when persistence fails, so the current session
 * still behaves correctly. The data just won't survive a tab reload —
 * which is the expected private-browsing experience.
 */

const cache = new Map()
const sessionCache = new Map()

// Once-per-session log dedupe. Flip true on first failure; subsequent
// failures are still attempted but no longer logged.
let _localStorageWarned = false
let _sessionStorageWarned = false

function _warnLocalStorageOnce(err, op) {
  if (_localStorageWarned) return
  _localStorageWarned = true
  logger.warn(
    `localStorage unavailable (${op}). In-memory cache only for this session — data won't survive reload.`,
    err
  )
}

function _warnSessionStorageOnce(err, op) {
  if (_sessionStorageWarned) return
  _sessionStorageWarned = true
  logger.warn(
    `sessionStorage unavailable (${op}). In-tab state will not survive navigation.`,
    err
  )
}

/**
 * Get item from localStorage with in-memory caching
 * @param {string} key - Storage key
 * @returns {string|null} - Stored value or null
 */
export function getStorageItem(key) {
  if (cache.has(key)) {
    return cache.get(key)
  }
  try {
    const value = localStorage.getItem(key)
    cache.set(key, value)
    return value
  } catch (err) {
    _warnLocalStorageOnce(err, 'get')
    return null
  }
}

/**
 * Set item in localStorage and update cache. The cache is updated even on
 * persistence failure so the current session sees consistent state.
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
export function setStorageItem(key, value) {
  cache.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    _warnLocalStorageOnce(err, 'set')
  }
}

/**
 * Remove item from localStorage and cache
 * @param {string} key - Storage key
 */
export function removeStorageItem(key) {
  cache.delete(key)
  try {
    localStorage.removeItem(key)
  } catch (err) {
    _warnLocalStorageOnce(err, 'remove')
  }
}

/**
 * Get item from sessionStorage with in-memory caching
 * @param {string} key - Storage key
 * @returns {string|null} - Stored value or null
 */
export function getSessionItem(key) {
  if (sessionCache.has(key)) {
    return sessionCache.get(key)
  }
  try {
    const value = sessionStorage.getItem(key)
    sessionCache.set(key, value)
    return value
  } catch (err) {
    _warnSessionStorageOnce(err, 'get')
    return null
  }
}

/**
 * Set item in sessionStorage and update cache
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
export function setSessionItem(key, value) {
  sessionCache.set(key, value)
  try {
    sessionStorage.setItem(key, value)
  } catch (err) {
    _warnSessionStorageOnce(err, 'set')
  }
}

/**
 * Remove item from sessionStorage and cache
 * @param {string} key - Storage key
 */
export function removeSessionItem(key) {
  sessionCache.delete(key)
  try {
    sessionStorage.removeItem(key)
  } catch (err) {
    _warnSessionStorageOnce(err, 'remove')
  }
}

/**
 * Clear the entire in-memory cache (call on logout to prevent data leaking between users)
 */
export function clearCache() {
  cache.clear()
  sessionCache.clear()
}

/**
 * Clear specific keys from cache (useful for testing)
 * @param {string[]} keys - Keys to clear from cache
 */
export function clearCacheKeys(keys) {
  keys.forEach((key) => {
    cache.delete(key)
    sessionCache.delete(key)
  })
}

// Storage key constants
export const STORAGE_KEYS = {
  SOUND_MUTED: 'soundMuted',
  RADIUS: 'wgh_radius',
  LOCATION_PERMISSION: 'whats-good-here-location-permission',
  EMAIL_CACHE: 'whats-good-here-email',
  MAP_SELECTED_RESTAURANT: 'wgh_map_selected_restaurant', // sessionStorage — survives in-tab nav, cleared on tab close
  HAS_SEEN_PHOTO_NUDGE: 'wgh_has_seen_photo_nudge',
}

// Pending vote storage helpers (survives OAuth redirect)
const PENDING_VOTE_KEY = 'whats_good_here_pending_vote'
const PENDING_VOTE_TTL_MS = 5 * 60 * 1000

/**
 * Get pending vote from storage if recent (within 5 minutes).
 * Routes through the wrappers above so storage failures use the same
 * dedupe-once logging path.
 */
export function getPendingVoteFromStorage() {
  const stored = getStorageItem(PENDING_VOTE_KEY)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored)
    if (Date.now() - parsed.timestamp < PENDING_VOTE_TTL_MS) {
      return parsed
    }
    removeStorageItem(PENDING_VOTE_KEY)
    return null
  } catch (error) {
    // Corrupt value (manual tamper, partial write, schema drift). Clear it
    // so we don't keep failing to parse the same garbage every read.
    logger.warn('Pending vote storage value malformed; clearing.', error)
    removeStorageItem(PENDING_VOTE_KEY)
    return null
  }
}

/**
 * Save pending vote to storage
 */
export function setPendingVoteToStorage(dishId, vote) {
  setStorageItem(PENDING_VOTE_KEY, JSON.stringify({
    dishId,
    vote,
    timestamp: Date.now(),
  }))
}

/**
 * Clear pending vote from storage
 */
export function clearPendingVoteStorage() {
  removeStorageItem(PENDING_VOTE_KEY)
}
