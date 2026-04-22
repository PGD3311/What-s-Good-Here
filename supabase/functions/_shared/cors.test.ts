import { describe, expect, it } from 'vitest'
import { corsHeaders, isAllowedOrigin } from './cors.ts'

describe('cors helper', () => {
  describe('isAllowedOrigin', () => {
    it('accepts named origins', () => {
      expect(isAllowedOrigin('https://wghapp.com')).toBe(true)
      expect(isAllowedOrigin('https://www.wghapp.com')).toBe(true)
      expect(isAllowedOrigin('https://whats-good-here.vercel.app')).toBe(true)
      expect(isAllowedOrigin('capacitor://localhost')).toBe(true)
      expect(isAllowedOrigin('https://localhost')).toBe(true)
      expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    })

    it('accepts Vercel preview pattern', () => {
      expect(
        isAllowedOrigin('https://whats-good-here-git-fix-foo-pgd3311.vercel.app'),
      ).toBe(true)
    })

    it('rejects wrong prefix and non-https for Vercel', () => {
      expect(isAllowedOrigin('https://someone-else.vercel.app')).toBe(false)
      expect(isAllowedOrigin('http://whats-good-here-preview.vercel.app')).toBe(false)
    })

    it('rejects subdomain-suffix spoofing', () => {
      expect(isAllowedOrigin('https://whats-good-here-x.vercel.app.evil.com')).toBe(false)
    })

    it('rejects null, empty, and unknown origins', () => {
      expect(isAllowedOrigin(null)).toBe(false)
      expect(isAllowedOrigin('')).toBe(false)
      expect(isAllowedOrigin('https://evil.com')).toBe(false)
      expect(isAllowedOrigin('http://whats-good-here.vercel.app')).toBe(false)
      expect(isAllowedOrigin('http://wghapp.com')).toBe(false)
      expect(isAllowedOrigin('https://wghapp.com.evil.com')).toBe(false)
    })
  })

  describe('corsHeaders', () => {
    it('emits default origin when Origin header is missing', () => {
      const req = new Request('https://example.com')
      const h = corsHeaders(req)
      expect(h['Access-Control-Allow-Origin']).toBe('https://wghapp.com')
      expect(h['Vary']).toBe('Origin')
    })

    it('echoes canonical wghapp.com origin back', () => {
      const req = new Request('https://example.com', {
        headers: { Origin: 'https://wghapp.com' },
      })
      expect(corsHeaders(req)['Access-Control-Allow-Origin']).toBe('https://wghapp.com')
    })

    it('echoes allowed Origin back', () => {
      const req = new Request('https://example.com', {
        headers: { Origin: 'capacitor://localhost' },
      })
      expect(corsHeaders(req)['Access-Control-Allow-Origin']).toBe('capacitor://localhost')
    })

    it('omits Access-Control-Allow-Origin for disallowed Origin', () => {
      const req = new Request('https://example.com', {
        headers: { Origin: 'https://evil.com' },
      })
      expect(corsHeaders(req)['Access-Control-Allow-Origin']).toBeUndefined()
    })

    it('always includes Methods and Allow-Headers', () => {
      const req = new Request('https://example.com')
      const h = corsHeaders(req)
      expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
      expect(h['Access-Control-Allow-Headers']).toBe(
        'authorization, x-client-info, apikey, content-type',
      )
    })
  })
})
