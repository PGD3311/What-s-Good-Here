// Canonical "Food Story" stat helpers — the single source of truth for the
// rating-style label and the standout-picks (Best Find / Hottest Take) shown on
// both the owner Profile (via useUserVotes) and the public UserProfile page.
//
// These two pages historically each carried their own copy of this logic and
// drifted (e.g. one returned an emoji, the other didn't). Keep all rating-style
// thresholds, labels, and the standout-pick rules HERE so the two pages cannot
// diverge again. Each page adapts its own vote shape into the normalized inputs
// below; the math lives only in this file.

export const RATING_STYLE_LABELS = {
  tough: 'Tough Critic',
  fair: 'Fair Judge',
  generous: 'Generous Rater',
  easy: 'Easy to Please',
}

// Standout-pick rules.
export const MIN_COMMUNITY_VOTES_FOR_STANDOUT = 3   // community baseline needed for a Hottest Take
export const HOTTEST_TAKE_DIFF_THRESHOLD = -1.0      // you must be ≥1.0 below the crowd to qualify

/**
 * Rating style from a user's average rating + variance.
 * @param {number|null} avgRating
 * @param {number} ratingVariance — std-dev of ratings
 * @returns {{ level: string, consistency: string, label: string, emoji: string } | null}
 */
export function computeRatingStyle(avgRating, ratingVariance) {
  if (avgRating === null) return null

  // Level based on average rating
  let level, emoji
  if (avgRating < 6.0) {
    level = 'tough'
    emoji = '🧐' // monocle face
  } else if (avgRating < 7.5) {
    level = 'fair'
    emoji = '⚖️' // balance scale
  } else if (avgRating < 8.5) {
    level = 'generous'
    emoji = '😊' // smiling face
  } else {
    level = 'easy'
    emoji = '🥰' // smiling face with hearts
  }

  // Consistency based on variance
  const consistency = ratingVariance < 1.5 ? 'consistent' : 'varied'

  return { level, consistency, label: RATING_STYLE_LABELS[level], emoji }
}

/**
 * Standout picks from a user's rated dishes vs community averages.
 *
 * @param {Array<{ dish_id: string, userRating: number, [k:string]: any }>} ratedItems
 *   Normalized, already-rated items. Whatever extra fields each caller includes
 *   (dish_name, restaurant_name, category, …) are passed through onto the picks.
 * @param {Object<string, { avg: number, count: number }>} communityAvgs — keyed by dish_id
 * @returns {{ bestFind?: object, harshestTake?: object }}
 *
 * - bestFind: the user's highest-rated dish (no community gate — "my favorite").
 * - harshestTake: the dish where the user is furthest below the crowd, but only
 *   if that gap is at least HOTTEST_TAKE_DIFF_THRESHOLD and the dish has a
 *   community baseline of MIN_COMMUNITY_VOTES_FOR_STANDOUT votes.
 */
export function computeStandoutPicks(ratedItems, communityAvgs) {
  const picks = {}

  if (ratedItems.length > 0) {
    const best = ratedItems.slice().sort((a, b) => b.userRating - a.userRating)
    picks.bestFind = best[0]
  }

  const comparisons = []
  for (const item of ratedItems) {
    const community = communityAvgs?.[item.dish_id]
    if (!community || community.count < MIN_COMMUNITY_VOTES_FOR_STANDOUT) continue
    comparisons.push({
      ...item,
      communityAvg: community.avg,
      diff: item.userRating - community.avg,
    })
  }

  if (comparisons.length > 0) {
    const harsh = comparisons.slice().sort((a, b) => a.diff - b.diff)
    if (harsh[0].diff <= HOTTEST_TAKE_DIFF_THRESHOLD) picks.harshestTake = harsh[0]
  }

  return picks
}
