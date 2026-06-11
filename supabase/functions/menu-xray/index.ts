// supabase/functions/menu-xray/index.ts
// Menu X-Ray: photo -> Claude vision extraction -> pg_trgm match -> quiet ingest.
// Self-contained folder (no ../_shared imports) so dashboard deploy works.
// Guests: full overlay, metadata-only logging, fail-closed IP rate limit.
// Logged-in: + photo proof in private bucket, + quiet ingest (capped, gated).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  MENU_EXTRACTION_PROMPT, validateImagePayload,
  decideMatches, buildIngestList, type ExtractedItem, type MatchRow,
} from './lib.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(req), 'Content-Type': 'application/json' },
  })
}
function clientIp(req: Request): string {
  // cf-connecting-ip is set by the trusted edge and can't be client-forged.
  // For x-forwarded-for, proxies APPEND — the FIRST entry is client-suppliable,
  // so take the LAST (added by the proxy closest to us).
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean)
  return xff.length > 0 ? xff[xff.length - 1] : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' })

  try {
    const { restaurant_id, image_base64, media_type } = await req.json()
    if (!restaurant_id || typeof restaurant_id !== 'string') {
      return json(req, 400, { error: 'restaurant_id required' })
    }
    const valid = validateImagePayload(image_base64, media_type)
    if (!valid.ok) return json(req, 400, { error: valid.error })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Who's calling? Guests are allowed (no user) — supabase-js always sends the
    // anon JWT, so getUser() returning null IS the guest signal.
    const authHeader = req.headers.get('Authorization') || ''
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await authClient.auth.getUser()

    // Rate limit: user-keyed for logged-in, fail-closed IP for guests.
    // Known trade-off: a rate-limited user can log out and get the guest IP
    // quota (10/hr) on top — bounded at ~$0.30/hr/IP of LLM spend, and we
    // deliberately don't IP-limit logged-in users because island restaurant
    // wifi + carrier CGNAT put many legit users behind one IP.
    if (user) {
      const { data: rl } = await authClient.rpc('check_menu_scan_rate_limit')
      if (!rl?.allowed) return json(req, 429, { error: rl?.message || 'Rate limited', retry_after: rl?.retry_after_seconds })
    } else {
      const { data: rl } = await service.rpc('check_and_record_ip_rate_limit_strict', {
        p_ip: clientIp(req), p_action: 'menu_scan_ip', p_max_attempts: 10, p_window_seconds: 3600,
      })
      if (!rl?.allowed) return json(req, 429, { error: rl?.message || 'Rate limited', retry_after: rl?.retry_after_seconds })
    }

    // Restaurant must exist (also anchors all writes).
    const { data: restaurant } = await service
      .from('restaurants').select('id, name').eq('id', restaurant_id).maybeSingle()
    if (!restaurant) return json(req, 404, { error: 'Restaurant not found' })

    // ---- Claude vision extraction ----
    if (!ANTHROPIC_API_KEY) return json(req, 500, { error: 'Extraction not configured' })
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: MENU_EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
          { type: 'text', text: `Extract the full menu from "${restaurant.name}" from the attached photo of a physical menu.` },
        ]}],
      }),
    })
    if (!aiRes.ok) return json(req, 502, { error: 'Could not read the menu — try again' })
    const aiBody = await aiRes.json()
    const raw = (aiBody.content?.[0]?.text || '').replace(/^```(json)?\n?/, '').replace(/\n?```$/, '')
    let parsed: { dishes?: ExtractedItem[]; not_a_menu?: boolean }
    try { parsed = JSON.parse(raw) } catch { return json(req, 502, { error: 'Could not read the menu — try again' }) }

    if (parsed.not_a_menu) {
      await service.from('menu_scans').insert({
        restaurant_id, user_id: user?.id ?? null, extracted: { not_a_menu: true },
        matched_count: 0, ingested_count: 0,
      })
      return json(req, 200, { not_a_menu: true })
    }
    const items = (parsed.dishes || []).filter((d) => d?.name && typeof d.name === 'string')
    if (items.length === 0) return json(req, 200, { unreadable: true })

    // ---- Match against this restaurant's dishes ----
    const { data: matchRows, error: matchError } = await service.rpc('match_menu_dishes', {
      p_restaurant_id: restaurant_id, p_names: items.map((d) => d.name),
    })
    if (matchError) return json(req, 500, { error: 'Matching failed' })
    const accepted = decideMatches(items, (matchRows || []) as MatchRow[])

    // ---- Quiet ingest (logged-in only, throttled) ----
    const ingested: string[] = []
    if (user) {
      const { data: ingestRl } = await authClient.rpc('check_menu_ingest_rate_limit')
      if (ingestRl?.allowed) {
        const { data: existing } = await service
          .from('dishes').select('id, name, category, price').eq('restaurant_id', restaurant_id)
        const toInsert = buildIngestList(items, new Set(accepted.keys()), existing || []).slice(0, 40)
        for (const dish of toInsert) {
          // Per-row insert so the offensive-name trigger only skips that row.
          const { error } = await service.from('dishes').insert({
            restaurant_id, created_by: user.id, ...dish,
          })
          if (!error) ingested.push(dish.name)
        }
      }
    }

    // ---- Photo proof (logged-in only) + audit row ----
    let photoPath: string | null = null
    if (user) {
      const scanFile = `${restaurant_id}/${crypto.randomUUID()}.jpg`
      const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0))
      const { error: upErr } = await service.storage.from('menu-scans')
        .upload(scanFile, bytes, { contentType: media_type })
      if (!upErr) photoPath = scanFile
    }
    // Audit logging must never turn a successful scan into a 500 — by this
    // point the user-visible work (and any ingest) already happened.
    const { error: auditError } = await service.from('menu_scans').insert({
      restaurant_id, user_id: user?.id ?? null, photo_path: photoPath,
      extracted: { dishes: items }, matched_count: accepted.size, ingested_count: ingested.length,
    })
    if (auditError) console.error('[menu-xray] audit insert failed:', auditError.message)

    // ---- Response payload ----
    const sectionOrder: string[] = []
    const sectionMap = new Map<string, Array<Record<string, unknown>>>()
    for (const item of items) {
      const section = item.menu_section || 'Menu'
      if (!sectionMap.has(section)) { sectionMap.set(section, []); sectionOrder.push(section) }
      const m = accepted.get(item.name)
      sectionMap.get(section)!.push({
        name: item.name, price: item.price ?? null, category: item.category,
        match: m ? { dishId: m.dish_id, dishName: m.dish_name, avgRating: m.avg_rating, totalVotes: m.total_votes, similarity: m.sim } : null,
        ingested: ingested.includes(item.name),
      })
    }
    let best: Record<string, unknown> | null = null
    for (const m of accepted.values()) {
      // MIN_VOTES_FOR_RANKING mirror: keep in sync with src/constants/app.js
      if (m.total_votes >= 3 && m.avg_rating !== null) {
        if (!best || (m.avg_rating as number) > (best.avgRating as number)) {
          best = { dishId: m.dish_id, name: m.dish_name, avgRating: m.avg_rating, totalVotes: m.total_votes }
        }
      }
    }
    return json(req, 200, {
      restaurant: { id: restaurant.id, name: restaurant.name },
      sections: sectionOrder.map((name) => ({ name, items: sectionMap.get(name) })),
      best,
      summary: { matched: accepted.size, ingested: ingested.length, total: items.length },
    })
  } catch (error) {
    console.error('[menu-xray]', error)
    return json(req, 500, { error: 'Scan failed — try again' })
  }
})
