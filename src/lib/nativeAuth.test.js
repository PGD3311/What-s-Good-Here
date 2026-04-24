import { describe, it, expect, vi, beforeEach } from 'vitest'

const loginMock = vi.fn()
const logoutMock = vi.fn()
const initializeMock = vi.fn()

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: {
    initialize: (...args) => initializeMock(...args),
    login: (...args) => loginMock(...args),
    logout: (...args) => logoutMock(...args),
  },
}))

import { signInWithGoogleNative, signInWithAppleNative, logoutNative } from './nativeAuth'

beforeEach(() => {
  initializeMock.mockReset()
  loginMock.mockReset()
  logoutMock.mockReset()
  initializeMock.mockResolvedValue(undefined)
})

describe('signInWithGoogleNative', () => {
  it('returns { idToken, accessToken } on success', async () => {
    loginMock.mockResolvedValueOnce({
      provider: 'google',
      result: { idToken: 'google-id', accessToken: 'google-access', profile: {} },
    })
    const r = await signInWithGoogleNative()
    expect(r).toEqual({ idToken: 'google-id', accessToken: 'google-access' })
  })

  it('maps user cancel to AUTH_USER_CANCELLED', async () => {
    loginMock.mockRejectedValueOnce(new Error('The user canceled the sign-in flow.'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_USER_CANCELLED',
    })
  })

  it('maps network error to AUTH_NETWORK', async () => {
    loginMock.mockRejectedValueOnce(new Error('network error'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_NETWORK',
    })
  })

  it('maps plugin init failure to AUTH_CONFIG', async () => {
    initializeMock.mockRejectedValueOnce(new Error('Missing client id'))
    await expect(signInWithGoogleNative()).rejects.toMatchObject({
      code: 'AUTH_CONFIG',
      subcode: 'google_sdk_missing_clientid',
    })
  })
})

describe('signInWithAppleNative', () => {
  it('passes hashed nonce to plugin and returns raw nonce with tokens', async () => {
    loginMock.mockResolvedValueOnce({
      provider: 'apple',
      result: {
        identityToken: 'apple-id',
        authorizationCode: 'apple-code',
        user: '000123.abc',
        profile: { givenName: 'Dan', familyName: 'Walsh' },
      },
    })
    const r = await signInWithAppleNative()
    expect(r.identityToken).toBe('apple-id')
    expect(r.authorizationCode).toBe('apple-code')
    expect(r.appleSub).toBe('000123.abc')
    expect(r.givenName).toBe('Dan')
    expect(r.familyName).toBe('Walsh')
    expect(r.rawNonce).toMatch(/^[0-9a-f]{64}$/)
    const loginArgs = loginMock.mock.calls[0][0]
    expect(loginArgs.options.nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(loginArgs.options.nonce).not.toBe(r.rawNonce)
  })

  it('maps user cancel', async () => {
    loginMock.mockRejectedValueOnce(new Error('The user canceled the authorization attempt.'))
    await expect(signInWithAppleNative()).rejects.toMatchObject({
      code: 'AUTH_USER_CANCELLED',
    })
  })
})

describe('logoutNative', () => {
  it('calls plugin logout for google', async () => {
    logoutMock.mockResolvedValueOnce(undefined)
    await logoutNative('google')
    expect(logoutMock).toHaveBeenCalledWith({ provider: 'google' })
  })

  it('swallows logout errors (best-effort)', async () => {
    logoutMock.mockRejectedValueOnce(new Error('boom'))
    await expect(logoutNative('google')).resolves.toBeUndefined()
  })
})
