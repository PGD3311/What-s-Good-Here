// scripts/spike-menu-xray.mjs
// Usage: ANTHROPIC_API_KEY=sk-... node scripts/spike-menu-xray.mjs ~/Desktop/menu-photos
// Runs each image through the SAME prompt menu-refresh uses and prints what came back.
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
const apiKey = process.env.ANTHROPIC_API_KEY
if (!dir || !apiKey) {
  console.error('Usage: ANTHROPIC_API_KEY=... node scripts/spike-menu-xray.mjs <photo-dir>')
  process.exit(1)
}

// Pull the production prompt straight out of menu-refresh so the spike tests
// EXACTLY what will ship. The const is a single template literal.
const src = fs.readFileSync('supabase/functions/menu-refresh/index.ts', 'utf8')
const m = src.match(/const MENU_EXTRACTION_PROMPT = `((?:[^`\\]|\\[\s\S])*)`/) // lexes escaped backticks correctly
if (!m) { console.error('Could not locate MENU_EXTRACTION_PROMPT in menu-refresh/index.ts'); process.exit(1) }
const PROMPT = m[1]

const MEDIA = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const files = fs.readdirSync(dir).filter(f => MEDIA[path.extname(f).toLowerCase()])
if (files.length === 0) { console.error('No jpg/png/webp files in ' + dir); process.exit(1) }

let ok = 0
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f))
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: PROMPT,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: MEDIA[path.extname(f).toLowerCase()], data: buf.toString('base64') } },
        { type: 'text', text: 'Extract the full menu from the attached photo of a physical menu.' },
      ]}],
    }),
  })
  if (!res.ok) { console.log(`✗ ${f}: API ${res.status}`); continue }
  const body = await res.json()
  const text = (body.content?.[0]?.text || '').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '')
  try {
    const parsed = JSON.parse(text)
    const dishes = parsed.dishes || []
    const priced = dishes.filter(d => d.price != null).length
    const plausible = dishes.length >= 5
    if (plausible) ok++
    console.log(`${plausible ? '✓' : '✗'} ${f}: ${dishes.length} dishes (${priced} priced) — sections: ${[...new Set(dishes.map(d => d.menu_section))].slice(0, 5).join(', ')}`)
    for (const d of dishes.slice(0, 4)) console.log(`    ${d.name} · ${d.category} · ${d.price ?? '—'}`)
  } catch { console.log(`✗ ${f}: unparseable JSON (${text.slice(0, 80)}…)`) }
}
console.log(`\n${ok}/${files.length} photos produced a plausible menu. GO threshold: 8/10.`)
