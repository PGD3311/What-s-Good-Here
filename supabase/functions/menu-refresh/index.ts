import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { detectCms, cmsRequiresRender } from './cms-detect.ts'
import { fetchRenderedHtml, BrowserlessError } from './browserless.ts'
import { discoverMenuCandidates, findMenuIframes, findSubMenuPages, isBlockedHostname, isKnownMenuIframeHost, type MenuCandidate } from './menu-candidates.ts'

// v1.3 dietary tag + description sanitizers (kept in sync with
// ./extractors.ts which exists for Vitest test coverage — Vitest can't
// import from this file because of the Deno URL imports above).
// Spec: docs/superpowers/specs/2026-05-18-dish-descriptions-dietary-tags-design.md
const ALLOWED_DIETARY_TAGS_INLINE = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'] as const
type AllowedDietaryTag = typeof ALLOWED_DIETARY_TAGS_INLINE[number]

function sanitizeDietaryTags(raw: unknown): AllowedDietaryTag[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<AllowedDietaryTag>()
  for (const t of raw) {
    if (typeof t === 'string' && (ALLOWED_DIETARY_TAGS_INLINE as readonly string[]).includes(t)) {
      seen.add(t as AllowedDietaryTag)
    }
  }
  return Array.from(seen)
}

function sanitizeDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed
}

function sortedArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false
  }
  return true
}

/**
 * Menu Refresh Edge Function
 *
 * Finds restaurants with menu_url where menu_last_checked is older than 14 days
 * (or never checked), fetches the menu page, uses Claude to extract dishes,
 * and upserts them into the database.
 *
 * Triggered by pg_cron every 2 weeks, or manually via POST.
 *
 * Can also process a single restaurant:
 *   POST { restaurant_id: "uuid" }
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://whats-good-here.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_CATEGORIES = [
  'pizza', 'burger', 'lobster roll', 'wings', 'sushi', 'breakfast',
  'seafood', 'chowder', 'pasta', 'steak', 'sandwich', 'salad',
  'taco', 'tendys', 'dessert', 'ice cream', 'fish', 'clams',
  'chicken', 'pork', 'breakfast sandwich', 'fried chicken', 'apps',
  'fries', 'entree', 'donuts', 'pokebowl', 'asian', 'quesadilla',
  'soup', 'ribs', 'duck', 'lamb', 'bruschetta', 'burrito',
  'calamari', 'crab', 'curry', 'lobster', 'mussels', 'onion rings',
  'pancakes', 'scallops', 'shrimp', 'waffles', 'wrap',
  'fish-and-chips', 'fish-sandwich', 'eggs-benedict',
  'oysters', 'pastry', 'coffee', 'drinks',
]

const MENU_EXTRACTION_PROMPT = `You are extracting a restaurant menu for a food discovery app. Your job is to produce output that mirrors the restaurant's actual menu — a user reading it should feel like they're looking at the real thing.

## Your #1 Priority: Faithfulness to the Source

The menu_section field and menu_section_order array must use the restaurant's EXACT section headings. If the menu says "From The Sea", you write "From The Sea" — not "Seafood", not "Fish Entrees". Copy the headings verbatim, preserving capitalization and punctuation.

Keep sections in the same order they appear on the menu. If "Raw Bar" comes before "Entrees" on the restaurant's menu, it comes first in your output.

Use the restaurant's exact dish names. If they call it "The Big Kahuna Burger", write that — don't shorten to "Kahuna Burger".

## WGH Category (Internal — Separate from Menu Section)

Each dish also gets a "category" field. This is OUR internal classification, NOT the restaurant's. A dish in the restaurant's "From The Sea" section might get category "lobster roll" or "scallops" or "fish-and-chips" depending on what it actually is.

Pick the MOST SPECIFIC category that fits. Prefer "lobster roll" over "seafood", "fish-and-chips" over "fish", "eggs-benedict" over "breakfast", "scallops" over "seafood", "calamari" over "apps".

### Valid Category IDs (use ONLY these)

| ID | Use For |
|---|---|
| pizza | Pizza, flatbreads |
| burger | Burgers |
| lobster roll | Lobster rolls specifically |
| lobster | Lobster entrees (not rolls) |
| wings | Wings |
| sushi | Sushi, sashimi, rolls |
| breakfast | Breakfast plates, eggs, omelets (not benedict, not pancakes/waffles) |
| eggs-benedict | Eggs benedict, lobster benedict |
| pancakes | Pancakes, french toast |
| waffles | Waffles |
| breakfast sandwich | Breakfast sandwiches, breakfast burritos, breakfast wraps |
| seafood | Seafood entrees that don't fit a more specific category |
| fish | Fish entrees (salmon, cod, swordfish, halibut, mahi) |
| fish-and-chips | Fish & chips, cod & chips |
| fish-sandwich | Fish sandwiches |
| scallops | Scallop dishes |
| shrimp | Shrimp dishes |
| crab | Crab cakes, crab entrees |
| calamari | Calamari, fried calamari |
| mussels | Mussel dishes |
| clams | Clam dishes (steamers, stuffed clams, clam strips) |
| oysters | Oysters (raw bar, oyster plates) |
| chowder | Clam chowder, any chowder |
| pasta | Pasta, risotto, linguine, ravioli |
| steak | Steak entrees, filet, ribeye, sirloin |
| sandwich | Sandwiches, BLTs, clubs, grilled cheese, hot dogs |
| wrap | Wraps |
| salad | Salads |
| taco | Tacos |
| burrito | Burritos |
| quesadilla | Quesadillas |
| tendys | Chicken tenders |
| fried chicken | Fried chicken sandwiches, fried chicken plates |
| chicken | Chicken entrees (not fried chicken, not tenders) |
| pork | Pork entrees, pork chops |
| ribs | Ribs |
| duck | Duck entrees |
| lamb | Lamb entrees |
| bruschetta | Bruschetta |
| apps | Appetizers, starters, shareable plates (only if no specific category fits) |
| fries | Fries, tater tots |
| onion rings | Onion rings |
| veggies | Vegetable-focused ENTREES only (veggie burger, veggie stir-fry) — not side dishes |
| soup | Soups (non-chowder) |
| dessert | Cakes, pies, brownies, sundaes |
| ice cream | Ice cream, gelato, frozen treats, milkshakes |
| donuts | Donuts, fritters |
| pastry | Pastries, croissants, scones, muffins |
| pokebowl | Poke bowls |
| asian | Asian entrees (pad thai, stir-fry) |
| curry | Curry dishes |
| coffee | Coffee drinks: drip, americano, espresso, latte, cappuccino, cortado, macchiato, mocha, flat white, cold brew, iced coffee |
| drinks | Handcrafted bar drinks: cocktails, mocktails, signature drinks, house specials. Bartender-prepared. NOT canned/bottled RTDs |
| entree | Catch-all for entrees that don't fit any specific category |

## Rules

1. **Extract EVERY food dish on the menu** — be thorough, don't skip items
2. **Coffee drinks ARE included** — categorize as \`coffee\`. This covers drip coffee, americano, espresso, latte, cappuccino, cortado, macchiato, mocha, flat white, cold brew, iced coffee, and other coffee preparations. **Skip alcoholic coffee drinks** (Irish coffee, espresso martini, coffee negroni, anything with a liqueur) — those go in \`drinks\` if they're house-made.

3. **Handcrafted bar drinks ARE included** — categorize as \`drinks\`. Decision rule: **include ONLY if** the menu shows mixed ingredients OR a classic/signature cocktail format (Old Fashioned, Margarita, Espresso Martini, French 75, mocktail variants, house spritz, signature negroni). **Exclude if** the item is sold as a packaged brand SKU (a brand name with a can/bottle, not a recipe).

   **Beer is NEVER \`drinks\`.** If a dish appears in a "Beer", "Draft", "Bottles", "Cans", "On Tap", "Brews" section, or if its name contains a beer-style token (\`IPA\`, \`lager\`, \`pilsner\`, \`stout\`, \`ale\`, \`porter\`, \`hefeweizen\`, \`saison\`, \`gose\`), exclude it — even if the name is creative ("Whale's Tale Pale Ale" is still beer).

   **Wine is NEVER \`drinks\`.** Wine by the glass, by the bottle, varietal listings (Chardonnay, Pinot, Cabernet, Rosé, sparkling) — all excluded. Champagne by the glass excluded. The only wine-related exception is a *house-made* preparation like sangria, mulled wine, or a wine cocktail — those count because the bar built them.

   **Skip canned/bottled ready-to-drink (RTD) products** — bartender pops a can; doesn't make it. Skip everything in these categories regardless of brand:
   - **Hard seltzers:** High Noon, White Claw, Truly, Sun Cruiser, Surfside, Cape Line, Mighty Swell, Crook & Marker, Vizzy, Topo Chico Hard Seltzer, NUTRL, Happy Dad, Cacti, Stateside, press/tea/vodka canned lines
   - **Canned cocktails:** Cutwater, On The Rocks, Tip Top, BeatBox, Loverboy, Monaco, Cayman Jack
   - **Malt beverages:** Smirnoff Ice, Mike's Hard, Twisted Tea, Cayman Jack
   - **Generic class language:** "hard lemonade", "hard tea", "hard seltzer", "canned cocktail", "RTD" → exclude
   - Anything marketed as "ready to drink" or sold by the can/bottle as a finished product

   **"House" terms — be strict.** "House pour", "house draft", "house red", "house white" all mean the restaurant's default cheap option — NOT a handcrafted drink. Exclude. Only include "house-made" when followed by a mixed/prepared drink (e.g., "house-made sangria", "house michelada", "house sour mix"). The word that matters is *made*, not *house*.

   **When in doubt:** creative name + ingredient list + cocktail price range ($12–$18) → include as \`drinks\`. Listed in a "Canned", "RTD", "Beer", "Wine", "On Tap" section → skip.

4. **Skip all OTHER beverages** — no juice, soda, lemonade (unless it's a clearly-labeled house cocktail), plain water, milk, plain tea, plain iced tea, kombucha, energy drinks. Complex non-alcoholic tea drinks on a serious cocktail menu (matcha latte cocktail, kombucha cocktail) count under \`drinks\` only if they have the cocktail-format signals from rule 3.

   **Coffee vs drinks precedence:** if an item is BOTH coffee AND alcoholic (espresso martini, Irish coffee, coffee negroni, white Russian, mudslide), route to \`drinks\` — alcoholic wins. Non-alcoholic coffee stays \`coffee\` (rule 2).
5. **Skip kids meals**
6. **Skip condiments** — extra sauce, side of dressing, bread roll
7. **Skip side dishes** — mashed potatoes, green beans, rice, coleslaw, steamed veggies, etc. NOT rateable.
8. **EXCEPTION: Fries and onion rings ARE included** — people rate these. Keep them.
9. **Deduplicate sizes, portions, and near-duplicate names within a menu section**:
   - **Size/portion variants** (Small/Medium/Large, 10"/14", Cup/Bowl, half/whole, lunch/dinner): output ONE entry per dish. Use the larger/dinner price.
   - **Near-duplicate names** (same menu_section, same category): if two dishes differ only by a redundant category suffix — "Margherita" vs "Margherita Pizza", "Caesar" vs "Caesar Salad", "Lobster" vs "Lobster Roll" when both are in the pizza / salad / lobster-roll section — they are the SAME dish listed twice. Output ONE entry. Prefer the shorter name (without the redundant category word).
   - **Genuinely different portions stay separate:** "Half Roast Chicken" vs "Whole Roast Chicken", "Kids Burger" vs "Burger" — output both.
   - **When in doubt:** if two dishes in the same section have names that a normal human would read as "the same dish at different prices," collapse them. Better to under-count than to duplicate.
10. **Prices: NEVER INVENT OR GUESS PRICES.** Only set a price if you can see an exact dollar amount next to that specific dish on the source page. If no explicit price is shown for a dish, the price field MUST be \`null\`. Do NOT infer prices from nearby dishes, category averages, or typical market values. Do NOT fill in \`18\` or any default. A null price is always better than a guessed price. If a range is shown (e.g. "$14-18"), use the lower number.
11. **One category per dish** — pick the most specific match
12. **Description rule:** Output a terse ingredient/preparation line, 80 chars or fewer, as \`description\`. Format: comma-separated nouns. Examples: "Hot lobster meat, drawn butter, split-top bun" / "Pepperoni, mozzarella, San Marzano tomato" / "Wagyu beef, bacon jam, brioche bun". If the menu has only marketing copy ("OUR SIGNATURE HAND-CRAFTED..."), output \`null\`. Never invent ingredients you don't see in the source.
13. **Dietary tags rule:** Output a \`dietary_tags\` array. Allowed tags (and only these): \`vegan\`, \`vegetarian\`, \`gluten_free\`, \`dairy_free\`, \`nut_free\`. **Only emit a tag when the menu definitively labels the dish as that diet** (not "available" or "on request"). This is an allergen-safety contract — a celiac diner trusts \`gluten_free\` to mean the dish is gluten-free as served, not "can be modified."

    **Conventional shorthand markers** — treat these as definitive when they appear as a badge, suffix, or column marker on a dish, even without a printed legend. These conventions are standard across restaurant menus:
    - \`V\` → \`vegetarian\`
    - \`VE\`, \`VG\`, \`VGN\`, \`V+\` → \`vegan\`
    - \`GF\` → \`gluten_free\`
    - \`DF\` → \`dairy_free\`
    - Combined like \`V/GF\` or \`(V, GF)\` → emit both tags
    - If the menu has its own printed legend (e.g., "V = Vegan"), defer to the legend instead of these defaults.

    **\`nut_free\` requires stricter evidence** — nut allergies can be anaphylactic. Emit \`nut_free\` ONLY when the menu uses the spelled-out phrase ("Nut-Free", "nut free", "free of tree nuts and peanuts"). Do NOT emit \`nut_free\` from a bare \`NF\` abbreviation — too rarely used and easily confused with "Not Featured", "New Flavor", etc.

    **\`PB\` is NOT a valid shorthand** — it commonly means "peanut butter" on dessert/coffee menus and is dangerous to interpret as "plant-based". Require the spelled-out "Plant-Based" / "plant based" / "Plant Based" phrase to emit \`vegan\` from this synonym.

    **Section-level inheritance.** If a menu section header is explicitly labeled with a diet ("VEGAN", "VEGETARIAN", "GLUTEN-FREE", "PLANT-BASED", "VEGAN OPTIONS", "GF MENU", "Plant-Based Bowls"), emit the corresponding tag ONLY for dishes listed directly under that header — the dishes structurally grouped beneath it before any visible section break, blank line, or new heading. Do NOT extend the label "until the next themed section" — in scraped HTML/PDF text, that boundary is unreliable and risks leaking labels across unrelated subsections.

    **Synonyms and phrasings to recognize:**
    - "Plant-Based" / "plant based" / "Plant Based" → \`vegan\` (NOT \`PB\` alone)
    - "Gluten-Free" / "Gluten Free" / "Gluten-free" → \`gluten_free\`
    - "Dairy-Free" / "Dairy Free" → \`dairy_free\`
    - "Nut-Free" / "nut free" / "free of nuts" → \`nut_free\`
    - "Vegan Buddha Bowl", "GF Pasta", "Dairy-Free Ice Cream" — name itself contains the label → emit
    - Explicit phrases like "All items are gluten-free" or "100% vegan menu" applied to a section → emit for every dish in scope

    **Do NOT emit:**
    - **Modifiable qualifiers:** "available", "on request", "can be made", "ask your server". "Gluten-Free Available" → no tag.
    - **Pure ingredient inference:** a tofu stir-fry with no animal products does NOT get \`vegan\` unless the menu labels it. A salad without croutons does NOT get \`gluten_free\` unless labeled.
    - **Allergen WARNINGS, not endorsements:** asterisk-footed lines like "\* contains nuts" or "Contains: dairy, gluten" are warnings about what the dish DOES have. These do NOT trigger the opposite \`nut_free\`/\`gluten_free\`/\`dairy_free\` tags. Only emit those tags from positive labels.
    - **Aspirational marketing:** "fresh ingredients", "wholesome", "natural" → no tags.

    Empty array \`[]\` when no marker, no section context, no synonym match. Never invent.

## CRITICAL: Reject placeholder/template content

If the content looks like a website template with placeholder text, return an EMPTY dishes array. Signs of template garbage:
- Generic dish names like "Burger", "Sandwich", "Salad", "Pasta" with NO specific name (e.g., no "Kahuna Burger" or "Caesar Salad")
- Placeholder descriptions like "Add a description here", "Lorem ipsum", "Your menu item", "Sample text"
- Multiple identical items with the same name and price (e.g., 9 items all called "Burger" at $16)
- Generic category headers with no actual dishes underneath

When in doubt: if dish names don't tell you what the actual dish IS (unique named dishes, not categories), return empty. Better to return nothing than fill the database with garbage.

## Output Format

Return ONLY valid JSON (no markdown, no code fences):
{
  "dishes": [
    {
      "name": "Dish Name",
      "category": "category_id",
      "menu_section": "Section Name",
      "price": 18.00,
      "description": "ingredient, ingredient, prep",
      "dietary_tags": ["vegan"]
    }
  ],
  "menu_section_order": ["Section 1", "Section 2"]
}`

interface ExtractedDish {
  name: string
  category: string
  menu_section: string
  price: number | null
  description: string | null
  dietary_tags: string[]
}

interface MenuExtractionResult {
  dishes: ExtractedDish[]
  menu_section_order: string[]
}

const MAX_RESTAURANTS_PER_RUN = 10
const STALE_DAYS = 14

// Identifies the extractor pipeline that produced the dishes currently stored
// for a restaurant. The hash short-circuit skips Sonnet only when BOTH
// restaurants.menu_content_hash matches the freshly-fetched HTML hash AND
// restaurants.extractor_fingerprint matches this constant. Bump the
// appropriate segment whenever something changes that affects what gets
// stored:
//   - model         : the Sonnet model identifier (current: sonnet-4-6)
//   - prompt        : the Sonnet system/user prompt revision
//   - pipeline      : extractors.ts sanitization, candidate scoring, strategy
//                     ordering (html/pdf/image/render), iframe-following
//   - features      : output-schema features (e.g. desc+dietary tags from PR #229)
// Format is intentionally human-readable so the stored value alone tells you
// which extractor produced a row — easier to debug than a bare integer.
const CURRENT_EXTRACTOR_FINGERPRINT = 'sonnet-4-6|prompt-v4|pipeline-v1|desc+dietary-v2|drinks-v1'

// Signals that a restaurant is closed (check before wasting Claude API call)
const CLOSED_SIGNALS = [
  /closed\s+(for\s+the\s+)?season/i,
  /closed\s+for\s+winter/i,
  /temporarily\s+closed/i,
  /permanently\s+closed/i,
  /opening\s+(in\s+)?(spring|summer|may|june|april|march)/i,
  /we\s+are\s+closed/i,
  /see\s+you\s+(in\s+)?(spring|summer|next\s+season)/i,
  /reopening\s+(in\s+)?\w+\s+\d{4}/i,
  /seasonal\s+closure/i,
]

function detectClosed(text: string): string | null {
  const snippet = text.slice(0, 3000).toLowerCase()
  for (const signal of CLOSED_SIGNALS) {
    const match = snippet.match(signal)
    if (match) return match[0]
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')

const MENU_PATHS = [
  // More specific paths first — less likely to hit a wrong page
  '/food-menu', '/dinner-menu', '/lunch-menu', '/breakfast-menu', '/brunch-menu',
  '/our-menu', '/menus', '/food-drink', '/food--drinks',
  '/menu', '/menu-1', '/menu-2', '/food', '/eat', '/dining',
  '/dinner', '/breakfast', '/lunch',
  '/order', '/order-online',
]

/**
 * Probe a website for common menu URL paths (HEAD requests)
 */
async function findMenuUrl(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null
  let base = websiteUrl.replace(/\/+$/, '')
  if (!base.startsWith('http')) base = 'https://' + base

  for (const path of MENU_PATHS) {
    const candidate = base + path
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(candidate, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsGoodHere-Bot/1.0)' },
      })
      clearTimeout(timeout)
      if (res.ok) return candidate
    } catch {
      // skip
    }
  }
  return null
}

/**
 * Search Google Places for a restaurant by name + address to find its website
 */
async function findWebsiteViaGoogle(name: string, address: string): Promise<{ websiteUrl: string | null; googlePlaceId: string | null }> {
  if (!GOOGLE_API_KEY) return { websiteUrl: null, googlePlaceId: null }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri',
      },
      body: JSON.stringify({
        textQuery: `${name} ${address}`,
        maxResultCount: 1,
      }),
    })

    if (!response.ok) return { websiteUrl: null, googlePlaceId: null }

    const data = await response.json()
    const place = data.places?.[0]
    if (!place) return { websiteUrl: null, googlePlaceId: null }

    return {
      websiteUrl: place.websiteUri || null,
      googlePlaceId: place.id || null,
    }
  } catch {
    return { websiteUrl: null, googlePlaceId: null }
  }
}

/**
 * Simple content hash — if the page hasn't changed, skip the Claude call
 */
async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16) // 16 hex chars = 64 bits, plenty for change detection
}

type ErrorCode = 'no_menu_url' | 'fetch_timeout' | 'fetch_error' | 'dns_error' | 'claude_error' | 'parse_error' | 'no_dishes' | 'page_too_short' | 'unknown_error'

function classifyError(error: unknown, context?: string): { code: ErrorCode; message: string; context: Record<string, unknown> } {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (context === 'no_menu_url') {
    return { code: 'no_menu_url', message: 'No menu URL found', context: {} }
  }
  if (context === 'no_dishes') {
    return { code: 'no_dishes', message: 'No dishes extracted from content', context: {} }
  }
  if (context === 'page_too_short') {
    return { code: 'page_too_short', message: 'Page content too short (<50 chars)', context: {} }
  }
  // Match Claude prefixes BEFORE network branches — Claude error bodies can
  // embed arbitrary upstream text (including phrases like "dns error") that
  // would otherwise trigger network classifiers below.
  if (lower.includes('claude api error') || lower.includes('claude image api error') || lower.includes('claude pdf api error')) {
    return { code: 'claude_error', message, context: {} }
  }
  // DNS resolution failure — Deno surfaces this as "dns error: failed to lookup
  // address information". Must precede the generic "fetch_error" branch because
  // these errors don't carry an "HTTP <status>" prefix and otherwise fell through
  // to the catch-all and got mislabelled as claude_error.
  if (lower.includes('dns error') || lower.includes('failed to lookup address')) {
    return { code: 'dns_error', message, context: {} }
  }
  if (lower.includes('abort') || lower.includes('timeout')) {
    return { code: 'fetch_timeout', message, context: {} }
  }
  if (message.includes('HTTP ')) {
    const statusMatch = message.match(/HTTP (\d+)/)
    return { code: 'fetch_error', message, context: { http_status: statusMatch?.[1] } }
  }
  if (lower.includes('json') || lower.includes('parse')) {
    return { code: 'parse_error', message, context: {} }
  }
  return { code: 'unknown_error', message, context: {} }
}

function calculateBackoff(attemptCount: number): Date {
  const minutes = 5 * Math.pow(6, attemptCount - 1)
  const backoff = new Date()
  backoff.setMinutes(backoff.getMinutes() + minutes)
  return backoff
}

/**
 * Result of fetching a menu URL. Most restaurants serve HTML, but some
 * (e.g. 19 Raw Oyster Bar) redirect their /menu URL directly to a PDF —
 * we must detect that BEFORE reading the body so we don't end up text-
 * extracting binary PDF bytes and finding zero candidates.
 */
type MenuFetchResult =
  | { type: 'html'; html: string }
  | { type: 'pdf'; pdfUrl: string }

const PDF_URL_EXT = /\.pdf(\?|#|$)/i

/**
 * Fetch a menu URL with a browser-ish User-Agent and 20s timeout. Returns
 * either the HTML body or a sentinel marking the response as a direct PDF
 * (caller short-circuits to PDF extraction). PDF detection prefers the
 * Content-Type header but falls back to the resolved URL extension because
 * some hosts (and some CDNs that strip mime types) serve PDFs as
 * application/octet-stream.
 */
// Maximum redirect hops we'll follow manually. Each hop is validated against
// isBlockedHostname before fetching, which is the SSRF defense that
// `redirect: 'follow'` doesn't give us.
const MAX_REDIRECT_HOPS = 5

async function fetchRawHtml(url: string): Promise<MenuFetchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    let currentUrl = url
    let response: Response | null = null

    // Manual redirect loop: validate each hop's hostname BEFORE issuing the
    // fetch, so a public iframe URL that 302s to a private/loopback/metadata
    // host never actually reaches that host. The default `redirect: 'follow'`
    // does the redirect internally before we can inspect it — too late.
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      let parsed: URL
      try {
        parsed = new URL(currentUrl)
      } catch {
        throw new Error('invalid_url')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`bad_scheme:${parsed.protocol}`)
      }
      if (isBlockedHostname(parsed.hostname)) {
        throw new Error(`blocked_host:${parsed.hostname}`)
      }

      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WhatsGoodHere-MenuBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/pdf',
        },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) throw new Error(`redirect_no_location:${response.status}`)
        try {
          currentUrl = new URL(location, currentUrl).href
        } catch {
          throw new Error('invalid_redirect_location')
        }
        continue
      }
      break
    }
    if (!response) throw new Error('no_response')
    if (response.status >= 300 && response.status < 400) {
      throw new Error('too_many_redirects')
    }

    const finalUrl = response.url || currentUrl
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    const looksLikePdf = contentType.includes('application/pdf') || PDF_URL_EXT.test(finalUrl)
    if (looksLikePdf) {
      // PDF: the URL itself is what gets passed to Sonnet's PDF tool, so a
      // non-2xx response means Sonnet would also fail to fetch it. Strict.
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`HTTP ${response.status}`)
      }
      await response.body?.cancel()
      return { type: 'pdf', pdfUrl: finalUrl }
    }

    // HTML: tolerate non-2xx if the response actually looks like HTML AND has
    // real body content. Some third-party menu hosts (e.g. checkle.menu) return
    // 500 status with full menu HTML in the body — a framework fluke, not an
    // actual server error. The content-type / sniff gate prevents us from
    // accepting long JSON error payloads or branded error pages as menu HTML.
    const html = await response.text()
    if (!response.ok) {
      const isHtmlContentType = contentType.includes('text/html') || contentType.includes('application/xhtml')
      const sniffsAsHtml = !contentType && /^\s*(<!doctype|<html)/i.test(html.slice(0, 200))
      if (!isHtmlContentType && !sniffsAsHtml) {
        throw new Error(`HTTP ${response.status}`)
      }
      if (html.length < 200) {
        throw new Error(`HTTP ${response.status}`)
      }
    }
    return { type: 'html', html }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract menu-relevant text from HTML using 3 strategies, combined.
 * Returns up to 60k chars of text suitable for Sonnet extraction.
 */
function extractMenuTextFromHtml(html: string): string {
  // Strategy 1: Extract JSON-LD structured data (common on Squarespace/Wix)
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || []
  const jsonLdText = jsonLdMatches
    .map(m => m.replace(/<\/?script[^>]*>/gi, ''))
    .join(' ')

  // Strategy 2: Extract script tags that look like menu data (prices, items)
  const menuScripts: string[] = []
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1]
    if (content.match(/\$\d+|\bprice\b|\bmenu\b.*\d{1,3}\.\d{2}/i) && content.length < 5000) {
      menuScripts.push(content)
    }
  }

  // Strategy 3: Standard HTML text extraction
  const plainText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  const parts: string[] = []
  if (jsonLdText.length > 20) parts.push('=== STRUCTURED DATA ===\n' + jsonLdText)
  if (menuScripts.length > 0) parts.push('=== EMBEDDED DATA ===\n' + menuScripts.join('\n'))
  parts.push('=== PAGE TEXT ===\n' + plainText)

  return parts.join('\n\n').slice(0, 60000)
}

/**
 * Legacy wrapper — same signature as before so existing callers still work.
 * If the URL serves a PDF directly, returns '' so the caller's
 * `content.length < 50` guard skips the restaurant (legacy path doesn't
 * support direct-PDF extraction; queue-based path handles it).
 */
async function fetchMenuContent(url: string): Promise<string> {
  const result = await fetchRawHtml(url)
  if (result.type === 'pdf') return ''
  return extractMenuTextFromHtml(result.html)
}

interface ExtractionAttempt {
  strategy: 'image' | 'pdf' | 'html' | 'sub-page' | 'iframe'
  url_count: number
  top_score?: number
  dishes_found: number
  error?: string
  url?: string  // for sub-page / iframe attempts, which URL was tried
}

// Caps per strategy. Vision is per-pixel-token expensive — keep image batches small.
const MAX_IMAGE_CANDIDATES = 3
const MAX_PDF_CANDIDATES = 6
const MAX_SUB_PAGES = 4
const MAX_MENU_IFRAMES = 2
// Render fallback #2 fires more broadly than fallback #1: even on plain HTML
// sites without a CMS signature, if everything else returned 0 dishes the page
// might just be a JS-loaded shell. One Browserless call per failed job is cheap
// insurance vs. another dead-letter restaurant.
const SPARSE_TEXT_THRESHOLD = 2000

// Merge two candidate lists by URL (last-write-wins on score), then re-sort.
// Used when Browserless renders surface JS-injected assets that weren't in the raw HTML.
function mergeCandidates(a: MenuCandidate[], b: MenuCandidate[]): MenuCandidate[] {
  const byUrl = new Map<string, MenuCandidate>()
  for (const c of a) byUrl.set(c.url, c)
  for (const c of b) {
    const existing = byUrl.get(c.url)
    if (!existing || c.score > existing.score) byUrl.set(c.url, c)
  }
  return Array.from(byUrl.values()).sort((x, y) => y.score - x.score)
}

/**
 * Anthropic's image and document URL sources require HTTPS — they reject http:// with
 * "Only HTTPS URLs are supported." Many restaurant sites still list assets at http://.
 * Most CDNs/hosts serve the same asset over https, so upgrade the protocol before sending.
 * URLs that aren't http/https (data:, file:, mailto:, etc.) are dropped — the extractors
 * can't use them anyway. Output is deduped to avoid double-charging when both protocols
 * appeared in the source.
 */
function toHttpsUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!u) continue
    let upgraded: string
    if (u.startsWith('https://')) {
      upgraded = u
    } else if (u.startsWith('http://')) {
      upgraded = 'https://' + u.slice('http://'.length)
    } else {
      continue
    }
    if (seen.has(upgraded)) continue
    seen.add(upgraded)
    out.push(upgraded)
  }
  return out
}

/**
 * Extract dishes from menu text using Claude
 */
async function extractMenuWithClaude(content: string, restaurantName: string): Promise<MenuExtractionResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `Extract the full menu from "${restaurantName}":\n\n${content}`,
        },
      ],
      system: MENU_EXTRACTION_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { dishes: [], menu_section_order: [] }
  }

  const parsed = JSON.parse(jsonMatch[0])

  // Validate categories
  const validDishes = (Array.isArray(parsed.dishes) ? parsed.dishes : [])
    .filter((d: ExtractedDish) => d.name && d.category)
    .map((d: ExtractedDish) => ({
      ...d,
      category: VALID_CATEGORIES.includes(d.category) ? d.category : 'entree',
      description: sanitizeDescription(d.description),
      dietary_tags: sanitizeDietaryTags(d.dietary_tags),
    }))

  return {
    dishes: validDishes,
    menu_section_order: Array.isArray(parsed.menu_section_order) ? parsed.menu_section_order : [],
  }
}

// Anthropic accepts image/png, image/jpeg, image/webp, image/gif for vision.
const ANTHROPIC_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
// 5MB is Anthropic's per-image cap; well under Edge Function memory limits at typical batch=3.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Download an image and return it as base64 with its media type. Returns null
 * if the URL is unreachable, the host blocks us, the response isn't a
 * supported image type, or the bytes exceed Anthropic's per-image cap.
 */
async function downloadImageAsBase64(
  url: string,
  signal: AbortSignal
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const resp = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhatsGoodHere-MenuBot/1.0)',
        'Accept': 'image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8',
      },
    })
    if (!resp.ok) return null
    const contentType = (resp.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
    if (!ANTHROPIC_IMAGE_MEDIA_TYPES.includes(contentType)) {
      await resp.body?.cancel()
      return null
    }
    // Pre-check Content-Length so a maliciously large image doesn't get
    // fully buffered into memory before we reject it (Supabase Edge
    // Functions cap at ~256MB; three parallel downloads share that).
    const advertisedLength = parseInt(resp.headers.get('content-length') || '0', 10)
    if (advertisedLength > MAX_IMAGE_BYTES) {
      await resp.body?.cancel()
      return null
    }
    const buffer = await resp.arrayBuffer()
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null
    return {
      // Anthropic only knows image/jpeg, not image/jpg — normalise.
      mediaType: contentType === 'image/jpg' ? 'image/jpeg' : contentType,
      data: encodeBase64(buffer),
    }
  } catch {
    return null
  }
}

/**
 * Extract dishes from one or more menu IMAGES (PNG/JPG/WEBP) using Sonnet vision.
 *
 * Images are downloaded server-side and sent to Anthropic as base64 because
 * Anthropic's URL-fetch path respects robots.txt, and Square/Wix-hosted menu
 * CDNs (the very hosts where menus are most often image-based) deny crawlers
 * in robots.txt — see S&S Kitchenette. Base64 mode bypasses that fetch
 * entirely; we already have permission to download as the user's agent.
 *
 * Vision is more expensive than document blocks per token — keep batches small (≤3).
 */
async function extractMenuFromImagesWithClaude(
  imageUrls: string[],
  restaurantName: string
): Promise<MenuExtractionResult> {
  const httpsUrls = toHttpsUrls(imageUrls)
  if (httpsUrls.length === 0) return { dishes: [], menu_section_order: [] }

  // 20s overall budget for image downloads — Anthropic's call itself takes
  // multiple seconds, so we can't afford slow image hosts.
  const downloadCtrl = new AbortController()
  const downloadTimeout = setTimeout(() => downloadCtrl.abort(), 20000)
  let downloaded: Array<{ data: string; mediaType: string } | null>
  try {
    downloaded = await Promise.all(
      httpsUrls.map(url => downloadImageAsBase64(url, downloadCtrl.signal))
    )
  } finally {
    clearTimeout(downloadTimeout)
  }

  const successful = downloaded.filter((d): d is { data: string; mediaType: string } => d !== null)
  if (successful.length === 0) {
    // Every image failed (404, blocked, wrong type, oversized). Don't call
    // Anthropic — that would just waste tokens.
    return { dishes: [], menu_section_order: [] }
  }

  const content: Array<Record<string, unknown>> = successful.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }))

  content.push({
    type: 'text',
    text: `Extract the full menu from "${restaurantName}" from the ${successful.length === 1 ? 'attached image' : `${successful.length} attached images`}. The images are page-ordered. If different images represent different services (breakfast, lunch, dinner), preserve those as menu sections.`,
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
      system: MENU_EXTRACTION_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude image API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { dishes: [], menu_section_order: [] }

  const parsed = JSON.parse(jsonMatch[0])
  const validDishes = (Array.isArray(parsed.dishes) ? parsed.dishes : [])
    .filter((d: ExtractedDish) => d.name && d.category)
    .map((d: ExtractedDish) => ({
      ...d,
      category: VALID_CATEGORIES.includes(d.category) ? d.category : 'entree',
      description: sanitizeDescription(d.description),
      dietary_tags: sanitizeDietaryTags(d.dietary_tags),
    }))

  return {
    dishes: validDishes,
    menu_section_order: Array.isArray(parsed.menu_section_order) ? parsed.menu_section_order : [],
  }
}

/**
 * Extract dishes from one or more PDFs using Sonnet's document content blocks.
 * PDFs are base64-encoded and sent as document blocks in a single request.
 * Uses the same MENU_EXTRACTION_PROMPT as the HTML extraction path.
 */
async function extractMenuFromPdfsWithClaude(
  pdfUrls: string[],
  restaurantName: string
): Promise<MenuExtractionResult> {
  const httpsUrls = toHttpsUrls(pdfUrls)
  if (httpsUrls.length === 0) return { dishes: [], menu_section_order: [] }

  // Use URL source instead of base64 — Sonnet fetches the PDFs server-side,
  // avoiding memory pressure on the Edge Function runtime.
  const content: Array<Record<string, unknown>> = httpsUrls.map(url => ({
    type: 'document',
    source: {
      type: 'url',
      url,
    },
  }))

  content.push({
    type: 'text',
    text: `Extract the full menu from "${restaurantName}" from the ${httpsUrls.length === 1 ? 'attached PDF' : `${httpsUrls.length} attached PDFs`}. Combine all dishes into a single output. If different PDFs represent different meal services (breakfast, lunch, dinner), preserve those as menu sections.`,
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
      system: MENU_EXTRACTION_PROMPT,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude PDF API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { dishes: [], menu_section_order: [] }
  }

  const parsed = JSON.parse(jsonMatch[0])

  const validDishes = (Array.isArray(parsed.dishes) ? parsed.dishes : [])
    .filter((d: ExtractedDish) => d.name && d.category)
    .map((d: ExtractedDish) => ({
      ...d,
      category: VALID_CATEGORIES.includes(d.category) ? d.category : 'entree',
      description: sanitizeDescription(d.description),
      dietary_tags: sanitizeDietaryTags(d.dietary_tags),
    }))

  return {
    dishes: validDishes,
    menu_section_order: Array.isArray(parsed.menu_section_order) ? parsed.menu_section_order : [],
  }
}

/**
 * Upsert dishes for a restaurant (safe mode — preserves votes/photos)
 */
async function upsertDishes(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string,
  extracted: MenuExtractionResult
): Promise<{ inserted: number; updated: number; unchanged: number }> {
  // Get existing dishes
  const { data: existingDishes, error: fetchErr } = await supabase
    .from('dishes')
    .select('id, name, category, menu_section, price, photo_url, description, dietary_tags')
    .eq('restaurant_id', restaurantId)

  if (fetchErr) {
    throw new Error(`Failed to fetch existing dishes: ${fetchErr.message}`)
  }

  const existingByName = new Map<string, typeof existingDishes[0]>()
  for (const d of (existingDishes || [])) {
    existingByName.set(d.name.toLowerCase(), d)
  }

  let inserted = 0
  let updated = 0
  let unchanged = 0

  for (const dish of extracted.dishes) {
    const existing = existingByName.get(dish.name.toLowerCase())

    if (existing) {
      // Check if anything changed
      const priceChanged = dish.price !== null && dish.price !== existing.price
      const categoryChanged = dish.category !== existing.category
      const sectionChanged = dish.menu_section !== existing.menu_section
      const descriptionChanged = (dish.description ?? null) !== (existing.description ?? null)
      const tagsChanged = !sortedArraysEqual(dish.dietary_tags || [], existing.dietary_tags || [])

      if (priceChanged || categoryChanged || sectionChanged || descriptionChanged || tagsChanged) {
        const updates: Record<string, unknown> = {}
        if (categoryChanged) updates.category = dish.category
        if (sectionChanged) updates.menu_section = dish.menu_section
        if (priceChanged) updates.price = dish.price
        if (descriptionChanged) updates.description = dish.description
        if (tagsChanged) updates.dietary_tags = dish.dietary_tags

        const { error } = await supabase
          .from('dishes')
          .update(updates)
          .eq('id', existing.id)

        if (!error) updated++
      } else {
        unchanged++
      }
    } else {
      // Insert new dish
      const { error } = await supabase
        .from('dishes')
        .insert({
          restaurant_id: restaurantId,
          name: dish.name,
          category: dish.category,
          menu_section: dish.menu_section || null,
          price: dish.price || null,
          description: dish.description ?? null,
          dietary_tags: dish.dietary_tags || [],
        })

      if (!error) inserted++
    }
  }

  // Update menu_section_order
  if (extracted.menu_section_order.length > 0) {
    await supabase
      .from('restaurants')
      .update({ menu_section_order: extracted.menu_section_order })
      .eq('id', restaurantId)
  }

  return { inserted, updated, unchanged }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Shared-secret gate. The function runs with verify_jwt = false at the
  // gateway (so pg_cron can invoke it after the legacy service_role JWT
  // stopped being accepted ~2026-04-12), but the function itself is
  // privileged: it mutates with service role and calls the paid Sonnet API.
  // Require an explicit CRON_SECRET match so this isn't a public endpoint.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // v1.3 backfill flag: ?force_all=true bypasses the STALE_DAYS filter so
    // a backfill operator can sweep every open restaurant with a menu_url in
    // a few batched invocations. ?limit=N caps per-invocation work (default
    // MAX_RESTAURANTS_PER_RUN, hard ceiling 50 to stay under edge timeout).
    const reqUrl = new URL(req.url)
    const forceAll = reqUrl.searchParams.get('force_all') === 'true'
    const forceLimitRaw = parseInt(reqUrl.searchParams.get('limit') || `${MAX_RESTAURANTS_PER_RUN}`, 10)
    const forceLimit = Math.min(50, Math.max(1, isNaN(forceLimitRaw) ? MAX_RESTAURANTS_PER_RUN : forceLimitRaw))

    // Check if single restaurant mode
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      // Empty body = batch mode
    }

    // === Queue processing mode ===
    if (body.mode === 'queue') {
      // --- Recovery pass: reset stalled jobs ---
      const { data: stalledJobs } = await supabase
        .from('menu_import_jobs')
        .select('id, attempt_count, max_attempts')
        .eq('status', 'processing')
        .lt('lock_expires_at', new Date().toISOString())

      for (const stalled of (stalledJobs || [])) {
        const newAttemptCount = stalled.attempt_count + 1
        if (newAttemptCount >= stalled.max_attempts) {
          await supabase
            .from('menu_import_jobs')
            .update({
              status: 'dead',
              attempt_count: newAttemptCount,
              error_message: 'Worker crashed or timed out',
              error_code: 'fetch_timeout',
              updated_at: new Date().toISOString(),
            })
            .eq('id', stalled.id)
        } else {
          await supabase
            .from('menu_import_jobs')
            .update({
              status: 'pending',
              attempt_count: newAttemptCount,
              run_after: new Date().toISOString(),
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', stalled.id)
        }
      }

      // --- Atomic dequeue ---
      const { data: jobs, error: dequeueErr } = await supabase.rpc('claim_menu_import_jobs', { p_limit: 3 })

      if (dequeueErr || !jobs || jobs.length === 0) {
        return new Response(JSON.stringify({
          message: jobs?.length === 0 ? 'No jobs to process' : 'Dequeue error',
          recovered: stalledJobs?.length || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const results: Array<Record<string, unknown>> = []

      for (const job of jobs) {
        try {
          const { data: restaurant, error: restErr } = await supabase
            .from('restaurants')
            .select('id, name, address, menu_url, website_url, google_place_id, menu_content_hash, extractor_fingerprint')
            .eq('id', job.restaurant_id)
            .single()

          if (restErr || !restaurant) {
            await supabase.from('menu_import_jobs').update({
              status: 'dead',
              error_code: 'fetch_error',
              error_message: 'Restaurant not found',
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'error', reason: 'restaurant not found' })
            continue
          }

          let menuUrl = restaurant.menu_url
          let websiteUrl = restaurant.website_url
          const dbUpdates: Record<string, unknown> = {}

          if (!websiteUrl && !menuUrl) {
            const googleResult = await findWebsiteViaGoogle(restaurant.name, restaurant.address || '')
            if (googleResult.websiteUrl) {
              websiteUrl = googleResult.websiteUrl
              dbUpdates.website_url = websiteUrl
            }
            if (googleResult.googlePlaceId && !restaurant.google_place_id) {
              dbUpdates.google_place_id = googleResult.googlePlaceId
            }
          }

          if (!menuUrl && websiteUrl) {
            const found = await findMenuUrl(websiteUrl)
            if (found) {
              menuUrl = found
              dbUpdates.menu_url = menuUrl
            } else {
              // Ephemeral fallback for THIS run only. Many restaurants link the
              // menu as a PDF or image (e.g. /wp-content/uploads/*.pdf) only from
              // the homepage — paths findMenuUrl's probe list misses. Letting the
              // downstream pipeline see the homepage gives discoverMenuCandidates
              // a chance to find those links and Sonnet a shot at the homepage
              // HTML. We do NOT persist this to dbUpdates.menu_url — that would
              // lock the restaurant into the homepage forever and prevent
              // future discovery of a real /menu URL.
              let normalized = websiteUrl.replace(/\/+$/, '')
              if (!normalized.startsWith('http')) normalized = 'https://' + normalized
              menuUrl = normalized
            }
          }

          if (Object.keys(dbUpdates).length > 0) {
            await supabase.from('restaurants').update(dbUpdates).eq('id', restaurant.id)
          }

          if (!menuUrl) {
            const classified = classifyError(null, 'no_menu_url')
            const newAttemptCount = job.attempt_count + 1
            await supabase.from('menu_import_jobs').update({
              status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
              attempt_count: newAttemptCount,
              run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
              error_code: classified.code,
              error_message: classified.message,
              error_context: { website_discovered: websiteUrl },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'no_menu_url', restaurant: restaurant.name })
            continue
          }

          // --- Fetch + extract (with render fallback for JS-rendered sites) ---
          let fetchResult: MenuFetchResult
          try {
            fetchResult = await fetchRawHtml(menuUrl)
          } catch (fetchErr) {
            const classified = classifyError(fetchErr)
            const newAttemptCount = job.attempt_count + 1
            await supabase.from('menu_import_jobs').update({
              status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
              attempt_count: newAttemptCount,
              run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
              error_code: classified.code,
              error_message: classified.message,
              error_context: { ...classified.context, menu_url: menuUrl },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'fetch_failed', restaurant: restaurant.name, error: classified.code })
            continue
          }

          // Direct-PDF shortcut: menu_url served `application/pdf` (Squarespace
          // restaurants commonly host their menu as a single PDF and 302 the
          // /menus URL straight at it — e.g. 19 Raw Oyster Bar). Skip CMS
          // detection, hash check, render fallbacks, sub-page traversal, all
          // text extraction — none of it applies. Hand the URL to Sonnet's
          // PDF tool directly.
          if (fetchResult.type === 'pdf') {
            const pdfAttempts: ExtractionAttempt[] = []
            let pdfExtracted: MenuExtractionResult = { dishes: [], menu_section_order: [] }
            try {
              pdfExtracted = await extractMenuFromPdfsWithClaude([fetchResult.pdfUrl], restaurant.name)
              pdfAttempts.push({ strategy: 'pdf', url_count: 1, dishes_found: pdfExtracted.dishes.length })
            } catch (pdfErr) {
              const message = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
              pdfAttempts.push({ strategy: 'pdf', url_count: 1, dishes_found: 0, error: message })
            }

            if (pdfExtracted.dishes.length > 0) {
              const stats = await upsertDishes(supabase, restaurant.id, pdfExtracted)
              // Note: we deliberately do not store menu_content_hash here —
              // PDFs route through a different fetch path with no equivalent
              // raw-HTML shell to fingerprint. The extractor_fingerprint is
              // still written so a future extractor bump invalidates the
              // cache for PDF-backed restaurants too.
              await supabase.from('restaurants').update({
                menu_last_checked: new Date().toISOString(),
                extractor_fingerprint: CURRENT_EXTRACTOR_FINGERPRINT,
              }).eq('id', restaurant.id)
              await supabase.from('menu_import_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                dishes_found: pdfExtracted.dishes.length,
                dishes_inserted: stats.inserted,
                dishes_updated: stats.updated,
                dishes_unchanged: stats.unchanged,
                error_context: {
                  menu_url: menuUrl,
                  resolved_pdf_url: fetchResult.pdfUrl,
                  winning_strategy: 'pdf-direct',
                  attempts: pdfAttempts,
                },
                lock_expires_at: null,
                updated_at: new Date().toISOString(),
              }).eq('id', job.id)
              results.push({
                job_id: job.id, status: 'success', restaurant: restaurant.name,
                dishes: pdfExtracted.dishes.length, inserted: stats.inserted, updated: stats.updated,
                strategy: 'pdf-direct',
              })
              continue
            }

            // PDF returned 0 dishes — record as no_dishes so the retry/dead
            // logic in the queue handles it like every other extraction failure.
            const classified = classifyError(null, 'no_dishes')
            const newAttemptCount = job.attempt_count + 1
            await supabase.from('menu_import_jobs').update({
              status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
              attempt_count: newAttemptCount,
              run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
              error_code: classified.code,
              error_message: classified.message,
              error_context: {
                menu_url: menuUrl,
                resolved_pdf_url: fetchResult.pdfUrl,
                winning_strategy: 'pdf-direct',
                attempts: pdfAttempts,
              },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'no_dishes', restaurant: restaurant.name })
            continue
          }

          const rawHtml = fetchResult.html

          const cms = detectCms(rawHtml, menuUrl)
          const rawText = extractMenuTextFromHtml(rawHtml)
          const rawTextLen = rawText.length
          let extractionContent = rawText
          let rendererAttempted = false
          let renderSucceeded = false
          let renderError: string | null = null
          let renderedTextLen: number | null = null

          // Discover all menu candidates (PDFs + images) and rank by score.
          // Score combines URL keywords (+menu/+dinner/-beverage/-logo) with
          // anchor/alt context. Highest-scoring asset wins, regardless of format.
          // `let` because Browserless renders below may surface JS-injected
          // candidates that need to merge into this pool.
          let candidates = discoverMenuCandidates(rawHtml, menuUrl)
          const attempts: ExtractionAttempt[] = []
          const triedUrls = new Set<string>()

          // Fast path: compute raw hash BEFORE any Sonnet/render call.
          // Skip Sonnet only when BOTH the raw HTML shell AND the extractor
          // fingerprint match what's stored. The fingerprint check ensures
          // that prompt/schema upgrades (e.g. PR #229 added description +
          // dietary_tags) invalidate the cache automatically — every restaurant
          // with a stored fingerprint from an older extractor re-extracts.
          // The 14-day refresh cron still catches actual menu updates between
          // extractor versions.
          const rawHash = await hashContent(rawText)
          if (
            restaurant.menu_content_hash &&
            restaurant.menu_content_hash === rawHash &&
            restaurant.extractor_fingerprint === CURRENT_EXTRACTOR_FINGERPRINT
          ) {
            await supabase.from('restaurants').update({ menu_last_checked: new Date().toISOString() }).eq('id', restaurant.id)
            await supabase.from('menu_import_jobs').update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              dishes_found: 0, dishes_inserted: 0, dishes_updated: 0, dishes_unchanged: 0,
              error_context: { menu_url: menuUrl, cms_detected: cms, raw_text_len: rawTextLen, reason: 'hash_unchanged' },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'unchanged', restaurant: restaurant.name })
            continue
          }

          // Render fallback #1: content too short AND CMS requires rendering
          if (extractionContent.length < 50 && cmsRequiresRender(cms)) {
            console.log(`${restaurant.name}: content too short + ${cms} CMS, attempting render fallback`)
            rendererAttempted = true  // mark ATTEMPTED regardless of outcome
            try {
              const renderedHtml = await fetchRenderedHtml(menuUrl, {
                gotoTimeout: 45000,
                waitForTimeoutMs: 12000,  // Wix needs time to hydrate menu API data
              })
              const renderedText = extractMenuTextFromHtml(renderedHtml)
              renderedTextLen = renderedText.length
              if (renderedText.length >= 50) {
                extractionContent = renderedText
                renderSucceeded = true
                // Re-discover candidates from the rendered HTML — JS-injected menu
                // PDFs/images are invisible in raw HTML.
                candidates = mergeCandidates(candidates, discoverMenuCandidates(renderedHtml, menuUrl))
              }
            } catch (renderErr) {
              renderError = renderErr instanceof Error ? renderErr.message : String(renderErr)
              console.error(`${restaurant.name}: render failed:`, renderError)
            }
          }

          if (extractionContent.length < 50) {
            const classified = classifyError(null, 'page_too_short')
            const newAttemptCount = job.attempt_count + 1
            await supabase.from('menu_import_jobs').update({
              status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
              attempt_count: newAttemptCount,
              run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
              error_code: classified.code,
              error_message: classified.message,
              error_context: {
                menu_url: menuUrl,
                website_url: websiteUrl,
                cms_detected: cms,
                raw_html_len: rawHtml.length,
                raw_text_len: rawTextLen,
                renderer_attempted: rendererAttempted,
                render_succeeded: renderSucceeded,
                render_error: renderError,
                rendered_text_len: renderedTextLen,
                candidates_found: candidates.length,
              },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'page_too_short', restaurant: restaurant.name })
            continue
          }

          // Closed detection — run on whatever content we ended up with (raw or rendered)
          const closedSignal = detectClosed(extractionContent)
          if (closedSignal) {
            await supabase.from('restaurants').update({
              is_open: false, menu_last_checked: new Date().toISOString(),
            }).eq('id', restaurant.id)

            if (job.job_type === 'refresh') {
              await supabase.from('menu_import_jobs').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                error_message: `Closed: ${closedSignal}`,
                lock_expires_at: null,
                updated_at: new Date().toISOString(),
              }).eq('id', job.id)
              results.push({ job_id: job.id, status: 'closed', restaurant: restaurant.name })
              continue
            }
          }

          // Extract with Sonnet. Try strategies in score order:
          // image batch (if highest-scoring candidates are images) → pdf batch → html text.
          // First non-empty result wins. Stop early to avoid extra Sonnet calls.
          let extracted: MenuExtractionResult = { dishes: [], menu_section_order: [] }

          const tryAssetExtraction = async (cands: MenuCandidate[]): Promise<void> => {
            const fresh = cands.filter(c => !triedUrls.has(c.url))
            const images = fresh.filter(c => c.type === 'image').slice(0, MAX_IMAGE_CANDIDATES)
            const pdfs = fresh.filter(c => c.type === 'pdf').slice(0, MAX_PDF_CANDIDATES)
            const imageMaxScore = images[0]?.score ?? -Infinity
            const pdfMaxScore = pdfs[0]?.score ?? -Infinity
            const tryImagesFirst = images.length > 0 && imageMaxScore >= pdfMaxScore
            const ordered: Array<{ type: 'image' | 'pdf'; cands: MenuCandidate[] }> = []
            if (tryImagesFirst) {
              if (images.length > 0) ordered.push({ type: 'image', cands: images })
              if (pdfs.length > 0) ordered.push({ type: 'pdf', cands: pdfs })
            } else {
              if (pdfs.length > 0) ordered.push({ type: 'pdf', cands: pdfs })
              if (images.length > 0) ordered.push({ type: 'image', cands: images })
            }

            for (const group of ordered) {
              const urls = group.cands.map(c => c.url)
              urls.forEach(u => triedUrls.add(u))
              const topScore = group.cands[0].score
              try {
                console.log(`${restaurant.name}: trying ${group.type} batch (${urls.length} urls, top score ${topScore})`)
                const result = group.type === 'image'
                  ? await extractMenuFromImagesWithClaude(urls, restaurant.name)
                  : await extractMenuFromPdfsWithClaude(urls, restaurant.name)
                attempts.push({ strategy: group.type, url_count: urls.length, top_score: topScore, dishes_found: result.dishes.length })
                if (result.dishes.length > 0) {
                  extracted = result
                  return
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(`${restaurant.name}: ${group.type} extraction failed:`, message)
                attempts.push({ strategy: group.type, url_count: urls.length, top_score: topScore, dishes_found: 0, error: message })
              }
            }
          }

          await tryAssetExtraction(candidates)

          // Fallback: extract from page text if no asset-based strategy yielded dishes
          if (extracted.dishes.length === 0) {
            try {
              const result = await extractMenuWithClaude(extractionContent, restaurant.name)
              attempts.push({ strategy: 'html', url_count: 0, dishes_found: result.dishes.length })
              if (result.dishes.length > 0) extracted = result
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              console.error(`${restaurant.name}: html extraction failed:`, message)
              attempts.push({ strategy: 'html', url_count: 0, dishes_found: 0, error: message })
            }
          }

          // Sub-page fallback (Pattern 1): when /menu is just a navigation page
          // linking to /brunch /lunch /dinner /breakfast (Webflow / WordPress /
          // multi-service restaurants split the menu across pages). Fetch each
          // sub-page, run extraction on each, merge results.
          //
          // Iframe fallback runs alongside: some restaurants embed their menu
          // in a cross-origin iframe (checkle.menu, popmenu, singleplatform,
          // Toast). findMenuIframes pulls those URLs so the same loop fetches
          // and extracts them.
          if (extracted.dishes.length === 0) {
            const subPages = findSubMenuPages(rawHtml, menuUrl, MAX_SUB_PAGES)
            const menuIframes = findMenuIframes(rawHtml, MAX_MENU_IFRAMES)
            const subUrls: Array<{ url: string; strategy: 'sub-page' | 'iframe' }> = [
              ...subPages.map(url => ({ url, strategy: 'sub-page' as const })),
              ...menuIframes.map(url => ({ url, strategy: 'iframe' as const })),
            ]
            if (subUrls.length > 0) {
              console.log(`${restaurant.name}: trying ${subPages.length} sub-pages + ${menuIframes.length} menu iframes`)
              // Dedupe across sub-pages by (lowercased name, lowercased section).
              // Many restaurants list the same dish on /lunch and /dinner; without
              // deduping we'd report inflated dishes_found, and even though
              // upsertDishes coalesces by name later, keeping the merged result
              // honest matters for telemetry and for pages that genuinely share
              // sections (e.g. desserts).
              const seenDishes = new Set<string>()
              const mergedDishes: typeof extracted.dishes = []
              const mergedSections: string[] = []
              for (const { url: subUrl, strategy } of subUrls) {
                try {
                  const subFetch = await fetchRawHtml(subUrl)
                  // Sub-page itself served a PDF (e.g. /lunch redirects to lunch.pdf).
                  // Pass it to Sonnet's PDF tool directly; the result joins the
                  // merged sub-page output below.
                  if (subFetch.type === 'pdf') {
                    const subPdfResult = await extractMenuFromPdfsWithClaude([subFetch.pdfUrl], restaurant.name)
                    attempts.push({ strategy, url_count: 1, dishes_found: subPdfResult.dishes.length, url: subUrl })
                    for (const dish of subPdfResult.dishes) {
                      const key = `${dish.name.toLowerCase()}|${(dish.menu_section || '').toLowerCase()}`
                      if (seenDishes.has(key)) continue
                      seenDishes.add(key)
                      mergedDishes.push(dish)
                    }
                    for (const sec of subPdfResult.menu_section_order) {
                      if (!mergedSections.includes(sec)) mergedSections.push(sec)
                    }
                    continue
                  }
                  let subText = extractMenuTextFromHtml(subFetch.html)
                  let subRendered = false
                  // Iframe URLs frequently point at Next.js / React menu services
                  // (checkle.menu, popmenu, etc.) where the static HTML is just a
                  // shell — actual menu content lives in JS state. Always render
                  // iframes from known menu-service hosts; cost is bounded
                  // because the allowlist limits which hosts qualify.
                  //
                  // Known-host gate also bounds the SSRF surface: Browserless
                  // follows redirects internally, so sending it an attacker-
                  // controlled URL would reopen the redirect-SSRF gap we closed
                  // for raw fetch.
                  if (strategy === 'iframe') {
                    let iframeHost = ''
                    try {
                      iframeHost = new URL(subUrl).hostname
                    } catch {
                      iframeHost = ''
                    }
                    const knownHost = iframeHost ? isKnownMenuIframeHost(iframeHost) : false
                    if (knownHost) {
                      try {
                        const renderedIframeHtml = await fetchRenderedHtml(subUrl, {
                          gotoTimeout: 45000,
                          waitForTimeoutMs: 12000,
                        })
                        const renderedIframeText = extractMenuTextFromHtml(renderedIframeHtml)
                        if (renderedIframeText.length > subText.length) {
                          subText = renderedIframeText
                          subRendered = true
                        }
                      } catch (renderErr) {
                        const msg = renderErr instanceof Error ? renderErr.message : String(renderErr)
                        console.error(`${restaurant.name}: iframe render failed for ${subUrl}:`, msg)
                      }
                    }
                  }
                  if (subText.length < 50) {
                    attempts.push({ strategy, url_count: 1, dishes_found: 0, url: subUrl, error: subRendered ? 'rendered_but_short' : 'page_too_short' })
                    continue
                  }
                  const subResult = await extractMenuWithClaude(subText, restaurant.name)
                  attempts.push({ strategy, url_count: 1, dishes_found: subResult.dishes.length, url: subUrl })
                  for (const dish of subResult.dishes) {
                    const key = `${dish.name.toLowerCase()}|${(dish.menu_section || '').toLowerCase()}`
                    if (seenDishes.has(key)) continue
                    seenDishes.add(key)
                    mergedDishes.push(dish)
                  }
                  for (const sec of subResult.menu_section_order) {
                    if (!mergedSections.includes(sec)) mergedSections.push(sec)
                  }
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err)
                  console.error(`${restaurant.name}: ${strategy} ${subUrl} failed:`, message)
                  attempts.push({ strategy, url_count: 1, dishes_found: 0, url: subUrl, error: message })
                }
              }
              if (mergedDishes.length > 0) {
                extracted = { dishes: mergedDishes, menu_section_order: mergedSections }
              }
            }
          }

          // Render fallback #2: zero dishes AND not yet rendered AND the site
          // either matches a known JS CMS OR has sparse raw text. The sparse-text
          // gate catches custom React/Vue restaurants that don't carry a CMS
          // signature — Quitsa-class sites. Without the gate we'd burn Browserless
          // on every 0-dish failure, including restaurants that legitimately have
          // no menu we can extract.
          const looksJsRendered = cmsRequiresRender(cms) || rawTextLen < SPARSE_TEXT_THRESHOLD
          if (extracted.dishes.length === 0 && !rendererAttempted && looksJsRendered) {
            console.log(`${restaurant.name}: Sonnet found 0 dishes in ${cms} site, attempting render fallback`)
            rendererAttempted = true  // mark ATTEMPTED regardless of outcome
            try {
              const renderedHtml = await fetchRenderedHtml(menuUrl, {
                gotoTimeout: 45000,
                waitForTimeoutMs: 12000,  // Wix needs time to hydrate menu API data
              })
              const renderedText = extractMenuTextFromHtml(renderedHtml)
              renderedTextLen = renderedText.length
              if (renderedText.length >= 50) {
                extractionContent = renderedText
                renderSucceeded = true
                // Re-run closed detection on rendered content (could reveal "closed for season" text)
                const renderedClosedSignal = detectClosed(extractionContent)
                if (renderedClosedSignal) {
                  await supabase.from('restaurants').update({
                    is_open: false, menu_last_checked: new Date().toISOString(),
                  }).eq('id', restaurant.id)
                  if (job.job_type === 'refresh') {
                    await supabase.from('menu_import_jobs').update({
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                      error_message: `Closed: ${renderedClosedSignal}`,
                      lock_expires_at: null,
                      updated_at: new Date().toISOString(),
                    }).eq('id', job.id)
                    results.push({ job_id: job.id, status: 'closed', restaurant: restaurant.name })
                    continue
                  }
                }
                // Re-discover candidates from rendered HTML — JS-injected PDF/image
                // menus that were invisible in raw HTML may be present now.
                candidates = mergeCandidates(candidates, discoverMenuCandidates(renderedHtml, menuUrl))
                await tryAssetExtraction(candidates)
                if (extracted.dishes.length === 0) {
                  // No new asset candidates worked either — fall back to text extraction
                  // on the rendered page.
                  const result = await extractMenuWithClaude(extractionContent, restaurant.name)
                  attempts.push({ strategy: 'html', url_count: 0, dishes_found: result.dishes.length })
                  if (result.dishes.length > 0) extracted = result
                }
              }
            } catch (renderErr) {
              renderError = renderErr instanceof Error ? renderErr.message : String(renderErr)
              console.error(`${restaurant.name}: render retry failed:`, renderError)
            }
          }

          if (extracted.dishes.length === 0) {
            const classified = classifyError(null, 'no_dishes')
            const newAttemptCount = job.attempt_count + 1
            await supabase.from('menu_import_jobs').update({
              status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
              attempt_count: newAttemptCount,
              run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
              error_code: classified.code,
              error_message: classified.message,
              error_context: {
                menu_url: menuUrl,
                website_url: websiteUrl,
                cms_detected: cms,
                raw_html_len: rawHtml.length,
                raw_text_len: rawTextLen,
                renderer_attempted: rendererAttempted,
                render_succeeded: renderSucceeded,
                render_error: renderError,
                rendered_text_len: renderedTextLen,
                candidates_found: candidates.length,
                attempts,
              },
              lock_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', job.id)
            results.push({ job_id: job.id, status: 'no_dishes', restaurant: restaurant.name })
            continue
          }

          // Success path: upsert dishes, store raw hash + render telemetry
          // Note: we hash the raw text (rawHash), not the rendered text. Next run can skip
          // cheaply when the raw HTML shell is unchanged. Mild staleness on JS sites is
          // acceptable; the 14-day refresh cron eventually catches updates.

          const stats = await upsertDishes(supabase, restaurant.id, extracted)

          await supabase.from('restaurants').update({
            menu_last_checked: new Date().toISOString(),
            menu_content_hash: rawHash,
            extractor_fingerprint: CURRENT_EXTRACTOR_FINGERPRINT,
          }).eq('id', restaurant.id)

          const winningStrategy = attempts.find(a => a.dishes_found > 0)?.strategy ?? 'html'

          await supabase.from('menu_import_jobs').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            dishes_found: extracted.dishes.length,
            dishes_inserted: stats.inserted,
            dishes_updated: stats.updated,
            dishes_unchanged: stats.unchanged,
            error_context: {
              menu_url: menuUrl,
              website_url: websiteUrl,
              cms_detected: cms,
              raw_html_len: rawHtml.length,
              raw_text_len: rawTextLen,
              renderer_attempted: rendererAttempted,
              render_succeeded: renderSucceeded,
              render_error: renderError,
              rendered_text_len: renderedTextLen,
              candidates_found: candidates.length,
              winning_strategy: winningStrategy,
              attempts,
            },
            lock_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', job.id)

          results.push({
            job_id: job.id, status: 'success', restaurant: restaurant.name,
            dishes: extracted.dishes.length, inserted: stats.inserted, updated: stats.updated,
            rendered: renderSucceeded,
            strategy: winningStrategy,
          })

        } catch (err) {
          console.error(`Job ${job.id} failed:`, err)
          const classified = classifyError(err)
          const newAttemptCount = job.attempt_count + 1

          await supabase.from('menu_import_jobs').update({
            status: newAttemptCount >= job.max_attempts ? 'dead' : 'pending',
            attempt_count: newAttemptCount,
            run_after: newAttemptCount >= job.max_attempts ? undefined : calculateBackoff(newAttemptCount).toISOString(),
            error_code: classified.code,
            error_message: classified.message,
            error_context: classified.context,
            lock_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', job.id)

          results.push({ job_id: job.id, status: 'error', error: classified.code })
        }

        if (jobs.length > 1) await sleep(2000)
      }

      return new Response(JSON.stringify({
        processed: jobs.length,
        recovered: stalledJobs?.length || 0,
        results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Backward compatibility: single restaurant_id enqueues a job ===
    if (body.restaurant_id) {
      const { data, error } = await supabase.rpc('enqueue_menu_import', {
        p_restaurant_id: body.restaurant_id as string,
        p_job_type: 'initial',
        p_priority: 10,
      })
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to enqueue job', details: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        message: 'Job enqueued',
        job: data?.[0],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // === Batch fallback mode: find stale menus (or all if force_all=true) ===
    let restaurants: Array<{
      id: string;
      name: string;
      menu_url: string;
      menu_content_hash: string | null;
      extractor_fingerprint: string | null;
    }>

    {
      // ORDER BY menu_last_checked (NULLS FIRST) so a backfill that runs the
      // same edge function in a loop cycles through the inventory instead of
      // grabbing the same physical-heap-order rows every call. Tiebreak by id
      // so batch boundaries are deterministic when many rows share the same
      // (or NULL) timestamp.
      let query = supabase
        .from('restaurants')
        .select('id, name, menu_url, menu_content_hash, extractor_fingerprint')
        .not('menu_url', 'is', null)
        .eq('is_open', true)
        .order('menu_last_checked', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })

      if (!forceAll) {
        // Default cron mode: only stale (or never-checked) menus
        const staleDate = new Date()
        staleDate.setDate(staleDate.getDate() - STALE_DAYS)
        query = query.or(`menu_last_checked.is.null,menu_last_checked.lt.${staleDate.toISOString()}`)
      }

      const { data, error } = await query.limit(forceAll ? forceLimit : MAX_RESTAURANTS_PER_RUN)

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch restaurants' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      restaurants = data || []

      if (forceAll) {
        console.log(`menu-refresh: force_all=true, limit=${forceLimit}, found ${restaurants.length} restaurants to refresh`)
      }
    }

    if (restaurants.length === 0) {
      return new Response(JSON.stringify({ message: 'No restaurants need menu refresh', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Array<{
      restaurant_id: string
      name: string
      status: string
      inserted?: number
      updated?: number
      unchanged?: number
      total_dishes?: number
    }> = []

    // Pre-stamp menu_last_checked BEFORE attempting each restaurant. The
    // column is the rotation key for ORDER BY menu_last_checked NULLS FIRST
    // above, so a row that hasn't been stamped sits at the front of the
    // queue forever. Pre-stamping guarantees rotation even when the function
    // is force-killed mid-processing — e.g. a single slow restaurant
    // (heavy Browserless render, oversized HTML, huge Sonnet response)
    // blowing past the edge-function 150s IDLE_TIMEOUT. Without this, that
    // restaurant would re-appear at the front of every subsequent batch and
    // block the entire backfill.
    //
    // Success and closed paths overwrite this stamp with a slightly newer
    // timestamp alongside their hash / fingerprint / is_open updates — that
    // overlap is fine. Skip and error paths leave the pre-stamp in place.
    //
    // Cost: the 14-day staleness cron sees failed rows as "fresh" for ~14
    // days. Acceptable — Path A's queue retry/backoff handles short-term
    // retries, and burning Sonnet on the same broken URL every cron cycle
    // would be worse.
    // Batch pre-stamp: update menu_last_checked = now() for the WHOLE batch
    // in a single UPDATE before processing any restaurant. The earlier
    // per-restaurant pre-stamp inside the loop only rotated the row
    // currently being processed on IDLE_TIMEOUT, leaving its 7 batch-mates
    // unstamped at the front of the queue — so the next invocation hit the
    // same slow cluster again. Batch-stamping at the top guarantees
    // full-batch rotation on any timeout, anywhere in the loop.
    //
    // Supabase JS resolves with { error } on PostgREST/SQL failures rather
    // than throwing, so inspect .error explicitly. The try/catch is still
    // there for transport-level throws (fetch failures, etc.). Either way
    // we log loudly and continue — rotation that didn't happen is loud, not
    // silent.
    try {
      const { error: batchStampErr } = await supabase
        .from('restaurants')
        .update({ menu_last_checked: new Date().toISOString() })
        .in('id', restaurants.map(r => r.id))
      if (batchStampErr) {
        console.error('Batch pre-stamp returned error (continuing):', batchStampErr)
      }
    } catch (stampErr) {
      console.error('Batch pre-stamp threw (continuing):', stampErr)
    }

    for (const restaurant of restaurants) {
      try {
        console.log(`Processing menu for: ${restaurant.name}`)

        // Fetch menu content
        const content = await fetchMenuContent(restaurant.menu_url)
        if (content.length < 50) {
          results.push({ restaurant_id: restaurant.id, name: restaurant.name, status: 'skipped: page too short' })
          continue
        }

        // Content hash — skip Claude only when BOTH the page hash and the
        // stored extractor fingerprint match. Fingerprint mismatch means we've
        // upgraded the extractor since last extraction (new prompt, new
        // schema, etc.) — re-run Sonnet so the upgrade actually takes effect.
        const contentHash = await hashContent(content)
        if (
          restaurant.menu_content_hash &&
          restaurant.menu_content_hash === contentHash &&
          restaurant.extractor_fingerprint === CURRENT_EXTRACTOR_FINGERPRINT
        ) {
          console.log(`${restaurant.name}: content + extractor unchanged, skipping`)
          results.push({ restaurant_id: restaurant.id, name: restaurant.name, status: 'unchanged (hash match)' })
          continue
        }

        // Check for closure signals BEFORE calling Claude (saves API cost)
        const closedSignal = detectClosed(content)
        if (closedSignal) {
          console.log(`${restaurant.name}: detected closed signal "${closedSignal}"`)
          await supabase
            .from('restaurants')
            .update({ is_open: false, menu_last_checked: new Date().toISOString() })
            .eq('id', restaurant.id)
          results.push({
            restaurant_id: restaurant.id,
            name: restaurant.name,
            status: `closed: ${closedSignal}`,
          })
          continue
        }

        // Extract dishes with Claude
        const extracted = await extractMenuWithClaude(content, restaurant.name)
        if (extracted.dishes.length === 0) {
          results.push({ restaurant_id: restaurant.id, name: restaurant.name, status: 'skipped: no dishes found' })
          continue
        }

        // Upsert dishes
        const stats = await upsertDishes(supabase, restaurant.id, extracted)

        // Mark menu as checked + save content hash + extractor fingerprint
        await supabase
          .from('restaurants')
          .update({
            menu_last_checked: new Date().toISOString(),
            menu_content_hash: contentHash,
            extractor_fingerprint: CURRENT_EXTRACTOR_FINGERPRINT,
          })
          .eq('id', restaurant.id)

        results.push({
          restaurant_id: restaurant.id,
          name: restaurant.name,
          status: 'success',
          inserted: stats.inserted,
          updated: stats.updated,
          unchanged: stats.unchanged,
          total_dishes: extracted.dishes.length,
        })
      } catch (err) {
        console.error(`Error processing ${restaurant.name}:`, err)
        results.push({
          restaurant_id: restaurant.id,
          name: restaurant.name,
          status: `error: ${String(err)}`,
        })
      }

      // Rate limit between restaurants
      if (restaurants.length > 1) {
        await sleep(2000)
      }
    }

    const totalInserted = results.reduce((sum, r) => sum + (r.inserted || 0), 0)
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0)
    const successCount = results.filter(r => r.status === 'success').length

    return new Response(JSON.stringify({
      processed: restaurants.length,
      success: successCount,
      total_inserted: totalInserted,
      total_updated: totalUpdated,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Menu refresh error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
