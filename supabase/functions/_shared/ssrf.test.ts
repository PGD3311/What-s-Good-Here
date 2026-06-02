import { describe, it, expect, vi, afterEach } from 'vitest'
import { isBlockedHostname, safeFetch } from './ssrf.ts'

// isBlockedHostname has a fuller suite in menu-refresh/menu-candidates.test.ts;
// these spot-check the cases that matter for the SSRF guard plus the URL-parser
// normalization that safeFetch relies on.
describe('isBlockedHostname', () => {
  it('blocks localhost / loopback / private / link-local / metadata', () => {
    for (const h of [
      'localhost', '0.0.0.0', '127.0.0.1', '10.0.0.1',
      '172.16.0.1', '172.31.255.254', '192.168.1.1',
      '169.254.169.254', // AWS/GCP metadata
      '::1', 'fc00:0:0:0:0:0:0:1',
      // fe80::/10 link-local spans fe80–febf, not just fe80
      'fe80::1', 'fe90::1', 'fea0::1', 'febf::1',
      'service.local', 'api.internal', 'foo.localhost', 'localhost.',
    ]) {
      expect(isBlockedHostname(h), h).toBe(true)
    }
  })

  it('allows public hosts', () => {
    for (const h of ['example.com', 'www.restaurant.com', '8.8.8.8', '172.32.0.1', 'checkle.menu']) {
      expect(isBlockedHostname(h), h).toBe(false)
    }
  })
})

describe('safeFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ok = (body = 'ok', status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'text/html' } })
  const redirectTo = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } })

  it('rejects non-http(s) schemes without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/ssrf_bad_scheme/)
    await expect(safeFetch('gopher://example.com')).rejects.toThrow(/ssrf_bad_scheme/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects malformed URLs without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(safeFetch('not a url')).rejects.toThrow('ssrf_invalid_url')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects blocked hosts (incl. integer-IP literal) without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const u of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://2130706433/', // decimal 127.0.0.1 — normalized by URL parser
      'http://[::1]/',
    ]) {
      await expect(safeFetch(u), u).rejects.toThrow(/ssrf_blocked_host/)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the response for a direct public 200 and forces redirect:manual', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok())
    const res = await safeFetch('https://example.com/menu', {
      method: 'HEAD',
      headers: { 'User-Agent': 'bot' },
    })
    expect(res.status).toBe(200)
    const [calledUrl, init] = fetchSpy.mock.calls[0]
    expect(calledUrl).toBe('https://example.com/menu')
    expect(init).toMatchObject({ method: 'HEAD', redirect: 'manual' })
    expect((init as RequestInit).headers).toMatchObject({ 'User-Agent': 'bot' })
  })

  it('follows a redirect to another PUBLIC host and returns the final response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('https://cdn.example.net/final'))
      .mockResolvedValueOnce(ok('final-body'))
    const res = await safeFetch('https://example.com/menu')
    expect(await res.text()).toBe('final-body')
  })

  it('blocks a redirect that points at an internal host (the core SSRF case)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirectTo('http://169.254.169.254/latest/meta-data/'))
    await expect(safeFetch('https://innocent.example.com/')).rejects.toThrow(/ssrf_blocked_host/)
    // The first (public) hop was fetched; the internal redirect target was NOT.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('throws too_many_redirects past the hop cap', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirectTo('https://example.com/loop'))
    await expect(safeFetch('https://example.com/start', {}, 2)).rejects.toThrow('ssrf_too_many_redirects')
  })

  it('throws on a redirect with no Location header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 302 }))
    await expect(safeFetch('https://example.com/')).rejects.toThrow(/ssrf_redirect_no_location/)
  })
})
