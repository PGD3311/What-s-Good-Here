import { describe, it, expect } from 'vitest'
import { getVerdict } from './verdict'
import { MIN_VOTES_FOR_RANKING } from '../constants/app'

describe('getVerdict', () => {
  it('0 votes → new tier', () => {
    expect(getVerdict(null, 0)).toMatchObject({ tier: 'new' })
  })

  it('null rating with votes → new tier (defensive)', () => {
    expect(getVerdict(null, 2)).toMatchObject({ tier: 'new' })
  })

  it('below threshold → early tier with score and votes', () => {
    const v = getVerdict(9.2, MIN_VOTES_FOR_RANKING - 1)
    expect(v.tier).toBe('early')
    expect(v.score).toBe('9.2')
    expect(v.votes).toBe(MIN_VOTES_FOR_RANKING - 1)
    expect(v.color).toBe('var(--color-text-tertiary)')
  })

  it('at threshold → rated tier', () => {
    expect(getVerdict(8.0, MIN_VOTES_FOR_RANKING).tier).toBe('rated')
  })

  it('rated colors follow getRatingColor exactly', () => {
    expect(getVerdict(8.0, 10).color).toBe('var(--color-green-deep)')
    expect(getVerdict(7.9, 10).color).toBe('var(--color-amber)')
    expect(getVerdict(6.0, 10).color).toBe('var(--color-amber)')
    expect(getVerdict(5.9, 10).color).toBe('var(--color-red)')
  })

  it('formats score to one decimal', () => {
    expect(getVerdict(9, 10).score).toBe('9.0')
  })

  it('non-numeric vote counts are treated as zero', () => {
    expect(getVerdict(8.5, undefined).tier).toBe('new')
    expect(getVerdict(8.5, NaN).tier).toBe('new')
  })

  it('invalid ratings fall back to new tier, never a scored chip', () => {
    expect(getVerdict(NaN, 10).tier).toBe('new')
    expect(getVerdict('garbage', 10).tier).toBe('new')
    expect(getVerdict(-1, 10).tier).toBe('new')
    expect(getVerdict(0, 10).tier).toBe('new')
    expect(getVerdict(8.5, -3).tier).toBe('new')
  })
})
