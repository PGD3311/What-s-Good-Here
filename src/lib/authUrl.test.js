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
    expect(parse('https://wghapp.com/restaurants')).toBeNull()
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

  it('parses /reset-password redirect (Supabase resetPasswordForEmail)', () => {
    // resetPasswordForEmail redirectTo lands here with code in query, no type param.
    expect(parse('https://wghapp.com/reset-password?code=resetcode')).toEqual({
      code: 'resetcode',
      type: 'recovery',
    })
  })

  it('parses /reset-password with trailing segment', () => {
    expect(parse('https://wghapp.com/reset-password/abc?code=x')).toEqual({
      code: 'x',
      type: 'recovery',
    })
  })

  it('reset-password path forces recovery type even if ?type= says otherwise', () => {
    // Defense: path is the source of truth; can't be tricked into other flows by query.
    expect(parse('https://wghapp.com/reset-password?code=x&type=magiclink')).toEqual({
      code: 'x',
      type: 'recovery',
    })
  })

  it('returns null for /reset-password without code', () => {
    expect(parse('https://wghapp.com/reset-password')).toBeNull()
  })

  it('does NOT match /reset-password-other or similar near-misses', () => {
    expect(parse('https://wghapp.com/reset-password-other?code=x')).toBeNull()
    expect(parse('https://wghapp.com/reset-passwords?code=x')).toBeNull()
  })
})
