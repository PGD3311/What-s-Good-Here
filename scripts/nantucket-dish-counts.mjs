#!/usr/bin/env node
/**
 * Dish-count snapshot for every open Nantucket restaurant.
 * Read-only via the public anon key — safe to run anytime to watch the
 * menu-refresh queue fill in menus.
 *
 *   node scripts/nantucket-dish-counts.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Safe env load: parse KEY=value lines, skip malformed/comment lines.
function loadEnv() {
  try {
    const file = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    for (const line of file.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const k = t.slice(0, i).trim()
      if (/\s/.test(k)) continue // skip lines whose "key" has spaces (malformed)
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim()
    }
  } catch { /* optional */ }
}
loadEnv()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1) }

const supabase = createClient(url, key)
const TOWNS = ['Nantucket', 'Siasconset', 'Madaket', 'Wauwinet']

const { data: restaurants, error } = await supabase
  .from('restaurants')
  .select('id, name')
  .in('town', TOWNS)
  .eq('is_open', true)
if (error) { console.error('restaurants query failed:', error.message); process.exit(1) }

const rows = []
for (const r of restaurants) {
  const { count } = await supabase
    .from('dishes')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', r.id)
  rows.push({ name: r.name, dishes: count ?? 0 })
}

rows.sort((a, b) => a.dishes - b.dishes || a.name.localeCompare(b.name))
const total = rows.reduce((s, r) => s + r.dishes, 0)
const thin = rows.filter(r => r.dishes <= 5).length

for (const r of rows) {
  const bar = r.dishes <= 5 ? '  ⚠️' : ''
  console.log(`${String(r.dishes).padStart(3)}  ${r.name}${bar}`)
}
console.log(`\n${restaurants.length} restaurants · ${total} dishes total · ${thin} still ≤5 dishes`)
