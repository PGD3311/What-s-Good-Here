// Cleanup script for duplicate dish rows.
//
// Groups dishes by (restaurant_id, category, normalizeDishKey(name, category))
// using the canonical normalizer from supabase/functions/menu-refresh/extractors.ts.
// For each group with multiple rows: keeps the row with attachments (or the
// longer/older name if none have attachments), deletes the rest.
//
// Usage:
//   node scripts/cleanup-duplicate-dishes.mjs             # dry-run, prints plan
//   node scripts/cleanup-duplicate-dishes.mjs --execute   # actually deletes
//
// Safety: aborts if any losing row has votes/favorites/photos/etc. attached.
// That case should be impossible under the current data (analyze script
// confirmed 0 attachments on 191 candidate losers) but the guard stays as a
// belt-and-braces check in case the data shifts between scan and execute.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (process.argv.includes('--execute') && !SERVICE_KEY) {
  console.error('--execute requires SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
)
const isDryRun = !process.argv.includes('--execute')

// Canonical normalizer — MUST stay in sync with
// supabase/functions/menu-refresh/extractors.ts normalizeDishKey().
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'over', 'n', 'gf', 'df', 'v', 've', 'vg', 'vgn'])
const ABBREV = { chix: 'chicken', chkn: 'chicken', brgr: 'burger', burg: 'burger' }
const CATEGORY_REDUNDANT = {
  donuts: ['donut', 'donuts'], burger: ['burger', 'burgers'], pizza: ['pizza', 'pizzas'],
  salad: ['salad', 'salads'], sandwich: ['sandwich', 'sandwiches'],
  'fish-sandwich': ['sandwich', 'sandwiches'], taco: ['taco', 'tacos'],
  burrito: ['burrito', 'burritos'], enchiladas: ['enchilada', 'enchiladas'],
  fries: ['fries'], 'onion rings': ['rings'], pasta: ['pasta', 'pastas'],
  wrap: ['wrap', 'wraps'], wings: ['wings', 'wing'], cookie: ['cookie', 'cookies'],
}
const NUMERIC_PAREN_RE = /\([^)]*\d[^)]*\)/g
const ANY_PAREN_RE = /\([^)]*\)/g

function normalizeDishKey(name, category) {
  if (!name) return ''
  const cat = (category || '').toLowerCase().trim()
  const lowered = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const protectedParens = lowered.replace(NUMERIC_PAREN_RE, (m) => {
    const d = m.match(/\d+/g)?.join('-') ?? ''
    return ` qty${d} `
  })
  const cleaned = protectedParens.replace(ANY_PAREN_RE, ' ').replace(/[*]/g, ' ')
    .replace(/['’`"]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const redundant = new Set(CATEGORY_REDUNDANT[cat] || [])
  const tokens = cleaned.split(' ').map((t) => ABBREV[t] ?? t).filter((t) => t && !STOPWORDS.has(t))
  const filtered = tokens.filter((t) => !redundant.has(t))
  const final = filtered.length > 0 ? filtered : tokens
  return final.slice().sort().join(' ')
}

console.log(`Mode: ${isDryRun ? 'DRY-RUN (no changes)' : '*** EXECUTE (will delete rows) ***'}`)

// Pull all dishes
const allDishes = []
let from = 0
for (;;) {
  const { data } = await supabase.from('dishes')
    .select('id, name, category, price, description, restaurant_id, created_at')
    .range(from, from + 999).order('id')
  if (!data?.length) break
  allDishes.push(...data)
  if (data.length < 1000) break
  from += 1000
}

// Pull restaurant names for the log
const restIds = [...new Set(allDishes.map((d) => d.restaurant_id).filter(Boolean))]
const restMap = {}
for (let i = 0; i < restIds.length; i += 100) {
  const { data } = await supabase.from('restaurants').select('id, name').in('id', restIds.slice(i, i + 100))
  for (const r of data || []) restMap[r.id] = r.name
}

// Group by (restaurant_id, category, normKey)
const groups = {}
for (const d of allDishes) {
  const normKey = normalizeDishKey(d.name, d.category)
  if (!normKey) continue
  const key = `${d.restaurant_id}|${(d.category || '').toLowerCase()}|${normKey}`
  groups[key] ||= []
  groups[key].push(d)
}
const dupeGroups = Object.values(groups).filter((g) => g.length > 1)
console.log(`Found ${dupeGroups.length} dupe groups across ${allDishes.length} dishes.`)

// Pull attachment counts for ALL candidate dish ids (winners + losers).
// We use this to (a) score winners and (b) safety-check that no loser has data.
const candidateIds = dupeGroups.flat().map((d) => d.id)

async function countTable(table, col = 'dish_id') {
  const counts = {}
  for (let i = 0; i < candidateIds.length; i += 200) {
    const batch = candidateIds.slice(i, i + 200)
    const { data, error } = await supabase.from(table).select(`id, ${col}`).in(col, batch)
    if (error) { console.error(`Error reading ${table}:`, error); process.exit(1) }
    for (const r of data || []) counts[r[col]] = (counts[r[col]] || 0) + 1
  }
  return counts
}

const [votes, favorites, photos, playlist, localList, biasEvents] = await Promise.all([
  countTable('votes'),
  countTable('favorites'),
  countTable('dish_photos'),
  countTable('user_playlist_items'),
  countTable('local_list_items'),
  countTable('bias_events'),
])
// Self-FK: any dishes whose parent_dish_id points at a loser?
const parentRefs = {}
{
  const { data } = await supabase.from('dishes').select('id, parent_dish_id').in('parent_dish_id', candidateIds)
  for (const r of data || []) parentRefs[r.parent_dish_id] = (parentRefs[r.parent_dish_id] || 0) + 1
}

function attachmentScore(id) {
  return (votes[id] || 0) * 100 + (favorites[id] || 0) * 10 + (photos[id] || 0) * 5 + (playlist[id] || 0) * 2 + (localList[id] || 0) * 2 + (biasEvents[id] || 0) + (parentRefs[id] || 0)
}

// Decide winners + losers per group
const plan = []
let blockedByAttachments = 0
for (const group of dupeGroups) {
  const ranked = group.map((d) => ({
    ...d,
    attachmentScore: attachmentScore(d.id),
    votes: votes[d.id] || 0,
    favorites: favorites[d.id] || 0,
    photos: photos[d.id] || 0,
    playlist: playlist[d.id] || 0,
    localList: localList[d.id] || 0,
    biasEvents: biasEvents[d.id] || 0,
    parentRefs: parentRefs[d.id] || 0,
  })).sort((a, b) =>
    b.attachmentScore - a.attachmentScore ||
    (b.description?.length || 0) - (a.description?.length || 0) ||
    b.name.length - a.name.length ||
    new Date(a.created_at) - new Date(b.created_at),
  )
  const [winner, ...losers] = ranked
  const losersWithAttachments = losers.filter((l) => l.attachmentScore > 0)
  if (losersWithAttachments.length > 0) blockedByAttachments++
  plan.push({ winner, losers, restName: restMap[winner.restaurant_id] || winner.restaurant_id })
}

console.log(`\nPlan: keep ${plan.length} winners, delete ${plan.reduce((n, p) => n + p.losers.length, 0)} losers.`)

if (blockedByAttachments > 0) {
  console.error(`\n!! ${blockedByAttachments} groups have a LOSER with attachments — refusing to proceed.`)
  console.error('   This script only handles attachment-free losers. Run the analyze script for details.')
  process.exit(1)
}

// Partition into safe merges vs suspect merges. Two false-positive classes
// observed in dry-runs:
//   (a) Same normKey but DIFFERENT prices — the parens or stripped tokens
//       were probably identity-bearing modifiers (protein options, portion
//       sizes like Half/Full or Cup/Bowl, prep styles).
//   (b) Both prices are NULL but each side has DIFFERENT paren content
//       (e.g., Larsen's "Shrimp (Cocktail & Jumbo)" vs "Shrimp (Cooked &
//       Chilled)"). Without price as a tiebreaker, divergent paren content
//       is the only signal that these are different dishes.
const SAME_PRICE_TOL = 0.01
function priceMatches(a, b) {
  if (a == null || b == null) return null   // unknown — fall through to other guards
  return Math.abs(a - b) <= SAME_PRICE_TOL
}

const PAREN_CONTENT_RE = /\(([^)]+)\)/g
function parenContents(name) {
  const out = []
  let m
  while ((m = PAREN_CONTENT_RE.exec(name)) !== null) {
    const trimmed = m[1].trim().toLowerCase()
    // Skip numeric-only parens — those are quantity (e.g. "(3)") and
    // already preserved as identity tokens by the normalizer.
    if (!/\d/.test(trimmed)) out.push(trimmed)
  }
  return out.sort().join('|')
}

function isSafeMerge(winner, loser) {
  const priceOK = priceMatches(winner.price, loser.price)
  if (priceOK === false) return false              // explicit price mismatch — defer
  // Both prices null OR both same: check paren contents next.
  const wParen = parenContents(winner.name)
  const lParen = parenContents(loser.name)
  if (wParen && lParen && wParen !== lParen) return false   // both have parens, different content
  return true
}

const samePricePlan = []
const diffPricePlan = []
for (const p of plan) {
  const allSafe = p.losers.every((l) => isSafeMerge(p.winner, l))
  if (allSafe) samePricePlan.push(p)
  else diffPricePlan.push(p)
}

console.log(`\nSafety partition:`)
console.log(`  Safe merges (will execute):       ${samePricePlan.length} groups → ${samePricePlan.reduce((n, p) => n + p.losers.length, 0)} deletes`)
console.log(`  Suspect merges (NEEDS REVIEW):    ${diffPricePlan.length} groups → ${diffPricePlan.reduce((n, p) => n + p.losers.length, 0)} skipped`)

console.log('\n--- SUSPECT MERGES (likely identity-bearing differences — NOT executing) ---')
for (const p of diffPricePlan) {
  console.log(`[${p.restName}] cat=${p.winner.category}`)
  console.log(`  KEEP   "${p.winner.name}" price=${p.winner.price ?? '?'}`)
  for (const l of p.losers) {
    const priceOK = priceMatches(p.winner.price, l.price)
    const flag = priceOK === false ? '  ← PRICE DIFFERS'
      : (parenContents(p.winner.name) && parenContents(l.name) && parenContents(p.winner.name) !== parenContents(l.name)) ? '  ← DIFFERENT PAREN CONTENT'
      : ''
    console.log(`  ???    "${l.name}" price=${l.price ?? '?'}${flag}`)
  }
}

console.log('\n--- SAME-PRICE MERGES (will execute) ---')
for (const p of samePricePlan.slice(0, 50)) {
  console.log(`[${p.restName}] cat=${p.winner.category}`)
  console.log(`  KEEP   "${p.winner.name}" price=${p.winner.price ?? '?'}`)
  for (const l of p.losers) {
    console.log(`  DELETE "${l.name}" price=${l.price ?? '?'}`)
  }
}
if (samePricePlan.length > 50) console.log(`  ... and ${samePricePlan.length - 50} more same-price groups (not printed for brevity)`)

if (isDryRun) {
  console.log(`\nDRY-RUN — no changes. Re-run with --execute to delete ${samePricePlan.reduce((n, p) => n + p.losers.length, 0)} same-price rows. ${diffPricePlan.length} different-price groups will be skipped.`)
  process.exit(0)
}

console.log('\n*** EXECUTING SAME-PRICE DELETES (different-price groups skipped) ***')
const loserIds = samePricePlan.flatMap((p) => p.losers.map((l) => l.id))
let deleted = 0
for (let i = 0; i < loserIds.length; i += 100) {
  const batch = loserIds.slice(i, i + 100)
  const { error, count } = await supabase.from('dishes').delete({ count: 'exact' }).in('id', batch)
  if (error) { console.error('Delete failed:', error); process.exit(1) }
  deleted += count || 0
  console.log(`  Deleted batch ${i / 100 + 1}/${Math.ceil(loserIds.length / 100)} (${count} rows)`)
}
console.log(`\nDone. Deleted ${deleted} duplicate dish rows.`)
