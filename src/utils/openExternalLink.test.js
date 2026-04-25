import { describe, it, expect, vi, beforeEach } from 'vitest'

const isNativeMock = vi.fn()
const browserOpenMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativeMock() },
}))

vi.mock('@capacitor/browser', () => ({
  Browser: { open: (...args) => browserOpenMock(...args) },
}))

vi.mock('./logger', () => ({
  logger: { warn: (...args) => loggerWarnMock(...args) },
}))

import { openExternalLink } from './openExternalLink'

beforeEach(() => {
  isNativeMock.mockReset()
  browserOpenMock.mockReset().mockResolvedValue(undefined)
  loggerWarnMock.mockReset()
})

describe('openExternalLink', () => {
  it('on web, does not preventDefault and does not call Browser.open', async () => {
    isNativeMock.mockReturnValue(false)
    const event = { preventDefault: vi.fn() }
    await openExternalLink(event, 'https://example.com')
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(browserOpenMock).not.toHaveBeenCalled()
  })

  it('on native, preventDefault and Browser.open with the url', async () => {
    isNativeMock.mockReturnValue(true)
    const event = { preventDefault: vi.fn() }
    await openExternalLink(event, 'https://example.com')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(browserOpenMock).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('on native, swallows Browser.open errors and logs a warning', async () => {
    isNativeMock.mockReturnValue(true)
    browserOpenMock.mockRejectedValueOnce(new Error('boom'))
    const event = { preventDefault: vi.fn() }
    await expect(openExternalLink(event, 'https://example.com')).resolves.toBeUndefined()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalled()
  })

  it('handles missing event gracefully', async () => {
    isNativeMock.mockReturnValue(true)
    await expect(openExternalLink(undefined, 'https://example.com')).resolves.toBeUndefined()
    expect(browserOpenMock).toHaveBeenCalled()
  })
})
