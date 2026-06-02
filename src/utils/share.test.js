import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn() }, Directory: { Cache: 'CACHE' } }))

import { shareImage } from './share'

function setNav(prop, value) {
  Object.defineProperty(navigator, prop, { value, configurable: true, writable: true })
}

describe('shareImage', () => {
  const file = new File(['x'], 'wgh-share.png', { type: 'image/png' })
  const blob = new Blob(['x'], { type: 'image/png' })
  let clickSpy

  beforeEach(() => {
    setNav('share', undefined)
    setNav('canShare', undefined)
    setNav('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) })
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('falls back to download + copy-link when file share is unsupported', async () => {
    const result = await shareImage({ file, blob, url: 'https://wghapp.com/playlist/1', text: 'hi' })
    expect(clickSpy).toHaveBeenCalled()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://wghapp.com/playlist/1')
    expect(result).toEqual({ method: 'download_copy', success: true })
  })

  it('uses web file share when supported', async () => {
    setNav('canShare', vi.fn(() => true))
    setNav('share', vi.fn().mockResolvedValue(undefined))
    const result = await shareImage({ file, blob, url: 'u', text: 'hi' })
    expect(navigator.share).toHaveBeenCalled()
    expect(result).toEqual({ method: 'web_share_file', success: true })
  })
})
