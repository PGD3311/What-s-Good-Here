import { describe, it, expect } from 'vitest'
import {
  computeRatingStyle,
  computeStandoutPicks,
  RATING_STYLE_LABELS,
  MIN_COMMUNITY_VOTES_FOR_STANDOUT,
  HOTTEST_TAKE_DIFF_THRESHOLD,
} from './foodStats'

describe('computeRatingStyle', () => {
  it('returns null when avgRating is null', () => {
    expect(computeRatingStyle(null, 0)).toBe(null)
  })

  it('maps each average-rating band to the right level + label', () => {
    expect(computeRatingStyle(5.9, 0)).toMatchObject({ level: 'tough', label: 'Tough Critic' })
    expect(computeRatingStyle(7.4, 0)).toMatchObject({ level: 'fair', label: 'Fair Judge' })
    expect(computeRatingStyle(8.4, 0)).toMatchObject({ level: 'generous', label: 'Generous Rater' })
    expect(computeRatingStyle(9.0, 0)).toMatchObject({ level: 'easy', label: 'Easy to Please' })
  })

  it('uses the exact band boundaries (<6.0, <7.5, <8.5)', () => {
    expect(computeRatingStyle(6.0, 0).level).toBe('fair')     // 6.0 is NOT tough
    expect(computeRatingStyle(7.5, 0).level).toBe('generous') // 7.5 is NOT fair
    expect(computeRatingStyle(8.5, 0).level).toBe('easy')     // 8.5 is NOT generous
  })

  it('preserves the exact emoji per level (locks the literal == the old \\uXXXX escapes)', () => {
    expect(computeRatingStyle(5.0, 0).emoji).toBe('🧐') // monocle
    expect(computeRatingStyle(7.0, 0).emoji).toBe('⚖️') // balance scale
    expect(computeRatingStyle(8.0, 0).emoji).toBe('😊') // smiling face
    expect(computeRatingStyle(9.0, 0).emoji).toBe('🥰') // smiling face w/ hearts
  })

  it('derives consistency from variance with a 1.5 boundary (<1.5 consistent)', () => {
    expect(computeRatingStyle(7.0, 1.49).consistency).toBe('consistent')
    expect(computeRatingStyle(7.0, 1.5).consistency).toBe('varied') // 1.5 is NOT < 1.5
    expect(computeRatingStyle(7.0, 2.0).consistency).toBe('varied')
  })

  it('labels map matches the public constant', () => {
    expect(RATING_STYLE_LABELS).toEqual({
      tough: 'Tough Critic', fair: 'Fair Judge', generous: 'Generous Rater', easy: 'Easy to Please',
    })
  })
})

describe('computeStandoutPicks', () => {
  const item = (dish_id, userRating, extra = {}) => ({ dish_id, dish_name: `dish-${dish_id}`, userRating, ...extra })

  it('returns {} for no rated items', () => {
    expect(computeStandoutPicks([], {})).toEqual({})
  })

  it('bestFind is the highest-rated dish, with no community gate', () => {
    const items = [item('a', 7), item('b', 9), item('c', 8)]
    const picks = computeStandoutPicks(items, {}) // no community data at all
    expect(picks.bestFind.dish_id).toBe('b')
    expect(picks.harshestTake).toBeUndefined()
  })

  it('passes the caller item fields through onto bestFind', () => {
    const picks = computeStandoutPicks([item('a', 9, { restaurant_name: 'Nancy\'s', category: 'lobster' })], {})
    expect(picks.bestFind).toMatchObject({ dish_id: 'a', dish_name: 'dish-a', userRating: 9, restaurant_name: 'Nancy\'s', category: 'lobster' })
  })

  it('harshestTake requires the community baseline (MIN_COMMUNITY_VOTES_FOR_STANDOUT) and a diff <= threshold', () => {
    const items = [item('a', 4), item('b', 9)]
    const community = {
      a: { avg: 8, count: MIN_COMMUNITY_VOTES_FOR_STANDOUT }, // diff -4 → qualifies
      b: { avg: 8, count: MIN_COMMUNITY_VOTES_FOR_STANDOUT }, // diff +1 → no
    }
    const picks = computeStandoutPicks(items, community)
    expect(picks.harshestTake.dish_id).toBe('a')
    expect(picks.harshestTake.communityAvg).toBe(8)
    expect(picks.harshestTake.diff).toBe(-4)
  })

  it('excludes dishes below the community vote threshold from harshestTake', () => {
    const items = [item('a', 4)]
    const community = { a: { avg: 8, count: MIN_COMMUNITY_VOTES_FOR_STANDOUT - 1 } } // only 2 votes
    const picks = computeStandoutPicks(items, community)
    expect(picks.harshestTake).toBeUndefined()
    expect(picks.bestFind.dish_id).toBe('a') // bestFind still set (no gate)
  })

  it('respects the exact diff threshold boundary (<= -1.0 qualifies, -0.9 does not)', () => {
    const community = { a: { avg: 8, count: 5 } }
    expect(computeStandoutPicks([item('a', 7.0)], community).harshestTake?.dish_id).toBe('a')   // diff -1.0
    expect(computeStandoutPicks([item('a', 7.1)], community).harshestTake).toBeUndefined()       // diff -0.9
    expect(HOTTEST_TAKE_DIFF_THRESHOLD).toBe(-1.0)
  })

  it('picks the single most-negative diff as harshestTake', () => {
    const items = [item('a', 6), item('b', 3), item('c', 7)]
    const community = { a: { avg: 8, count: 5 }, b: { avg: 8, count: 5 }, c: { avg: 8, count: 5 } }
    expect(computeStandoutPicks(items, community).harshestTake.dish_id).toBe('b') // diff -5
  })
})
