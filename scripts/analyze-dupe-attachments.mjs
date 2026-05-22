import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// Same normalizer logic as supabase/functions/menu-refresh/extractors.ts
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

// Pull all dishes
const allDishes = []
let from = 0
for (;;) {
  const { data } = await supabase.from('dishes')
    .select('id, name, category, price, restaurant_id, created_at')
    .range(from, from + 999).order('id')
  if (!data?.length) break
  allDishes.push(...data)
  if (data.length < 1000) break
  from += 1000
}

// Group by (restaurant_id, category, normKey)
const groups = {}
for (const d of allDishes) {
  const key = `${d.restaurant_id}|${(d.category || '').toLowerCase()}|${normalizeDishKey(d.name, d.category)}`
  if (!key.endsWith('|')) {
    groups[key] ||= []
    groups[key].push(d)
  }
}

const dupeGroups = Object.values(groups).filter((g) => g.length > 1)
const dupeIds = dupeGroups.flat().map((d) => d.id)

console.log(`Total dupe groups (under new normalizer): ${dupeGroups.length}`)
console.log(`Total dishes inside dupe groups: ${dupeIds.length}`)

// Count attachments on dupe dishes
async function countTable(table, col = 'dish_id') {
  const counts = {}
  for (let i = 0; i < dupeIds.length; i += 200) {
    const batch = dupeIds.slice(i, i + 200)
    const { data } = await supabase.from(table).select(`id, ${col}`).in(col, batch)
    for (const r of data || []) counts[r[col]] = (counts[r[col]] || 0) + 1
  }
  return counts
}

const votes = await countTable('votes')
const favorites = await countTable('favorites')
const photos = await countTable('dish_photos')
const playlist = await countTable('user_playlist_items')
const localList = await countTable('local_list_items')

console.log('\n--- Per-group attachment profile ---')
let groupsWithBothSidesHavingData = 0
let groupsWithOneSideOnly = 0
let groupsWithNoAttachments = 0
const merges = []

for (const group of dupeGroups) {
  const enriched = group.map((d) => ({
    ...d,
    votes: votes[d.id] || 0,
    favorites: favorites[d.id] || 0,
    photos: photos[d.id] || 0,
    playlist: playlist[d.id] || 0,
    localList: localList[d.id] || 0,
    score: (votes[d.id] || 0) * 100 + (favorites[d.id] || 0) * 10 + (photos[d.id] || 0) + (playlist[d.id] || 0) + (localList[d.id] || 0),
  }))
  const sidesWithData = enriched.filter((d) => d.score > 0).length
  if (sidesWithData === 0) groupsWithNoAttachments++
  else if (sidesWithData === 1) groupsWithOneSideOnly++
  else groupsWithBothSidesHavingData++

  // pick winner: highest score, tiebreaker = longer name, oldest created_at
  enriched.sort((a, b) =>
    b.score - a.score ||
    b.name.length - a.name.length ||
    new Date(a.created_at) - new Date(b.created_at)
  )
  const [winner, ...losers] = enriched
  merges.push({ winner, losers, sidesWithData })
}

console.log(`Groups with NO attachments on any side: ${groupsWithNoAttachments} (simple delete-the-rest)`)
console.log(`Groups with ONE side having attachments: ${groupsWithOneSideOnly} (vote-bearer wins, others deleted)`)
console.log(`Groups with MULTIPLE sides having attachments: ${groupsWithBothSidesHavingData} (need FK reassignment)`)

console.log('\n--- Groups needing FK reassignment (multi-side data) ---')
for (const m of merges.filter((x) => x.sidesWithData > 1).slice(0, 20)) {
  console.log(`Winner: "${m.winner.name}" votes=${m.winner.votes} fav=${m.winner.favorites} photos=${m.winner.photos} pl=${m.winner.playlist} ll=${m.winner.localList}`)
  for (const l of m.losers) {
    console.log(`  Loser:  "${l.name}" votes=${l.votes} fav=${l.favorites} photos=${l.photos} pl=${l.playlist} ll=${l.localList}`)
  }
}
