/**
 * Shared CORS helper for browser-facing Edge Functions.
 *
 * Echoes the request Origin back when it matches the allowlist so Capacitor
 * native webviews (capacitor://localhost, https://localhost) and local dev
 * (http://localhost:5173) can call these functions the same way the prod web
 * origin can. When Origin is present but disallowed, the header is omitted
 * entirely — the browser will reject the request cleanly, and failure shows
 * up loudly in the console instead of getting papered over with a default.
 */

const NAMED_ORIGINS = new Set<string>([
  'https://whats-good-here.vercel.app', // prod web
  'capacitor://localhost',              // Capacitor iOS
  'https://localhost',                  // Capacitor Android (default scheme)
  'http://localhost:5173',              // Vite dev
])

const DEFAULT_ORIGIN = 'https://whats-good-here.vercel.app'

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  if (NAMED_ORIGINS.has(origin)) return true
  try {
    const url = new URL(origin)
    // Vercel preview deploys: https://whats-good-here-<hash>-<team>.vercel.app
    if (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.vercel.app') &&
      url.hostname.startsWith('whats-good-here-')
    ) {
      return true
    }
  } catch {
    return false
  }
  return false
}

/**
 * Build CORS response headers for a request. Returns a fresh object each call
 * so callers can safely spread/mutate.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin === null) {
    // Server-to-server or dashboard tester — emit a safe default.
    headers['Access-Control-Allow-Origin'] = DEFAULT_ORIGIN
  } else if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  // else: omit Access-Control-Allow-Origin entirely — browser rejects cleanly.
  return headers
}
