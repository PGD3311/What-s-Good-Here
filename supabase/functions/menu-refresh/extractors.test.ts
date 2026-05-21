import { describe, expect, it } from 'vitest'
import { sanitizeDescription, sanitizeDietaryTags, sortedArraysEqual, ALLOWED_DIETARY_TAGS } from './extractors.ts'

describe('sanitizeDescription', () => {
  it('returns null for non-string input', () => {
    expect(sanitizeDescription(null)).toBe(null)
    expect(sanitizeDescription(undefined)).toBe(null)
    expect(sanitizeDescription(42)).toBe(null)
    expect(sanitizeDescription([])).toBe(null)
    expect(sanitizeDescription({})).toBe(null)
  })

  it('returns null for empty / whitespace-only strings', () => {
    expect(sanitizeDescription('')).toBe(null)
    expect(sanitizeDescription('   ')).toBe(null)
    expect(sanitizeDescription('\n\t')).toBe(null)
  })

  it('trims whitespace before checking emptiness', () => {
    expect(sanitizeDescription('  Hot lobster, drawn butter  ')).toBe('Hot lobster, drawn butter')
  })

  it('truncates strings over 150 chars to ≤150 at word boundary', () => {
    const long = 'word '.repeat(50)  // 250 chars of "word word word..."
    const result = sanitizeDescription(long)
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(150)
    expect(result!.endsWith(' ')).toBe(false)
  })

  it('passes through strings under 150 chars unchanged', () => {
    const short = 'Pepperoni, mozzarella, San Marzano tomato'
    expect(sanitizeDescription(short)).toBe(short)
  })

  it('handles exactly-150-char string without truncation', () => {
    const exact = 'x'.repeat(150)
    expect(sanitizeDescription(exact)).toBe(exact)
  })

  it('strips orphaned trailing punctuation after word-boundary truncation', () => {
    // 160-char comma-separated list; word-boundary cut leaves an orphaned comma
    const long = 'cauliflower, brussels sprouts, sun-dried tomato melange, crispy garlic, smoked sea salt, vichyssoise sauce, lemon zest, fresh herbs, microgreens'
    const result = sanitizeDescription(long)
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(150)
    expect(/[,;:.·•\-–—]$/.test(result!)).toBe(false)
  })

  it('hard-cuts when no space within first 80 chars', () => {
    // 200-char string with no spaces in first 80
    const long = 'a'.repeat(85) + ' rest of description here'
    const result = sanitizeDescription(long)
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(150)
  })
})

describe('sanitizeDietaryTags', () => {
  it('returns empty array for non-array input', () => {
    expect(sanitizeDietaryTags(null)).toEqual([])
    expect(sanitizeDietaryTags(undefined)).toEqual([])
    expect(sanitizeDietaryTags('vegan')).toEqual([])
    expect(sanitizeDietaryTags({ vegan: true })).toEqual([])
    expect(sanitizeDietaryTags(42)).toEqual([])
  })

  it('returns empty array for empty array input', () => {
    expect(sanitizeDietaryTags([])).toEqual([])
  })

  it('drops tags outside the whitelist', () => {
    expect(sanitizeDietaryTags(['vegan', 'paleo', 'keto', 'gluten_free'])).toEqual(['vegan', 'gluten_free'])
  })

  it('drops non-string entries', () => {
    expect(sanitizeDietaryTags(['vegan', 42, null, undefined, 'gluten_free'])).toEqual(['vegan', 'gluten_free'])
  })

  it('dedupes duplicates while preserving first-seen order', () => {
    expect(sanitizeDietaryTags(['vegan', 'vegan', 'vegetarian', 'vegan'])).toEqual(['vegan', 'vegetarian'])
  })

  it('returns empty array when no whitelist tags present', () => {
    expect(sanitizeDietaryTags(['paleo', 'keto', 'whole30'])).toEqual([])
  })

  it('accepts all five allowed tags', () => {
    const all = [...ALLOWED_DIETARY_TAGS]
    expect(sanitizeDietaryTags(all)).toEqual(all)
  })
})

describe('sortedArraysEqual', () => {
  it('returns true for empty arrays', () => {
    expect(sortedArraysEqual([], [])).toBe(true)
  })

  it('returns true for same elements in same order', () => {
    expect(sortedArraysEqual(['vegan', 'gluten_free'], ['vegan', 'gluten_free'])).toBe(true)
  })

  it('returns true for same elements in different order', () => {
    expect(sortedArraysEqual(['vegan', 'gluten_free'], ['gluten_free', 'vegan'])).toBe(true)
  })

  it('returns false for different lengths', () => {
    expect(sortedArraysEqual(['vegan'], ['vegan', 'gluten_free'])).toBe(false)
  })

  it('returns false for same length, different elements', () => {
    expect(sortedArraysEqual(['vegan'], ['vegetarian'])).toBe(false)
  })

  it('returns false when one is empty and other is not', () => {
    expect(sortedArraysEqual([], ['vegan'])).toBe(false)
    expect(sortedArraysEqual(['vegan'], [])).toBe(false)
  })
})
