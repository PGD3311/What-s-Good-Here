const KNOWN_TYPES = new Set([
  'signup',
  'email',
  'recovery',
  'magiclink',
  'invite',
  'email_change',
])

export function getAuthUrlType(urlString) {
  if (!urlString || typeof urlString !== 'string') return null
  let url
  try {
    url = new URL(urlString)
  } catch {
    return null
  }

  const queryType = url.searchParams.get('type')
  if (queryType && KNOWN_TYPES.has(queryType)) return queryType

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(hash)
  const hashType = hashParams.get('type')
  if (hashType && KNOWN_TYPES.has(hashType)) return hashType

  return null
}
