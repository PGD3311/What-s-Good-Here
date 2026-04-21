import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isChunkLoadError, tryChunkReload, clearChunkReloadState } from './chunkReload'
import { setSessionItem } from '../lib/storage'

describe('isChunkLoadError', () => {
  it('matches Chrome message', () => {
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module: /assets/x.js' })).toBe(true)
  })

  it('matches Safari message', () => {
    expect(isChunkLoadError({ message: 'error loading dynamically imported module' })).toBe(true)
  })

  it('matches Firefox message', () => {
    expect(isChunkLoadError({ message: 'Importing a module script failed.' })).toBe(true)
  })

  it('matches generic Loading chunk', () => {
    expect(isChunkLoadError({ message: 'Loading chunk 42 failed.' })).toBe(true)
  })

  it('matches plain network Failed to fetch', () => {
    expect(isChunkLoadError({ message: 'Failed to fetch' })).toBe(true)
  })

  it("matches Safari's HTML-parsed-as-JS SyntaxError", () => {
    expect(isChunkLoadError({ name: 'SyntaxError', message: "Unexpected token '<'" })).toBe(true)
  })

  it('does NOT match bare Unexpected token (avoid false positives on user code)', () => {
    expect(isChunkLoadError({ name: 'SyntaxError', message: 'Unexpected token }' })).toBe(false)
  })

  it('matches Unable to resolve specifier', () => {
    expect(isChunkLoadError({ message: 'Unable to resolve specifier "./foo.js"' })).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isChunkLoadError({ message: 'Network request failed: auth' })).toBe(false)
    expect(isChunkLoadError({ name: 'TypeError', message: 'Cannot read property x of undefined' })).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })
})

describe('tryChunkReload + clearChunkReloadState', () => {
  let reload

  beforeEach(() => {
    sessionStorage.clear()
    clearChunkReloadState()
    reload = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearChunkReloadState()
    sessionStorage.clear()
  })

  it('first call triggers reload and returns true', () => {
    expect(tryChunkReload(reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('second call within window triggers reload and returns true', () => {
    tryChunkReload(reload)
    expect(tryChunkReload(reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('third call within window does NOT reload (max 2 attempts)', () => {
    tryChunkReload(reload)
    tryChunkReload(reload)
    expect(tryChunkReload(reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('attempt counter resets after 2-min window expires', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    tryChunkReload(reload)
    tryChunkReload(reload)
    expect(tryChunkReload(reload)).toBe(false)

    Date.now.mockReturnValue(now + 3 * 60 * 1000)
    expect(tryChunkReload(reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('clearChunkReloadState resets the counter', () => {
    tryChunkReload(reload)
    tryChunkReload(reload)
    clearChunkReloadState()
    expect(tryChunkReload(reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('corrupt state is treated as absent and retry allowed', () => {
    setSessionItem('wgh_chunk_reload_state', 'not-json')
    expect(tryChunkReload(reload)).toBe(true)
  })
})
