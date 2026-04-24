// THE ONLY module in the codebase that imports @capgo/capacitor-social-login.
// Plugin is loaded via dynamic import so it never enters the web bundle —
// web users will never execute these functions (callers gate on
// Capacitor.isNativePlatform()). Swapping plugins means editing this file
// and nothing else.

import { generateNonce, sha256 } from '../utils/nonce'
import { logger } from '../utils/logger'

const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || ''
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || ''

let _socialLogin = null
async function getSocialLogin() {
  if (_socialLogin) return _socialLogin
  const mod = await import('@capgo/capacitor-social-login')
  _socialLogin = mod.SocialLogin
  return _socialLogin
}

// ensureInitialized calls the plugin's initialize on every sign-in invocation.
// The Capgo plugin treats initialize as idempotent, so repeated calls are safe.
// This keeps module-level state minimal and makes test isolation trivial —
// vi.mock + beforeEach mock resets are sufficient, no module-level cache to
// fight between tests.
async function ensureInitialized() {
  const SocialLogin = await getSocialLogin()
  try {
    await SocialLogin.initialize({
      google: {
        iOSClientId: GOOGLE_IOS_CLIENT_ID,
        webClientId: GOOGLE_WEB_CLIENT_ID,
      },
      apple: {
        clientId: 'com.whatsgoodhere.app',
      },
    })
  } catch (err) {
    const e = new Error(err?.message || 'Social login init failed')
    e.code = 'AUTH_CONFIG'
    e.subcode = GOOGLE_IOS_CLIENT_ID ? 'google_plugin_init_failed' : 'google_sdk_missing_clientid'
    e.cause = err?.message
    throw e
  }
}

function mapPluginError(err, provider) {
  const msg = String(err?.message || err || '').toLowerCase()
  if (msg.includes('cancel')) {
    return Object.assign(new Error('User cancelled'), { code: 'AUTH_USER_CANCELLED' })
  }
  if (msg.includes('network') || msg.includes('offline') || msg.includes('timeout')) {
    return Object.assign(new Error('Network error'), {
      code: 'AUTH_NETWORK',
      cause: err?.message,
    })
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return Object.assign(new Error('Rate limited'), {
      code: 'AUTH_RATE_LIMITED',
      cause: err?.message,
    })
  }
  logger.warn(`nativeAuth ${provider} unknown error`, err)
  return Object.assign(new Error('Sign in failed'), {
    code: 'AUTH_UNKNOWN',
    cause: err?.message,
  })
}

export async function signInWithGoogleNative() {
  await ensureInitialized()
  const SocialLogin = await getSocialLogin()
  let res
  try {
    res = await SocialLogin.login({ provider: 'google', options: {} })
  } catch (err) {
    throw mapPluginError(err, 'google')
  }
  const idToken = res?.result?.idToken
  const accessToken = res?.result?.accessToken
  if (!idToken) {
    throw Object.assign(new Error('Missing idToken from Google'), {
      code: 'AUTH_CONFIG',
      subcode: 'google_plugin_init_failed',
    })
  }
  return { idToken, accessToken }
}

export async function signInWithAppleNative() {
  await ensureInitialized()
  const SocialLogin = await getSocialLogin()
  const rawNonce = generateNonce()
  const hashedNonce = await sha256(rawNonce)
  let res
  try {
    res = await SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['email', 'name'], nonce: hashedNonce },
    })
  } catch (err) {
    throw mapPluginError(err, 'apple')
  }
  const result = res?.result || {}
  const identityToken = result.identityToken
  const authorizationCode = result.authorizationCode || null
  const appleSub = result.user || null
  if (!identityToken) {
    throw Object.assign(new Error('Missing identityToken from Apple'), {
      code: 'AUTH_UNKNOWN',
      subcode: 'apple_missing_identity_token',
    })
  }
  return {
    identityToken,
    authorizationCode,
    appleSub,
    givenName: result.profile?.givenName || null,
    familyName: result.profile?.familyName || null,
    rawNonce,
  }
}

export async function logoutNative(provider) {
  try {
    const SocialLogin = await getSocialLogin()
    await SocialLogin.logout({ provider })
  } catch (err) {
    logger.warn(`nativeAuth logout ${provider} failed`, err)
  }
}
