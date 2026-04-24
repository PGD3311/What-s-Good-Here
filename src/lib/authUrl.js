// Parses universal-link / deep-link URLs returning from email confirmation,
// password reset, or magic link. Returns null for anything not an auth return.
// Used by AuthLifecycle (in a later PR) when @capacitor/app fires appUrlOpen.

const AUTH_PATH_PREFIX = '/auth/'

export function parse(input) {
  if (!input || typeof input !== 'string') return null
  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (!url.pathname.startsWith(AUTH_PATH_PREFIX)) return null
  const code = url.searchParams.get('code')
  if (!code) return null
  const rawType = url.searchParams.get('type')
  const type = normalizeType(rawType)
  return { code, type }
}

function normalizeType(raw) {
  if (raw === 'recovery') return 'recovery'
  if (raw === 'signup' || raw === 'confirm') return 'confirm'
  return 'magiclink'
}
