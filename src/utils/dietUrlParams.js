import { ALLOWED_DIETARY_TAGS } from '../constants/dietaryTags'

const ALLOWED = new Set(ALLOWED_DIETARY_TAGS)

/**
 * Parse a ?diet=... URL search-param value into a sanitized array of
 * dietary tags. Drops anything not in ALLOWED_DIETARY_TAGS, dedupes,
 * preserves first-seen order, trims surrounding whitespace.
 *
 * Strict case: input is not lowercased before allowlist check. Mixed-case
 * tokens (e.g. `Vegan`, `GLUTEN_FREE`) are dropped individually — valid
 * lowercase tokens in the same param are still returned. That prevents
 * URL aliasing where multiple cases map to the same canonical filter
 * while still degrading gracefully when tampered URLs include both
 * valid and invalid tokens.
 *
 * @param {unknown} raw - The raw search-param value (typeof string expected)
 * @returns {string[]} Sanitized list of allowed tag ids
 */
export function parseDietParam(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (trimmed && ALLOWED.has(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed)
      out.push(trimmed)
    }
  }
  return out
}

/**
 * Serialize an array of dietary tags to the ?diet= URL search-param
 * value. Empty array → empty string (caller should omit the param).
 * Invalid tags are dropped silently, duplicates are collapsed, and
 * first-seen order of valid tags is preserved — guarantees a true
 * round-trip with parseDietParam.
 *
 * @param {unknown} tags - Expected string[] of tag ids
 * @returns {string} Canonical comma-joined value, or '' when empty
 */
export function serializeDietParam(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return ''
  const seen = new Set()
  const out = []
  for (const t of tags) {
    if (typeof t === 'string' && ALLOWED.has(t) && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out.join(',')
}
