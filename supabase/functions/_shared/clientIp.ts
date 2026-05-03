/**
 * Extract the originating client IP from request headers.
 *
 * Supabase Edge Functions sit behind a proxy that sets `x-forwarded-for`.
 * If a request originates through Cloudflare (e.g. our Vercel-hosted web
 * app), `cf-connecting-ip` is most accurate. Fall back through the standard
 * forwarding headers and return null when nothing usable is present.
 *
 * Used by the Places proxy functions to apply per-IP rate limits to
 * unauthenticated callers, since `auth.uid()`-based limiting only covers
 * authenticated traffic.
 */
export function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) {
    const trimmed = cfIp.trim()
    if (trimmed) return trimmed
  }

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    // First entry is the original client; later entries are intermediate
    // proxies. Trim whitespace and bracket characters that some proxies add
    // around IPv6 addresses.
    const first = xff.split(',')[0]?.trim().replace(/^\[|\]$/g, '')
    if (first) return first
  }

  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) {
    const trimmed = xRealIp.trim()
    if (trimmed) return trimmed
  }

  return null
}
