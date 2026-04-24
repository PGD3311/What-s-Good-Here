import { describe, it, expect } from 'vitest'
import { generateNonce, sha256 } from './nonce'

describe('generateNonce', () => {
  it('returns a 64-char hex string', () => {
    const n = generateNonce()
    expect(n).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns different values each call', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
  })
})

describe('sha256', () => {
  it('matches known RFC 6234 test vector for "abc"', async () => {
    const h = await sha256('abc')
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('is deterministic', async () => {
    const a = await sha256('the-same-input')
    const b = await sha256('the-same-input')
    expect(a).toBe(b)
  })
})
