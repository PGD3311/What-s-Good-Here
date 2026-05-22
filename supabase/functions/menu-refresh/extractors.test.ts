import { describe, expect, it } from 'vitest'
import { sanitizeDescription, sanitizeDietaryTags, sortedArraysEqual, ALLOWED_DIETARY_TAGS, normalizeDishKey } from './extractors.ts'

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

describe('normalizeDishKey', () => {
  // SHOULD MERGE: real duplicate patterns observed in production data
  it('collapses category-suffix variants', () => {
    expect(normalizeDishKey('Boston Cream', 'donuts'))
      .toBe(normalizeDishKey('Boston Cream Donut', 'donuts'))
    expect(normalizeDishKey('Old Fashioned', 'donuts'))
      .toBe(normalizeDishKey('Old Fashioned Donut', 'donuts'))
  })

  it('keeps non-numeric parenthetical content as identity-bearing', () => {
    // Region tags differ but the key conservatively keeps them separate —
    // we can't tell "(Ghana)" (identity-neutral) from "(Shrimp)" (identity-
    // bearing modifier) without a knowledge base. Cleanup happens in the
    // separate cleanup-duplicate-dishes script which uses price as the gate.
    expect(normalizeDishKey('Jollof Rice', 'entree'))
      .not.toBe(normalizeDishKey('Jollof Rice (Ghana)', 'entree'))
    expect(normalizeDishKey('SOS Pwa', 'entree'))
      .not.toBe(normalizeDishKey('SOS Pwa (Haiti)', 'entree'))
  })

  it('keeps protein/portion variants in parens distinct', () => {
    // Critical false-positive guard — Sharky's Cantina and similar
    // menus offer the same dish with different proteins at different
    // prices. These must NOT collapse.
    expect(normalizeDishKey('Loaded Quesadilla Plato (Shrimp)', 'quesadilla'))
      .not.toBe(normalizeDishKey('Loaded Quesadilla Plato (Steak)', 'quesadilla'))
    expect(normalizeDishKey('Jumbo Shrimp Cocktail (Half Dozen)', 'shrimp'))
      .not.toBe(normalizeDishKey('Jumbo Shrimp Cocktail (Dozen)', 'shrimp'))
    expect(normalizeDishKey('French Onion Soup (Bowl)', 'apps'))
      .not.toBe(normalizeDishKey('French Onion Soup (Cup)', 'apps'))
  })

  it('keeps dietary-marker variants distinct', () => {
    // "GF Boston Cream" at $4 and "Boston Cream" at $3.50 are different
    // SKUs — the marker is price-bearing identity.
    expect(normalizeDishKey('GF Boston Cream', 'donuts'))
      .not.toBe(normalizeDishKey('Boston Cream', 'donuts'))
    expect(normalizeDishKey('Truffled Chicken Frites GF', 'chicken'))
      .not.toBe(normalizeDishKey('Truffled Chicken Frites', 'chicken'))
  })

  it('strips asterisks (raw/footnote markers)', () => {
    expect(normalizeDishKey('Littleneck Clams', 'clams'))
      .toBe(normalizeDishKey('Littleneck Clams*', 'clams'))
  })

  it('expands common abbreviations', () => {
    expect(normalizeDishKey('Chix Sandwich', 'sandwich'))
      .toBe(normalizeDishKey('Chicken Sandwich', 'sandwich'))
    expect(normalizeDishKey('Brgr Wrap', 'wrap'))
      .toBe(normalizeDishKey('Burger Wrap', 'wrap'))
  })

  it('normalizes punctuation and connective words', () => {
    expect(normalizeDishKey('Fish & Chips', 'fish-and-chips'))
      .toBe(normalizeDishKey('Fish-n- Chips', 'fish-and-chips'))
    expect(normalizeDishKey('Fish and Chips', 'fish-and-chips'))
      .toBe(normalizeDishKey('Fish & Chips', 'fish-and-chips'))
  })

  it('normalizes apostrophes and quote variants', () => {
    expect(normalizeDishKey("Atria's Truffle Fries", 'fries'))
      .toBe(normalizeDishKey("Atrias Truffle Fries", 'fries'))
    expect(normalizeDishKey('Atria’s Truffle Fries', 'fries'))
      .toBe(normalizeDishKey("Atria's Truffle Fries", 'fries'))
  })

  it('normalizes diacritics so accents do not split keys', () => {
    expect(normalizeDishKey('Jalapeño Poppers', 'appetizer'))
      .toBe(normalizeDishKey('Jalapeno Poppers', 'appetizer'))
    expect(normalizeDishKey('Café Latte', 'coffee'))
      .toBe(normalizeDishKey('Cafe Latte', 'coffee'))
  })

  it('treats whitespace and minor punctuation differences as equal', () => {
    expect(normalizeDishKey('Hummus ,Veggie & Quinoa Wrap', 'wrap'))
      .toBe(normalizeDishKey('Hummus, Veggie & Quinoa Wrap', 'wrap'))
  })

  // SHOULD NOT MERGE: legitimately different dishes
  it('keeps size modifiers distinct', () => {
    expect(normalizeDishKey('Half Roast Chicken', 'chicken'))
      .not.toBe(normalizeDishKey('Whole Roast Chicken', 'chicken'))
  })

  it('keeps kid/adult portion variants distinct', () => {
    expect(normalizeDishKey('Kids Burger', 'burger'))
      .not.toBe(normalizeDishKey('Burger', 'burger'))
  })

  it('keeps modifier-prefixed versions distinct from base', () => {
    expect(normalizeDishKey('Cod Sandwich', 'fish-sandwich'))
      .not.toBe(normalizeDishKey('Fat Cod Sandwich', 'fish-sandwich'))
  })

  it('preserves numeric/quantity parentheticals', () => {
    // Quantity is identity-bearing — must NOT collapse different counts.
    expect(normalizeDishKey('Tacos (3)', 'taco'))
      .not.toBe(normalizeDishKey('Tacos (6)', 'taco'))
    expect(normalizeDishKey('Wings (10 pc)', 'wings'))
      .not.toBe(normalizeDishKey('Wings (6 pc)', 'wings'))
  })

  it('strips dietary shorthand letters (already in dietary_tags column)', () => {
    // "Plain GF" and "Plain GF Donut" are the same dish; the gluten-free
    // marker belongs in dietary_tags, not the name.
    expect(normalizeDishKey('Plain GF', 'donuts'))
      .toBe(normalizeDishKey('Plain GF Donut', 'donuts'))
  })

  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeDishKey('', 'donuts')).toBe('')
    expect(normalizeDishKey('   ', 'donuts')).toBe('')
    // Caller must guard against empty keys to avoid bad matches.
  })

  it('is stable when category is null/undefined', () => {
    expect(normalizeDishKey('Boston Cream Donut', null))
      .toBe(normalizeDishKey('Boston Cream Donut', undefined))
    // Without the donuts category, "donut" no longer strips.
    expect(normalizeDishKey('Boston Cream Donut', null))
      .not.toBe(normalizeDishKey('Boston Cream', null))
  })
})
