// Vercel Edge Middleware to proxy PostHog requests
// This avoids ad blocker blocking by routing through our domain

const POSTHOG_HOST = 'us.i.posthog.com'
const POSTHOG_ASSETS_HOST = 'us-assets.i.posthog.com'

// CORS allowlist for /ingest/* requests. The PostHog proxy runs same-origin in
// the browser, so this list only needs the web origins; native (Capacitor) and
// Vercel preview origins never hit this middleware — they go direct to Supabase
// Functions, which use the broader allowlist in supabase/functions/_shared/cors.ts.
const ALLOWED_ORIGINS = new Set([
  'https://wghapp.com',
  'https://www.wghapp.com',
  'https://whats-good-here.vercel.app',
  'http://localhost:5173',
])
const DEFAULT_ORIGIN = 'https://wghapp.com'

export const config = {
  matcher: '/ingest/:path*',
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const pathname = url.pathname

  // Remove /ingest prefix and determine target host
  const path = pathname.replace('/ingest', '')
  let targetHost = POSTHOG_HOST

  if (path.startsWith('/static')) {
    targetHost = POSTHOG_ASSETS_HOST
  }

  const targetUrl = new URL(`https://${targetHost}${path}${url.search}`)

  // Clone headers but update host
  const headers = new Headers(request.headers)
  headers.set('host', targetHost)
  headers.delete('connection')

  // Forward the request
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  })

  try {
    const response = await fetch(proxyRequest)

    // Return response with CORS headers. Echo the request Origin if it's in
    // the allowlist; fall back to the canonical domain for origin-less callers.
    const reqOrigin = request.headers.get('origin')
    const allowOrigin = reqOrigin && ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : DEFAULT_ORIGIN
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', allowOrigin)
    // Append "Origin" to any existing Vary directive from upstream (PostHog's
    // /static assets set their own Vary values; overwriting them would break
    // downstream caching).
    const upstreamVary = responseHeaders.get('Vary')
    if (!upstreamVary) {
      responseHeaders.set('Vary', 'Origin')
    } else if (!/\bOrigin\b/i.test(upstreamVary)) {
      responseHeaders.set('Vary', `${upstreamVary}, Origin`)
    }
    responseHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type')

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('PostHog proxy error:', error)
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
