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
    // Pin VITE_GOOGLE_IOS_CLIENT_ID instead of inheriting it from the developer's
    // .env.local. The module reads it once at import time, so stub the env and
    // re-import to exercise the no-client-id branch deterministically — this
    // matches CI, where the var is unset and the subcode is google_sdk_missing_clientid.
    vi.stubEnv('VITE_GOOGLE_IOS_CLIENT_ID', '')
    vi.resetModules()
    try {
      const { signInWithGoogleNative: signIn } = await import('./nativeAuth')
      initializeMock.mockRejectedValueOnce(new Error('Missing client id'))
      await expect(signIn()).rejects.toMatchObject({
        code: 'AUTH_CONFIG',
        subcode: 'google_sdk_missing_clientid',
      })
    } finally {
      // Always restore env even if the assertion throws, so a failure here can't
      // leak the stubbed client id into later tests in this file.
      vi.unstubAllEnvs()
    }
  })
})

describe('signInWithAppleNative', () => {
  it('passes hashed nonce to plugin and returns raw nonce with tokens', async () => {
    loginMock.mockResolvedValueOnce({
      provider: 'apple',
      result: {
        idToken: 'apple-id',
        authorizationCode: 'apple-code',
        profile: { user: '000123.abc', givenName: 'Dan', familyName: 'Walsh' },
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
