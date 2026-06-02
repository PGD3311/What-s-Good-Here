/**
 * BentoBox menu adapter.
 *
 * BentoBox (getbento.com) is a restaurant CMS used by many upscale spots. Its
 * menus render client-side as JS tabs on a single URL, so the static HTML is a
 * navigation shell with no dish data — which makes the generic HTML-text
 * extractor hallucinate a handful of fake dishes (observed: Saltie Girl Boston
 * produced 6 wrong dishes, all priceless).
 *
 * BUT every BentoBox page embeds its menu as schema.org `@type: "Menu"`
 * JSON-LD (`hasMenuSection` -> `hasMenuItem` with `offers.price`). That data is
 * deterministic and price-complete, so parsing it is hallucination-proof.
 *
 * This module turns that JSON-LD into clean menu text. The caller feeds that
 * text into the existing Sonnet extractor, which keeps category mapping,
 * dietary/cuisine tagging, dedup, the price gate, and the "skip canned/retail
 * products" curation rules intact — we only fix the *input*.
 *
 * Hub vs tab pages: a BentoBox "menus" hub page (e.g. /boston-menus/) aggregates
 * every tab's JSON-LD, so one fetch usually suffices. When the configured URL is
 * a single tab, we follow same-origin /menu/<slug>/ links to gather siblings.
 */

export interface BentoMenuItem {
  section: string
  name: string
  price: number | null
  description: string | null
  /** Name of the schema.org Menu (BentoBox tab) this item came from, e.g. "All
   * Day" / "Brunch". '' when the Menu object had no name. Drives menu groups. */
  sourceMenu: string
  /** Resolved menu_group (pill label) — set by buildBentoBoxMenuText after the
   * pill rule runs. Undefined when the restaurant has no service/venue pills. */
  group?: string
}

/** Cheap signature check — BentoBox stamps getbento.com asset/CDN hosts everywhere. */
export function detectBentoBox(html: string): boolean {
  return /getbento\.com|bentoboxcloud|bentobox\.min\.js/i.test(html)
}

/** Coerce a schema.org price (string "14.00" | number | null) to a number or null. */
function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    if (!cleaned) return null
    const n = Number.parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Pull the first price out of an `offers` field that may be an object or array. */
function priceFromOffers(offers: unknown): number | null {
  if (Array.isArray(offers)) {
    for (const o of offers) {
      const p = o && typeof o === 'object' ? parsePrice((o as Record<string, unknown>).price) : null
      if (p != null) return p
    }
    return null
  }
  if (offers && typeof offers === 'object') {
    return parsePrice((offers as Record<string, unknown>).price)
  }
  return null
}

function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // Decode the few HTML entities BentoBox leaves in descriptions, collapse space.
  const t = raw
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length ? t : null
}

/**
 * Recursively collect MenuItems from a MenuSection tree. Sections can nest
 * (`hasMenuSection` inside `hasMenuSection`); items live under `hasMenuItem`.
 * `inheritedSection` carries the nearest named ancestor so items always get a
 * section label even when their immediate parent is unnamed.
 */
function collectFromSection(
  section: unknown,
  inheritedSection: string,
  sourceMenu: string,
  out: BentoMenuItem[]
): void {
  if (!section || typeof section !== 'object') return
  const s = section as Record<string, unknown>
  // When a section is unnamed in the JSON-LD, fall back to the menu/tab name
  // (e.g. an "Appetizers" tab with one unnamed section → section "Appetizers")
  // rather than a useless literal "Menu". Many BentoBox sites tab their courses
  // and leave the inner section blank.
  const sectionName = cleanText(s.name) || inheritedSection || sourceMenu || 'Menu'

  const items = s.hasMenuItem
  const itemArr = Array.isArray(items) ? items : items ? [items] : []
  for (const item of itemArr) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const name = cleanText(it.name)
    if (!name) continue
    out.push({
      section: sectionName,
      name,
      price: priceFromOffers(it.offers),
      description: cleanText(it.description),
      sourceMenu,
    })
  }

  const nested = s.hasMenuSection
  const nestedArr = Array.isArray(nested) ? nested : nested ? [nested] : []
  for (const child of nestedArr) {
    collectFromSection(child, sectionName, sourceMenu, out)
  }
}

/** Walk an arbitrary JSON-LD value, harvesting every `@type: "Menu"` it contains. */
function collectFromNode(node: unknown, out: BentoMenuItem[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectFromNode(n, out)
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  const isMenu = type === 'Menu' || (Array.isArray(type) && type.includes('Menu'))
  if (isMenu) {
    const menuName = cleanText(obj.name) || ''
    const sections = obj.hasMenuSection
    const sectionArr = Array.isArray(sections) ? sections : sections ? [sections] : []
    for (const sec of sectionArr) collectFromSection(sec, '', menuName, out)
  }
  // Recurse into every nested value so a Menu nested under another type is still
  // found — e.g. Restaurant -> hasMenu -> Menu, WebPage -> mainEntity, @graph
  // containers. MenuSection / MenuItem nodes never match isMenu, so this can't
  // double-collect items. Skip hasMenuSection (already consumed above) to avoid
  // re-walking the section tree.
  for (const key of Object.keys(obj)) {
    if (key === 'hasMenuSection') continue
    const value = obj[key]
    if (value && typeof value === 'object') collectFromNode(value, out)
  }
}

/** Extract every schema.org MenuItem from a page's JSON-LD blocks. */
export function parseSchemaOrgMenuItems(html: string): BentoMenuItem[] {
  const out: BentoMenuItem[] = []
  // Tolerate `type="application/ld+json; charset=utf-8"` and similar suffixes —
  // [^"']* after the media type matches any trailing parameters/whitespace.
  const re = /<script[^>]*type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const blob = m[1].trim()
    if (!blob) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(blob)
    } catch {
      continue
    }
    collectFromNode(parsed, out)
  }
  return out
}

/** Find same-origin /menu/<slug>/ tab links on a hub page (deduped, capped). */
export function findBentoMenuTabUrls(html: string, baseUrl: string, max = 8): string[] {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    return []
  }
  const urls = new Set<string>()
  // Slugs are usually lowercase-kebab, but tolerate uppercase + underscores.
  const re = /href=["']([^"']*\/menu\/[A-Za-z0-9_-]+\/?)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null && urls.size < max) {
    let abs: URL
    try {
      abs = new URL(m[1], base)
    } catch {
      continue
    }
    if (abs.hostname !== base.hostname) continue // bound SSRF: same-origin only
    abs.hash = ''
    urls.add(abs.toString())
  }
  return [...urls]
}

// Menu grouping (pills) mirrors a restaurant's distinct DINING menus. The clean
// structural signal ("multi-section tab") over-pills, because drink lists and
// course-tabs are multi-section too. So we use a hybrid: one "main" food menu
// (the largest), plus an extra pill ONLY for tabs whose name denotes a separate
// meal service or venue. Drinks and course-tabs fold into the main as sections.
// See docs/superpowers/plans/2026-05-31-auto-menu-groups.md.

// Distinct meal services / venues → eligible to be their own pill alongside
// main. Deliberately excludes "raw bar"/"oyster bar" (those are sections, not
// separate menus) and all drink terms (handled by DRINK_MENU_PATTERN).
const MEAL_VENUE_PATTERN =
  /\b(breakfast|brunch|lunch|dinner|supper|happy[\s-]*hour|late[\s-]*night|upstairs|downstairs|patio|rooftop)\b/i

// Drink-only menus — never a dining pill. Their items fold into main (wine/beer
// get dropped by the extractor's beverage rules anyway; cocktails become a
// section). Listed BEFORE meal/venue so "Bar" stays out of pills.
const DRINK_MENU_PATTERN =
  /\b(wines?|beers?|cocktails?|libations?|beverages?|drinks?|ciders?|spirits?|sake|mocktails?|on[\s-]*tap|by[\s-]*the[\s-]*glass)\b/i

// Retail/conservas tabs (Tin List, Conservas…) — never a pill, fold into main;
// the tinned program is then dropped by the conservas prompt rule.
const RETAIL_MENU_PATTERN =
  /\b(tin|tins|tinned|conservas?|retail|market|merch|bottle\s*shop|cellar)\b/i

export interface SourceMenuStats {
  name: string
  itemCount: number
}

/** A drink or retail tab that can never be a dining pill (folds into main). */
function isFoldMenu(name: string): boolean {
  return DRINK_MENU_PATTERN.test(name) || RETAIL_MENU_PATTERN.test(name)
}

/**
 * Decide menu groups (pills) from the source menus.
 *
 * Hybrid rule: the "main" group is the largest FOOD menu (non-drink/retail,
 * named). An additional pill is created only for a food menu whose name denotes
 * a distinct meal service or venue (Brunch, Lunch, Dinner, Happy Hour,
 * Upstairs…). Course-tabs (Antipasti/Entrees/Dessert), drink lists, and retail
 * tabs all fold into the main group as sections. Returns null (stay flat) unless
 * ≥2 groups result. Returns each source-menu → resolved group + ordered groups.
 */
export function classifyMenuGroups(
  menus: SourceMenuStats[]
): { groupOf: Map<string, string>; order: string[] } | null {
  // Food menus: named, not drink/retail, with at least one dish.
  const foodMenus = menus.filter((m) => m.name.trim() !== '' && m.itemCount > 0 && !isFoldMenu(m.name))
  if (foodMenus.length === 0) return null

  // main = largest food menu by item count (tie → first in source order).
  let main = foodMenus[0]
  for (const m of foodMenus) {
    if (m.itemCount > main.itemCount) main = m
  }
  const mainName = main.name

  // Extra pills = food menus (other than main) named like a meal service/venue.
  const groupOf = new Map<string, string>()
  const order: string[] = [mainName]
  for (const m of menus) {
    if (m.name === mainName) {
      groupOf.set(m.name, mainName)
    } else if (!isFoldMenu(m.name) && m.name.trim() !== '' && m.itemCount > 0 && MEAL_VENUE_PATTERN.test(m.name)) {
      groupOf.set(m.name, m.name) // distinct meal/venue → its own pill
      if (!order.includes(m.name)) order.push(m.name)
    } else {
      groupOf.set(m.name, mainName) // courses, drinks, retail → fold into main
    }
  }

  if (order.length < 2) return null
  return { groupOf, order }
}

/** Dedup items by (section|name), keeping the first occurrence. */
export function dedupeBentoItems(items: BentoMenuItem[]): BentoMenuItem[] {
  const seen = new Set<string>()
  const out: BentoMenuItem[] = []
  for (const it of items) {
    const key = `${it.section.toLowerCase()}|${it.name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function itemLine(it: BentoMenuItem): string {
  const price = it.price != null ? ` — $${it.price.toFixed(2)}` : ''
  const desc = it.description ? ` — ${it.description}` : ''
  return `- ${it.name}${price}${desc}`
}

/**
 * Serialize structured items into clean menu text for Sonnet.
 *
 * When `groupOrder` is given (the restaurant has pills), emit `GROUP: <label>`
 * markers above each group's sections so Sonnet can carry menu_group through.
 * Otherwise emit a flat section list (single-menu restaurants).
 */
export function serializeBentoItems(items: BentoMenuItem[], groupOrder?: string[]): string {
  const lines: string[] = []
  const emitSections = (groupItems: BentoMenuItem[]) => {
    const bySection = new Map<string, BentoMenuItem[]>()
    for (const it of groupItems) {
      const arr = bySection.get(it.section) ?? []
      arr.push(it)
      bySection.set(it.section, arr)
    }
    for (const [section, arr] of bySection) {
      lines.push(`SECTION: ${section}`)
      for (const it of arr) lines.push(itemLine(it))
      lines.push('')
    }
  }

  if (groupOrder && groupOrder.length > 0) {
    for (const group of groupOrder) {
      const groupItems = items.filter((it) => (it.group ?? '') === group)
      if (groupItems.length === 0) continue
      lines.push(`GROUP: ${group}`)
      emitSections(groupItems)
    }
  } else {
    emitSections(items)
  }
  return lines.join('\n').trim()
}

export interface BentoBoxMenuResult {
  text: string
  itemCount: number
  pagesUsed: number
  /** Ordered pill labels (≥2 ⇒ the restaurant gets pills). Empty when flat. */
  groupOrder: string[]
  /** menu_section → menu_group for sections that map to exactly one group.
   * Lets the handler deterministically backfill menu_group if Sonnet drops a
   * GROUP label. Ambiguous sections (same name in >1 group) are omitted. */
  sectionGroups: Record<string, string>
}

/**
 * Build clean menu text from a BentoBox site's JSON-LD.
 *
 * Parses the current page first. If that already yields a substantial menu
 * (more than `tabAugmentThreshold` items — i.e. it was a hub page), we stop.
 * Otherwise we follow same-origin /menu/<slug>/ tab links and merge their
 * JSON-LD so a single-tab menu_url still gathers the full menu.
 *
 * Returns null when no MenuItems are found (caller falls back to the normal
 * extraction path). `fetchHtml` is injected so this module stays network- and
 * test-agnostic; it should return '' for any non-HTML (e.g. PDF) response.
 */
export async function buildBentoBoxMenuText(opts: {
  rawHtml: string
  menuUrl: string
  fetchHtml: (url: string) => Promise<string>
  maxTabPages?: number
  tabAugmentThreshold?: number
  /**
   * Whether to follow same-origin /menu/<slug>/ sibling links to augment a thin
   * page. That crawl is BentoBox's tab convention, so it's only meaningful for
   * BentoBox sites. The JSON-LD parse itself is generic — any page exposing
   * schema.org Menu data benefits even with crawlTabs off. Defaults true.
   */
  crawlTabs?: boolean
}): Promise<BentoBoxMenuResult | null> {
  const { rawHtml, menuUrl, fetchHtml } = opts
  const maxTabPages = opts.maxTabPages ?? 8
  const tabAugmentThreshold = opts.tabAugmentThreshold ?? 10
  const crawlTabs = opts.crawlTabs ?? true

  const items = parseSchemaOrgMenuItems(rawHtml)
  let pagesUsed = 1

  // Only crawl sibling tabs when the current page didn't already aggregate a
  // full menu — avoids 6 redundant fetches on a hub page that has everything.
  if (crawlTabs && items.length <= tabAugmentThreshold) {
    const tabUrls = findBentoMenuTabUrls(rawHtml, menuUrl, maxTabPages)
    for (const url of tabUrls) {
      if (url === menuUrl) continue
      try {
        const tabHtml = await fetchHtml(url)
        if (!tabHtml) continue
        const tabItems = parseSchemaOrgMenuItems(tabHtml)
        if (tabItems.length > 0) {
          items.push(...tabItems)
          pagesUsed++
        }
      } catch {
        // Best-effort: a failed tab fetch just contributes nothing.
      }
    }
  }

  if (items.length === 0) return null

  // Decide menu groups (pills) from each source menu's item count, in first-seen
  // order.
  const counts = new Map<string, number>()
  const menuOrder: string[] = []
  for (const it of items) {
    const m = it.sourceMenu || ''
    if (!counts.has(m)) menuOrder.push(m)
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const menus: SourceMenuStats[] = menuOrder.map((name) => ({ name, itemCount: counts.get(name)! }))
  const classified = classifyMenuGroups(menus)

  let groupOrder: string[] = []
  if (classified) {
    groupOrder = classified.order
    for (const it of items) it.group = classified.groupOf.get(it.sourceMenu || '')
    // Order items so groups appear main-first; dedup then keeps the main-group
    // copy of any dish shared across menus (e.g. towers listed in All Day AND
    // Brunch), so a pill shows only its exclusive dishes.
    const rank = new Map(groupOrder.map((g, i) => [g, i]))
    items.sort((a, b) => (rank.get(a.group ?? '') ?? 999) - (rank.get(b.group ?? '') ?? 999))
  }

  const deduped = dedupeBentoItems(items)
  if (deduped.length === 0) return null

  // Build section → group, omitting sections that span more than one group
  // (ambiguous — those rely on Sonnet's per-dish GROUP label instead).
  const sectionGroups: Record<string, string> = {}
  if (classified) {
    const seen = new Map<string, string | null>()
    for (const it of deduped) {
      if (!it.group) continue
      const prev = seen.get(it.section)
      if (prev === undefined) seen.set(it.section, it.group)
      else if (prev !== it.group) seen.set(it.section, null) // ambiguous
    }
    for (const [section, group] of seen) {
      if (group) sectionGroups[section] = group
    }
  }

  return {
    text: serializeBentoItems(deduped, groupOrder),
    itemCount: deduped.length,
    pagesUsed,
    groupOrder,
    sectionGroups,
  }
}
