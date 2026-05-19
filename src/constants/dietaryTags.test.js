import { describe, it, expect } from 'vitest'
import { ALLOWED_DIETARY_TAGS, DIETARY_TAG_LABELS, DIETARY_DISCLAIMER } from './dietaryTags'

describe('dietaryTags constants', () => {
  it('exports five allowed tags in fixed order', () => {
    expect(ALLOWED_DIETARY_TAGS).toEqual([
      'vegan',
      'vegetarian',
      'gluten_free',
      'dairy_free',
      'nut_free',
    ])
  })

  it('has a human label for every allowed tag', () => {
    for (const tag of ALLOWED_DIETARY_TAGS) {
      expect(DIETARY_TAG_LABELS[tag]).toBeTruthy()
      expect(typeof DIETARY_TAG_LABELS[tag]).toBe('string')
    }
  })

  it('has no labels for tags outside the allowed list', () => {
    expect(Object.keys(DIETARY_TAG_LABELS).sort()).toEqual([...ALLOWED_DIETARY_TAGS].sort())
  })

  it('exports a non-empty disclaimer mentioning allergy/allergens', () => {
    expect(DIETARY_DISCLAIMER).toMatch(/allerg/i)
  })

  it('disclaimer tells users to confirm with the restaurant', () => {
    expect(DIETARY_DISCLAIMER.toLowerCase()).toContain('confirm')
    expect(DIETARY_DISCLAIMER.toLowerCase()).toContain('restaurant')
  })
})
