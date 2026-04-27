import { logger } from '../utils/logger'

/**
 * Cached localStorage wrapper
 * Avoids repeated synchronous reads from localStorage
 */

const cache = new Map()
const sessionCache = new Map()

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
  } catch {
    return null
  }
}

/**
 * Set item in localStorage and update cache
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value)
    cache.set(key, value)
  } catch {
    // localStorage may be unavailable in private browsing
  }
}

/**
 * Remove item from localStorage and cache
 * @param {string} key - Storage key
 */
export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key)
    cache.delete(key)
  } catch {
    // localStorage may be unavailable
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
  } catch {
    return null
  }
}

/**
 * Set item in sessionStorage and update cache
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
export function setSessionItem(key, value) {
  try {
    sessionStorage.setItem(key, value)
    sessionCache.set(key, value)
  } catch {
    // sessionStorage may be unavailable in private browsing
  }
}

/**
 * Remove item from sessionStorage and cache
 * @param {string} key - Storage key
 */
export function removeSessionItem(key) {
  try {
    sessionStorage.removeItem(key)
    sessionCache.delete(key)
  } catch {
    // sessionStorage may be unavailable in private browsing
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
}

// Pending vote storage helpers (survives OAuth redirect)
const PENDING_VOTE_KEY = 'whats_good_here_pending_vote'

/**
 * Get pending vote from storage if recent (within 5 minutes)
 */
export function getPendingVoteFromStorage() {
  try {
    const stored = localStorage.getItem(PENDING_VOTE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Check if it's recent (within 5 minutes) to avoid stale data
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return parsed
      }
      localStorage.removeItem(PENDING_VOTE_KEY)
    }
  } catch (error) {
    logger.warn('Unable to read pending vote from storage', error)
  }
  return null
}

/**
 * Save pending vote to storage
 */
export function setPendingVoteToStorage(dishId, vote) {
  try {
    localStorage.setItem(PENDING_VOTE_KEY, JSON.stringify({
      dishId,
      vote,
      timestamp: Date.now()
    }))
  } catch (error) {
    logger.warn('Unable to persist pending vote to storage', error)
  }
}

/**
 * Clear pending vote from storage
 */
export function clearPendingVoteStorage() {
  try {
    localStorage.removeItem(PENDING_VOTE_KEY)
  } catch (error) {
    logger.warn('Unable to clear pending vote from storage', error)
  }
}
