/**
 * Format a score to one decimal place
 * @param {number} score - The score to format
 * @returns {string} Formatted score (e.g., "8.4", "9.0", "7.1")
 */
export function formatScore10(score) {
  if (score === null || score === undefined) return '—'
  return Number(score).toFixed(1)
}

/**
 * Get color for rating based on score
 * @param {number} rating - Rating on 1-10 scale
 * @returns {string} CSS color value
 */
export function getRatingColor(rating) {
  if (rating === null || rating === undefined) return 'var(--color-text-tertiary)'
  const score = Number(rating)
  if (score >= 8.0) return 'var(--color-green-deep)'
  if (score >= 6.0) return 'var(--color-amber)'
  return 'var(--color-red)'
}

/**
 * Get the left-border accent color used on review cards.
 * Distinct from getRatingColor — uses theme accent tokens, not badge colors.
 * @param {number} rating - Rating on 1-10 scale
 * @returns {string} CSS color value
 */
export function getRatingAccentColor(rating) {
  if (rating === null || rating === undefined) return 'var(--color-divider)'
  const score = Number(rating)
  if (score >= 8.0) return 'var(--color-success, #22c55e)'
  if (score >= 6.0) return 'var(--color-accent-gold)'
  return 'var(--color-primary)'
}

/**
 * Get confidence level based on vote count
 * @param {number} totalVotes - Total number of votes
 * @returns {'none' | 'low' | 'medium' | 'high'}
 */
export function getConfidenceLevel(totalVotes) {
  if (totalVotes === 0) return 'none'
  if (totalVotes < 10) return 'low'
  if (totalVotes < 20) return 'medium'
  return 'high'
}

/**
 * Get confidence indicator text and styling
 * @param {number} totalVotes - Total number of votes
 * @returns {Object} Confidence info object
 */
export function getConfidenceIndicator(totalVotes) {
  const level = getConfidenceLevel(totalVotes)

  const indicators = {
    none: {
      level: 'none',
      text: 'No votes yet — be the first!',
      icon: null,
      color: 'var(--color-text-tertiary)',
      style: { color: 'var(--color-text-tertiary)' },
    },
    low: {
      level: 'low',
      text: `Not enough votes yet (${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'})`,
      icon: '📊',
      color: 'var(--color-accent-gold)',
      style: { color: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)', background: 'rgba(var(--color-accent-gold-rgb), 0.1)' },
    },
    medium: {
      level: 'medium',
      text: `${totalVotes} votes`,
      icon: null,
      color: 'var(--color-text-secondary)',
      style: { color: 'var(--color-text-secondary)' },
    },
    high: {
      level: 'high',
      text: `${totalVotes} votes`,
      icon: '✓',
      color: 'var(--color-rating)',
      style: { color: 'var(--color-rating)', borderColor: 'var(--color-rating)', background: 'rgba(var(--color-rating-rgb), 0.1)' },
    },
  }

  return indicators[level]
}
