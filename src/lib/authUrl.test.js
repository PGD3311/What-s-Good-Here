import { describe, it, expect } from 'vitest'
import { parse } from './authUrl'

describe('authUrl.parse', () => {
  it('parses recovery link', () => {
    const r = parse('https://wghapp.com/auth/callback?code=abc123&type=recovery')
    expect(r).toEqual({ code: 'abc123', type: 'recovery' })
  })

  it('parses confirm link (Supabase sends type=signup)', () => {
    const r = parse('https://wghapp.com/auth/callback?code=abc&type=signup')
    expect(r).toEqual({ code: 'abc', type: 'confirm' })
  })

  it('parses magiclink', () => {
    const r = parse('https://wghapp.com/auth/callback?code=xyz&type=magiclink')
    expect(r).toEqual({ code: 'xyz', type: 'magiclink' })
  })

  it('returns null for non-auth URLs', () => {
    expect(parse('https://wghapp.com/browse')).toBeNull()
    expect(parse('https://wghapp.com/dish/abc')).toBeNull()
  })

  it('returns null when code is missing', () => {
    expect(parse('https://wghapp.com/auth/callback?type=recovery')).toBeNull()
  })

  it('returns null for malformed URLs without throwing', () => {
    expect(parse('not a url')).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse(undefined)).toBeNull()
  })

  it('defaults to magiclink when type absent but code present on /auth/*', () => {
    expect(parse('https://wghapp.com/auth/callback?code=abc')).toEqual({
      code: 'abc',
      type: 'magiclink',
    })
  })
})
