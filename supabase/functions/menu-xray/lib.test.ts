import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateImagePayload, decideMatches, buildIngestList } from './lib.ts'

Deno.test('rejects oversize base64 (>5MB decoded)', () => {
  const big = 'A'.repeat(7.1 * 1024 * 1024)
  assertEquals(validateImagePayload(big, 'image/jpeg').ok, false)
})
Deno.test('rejects media type Anthropic does not accept', () => {
  assertEquals(validateImagePayload('aGVsbG8=', 'image/heic').ok, false)
})
Deno.test('rejects when magic bytes disagree with declared type', () => {
  const pngBytes = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2))
  assertEquals(validateImagePayload(pngBytes, 'image/jpeg').ok, false)
})
Deno.test('accepts a real JPEG header declared as jpeg', () => {
  const jpegBytes = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4))
  assertEquals(validateImagePayload(jpegBytes, 'image/jpeg').ok, true)
})

const row = (qname: string, rank: number, sim: number, over: Record<string, unknown> = {}) => ({
  query_name: qname, rank, dish_id: `id-${qname}-${rank}`, dish_name: `${qname} dish ${rank}`,
  dish_category: 'seafood', avg_rating: 9.0, total_votes: 10, price: 20, sim, ...over,
})
Deno.test('clear winner above threshold with margin → accepted', () => {
  const out = decideMatches([{ name: 'Lobster Roll', category: 'lobster roll' }],
    [row('Lobster Roll', 1, 0.8), row('Lobster Roll', 2, 0.4)])
  assertEquals(out.get('Lobster Roll')?.dish_id, 'id-Lobster Roll-1')
})
Deno.test('below 0.45 → rejected', () => {
  const out = decideMatches([{ name: 'Crab Cakes', category: 'seafood' }], [row('Crab Cakes', 1, 0.40)])
  assertEquals(out.has('Crab Cakes'), false)
})
Deno.test('near-tie under 0.6 with no category separation → rejected (ambiguous)', () => {
  const out = decideMatches([{ name: 'Tacos', category: 'taco' }],
    [row('Tacos', 1, 0.5, { dish_category: 'taco' }), row('Tacos', 2, 0.48, { dish_category: 'taco' })])
  assertEquals(out.has('Tacos'), false)
})
Deno.test('near-tie broken by category agreement', () => {
  const out = decideMatches([{ name: 'Tacos', category: 'taco' }],
    [row('Tacos', 1, 0.5, { dish_category: 'sandwich' }), row('Tacos', 2, 0.48, { dish_category: 'taco' })])
  assertEquals(out.get('Tacos')?.dish_id, 'id-Tacos-2')
})
Deno.test('strong sim >= 0.6 accepted even with small margin', () => {
  const out = decideMatches([{ name: 'Chowder', category: 'chowder' }],
    [row('Chowder', 1, 0.65), row('Chowder', 2, 0.6)])
  assertEquals(out.get('Chowder')?.dish_id, 'id-Chowder-1')
})
Deno.test('unmatched new dish is ingestable; dup-by-normalized-key is not', () => {
  const extracted = [
    { name: 'Brand New Tartare', category: 'seafood', price: 19, menu_section: 'Apps', description: null, dietary_tags: [] },
    { name: "The Lobster Roll", category: 'lobster roll', price: 34, menu_section: 'Mains', description: null, dietary_tags: [] },
  ]
  const existing = [{ id: 'x', name: 'Lobster Roll', category: 'lobster roll', price: 34 }]
  const out = buildIngestList(extracted, new Set<string>(), existing)
  assertEquals(out.length, 1)
  assertEquals(out[0].name, 'Brand New Tartare')
})
Deno.test('garbage rows filtered: 1-char names, absurd prices, bad category coerced', () => {
  const extracted = [
    { name: 'X', category: 'apps', price: 5, menu_section: null, description: null, dietary_tags: [] },
    { name: 'Gold Plated Burger', category: 'burger', price: 9999, menu_section: null, description: null, dietary_tags: [] },
    { name: 'Mystery Bowl', category: 'not-a-category', price: 12, menu_section: null, description: null, dietary_tags: [] },
  ]
  const out = buildIngestList(extracted, new Set<string>(), [])
  assertEquals(out.length, 2)
  assertEquals(out.find(d => d.name === 'Gold Plated Burger')?.price, null)
  assertEquals(out.find(d => d.name === 'Mystery Bowl')?.category, 'entree')
})
