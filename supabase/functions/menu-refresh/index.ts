import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { detectCms, cmsRequiresRender } from './cms-detect.ts'
import { fetchRenderedHtml, BrowserlessError } from './browserless.ts'
import { discoverMenuCandidates, findSubMenuPages, type MenuCandidate } from './menu-candidates.ts'

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
  'oysters', 'pastry',
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
| entree | Catch-all for entrees that don't fit any specific category |

## Rules

1. **Extract EVERY food dish on the menu** — be thorough, don't skip items
2. **Skip ALL drinks** — no cocktails, beer, wine, coffee, soda, juice, or any beverages
3. **Skip kids meals**
4. **Skip condiments** — extra sauce, side of dressing, bread roll
5. **Skip side dishes** — mashed potatoes, green beans, rice, coleslaw, steamed veggies, etc. NOT rateable.
6. **EXCEPTION: Fries and onion rings ARE included** — people rate these. Keep them.
7. **Deduplicate sizes, portions, and near-duplicate names within a menu section**:
   - **Size/portion variants** (Small/Medium/Large, 10"/14", Cup/Bowl, half/whole, lunch/dinner): output ONE entry per dish. Use the larger/dinner price.
   - **Near-duplicate names** (same menu_section, same category): if two dishes differ only by a redundant category suffix — "Margherita" vs "Margherita Pizza", "Caesar" vs "Caesar Salad", "Lobster" vs "Lobster Roll" when both are in the pizza / salad / lobster-roll section — they are the SAME dish listed twice. Output ONE entry. Prefer the shorter name (without the redundant category word).
   - **Genuinely different portions stay separate:** "Half Roast Chicken" vs "Whole Roast Chicken", "Kids Burger" vs "Burger" — output both.
   - **When in doubt:** if two dishes in the same section have names that a normal human would read as "the same dish at different prices," collapse them. Better to under-count than to duplicate.
8. **Prices: NEVER INVENT OR GUESS PRICES.** Only set a price if you can see an exact dollar amount next to that specific dish on the source page. If no explicit price is shown for a dish, the price field MUST be \`null\`. Do NOT infer prices from nearby dishes, category averages, or typical market values. Do NOT fill in \`18\` or any default. A null price is always better than a guessed price. If a range is shown (e.g. "$14-18"), use the lower number.
9. **One category per dish** — pick the most specific match

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
    { "name": "Dish Name", "category": "category_id", "menu_section": "Section Name", "price": 18.00 }
  ],
  "menu_section_order": ["Section 1", "Section 2"]
}`

interface ExtractedDish {
  name: string
  category: string
  menu_section: string
  price: number | null
}

interface MenuExtractionResult {
  dishes: ExtractedDish[]
  menu_section_order: string[]
}

const MAX_RESTAURANTS_PER_RUN = 10
const STALE_DAYS = 14

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

type ErrorCode = 'no_menu_url' | 'fetch_timeout' | 'fetch_error' | 'claude_error' | 'parse_error' | 'no_dishes' | 'page_too_short'

function classifyError(error: unknown, context?: string): { code: ErrorCode; message: string; context: Record<string, unknown> } {
  const message = error instanceof Error ? error.message : String(error)

  if (context === 'no_menu_url') {
    return { code: 'no_menu_url', message: 'No menu URL found', context: {} }
  }
  if (context === 'no_dishes') {
    return { code: 'no_dishes', message: 'No dishes extracted from content', context: {} }
  }
  if (context === 'page_too_short') {
    return { code: 'page_too_short', message: 'Page content too short (<50 chars)', context: {} }
  }
  if (message.includes('abort') || message.includes('timeout')) {
    return { code: 'fetch_timeout', message, context: {} }
  }
  if (message.includes('HTTP ')) {
    const statusMatch = message.match(/HTTP (\d+)/)
    return { code: 'fetch_error', message, context: { http_status: statusMatch?.[1] } }
  }
  if (message.includes('Claude API error')) {
    return { code: 'claude_error', message, context: {} }
  }
  if (message.includes('JSON') || message.includes('parse')) {
    return { code: 'parse_error', message, context: {} }
  }
  return { code: 'claude_error', message, context: {} }
}

function calculateBackoff(attemptCount: number): Date {
  const minutes = 5 * Math.pow(6, attemptCount - 1)
  const backoff = new Date()
  backoff.setMinutes(backoff.getMinutes() + minutes)
  return backoff
}

/**
 * Fetch raw HTML from a URL with a browser-ish User-Agent and 20s timeout.
 * Returns the full HTML text. Caller is responsible for extracting content.
 */
async function fetchRawHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhatsGoodHere-MenuBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.text()
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
 */
async function fetchMenuContent(url: string): Promise<string> {
  const html = await fetchRawHtml(url)
  return extractMenuTextFromHtml(html)
}

interface ExtractionAttempt {
  strategy: 'image' | 'pdf' | 'html' | 'sub-page'
  url_count: number
  top_score?: number
  dishes_found: number
  error?: string
  url?: string  // for sub-page attempts, which sub-URL was tried
}

// Caps per strategy. Vision is per-pixel-token expensive — keep image batches small.
const MAX_IMAGE_CANDIDATES = 3
const MAX_PDF_CANDIDATES = 6
const MAX_SUB_PAGES = 4
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
    }))

  return {
    dishes: validDishes,
    menu_section_order: Array.isArray(parsed.menu_section_order) ? parsed.menu_section_order : [],
  }
}

/**
 * Extract dishes from one or more menu IMAGES (PNG/JPG/WEBP) using Sonnet vision.
 * Images are passed by URL so Sonnet fetches them server-side (no Edge Function OOM).
 * Vision is more expensive than document blocks per token — keep batches small (≤3).
 */
async function extractMenuFromImagesWithClaude(
  imageUrls: string[],
  restaurantName: string
): Promise<MenuExtractionResult> {
  const httpsUrls = toHttpsUrls(imageUrls)
  if (httpsUrls.length === 0) return { dishes: [], menu_section_order: [] }

  const content: Array<Record<string, unknown>> = httpsUrls.map(url => ({
    type: 'image',
    source: { type: 'url', url },
  }))

  content.push({
    type: 'text',
    text: `Extract the full menu from "${restaurantName}" from the ${httpsUrls.length === 1 ? 'attached image' : `${httpsUrls.length} attached images`}. The images are page-ordered. If different images represent different services (breakfast, lunch, dinner), preserve those as menu sections.`,
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
    .select('id, name, category, menu_section, price, photo_url')
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

      if (priceChanged || categoryChanged || sectionChanged) {
        const updates: Record<string, unknown> = {}
        if (categoryChanged) updates.category = dish.category
        if (sectionChanged) updates.menu_section = dish.menu_section
        if (priceChanged) updates.price = dish.price

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
            .select('id, name, address, menu_url, website_url, google_place_id, menu_content_hash')
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
          let rawHtml: string
          try {
            rawHtml = await fetchRawHtml(menuUrl)
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
          // If the raw HTML shell hasn't changed since last successful run, skip everything.
          // This costs some freshness on JS-rendered sites (Wix shell may not change even when
          // the menu does), but avoids paying Sonnet and Browserless on every cron cycle.
          // The 14-day refresh cron will eventually catch menu updates.
          const rawHash = await hashContent(rawText)
          if (restaurant.menu_content_hash && restaurant.menu_content_hash === rawHash) {
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
          if (extracted.dishes.length === 0) {
            const subPages = findSubMenuPages(rawHtml, menuUrl, MAX_SUB_PAGES)
            if (subPages.length > 0) {
              console.log(`${restaurant.name}: trying ${subPages.length} sub-menu pages`)
              // Dedupe across sub-pages by (lowercased name, lowercased section).
              // Many restaurants list the same dish on /lunch and /dinner; without
              // deduping we'd report inflated dishes_found, and even though
              // upsertDishes coalesces by name later, keeping the merged result
              // honest matters for telemetry and for pages that genuinely share
              // sections (e.g. desserts).
              const seenDishes = new Set<string>()
              const mergedDishes: typeof extracted.dishes = []
              const mergedSections: string[] = []
              for (const subUrl of subPages) {
                try {
                  const subHtml = await fetchRawHtml(subUrl)
                  const subText = extractMenuTextFromHtml(subHtml)
                  if (subText.length < 50) {
                    attempts.push({ strategy: 'sub-page', url_count: 1, dishes_found: 0, url: subUrl, error: 'page_too_short' })
                    continue
                  }
                  const subResult = await extractMenuWithClaude(subText, restaurant.name)
                  attempts.push({ strategy: 'sub-page', url_count: 1, dishes_found: subResult.dishes.length, url: subUrl })
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
                  console.error(`${restaurant.name}: sub-page ${subUrl} failed:`, message)
                  attempts.push({ strategy: 'sub-page', url_count: 1, dishes_found: 0, url: subUrl, error: message })
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

    // === Batch fallback mode: find stale menus ===
    let restaurants: Array<{ id: string; name: string; menu_url: string; menu_content_hash: string | null }>

    {
      // Batch mode: find stale menus
      const staleDate = new Date()
      staleDate.setDate(staleDate.getDate() - STALE_DAYS)

      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, menu_url, menu_content_hash')
        .not('menu_url', 'is', null)
        .eq('is_open', true)
        .or(`menu_last_checked.is.null,menu_last_checked.lt.${staleDate.toISOString()}`)
        .limit(MAX_RESTAURANTS_PER_RUN)

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch restaurants' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      restaurants = data || []
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

    for (const restaurant of restaurants) {
      try {
        console.log(`Processing menu for: ${restaurant.name}`)

        // Fetch menu content
        const content = await fetchMenuContent(restaurant.menu_url)
        if (content.length < 50) {
          results.push({ restaurant_id: restaurant.id, name: restaurant.name, status: 'skipped: page too short' })
          continue
        }

        // Content hash — skip Claude if page hasn't changed
        const contentHash = await hashContent(content)
        if (restaurant.menu_content_hash && restaurant.menu_content_hash === contentHash) {
          console.log(`${restaurant.name}: content unchanged, skipping`)
          await supabase
            .from('restaurants')
            .update({ menu_last_checked: new Date().toISOString() })
            .eq('id', restaurant.id)
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

        // Mark menu as checked + save content hash
        await supabase
          .from('restaurants')
          .update({
            menu_last_checked: new Date().toISOString(),
            menu_content_hash: contentHash,
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
