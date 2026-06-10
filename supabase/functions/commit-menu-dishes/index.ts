import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * commit-menu-dishes Edge Function
 *
 * The TRUSTED write path for the menu-photo snap flow. Loads an existing
 * extraction row from `menu_photo_extractions`, verifies ownership + freshness
 * + replay guard, and upserts the caller-selected dishes into `dishes` using
 * server-stored trusted fields only. The client can NOT inject or override any
 * dish field other than a numeric price correction; all names / categories /
 * sections / descriptions / dietary tags come from the server-stored extraction.
 *
 * Auth:        JWT required (anon client + getUser, same as extract-menu-from-photo).
 * Rate limit:  6/hour via check_and_record_rate_limit.
 * Write:       Service-role client; updates dishes table only after all verifications pass.
 *
 * Input:  { extraction_id: uuid, includes: number[], price_overrides?: Record<string, number> }
 * Output: { inserted: number, updated: number, skipped: number }
 *
 * Spec: docs/superpowers/specs/2026-06-09-menu-photo-fallback-design.md §2b
 */

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh normalizeDishKey + its inline constants — keep in sync
// Source: supabase/functions/menu-refresh/index.ts lines 55–103
// Used for secondary dedupe when exact-lowercase-name lookup misses.
// ---------------------------------------------------------------------------
const NORMALIZE_STOPWORDS_INLINE = new Set([
  'the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'over', 'n',
])
const NORMALIZE_ABBREV_INLINE: Record<string, string> = {
  chix: 'chicken', chkn: 'chicken', brgr: 'burger', burg: 'burger',
}
const CATEGORY_REDUNDANT_WORDS_INLINE: Record<string, string[]> = {
  donuts: ['donut', 'donuts'],
  burger: ['burger', 'burgers'],
  pizza: ['pizza', 'pizzas'],
  salad: ['salad', 'salads'],
  sandwich: ['sandwich', 'sandwiches'],
  'fish-sandwich': ['sandwich', 'sandwiches'],
  taco: ['taco', 'tacos'],
  burrito: ['burrito', 'burritos'],
  enchiladas: ['enchilada', 'enchiladas'],
  fries: ['fries'],
  'onion rings': ['rings'],
  pasta: ['pasta', 'pastas'],
  wrap: ['wrap', 'wraps'],
  wings: ['wings', 'wing'],
  cookie: ['cookie', 'cookies'],
}
const NUMERIC_PAREN_RE_INLINE = /\([^)]*\d[^)]*\)/g

function normalizeDishKey(rawName: string, category: string | null | undefined): string {
  if (!rawName) return ''
  const cat = (category || '').toLowerCase().trim()
  const lowered = rawName.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const protectedParens = lowered.replace(NUMERIC_PAREN_RE_INLINE, (m) => {
    const digits = m.match(/\d+/g)?.join('-') ?? ''
    return ` qty${digits} `
  })
  const cleaned = protectedParens
    .replace(/[*]/g, ' ')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const redundant = new Set(CATEGORY_REDUNDANT_WORDS_INLINE[cat] || [])
  const tokens = cleaned
    .split(' ')
    .map((t) => NORMALIZE_ABBREV_INLINE[t] ?? t)
    .filter((t) => t && !NORMALIZE_STOPWORDS_INLINE.has(t))
  const filtered = tokens.filter((t) => !redundant.has(t))
  const final = filtered.length > 0 ? filtered : tokens
  return final.slice().sort().join(' ')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StoredDish {
  name: string
  category: string
  menu_group: string | null
  menu_section: string | null
  price: number | null
  description: string | null
  dietary_tags: string[]
}

interface ExistingDish {
  id: string
  name: string
  category: string
  menu_group: string | null
  menu_section: string | null
  price: number | null
  description: string | null
  dietary_tags: string[]
  created_at: string
}

// ---------------------------------------------------------------------------
// UUID validation regex — same as extract-menu-from-photo
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Maximum dishes per extraction commit (safety cap)
const MAX_DISHES_PER_COMMIT = 120

// Extraction row expires after 1 day
const EXTRACTION_TTL_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  // CORS / preflight — MIRROR of extract-menu-from-photo pattern
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // Auth gate — MIRROR of extract-menu-from-photo JWT auth pattern
  // Source: supabase/functions/extract-menu-from-photo/index.ts lines 473–491
  // Require an authenticated caller. The anon client + getUser() verifies the
  // JWT without requiring service-role; it also provides the caller's user.id
  // which we later compare against the extraction row's user_id.
  // ---------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // Parse + validate input
  // Client may only supply: extraction_id (uuid), includes (int[]), price_overrides (Record<string,number>).
  // NO dish field (name/category/section/description/tags) is read from here.
  // ---------------------------------------------------------------------------
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Validate extraction_id
  const extractionId = typeof body.extraction_id === 'string' ? body.extraction_id.trim() : ''
  if (!extractionId || !UUID_RE.test(extractionId)) {
    return new Response(JSON.stringify({ error: 'extraction_id must be a valid UUID' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Validate includes
  const rawIncludes = body.includes
  if (!Array.isArray(rawIncludes) || rawIncludes.length === 0) {
    return new Response(JSON.stringify({ error: 'includes must be a non-empty array of indices' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Filter to valid integers only; silently drop non-integers. Dedupe so a
  // repeated index can't double-write the same dish.
  const includes: number[] = [...new Set(
    (rawIncludes as unknown[])
      .filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0),
  )]

  if (includes.length === 0) {
    return new Response(JSON.stringify({ error: 'includes must contain at least one valid non-negative integer index' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Parse price_overrides — only numeric values in [0, 1000] are accepted.
  // Keys are stringified indices. Invalid entries are silently ignored.
  const rawOverrides = body.price_overrides
  const priceOverrides: Record<string, number> = {}
  if (rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides)) {
    for (const [k, v] of Object.entries(rawOverrides as Record<string, unknown>)) {
      if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1000) {
        priceOverrides[k] = v
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rate limit — MIRROR of extract-menu-from-photo check_and_record_rate_limit call
  // Source: supabase/functions/extract-menu-from-photo/index.ts lines 647–657
  // Action 'commit_menu_dishes', limit 6/hour (spec §2b + §1 rate-limit table)
  // ---------------------------------------------------------------------------
  const { data: rateCheck, error: rateErr } = await authClient.rpc('check_and_record_rate_limit', {
    p_action: 'commit_menu_dishes',
    p_max_attempts: 6,
    p_window_seconds: 3600,
  })
  // Fail CLOSED: if the RPC errored or returned no result, block the request.
  // Only proceed when the RPC explicitly grants access (allowed === true).
  if (rateErr || !rateCheck || rateCheck.allowed !== true) {
    const isRateLimit = rateCheck && rateCheck.allowed === false
    return new Response(
      JSON.stringify(
        isRateLimit
          ? { error: 'Rate limit exceeded', retry_after: rateCheck.retry_after_seconds }
          : { error: 'Rate limit unavailable' },
      ),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  // ---------------------------------------------------------------------------
  // Service-role client — MIRROR of menu-refresh service-role creation
  // Source: supabase/functions/menu-refresh/index.ts lines 1332–1334
  // Used for all reads/writes below: menu_photo_extractions + dishes.
  // ---------------------------------------------------------------------------
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseServiceKey) {
    console.error('commit-menu-dishes: SUPABASE_SERVICE_ROLE_KEY not configured')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  // ---------------------------------------------------------------------------
  // Load + verify the extraction row — GUARDS 1, 2, 4 via a preliminary SELECT
  //
  // (1) Row exists                      → 404 if not
  // (2) row.user_id === authUser.id     → 403 if mismatch
  // (4) now - row.created_at <= 1 day   → 410 if expired
  //
  // Guard (3) — replay guard — is enforced ATOMICALLY below via a conditional
  // UPDATE ... IS NULL instead of a JS check, which would be a TOCTOU race.
  //
  // We need the preliminary SELECT only for guards 1/2/4 because they require
  // distinct status codes; without it, a missing/forbidden/expired row and an
  // already-consumed row would all silently appear as "no row returned" from
  // the atomic UPDATE.
  // ---------------------------------------------------------------------------
  const { data: extraction, error: fetchErr } = await serviceClient
    .from('menu_photo_extractions')
    .select('id, user_id, created_at')
    .eq('id', extractionId)
    .maybeSingle()

  if (fetchErr) {
    console.error('commit-menu-dishes: failed to load extraction', fetchErr.message)
    return new Response(JSON.stringify({ error: 'Failed to load extraction' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Guard (1): row must exist
  if (!extraction) {
    return new Response(JSON.stringify({ error: 'Extraction not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Guard (2): caller must own the extraction
  if (extraction.user_id !== authUser.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Guard (4): extraction must not be expired (> 1 day old)
  const createdAt = new Date(extraction.created_at).getTime()
  if (Date.now() - createdAt > EXTRACTION_TTL_MS) {
    return new Response(JSON.stringify({ error: 'Extraction expired' }), {
      status: 410,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // Guard (3) — ATOMIC replay claim (replaces JS consumed_at check + late UPDATE)
  //
  // A single conditional UPDATE that sets consumed_at only when it IS NULL.
  // Returns the full trusted dish data in the same round-trip. If another
  // concurrent request claimed the row first, this UPDATE returns zero rows
  // (claimed === null) → 409 without any TOCTOU window.
  //
  // This is the ONLY place consumed_at is set; the late UPDATE block is gone.
  // ---------------------------------------------------------------------------
  const { data: claimed, error: claimErr } = await serviceClient
    .from('menu_photo_extractions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', extractionId)
    .is('consumed_at', null)
    .select('dishes, menu_section_order, restaurant_id, user_id')
    .maybeSingle()

  if (claimErr) {
    console.error('commit-menu-dishes: failed to claim extraction', claimErr.message)
    return new Response(JSON.stringify({ error: 'Failed to claim extraction' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!claimed) {
    // Race lost or already consumed
    return new Response(JSON.stringify({ error: 'Extraction already committed' }), {
      status: 409,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // Build the dish set from the STORED extraction row (server-trusted fields)
  //
  // IMPORTANT: dish name, category, menu_section, menu_group, description, and
  // dietary_tags come EXCLUSIVELY from claimed.dishes (the server-stored row).
  // The client supplied only integer indices (includes) and optional numeric
  // price corrections (priceOverrides). No other client field is read here.
  //
  // Lines where trusted data is sourced from the stored row:
  //   name:          storedDish.name
  //   category:      storedDish.category
  //   menu_section:  storedDish.menu_section
  //   menu_group:    storedDish.menu_group   (only if non-null)
  //   description:   storedDish.description
  //   dietary_tags:  storedDish.dietary_tags
  //   price:         storedDish.price, overridden ONLY by a validated numeric in [0,1000]
  // ---------------------------------------------------------------------------
  const storedDishes: StoredDish[] = Array.isArray(claimed.dishes) ? claimed.dishes : []

  const dishesToCommit: StoredDish[] = []
  for (const idx of includes) {
    // Skip out-of-range indices silently (client may have stale knowledge)
    if (idx < 0 || idx >= storedDishes.length) continue
    const storedDish = storedDishes[idx]
    if (!storedDish || typeof storedDish.name !== 'string' || !storedDish.name.trim()) continue

    // Apply price override only if it was validated above (finite, [0,1000])
    const overrideKey = String(idx)
    const price = overrideKey in priceOverrides
      ? priceOverrides[overrideKey]
      : (typeof storedDish.price === 'number' ? storedDish.price : null)

    // Build the final dish — ALL text fields from the stored row
    dishesToCommit.push({
      name: storedDish.name,
      category: storedDish.category,
      menu_section: typeof storedDish.menu_section === 'string' ? storedDish.menu_section : null,
      menu_group: typeof storedDish.menu_group === 'string' && storedDish.menu_group.trim()
        ? storedDish.menu_group.trim()
        : null,
      price,
      description: typeof storedDish.description === 'string' && storedDish.description.trim()
        ? storedDish.description.trim()
        : null,
      dietary_tags: Array.isArray(storedDish.dietary_tags) ? storedDish.dietary_tags : [],
    })

    // Cap at 120 dishes
    if (dishesToCommit.length >= MAX_DISHES_PER_COMMIT) break
  }

  if (dishesToCommit.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid dishes to commit after index filtering' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // Load existing dishes for this restaurant (service role, ordered by created_at asc
  // so oldest row wins on duplicate keys — same tiebreaker as menu-refresh)
  // ---------------------------------------------------------------------------
  const { data: existingRows, error: existingErr } = await serviceClient
    .from('dishes')
    .select('id, name, category, menu_group, menu_section, price, description, dietary_tags, created_at')
    .eq('restaurant_id', claimed.restaurant_id)
    .order('created_at', { ascending: true })

  if (existingErr) {
    console.error('commit-menu-dishes: failed to load existing dishes', existingErr.message)
    return new Response(JSON.stringify({ error: 'Failed to load existing dishes' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const existing: ExistingDish[] = existingRows || []

  // ---------------------------------------------------------------------------
  // Build dedupe maps — oldest row wins (guard with has() so later rows don't
  // overwrite an earlier entry). Two lookup strategies:
  //   1. Exact lowercase name (fast path)
  //   2. normalizeDishKey(name, category) (fuzzy fallback for abbreviations /
  //      punctuation variants — mirrors menu-refresh upsert logic)
  //
  // MIRROR of menu-refresh upsert dedupe maps
  // Source: supabase/functions/menu-refresh/index.ts lines 1162–1180
  // ---------------------------------------------------------------------------
  const exactNameMap = new Map<string, ExistingDish>()
  const normalizedKeyMap = new Map<string, ExistingDish>()

  for (const row of existing) {
    const exactKey = row.name.toLowerCase()
    if (!exactNameMap.has(exactKey)) {
      exactNameMap.set(exactKey, row)
    }
    const normKey = normalizeDishKey(row.name, row.category)
    if (normKey && !normalizedKeyMap.has(normKey)) {
      normalizedKeyMap.set(normKey, row)
    }
  }

  // ---------------------------------------------------------------------------
  // Upsert loop — for each dish to commit:
  //   - Find existing by exact lowercase name, else by normalized key
  //   - If found: UPDATE only changed fields (never delete, preserve votes/photos)
  //   - If not found: INSERT with created_via='menu_photo' + created_by=caller
  //   - Per-dish errors increment skipped and continue (don't abort the batch)
  //
  // FIX C: fuzzy (normalized-key) matches are gated by price agreement.
  // If both prices are non-null and differ by > 0.01, treat as a new dish
  // (INSERT) rather than an update to avoid merging differently-priced items.
  // Exact-name matches bypass this gate (name identity is sufficient).
  // ---------------------------------------------------------------------------

  /** Returns true when both prices agree or at least one is null. */
  function pricesAgree(a: number | null | undefined, b: number | null | undefined): boolean {
    if (a == null || b == null) return true
    return Math.abs(a - b) <= 0.01
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const dish of dishesToCommit) {
    const exactKey = dish.name.toLowerCase()
    const normKey = normalizeDishKey(dish.name, dish.category)

    const exactMatch = exactNameMap.get(exactKey)
    const fuzzyMatch = normKey ? normalizedKeyMap.get(normKey) : undefined

    // Apply price-agreement gate to fuzzy matches only.
    const fuzzyAllowed = fuzzyMatch && pricesAgree(dish.price, fuzzyMatch.price)
    const existingDish = exactMatch ?? (fuzzyAllowed ? fuzzyMatch : undefined)

    if (existingDish) {
      // UPDATE only the fields that changed — never delete, preserve votes/photos.
      // menu_group is only written when the incoming value is non-null (preserves
      // hand-curated groups, same guard as menu-refresh writeGroups pattern).
      const updates: Record<string, unknown> = {}

      if (dish.category !== existingDish.category) {
        updates.category = dish.category
      }
      if (dish.menu_section !== existingDish.menu_section) {
        updates.menu_section = dish.menu_section
      }
      // Only overwrite menu_group when this dish has a non-null group
      if (dish.menu_group !== null && dish.menu_group !== existingDish.menu_group) {
        updates.menu_group = dish.menu_group
      }
      if (dish.price !== null && dish.price !== existingDish.price) {
        updates.price = dish.price
      }
      if ((dish.description ?? null) !== (existingDish.description ?? null)) {
        updates.description = dish.description
      }
      // Dietary tags: compare sorted arrays
      const incomingTags = [...(dish.dietary_tags || [])].sort().join(',')
      const existingTags = [...(existingDish.dietary_tags || [])].sort().join(',')
      if (incomingTags !== existingTags) {
        updates.dietary_tags = dish.dietary_tags
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await serviceClient
          .from('dishes')
          .update(updates)
          .eq('id', existingDish.id)

        if (updateErr) {
          console.error('commit-menu-dishes: update failed for', dish.name, updateErr.message)
          skipped++
        } else {
          updated++
          // Keep dedupe maps consistent: add the existing dish's name under the
          // new name key in case later dishes in this batch would match it.
        }
      }
      // No changes → count as updated (idempotent, not an error)
      else {
        updated++
      }
    } else {
      // INSERT new dish — all text from trusted stored extraction
      const { data: insertedRow, error: insertErr } = await serviceClient
        .from('dishes')
        .insert({
          restaurant_id: claimed.restaurant_id,
          name: dish.name,
          category: dish.category,
          menu_section: dish.menu_section ?? null,
          menu_group: dish.menu_group ?? null,
          price: dish.price ?? null,
          description: dish.description ?? null,
          dietary_tags: dish.dietary_tags || [],
          created_via: 'menu_photo',
          created_by: authUser.id,
        })
        .select('id, name, category')
        .single()

      if (insertErr) {
        console.error('commit-menu-dishes: insert failed for', dish.name, insertErr.message)
        skipped++
      } else {
        inserted++
        // Add the newly inserted dish to dedupe maps so later dishes in this
        // same batch don't try to insert the same dish twice.
        if (insertedRow) {
          const newExisting: ExistingDish = {
            id: insertedRow.id,
            name: insertedRow.name,
            category: insertedRow.category,
            menu_group: dish.menu_group,
            menu_section: dish.menu_section,
            price: dish.price,
            description: dish.description,
            dietary_tags: dish.dietary_tags,
            created_at: new Date().toISOString(),
          }
          const newExactKey = insertedRow.name.toLowerCase()
          if (!exactNameMap.has(newExactKey)) exactNameMap.set(newExactKey, newExisting)
          const newNormKey = normalizeDishKey(insertedRow.name, insertedRow.category)
          if (newNormKey && !normalizedKeyMap.has(newNormKey)) normalizedKeyMap.set(newNormKey, newExisting)
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FIX B: Un-consume on TOTAL write failure so the user can retry.
  // If every dish failed (0 inserted + 0 updated, only skipped), reset
  // consumed_at to NULL so this extraction can be retried. Partial success
  // (some inserted/updated) stays consumed and returns 200 normally.
  // ---------------------------------------------------------------------------
  if (inserted === 0 && updated === 0 && skipped > 0) {
    await serviceClient
      .from('menu_photo_extractions')
      .update({ consumed_at: null })
      .eq('id', extractionId)
    return new Response(
      JSON.stringify({ error: 'commit failed' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ inserted, updated, skipped }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
