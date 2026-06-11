import { MIN_VOTES_FOR_RANKING } from '../constants/app'
import { getRatingColor, formatScore10 } from './ranking'

/**
 * Map a dish's rating data to a Menu X-Ray verdict tier.
 * Tiers: 'rated' (>= MIN_VOTES_FOR_RANKING votes, app-standard color),
 *        'early' (1..threshold-1 votes, muted), 'new' (no usable signal).
 * Colors intentionally reuse getRatingColor — one color language app-wide.
 * No worded labels; the only worded chip is the "new" tier's CTA.
 * @param {number|null} avgRating - 1-10 scale average, null when unrated
 * @param {number} totalVotes - raw vote count
 * @returns {{ tier: 'rated'|'early'|'new', score: string|null, votes: number, color: string }}
 */
export function getVerdict(avgRating, totalVotes) {
  const votes = Number(totalVotes) || 0
  const rating = Number(avgRating)
  // Ratings live on a 1-10 scale; anything non-finite or out of range is "no signal".
  if (votes <= 0 || !Number.isFinite(rating) || rating <= 0) {
    return { tier: 'new', score: null, votes: Math.max(0, votes), color: 'var(--color-accent-gold)' }
  }
  if (votes < MIN_VOTES_FOR_RANKING) {
    return { tier: 'early', score: formatScore10(avgRating), votes, color: 'var(--color-text-tertiary)' }
  }
  return { tier: 'rated', score: formatScore10(avgRating), votes, color: getRatingColor(avgRating) }
}
