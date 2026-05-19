import { describe, it, expect } from 'vitest'
import { parseDietParam, serializeDietParam } from './dietUrlParams'

describe('parseDietParam', () => {
  it('returns empty array for null', () => {
    expect(parseDietParam(null)).toEqual([])
  })

  it('returns empty array for undefined', () => {
    expect(parseDietParam(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseDietParam('')).toEqual([])
  })

  it('returns empty array for non-string input', () => {
    expect(parseDietParam(42)).toEqual([])
    expect(parseDietParam([])).toEqual([])
    expect(parseDietParam({})).toEqual([])
  })

  it('returns empty array when string is only commas/whitespace', () => {
    expect(parseDietParam(',,,')).toEqual([])
    expect(parseDietParam('  ,  ,  ')).toEqual([])
  })

  it('parses a single valid tag', () => {
    expect(parseDietParam('vegan')).toEqual(['vegan'])
  })

  it('parses multiple comma-separated valid tags preserving order', () => {
    expect(parseDietParam('vegan,gluten_free')).toEqual(['vegan', 'gluten_free'])
  })

  it('drops invalid tag values', () => {
    expect(parseDietParam('vegan,paleo,gluten_free,keto')).toEqual(['vegan', 'gluten_free'])
  })

  it('dedupes repeats', () => {
    expect(parseDietParam('vegan,vegan,gluten_free,vegan')).toEqual(['vegan', 'gluten_free'])
  })

  it('trims whitespace around tags', () => {
    expect(parseDietParam('vegan , gluten_free')).toEqual(['vegan', 'gluten_free'])
    expect(parseDietParam('  vegan  ,  gluten_free  ')).toEqual(['vegan', 'gluten_free'])
  })

  it('rejects mixed-case tokens but keeps valid lowercase ones', () => {
    expect(parseDietParam('Vegan,GLUTEN_FREE')).toEqual([])
    expect(parseDietParam('vegan,GLUTEN_FREE')).toEqual(['vegan'])
    expect(parseDietParam('VEGAN,gluten_free,Vegetarian')).toEqual(['gluten_free'])
  })
})

describe('serializeDietParam', () => {
  it('returns empty string for empty array', () => {
    expect(serializeDietParam([])).toBe('')
  })

  it('returns empty string for non-array input', () => {
    expect(serializeDietParam(null)).toBe('')
    expect(serializeDietParam(undefined)).toBe('')
    expect(serializeDietParam('vegan')).toBe('')
  })

  it('joins valid tags with commas', () => {
    expect(serializeDietParam(['vegan', 'gluten_free'])).toBe('vegan,gluten_free')
  })

  it('drops invalid tags when serializing', () => {
    expect(serializeDietParam(['vegan', 'paleo', 'gluten_free'])).toBe('vegan,gluten_free')
  })

  it('preserves order of allowed tags', () => {
    expect(serializeDietParam(['gluten_free', 'vegan'])).toBe('gluten_free,vegan')
  })

  it('dedupes repeated tags', () => {
    expect(serializeDietParam(['vegan', 'vegan', 'gluten_free'])).toBe('vegan,gluten_free')
  })
})

describe('round-trip', () => {
  it('serialize then parse is identity for valid tags', () => {
    const input = ['vegan', 'gluten_free', 'dairy_free']
    expect(parseDietParam(serializeDietParam(input))).toEqual(input)
  })

  it('parse then serialize is identity for canonical strings', () => {
    expect(serializeDietParam(parseDietParam('vegan,gluten_free'))).toBe('vegan,gluten_free')
  })
})
