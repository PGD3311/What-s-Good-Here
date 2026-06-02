import { describe, it, expect, vi } from 'vitest'
import { buildDirectionsUrl, buildToastOrderUrl } from './restaurantLinks'

// sanitizeUrl is exercised for real (it's a pure util); these assertions assume
// it passes through a valid http(s) URL and rejects junk.
describe('buildDirectionsUrl', () => {
  it('uses coordinates when both lat and lng are present', () => {
    expect(buildDirectionsUrl({ lat: 41.45, lng: -70.55, address: 'ignored' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=41.45,-70.55')
  })

  it('falls back to the encoded address when coords are missing', () => {
    expect(buildDirectionsUrl({ address: "Nancy's, Oak Bluffs, MA" }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=Nancy\'s%2C%20Oak%20Bluffs%2C%20MA')
  })

  it('falls back when only one coord is present (matches the && truthiness check)', () => {
    expect(buildDirectionsUrl({ lat: 41.45, lng: null, address: 'X' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=X')
  })

  it('handles no address gracefully (DishListItem coord-only case)', () => {
    expect(buildDirectionsUrl({ lat: 1, lng: 2 }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=1,2')
    expect(buildDirectionsUrl({})).toBe('https://www.google.com/maps/dir/?api=1&destination=')
  })
})

describe('buildToastOrderUrl', () => {
  it('builds a Toast deep link from a slug', () => {
    expect(buildToastOrderUrl('the-cafe', 'https://example.com/order'))
      .toBe('https://order.toasttab.com/online/the-cafe')
  })

  it('falls back to the sanitized order URL when there is no slug', () => {
    expect(buildToastOrderUrl(null, 'https://example.com/order'))
      .toBe('https://example.com/order')
  })

  it('returns the sanitizer result for an unsafe/empty fallback (no slug)', () => {
    // sanitizeUrl rejects javascript: and the like → null (falsy), preserving the
    // "no order link" guard behavior at the call sites.
    expect(buildToastOrderUrl(null, 'javascript:alert(1)')).toBe(null)
    expect(buildToastOrderUrl(null, null)).toBe(null)
  })
})
