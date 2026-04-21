import { describe, it, expect } from 'vitest'
import { getAuthUrlType } from './authUrlType'

describe('getAuthUrlType', () => {
  it('returns null for a plain URL', () => {
    expect(getAuthUrlType('https://app.example/login')).toBe(null)
  })

  it('returns the type from a query param (PKCE)', () => {
    expect(getAuthUrlType('https://app.example/login?code=abc&type=signup')).toBe('signup')
    expect(getAuthUrlType('https://app.example/login?type=email&code=abc')).toBe('email')
    expect(getAuthUrlType('https://app.example/reset-password?code=abc&type=recovery')).toBe('recovery')
  })

  it('returns the type from a hash fragment (legacy implicit)', () => {
    expect(getAuthUrlType('https://app.example/login#access_token=xxx&type=signup')).toBe('signup')
    expect(getAuthUrlType('https://app.example/login#type=email&access_token=xxx')).toBe('email')
  })

  it('prefers query over hash if both present', () => {
    expect(getAuthUrlType('https://app.example/login?type=signup#type=email')).toBe('signup')
  })

  it('returns null for malformed URLs (no throw)', () => {
    expect(getAuthUrlType('not a url')).toBe(null)
    expect(getAuthUrlType('')).toBe(null)
    expect(getAuthUrlType(null)).toBe(null)
  })

  it('returns null for unrecognized type values', () => {
    expect(getAuthUrlType('https://app.example/login?type=unknown')).toBe(null)
  })

  it('recognizes magiclink type', () => {
    expect(getAuthUrlType('https://app.example/login?code=xxx&type=magiclink')).toBe('magiclink')
  })

  it('recognizes invite and email_change types', () => {
    expect(getAuthUrlType('https://app.example/login?code=xxx&type=invite')).toBe('invite')
    expect(getAuthUrlType('https://app.example/login?code=xxx&type=email_change')).toBe('email_change')
  })

  it('is case-sensitive (only accepts lowercase Supabase values)', () => {
    expect(getAuthUrlType('https://app.example/login?type=Signup')).toBe(null)
    expect(getAuthUrlType('https://app.example/login?type=EMAIL')).toBe(null)
  })
})
