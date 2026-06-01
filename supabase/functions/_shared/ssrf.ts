// Shared SSRF guard for edge functions that fetch restaurant-controlled URLs
// (restaurant-scraper, menu-refresh). Restaurant managers can set website_url /
// facebook_url / menu_url on their own row, and menu/image URLs are discovered
// from page HTML — all untrusted. These helpers block fetches that would reach
// loopback / private / link-local / cloud-metadata hosts or use a non-http(s)
// scheme, and re-validate every redirect hop so a public URL can't 30x its way
// to an internal host.
//
// LIMITATION: this validates the hostname string, not the resolved IP, so it
// does NOT defend against DNS rebinding (a public hostname that resolves to a
// private address). Defending that requires pinning the resolved IP, which Deno
// `fetch` doesn't expose. This matches the guarantee of the original in-line
// guard in menu-refresh's fetchRawHtml.

// Block hostnames a fetch could otherwise be coaxed into reaching: loopback,
// RFC1918 private space, link-local (incl. AWS/GCP metadata at 169.254.169.254),
// and the *.local / *.internal suffixes used by service discovery on private
// networks. A legitimate restaurant URL never points here.
//
// Integer/hex/octal IP literals (e.g. http://2130706433) are normalized to
// dotted-quad by `new URL()` before this sees them, so the IPv4 branch catches
// them too.
export function isBlockedHostname(hostname: string): boolean {
  // Normalize: strip IPv6 brackets, trailing FQDN dot, lowercase.
  // Trailing-dot variants ('localhost.', 'service.local.') would otherwise
  // sneak past the suffix and equality checks — DNS treats them as equivalent.
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '') return true
  if (lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) return true
  // IPv4 numeric
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(lower)) {
    const parts = lower.split('.').map(Number)
    if (parts[0] === 0) return true                                            // 0/8
    if (parts[0] === 127) return true                                          // 127/8 loopback
    if (parts[0] === 10) return true                                           // 10/8 private
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true      // 172.16/12 private
    if (parts[0] === 192 && parts[1] === 168) return true                      // 192.168/16 private
    if (parts[0] === 169 && parts[1] === 254) return true                      // link-local + cloud metadata
    return false
  }
  // Any IPv6 starting with `::` is unreachable on the public internet: those
  // are the unspecified/loopback/IPv4-compatible/IPv4-mapped compatibility
  // forms (::1, ::, ::1.2.3.4, ::ffff:1.2.3.4, parser-normalized variants
  // like ::7f00:1). Real public IPv6 services live in 2000::/3 — none of
  // them start with `::`. Block the whole class so we don't have to enumerate
  // every parser-normalization quirk.
  if (lower.startsWith('::')) return true
  // IPv6 unique-local + link-local
  if (/^fc[0-9a-f]{2}:/i.test(lower) || /^fd[0-9a-f]{2}:/i.test(lower)) return true  // fc00::/7 ULA
  // fe80::/10 link-local spans first-hextet fe80–febf, NOT just fe80. The third
  // hex digit is 8/9/a/b (binary 10xx); matching only `fe80:` would let fe90::,
  // fea0::, febf:: through.
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true                                  // fe80::/10 link-local
  return false
}

// Maximum redirect hops safeFetch will follow. Each hop is validated BEFORE the
// request is issued, which is the SSRF defense that `redirect: 'follow'` doesn't
// provide (it redirects internally before we can inspect the target).
export const MAX_REDIRECT_HOPS = 5

/**
 * fetch() wrapper that validates the scheme + hostname of the URL and of every
 * redirect hop before issuing each request, then returns the final non-3xx
 * Response. Behaves like `redirect: 'follow'` but safe: it follows up to
 * `maxHops` redirects, re-checking each Location against isBlockedHostname.
 *
 * Throws (rather than returning) on a malformed URL, non-http(s) scheme, blocked
 * host, missing/invalid redirect Location, or too many redirects. Every current
 * caller already treats a throw as "skip this URL" (return null / log + continue),
 * so a blocked host degrades gracefully instead of crashing the run.
 *
 * `init` is forwarded verbatim except `redirect`, which is forced to 'manual'.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  maxHops: number = MAX_REDIRECT_HOPS,
): Promise<Response> {
  let currentUrl = url

  for (let hop = 0; hop <= maxHops; hop++) {
    let parsed: URL
    try {
      parsed = new URL(currentUrl)
    } catch {
      throw new Error('ssrf_invalid_url')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`ssrf_bad_scheme:${parsed.protocol}`)
    }
    if (isBlockedHostname(parsed.hostname)) {
      throw new Error(`ssrf_blocked_host:${parsed.hostname}`)
    }

    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      // Drain the redirect body so the connection can be reused / closed.
      await response.body?.cancel()
      if (!location) throw new Error(`ssrf_redirect_no_location:${response.status}`)
      try {
        currentUrl = new URL(location, currentUrl).href
      } catch {
        throw new Error('ssrf_invalid_redirect_location')
      }
      continue
    }

    return response
  }

  throw new Error('ssrf_too_many_redirects')
}
