import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { corsHeaders, isAllowedOrigin } from './cors.ts'

Deno.test('isAllowedOrigin — named origins', () => {
  assertEquals(isAllowedOrigin('https://whats-good-here.vercel.app'), true)
  assertEquals(isAllowedOrigin('capacitor://localhost'), true)
  assertEquals(isAllowedOrigin('https://localhost'), true)
  assertEquals(isAllowedOrigin('http://localhost:5173'), true)
})

Deno.test('isAllowedOrigin — Vercel preview pattern', () => {
  assertEquals(
    isAllowedOrigin('https://whats-good-here-git-fix-foo-pgd3311.vercel.app'),
    true,
  )
  // Wrong prefix
  assertEquals(isAllowedOrigin('https://someone-else.vercel.app'), false)
  // Wrong protocol
  assertEquals(
    isAllowedOrigin('http://whats-good-here-preview.vercel.app'),
    false,
  )
  // Subdomain squat: vercel.app-attacker.com
  assertEquals(isAllowedOrigin('https://whats-good-here-x.vercel.app.evil.com'), false)
})

Deno.test('isAllowedOrigin — disallowed', () => {
  assertEquals(isAllowedOrigin(null), false)
  assertEquals(isAllowedOrigin(''), false)
  assertEquals(isAllowedOrigin('https://evil.com'), false)
  assertEquals(isAllowedOrigin('http://whats-good-here.vercel.app'), false) // http not https
})

Deno.test('corsHeaders — missing Origin emits default', () => {
  const req = new Request('https://example.com')
  const h = corsHeaders(req)
  assertEquals(h['Access-Control-Allow-Origin'], 'https://whats-good-here.vercel.app')
  assertEquals(h['Vary'], 'Origin')
})

Deno.test('corsHeaders — allowed Origin echoed back', () => {
  const req = new Request('https://example.com', {
    headers: { Origin: 'capacitor://localhost' },
  })
  const h = corsHeaders(req)
  assertEquals(h['Access-Control-Allow-Origin'], 'capacitor://localhost')
})

Deno.test('corsHeaders — disallowed Origin → header omitted', () => {
  const req = new Request('https://example.com', {
    headers: { Origin: 'https://evil.com' },
  })
  const h = corsHeaders(req)
  assertEquals(h['Access-Control-Allow-Origin'], undefined)
})

Deno.test('corsHeaders — always includes Methods + Allow-Headers', () => {
  const req = new Request('https://example.com')
  const h = corsHeaders(req)
  assertEquals(h['Access-Control-Allow-Methods'], 'POST, OPTIONS')
  assertEquals(
    h['Access-Control-Allow-Headers'],
    'authorization, x-client-info, apikey, content-type',
  )
})
