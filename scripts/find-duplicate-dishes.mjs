import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const ABBREV = {
  brgr: 'burger',
  burg: 'burger',
  chix: 'chicken',
  chkn: 'chicken',
  veg: 'veggie',
  sweeties: 'sweet potato fries',
  rings: 'onion rings',
  fishnchips: 'fish and chips',
  fish: 'fish',
  mac: 'macaroni',
  bbq: 'barbecue',
  hbc: 'honey buffalo chicken',
  cgb: 'chopped ground beef',
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'n', 'over'])

function tokenize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((t) => ABBREV[t] || t)
    .filter((t) => t && !STOPWORDS.has(t))
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  const inter = [...setA].filter((t) => setB.has(t)).length
  const union = new Set([...setA, ...setB]).size
  return inter / union
}

// Pull all dishes
const allDishes = []
const PAGE = 1000
let from = 0
for (;;) {
  const { data, error } = await supabase
    .from('dishes')
    .select('id, name, category, description, price, restaurant_id, created_at')
    .range(from, from + PAGE - 1)
    .order('id')
  if (error) { console.error('Fetch error:', error); process.exit(1) }
  if (!data?.length) break
  allDishes.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

// Pull restaurant names
const restIds = [...new Set(allDishes.map((d) => d.restaurant_id).filter(Boolean))]
const restMap = {}
for (let i = 0; i < restIds.length; i += 100) {
  const { data } = await supabase
    .from('restaurants')
    .select('id, name, town')
    .in('id', restIds.slice(i, i + 100))
  for (const r of data || []) restMap[r.id] = r
}

console.log(`Loaded ${allDishes.length} dishes across ${restIds.length} restaurants.`)

// Group by restaurant
const byRest = {}
for (const d of allDishes) {
  byRest[d.restaurant_id] ||= []
  byRest[d.restaurant_id].push({ ...d, tokens: tokenize(d.name) })
}

const SIM_THRESHOLD = 0.6
const allDupes = []

for (const [restId, dishes] of Object.entries(byRest)) {
  for (let i = 0; i < dishes.length; i++) {
    for (let j = i + 1; j < dishes.length; j++) {
      const a = dishes[i]
      const b = dishes[j]
      const sim = similarity(a.tokens, b.tokens)
      const samePrice = a.price && b.price && Math.abs(a.price - b.price) < 0.01
      const oneContainsOther =
        a.tokens.length && b.tokens.length &&
        (a.tokens.every((t) => b.tokens.includes(t)) || b.tokens.every((t) => a.tokens.includes(t)))

      // Confidence:
      // HIGH: same price + (sim>=0.6 OR one tokens subset of other)
      // MED:  same price + sim>=0.4, or different price + sim>=0.75
      // LOW:  sim>=0.6, no price match
      let conf = null
      if (samePrice && (sim >= SIM_THRESHOLD || oneContainsOther)) conf = 'HIGH'
      else if (samePrice && sim >= 0.4) conf = 'MED'
      else if (!samePrice && sim >= 0.75) conf = 'MED'
      else if (sim >= SIM_THRESHOLD) conf = 'LOW'

      if (conf) {
        allDupes.push({
          restId,
          rest: restMap[restId]?.name || '???',
          town: restMap[restId]?.town || '',
          a, b, sim, samePrice, oneContainsOther, conf,
        })
      }
    }
  }
}

const order = { HIGH: 0, MED: 1, LOW: 2 }
allDupes.sort((x, y) => order[x.conf] - order[y.conf] || x.rest.localeCompare(y.rest))

const summary = { HIGH: 0, MED: 0, LOW: 0 }
const byRestaurant = {}
for (const d of allDupes) {
  summary[d.conf]++
  byRestaurant[d.rest] = (byRestaurant[d.rest] || 0) + 1
}

console.log('\n========================================')
console.log(`Suspected duplicates: HIGH=${summary.HIGH}  MED=${summary.MED}  LOW=${summary.LOW}  TOTAL=${allDupes.length}`)
console.log('========================================\n')

console.log('Worst-offender restaurants:')
const sortedRests = Object.entries(byRestaurant).sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [name, n] of sortedRests) console.log(`  ${n.toString().padStart(3)}  ${name}`)

console.log('\n--- HIGH-confidence pairs ---\n')
for (const d of allDupes.filter((x) => x.conf === 'HIGH').slice(0, 200)) {
  console.log(`[${d.rest} / ${d.town}]`)
  console.log(`  A: "${d.a.name}" $${d.a.price ?? '?'} cat=${d.a.category} id=${d.a.id.slice(0, 8)}`)
  console.log(`  B: "${d.b.name}" $${d.b.price ?? '?'} cat=${d.b.category} id=${d.b.id.slice(0, 8)}`)
  console.log(`  sim=${d.sim.toFixed(2)} subset=${d.oneContainsOther}`)
}

console.log('\n--- MED-confidence pairs (first 40) ---\n')
for (const d of allDupes.filter((x) => x.conf === 'MED').slice(0, 40)) {
  console.log(`[${d.rest}]`)
  console.log(`  A: "${d.a.name}" $${d.a.price ?? '?'} cat=${d.a.category}`)
  console.log(`  B: "${d.b.name}" $${d.b.price ?? '?'} cat=${d.b.category}`)
  console.log(`  sim=${d.sim.toFixed(2)} samePrice=${d.samePrice}`)
}
