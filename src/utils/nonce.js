// Nonce helpers for Sign in with Apple. Apple accepts a raw nonce AND
// requires us to pass the SHA-256 of that nonce to ASAuthorizationController.
// We keep the raw value in memory, hash it, send hash to Apple, and pass raw
// to supabase.signInWithIdToken which verifies hash(raw) matches id_token.nonce.

export function generateNonce() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(input) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
