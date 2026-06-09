import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * extract-menu-from-photo Edge Function
 *
 * Vision-extracts dishes from 1-4 user-uploaded menu photos and persists the
 * result into `menu_photo_extractions` for the user to review before committing.
 *
 * Auth:        JWT required (verify_jwt = true at gateway, like photo-moderate).
 * Ownership:   Every URL must be a `menu-photos` public URL of this project
 *              whose first path segment after the bucket == auth.uid().
 * Rate limit:  10/min via check_and_record_rate_limit.
 * Writes:      Only to `menu_photo_extractions` (service role). Never touches
 *              the `dishes` table.
 *
 * Deploy note: MENU_EXTRACTION_PROMPT and VALID_CATEGORIES are duplicated from
 * menu-refresh. When the prompt changes there, co-deploy this function too.
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh MENU_EXTRACTION_PROMPT — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
const MENU_EXTRACTION_PROMPT = `You are extracting a restaurant menu for a food discovery app. Your job is to produce output that mirrors the restaurant's actual menu — a user reading it should feel like they're looking at the real thing.

## Your #1 Priority: Faithfulness to the Source

The menu_section field and menu_section_order array must use the restaurant's EXACT section headings. If the menu says "From The Sea", you write "From The Sea" — not "Seafood", not "Fish Entrees". Copy the headings verbatim, preserving capitalization and punctuation.

Keep sections in the same order they appear on the menu. If "Raw Bar" comes before "Entrees" on the restaurant's menu, it comes first in your output.

Use the restaurant's exact dish names. If they call it "The Big Kahuna Burger", write that — don't shorten to "Kahuna Burger".

**Menu groups (GROUP markers).** Some sources mark distinct menus with a line \`GROUP: <name>\` (e.g. \`GROUP: All Day\`, \`GROUP: Brunch\`). When present, assign every dish below a GROUP marker to that group via the \`menu_group\` field, until the next GROUP marker. If the input has NO GROUP markers, set \`menu_group\` to \`null\` for every dish. Never invent groups — only use the exact GROUP labels given.

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
| cocktails | Alcoholic bar drinks ONLY: classic + signature cocktails, spirit-based drinks, wine cocktails (sangria), beer cocktails (michelada). Bartender-prepared with alcohol. NOT mocktails, NOT smoothies, NOT non-alcoholic anything, NOT canned/bottled RTDs |
| entree | Catch-all for entrees that don't fit any specific category |

## Rules

1. **Extract EVERY food dish on the menu** — be thorough, don't skip items
2. **Coffee drinks ARE included** — categorize as \`coffee\`. This covers drip coffee, americano, espresso, latte, cappuccino, cortado, macchiato, mocha, flat white, cold brew, iced coffee, and other coffee preparations. **Skip alcoholic coffee drinks** (Irish coffee, espresso martini, coffee negroni, anything with a liqueur) — those go in \`cocktails\`.

3. **Cocktails (ALCOHOL ONLY) ARE included** — categorize as \`cocktails\`. The category is **strictly alcoholic** — if it doesn't contain alcohol, it doesn't belong here. Decision rule: **include ONLY if** the drink is alcohol-based AND the menu shows mixed ingredients OR a classic/signature cocktail format (Old Fashioned, Margarita, Negroni, Espresso Martini, French 75, Mai Tai, Mule, Spritz, etc.). **Exclude if** the item is sold as a packaged brand SKU.

   **EXCLUDE everything non-alcoholic, no exceptions:**
   - **Mocktails / zero-proof / "spirit-free" / "alcohol-free" cocktails** — these are NOT \`cocktails\` per Dan's rule. Don't extract them at all.
   - **Smoothies, frappes, milkshakes, frozen lemonades, slushies** — frozen non-alcoholic drinks are not cocktails. Skip entirely (they don't fit any other category either).
   - **Juice cocktails, mocktail "spritzers", non-alcoholic punches** — skip.
   - **Tea drinks, matcha lattes, kombucha** (alcoholic or non-alcoholic) — skip.
   - **Hot chocolate, cider (non-alcoholic), egg nog (non-alcoholic)** — skip.

   **Beer is NEVER \`cocktails\`.** If a dish appears in a "Beer", "Draft", "Bottles", "Cans", "On Tap", "Brews" section, or if its name contains a beer-style token (\`IPA\`, \`lager\`, \`pilsner\`, \`stout\`, \`ale\`, \`porter\`, \`hefeweizen\`, \`saison\`, \`gose\`), exclude it — even if the name is creative ("Whale's Tale Pale Ale" is still beer). EXCEPTION: a beer cocktail / michelada / shandy made by the bartender (beer + lime + spice mix, not just beer) IS a cocktail.

   **Wine is NEVER \`cocktails\`.** Wine by the glass, by the bottle, varietal listings (Chardonnay, Pinot, Cabernet, Rosé, sparkling) — all excluded. Champagne by the glass excluded. EXCEPTION: house-made wine preparations like sangria, mulled wine, or wine cocktails — those count because they're built drinks.

   **Skip canned/bottled ready-to-drink (RTD) products** — bartender pops a can; doesn't make it. Skip everything in these categories regardless of brand:
   - **Hard seltzers:** High Noon, White Claw, Truly, Sun Cruiser, Surfside, Cape Line, Mighty Swell, Crook & Marker, Vizzy, Topo Chico Hard Seltzer, NUTRL, Happy Dad, Cacti, Stateside, press/tea/vodka canned lines
   - **Canned cocktails:** Cutwater, On The Rocks, Tip Top, BeatBox, Loverboy, Monaco, Cayman Jack
   - **Malt beverages:** Smirnoff Ice, Mike's Hard, Twisted Tea, Cayman Jack
   - **Generic class language:** "hard lemonade", "hard tea", "hard seltzer", "canned cocktail", "RTD" → exclude
   - Anything marketed as "ready to drink" or sold by the can/bottle as a finished product

   **"House" terms — be strict.** "House pour", "house draft", "house red", "house white" all mean the restaurant's default cheap option — NOT a handcrafted cocktail. Exclude. Only include "house-made" when followed by a mixed/prepared ALCOHOLIC drink (e.g., "house-made sangria", "house michelada", "house bloody mary"). The word that matters is *made + alcohol*, not *house*.

   **When in doubt:** alcohol-based + creative name + ingredient list + cocktail price range ($12–$18) → include as \`cocktails\`. Listed in a "Canned", "RTD", "Beer", "Wine", "On Tap", "Zero Proof", "Mocktails", "Spirit-Free" section → skip.

4. **Skip all OTHER beverages** — no juice, soda, lemonade, plain water, milk, plain tea, plain iced tea, kombucha, energy drinks, smoothies, frappes, milkshakes (unless an alcoholic milkshake like mudslide). Non-alcoholic beverages have no home in this app's categories — don't try to slot them anywhere.

   **Coffee vs cocktails precedence:** if an item is BOTH coffee AND alcoholic (espresso martini, Irish coffee, coffee negroni, white Russian, mudslide), route to \`cocktails\` — alcoholic wins. Non-alcoholic coffee stays \`coffee\` (rule 2).
5. **Skip kids meals**
6. **Skip condiments** — extra sauce, side of dressing, bread roll
7. **Skip side dishes** — mashed potatoes, green beans, rice, coleslaw, steamed veggies, etc. NOT rateable.
8. **EXCEPTION: Fries and onion rings ARE included** — people rate these. Keep them.
9. **Skip tinned/canned/jarred seafood (conservas)** — fish or shellfish sold by the tin/can/jar as a RETAIL product, not a plated dish. Recognize the pattern: many single-species listings grouped by fish type (Sardines, Anchovies, Mackerel, Tuna, Mussels, Cockles, Squid, Octopus, Herring, Cod, etc.), brand/origin names, and descriptions that are only a preservation medium ("in olive oil", "in EVOO", "in escabeche", "in spiced oil", "with lemon", "smoked, tinned") rather than a cooked or composed preparation. A restaurant with a "Tinned Fish" / "Conservas" / "Tins" program lists dozens of these — they are retail items diners buy, not dishes they order and rate, so skip the entire program. **KEEP prepared seafood**: chowders, fried/grilled/roasted preparations, crudo, raw oysters/clams on the half shell, lobster rolls, seafood towers — anything cooked, plated, or composed with accompaniments.
10. **Deduplicate sizes, portions, and near-duplicate names within a menu section**:
   - **Size/portion variants** (Small/Medium/Large, 10"/14", Cup/Bowl, half/whole, lunch/dinner): output ONE entry per dish. Use the larger/dinner price.
   - **Near-duplicate names** (same menu_section, same category): if two dishes differ only by a redundant category suffix — "Margherita" vs "Margherita Pizza", "Caesar" vs "Caesar Salad", "Lobster" vs "Lobster Roll" when both are in the pizza / salad / lobster-roll section — they are the SAME dish listed twice. Output ONE entry. Prefer the shorter name (without the redundant category word).
   - **Genuinely different portions stay separate:** "Half Roast Chicken" vs "Whole Roast Chicken", "Kids Burger" vs "Burger" — output both.
   - **When in doubt:** if two dishes in the same section have names that a normal human would read as "the same dish at different prices," collapse them. Better to under-count than to duplicate.
11. **Prices: NEVER INVENT OR GUESS PRICES.** Only set a price if you can see an exact dollar amount next to that specific dish on the source page. If no explicit price is shown for a dish, the price field MUST be \`null\`. Do NOT infer prices from nearby dishes, category averages, or typical market values. Do NOT fill in \`18\` or any default. A null price is always better than a guessed price. If a range is shown (e.g. "$14-18"), use the lower number.
12. **One category per dish** — pick the most specific match
13. **Description rule:** Output an ingredient/preparation line **150 chars or fewer** as \`description\`. Format: comma-separated nouns. List the dish's defining ingredients in the order the menu presents them — protein, signature accompaniments, sauce/finish. Skip filler adjectives ("fresh", "house-made", "perfectly"). If the menu copy fits under 150 chars, keep all of it. **Never truncate mid-word.** Examples: "Hot lobster meat, drawn butter, split-top bun" / "Fried cauliflower, brussels sprouts, sun-dried tomato melange, crispy garlic, smoked sea salt, vichyssoise sauce" / "Wagyu beef, bacon jam, brioche bun". If the menu has only marketing copy ("OUR SIGNATURE HAND-CRAFTED..."), output \`null\`. Never invent ingredients you don't see in the source.
14. **Dietary tags rule:** Output a \`dietary_tags\` array. Allowed tags (and only these): \`vegan\`, \`vegetarian\`, \`gluten_free\`, \`dairy_free\`, \`nut_free\`. **Only emit a tag when the menu definitively labels the dish as that diet** (not "available" or "on request"). This is an allergen-safety contract — a celiac diner trusts \`gluten_free\` to mean the dish is gluten-free as served, not "can be modified."

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
      "menu_group": "All Day",
      "menu_section": "Section Name",
      "price": 18.00,
      "description": "ingredient, ingredient, prep",
      "dietary_tags": ["vegan"]
    }
  ],
  "menu_section_order": ["Section 1", "Section 2"]
}

(menu_group is null when the input has no GROUP markers.)`

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh VALID_CATEGORIES — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
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
  'oysters', 'pastry', 'coffee', 'cocktails',
]

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh sanitizeDietaryTags + sanitizeDescription — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
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
  if (trimmed.length <= 150) return trimmed
  const capped = trimmed.slice(0, 150)
  const lastSpace = capped.lastIndexOf(' ')
  const result = lastSpace >= 80 ? capped.slice(0, lastSpace) : capped
  return result.trimEnd().replace(/[,;:.·•\-–—]+$/, '')
}

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh ANTHROPIC_IMAGE_MEDIA_TYPES + MAX_IMAGE_BYTES — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
// Anthropic accepts image/png, image/jpeg, image/webp, image/gif for vision.
const ANTHROPIC_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
// 5MB is Anthropic's per-image cap; well under Edge Function memory limits at typical batch=4.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh toHttpsUrls — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
/**
 * Anthropic's image URL sources require HTTPS — they reject http:// with
 * "Only HTTPS URLs are supported." Upgrade http:// to https:// before sending.
 * Drop non-http(s) URLs. Dedup to avoid double-charging.
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

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh downloadImageAsBase64 — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// Note: we omit the safeFetch SSRF guard here because photo URLs are already
// verified to be from THIS Supabase project's public storage (origin + bucket
// checks above). Fetching our own storage is safe and doesn't need the guard.
// ---------------------------------------------------------------------------
/**
 * Download an image and return it as base64 with its media type. Returns null
 * if the URL is unreachable, the response isn't a supported image type, or
 * the bytes exceed Anthropic's per-image cap.
 */
async function downloadImageAsBase64(
  url: string,
  signal: AbortSignal,
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
    // Pre-check Content-Length so a large image doesn't fully buffer before rejection.
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

// ---------------------------------------------------------------------------
// Types (local — not imported from menu-refresh)
// ---------------------------------------------------------------------------
interface ExtractedDish {
  name: string
  category: string
  menu_group: string | null
  menu_section: string
  price: number | null
  description: string | null
  dietary_tags: string[]
}

interface MenuExtractionResult {
  dishes: ExtractedDish[]
  menu_section_order: string[]
}

// ---------------------------------------------------------------------------
// MIRROR of menu-refresh extractMenuFromImagesWithClaude body — keep in sync
// Source: supabase/functions/menu-refresh/index.ts
// ---------------------------------------------------------------------------
/**
 * Extract dishes from 1-N menu images using Sonnet vision.
 * Images are downloaded server-side as base64 (bypasses robots.txt on CDNs).
 */
async function extractMenuFromImagesWithClaude(
  imageUrls: string[],
  restaurantName: string,
): Promise<MenuExtractionResult> {
  const httpsUrls = toHttpsUrls(imageUrls)
  if (httpsUrls.length === 0) return { dishes: [], menu_section_order: [] }

  // 20s overall budget for image downloads.
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
      menu_group: typeof d.menu_group === 'string' && d.menu_group.trim() ? d.menu_group.trim() : null,
      description: sanitizeDescription(d.description),
      dietary_tags: sanitizeDietaryTags(d.dietary_tags),
    }))

  return {
    dishes: validDishes,
    menu_section_order: Array.isArray(parsed.menu_section_order) ? parsed.menu_section_order : [],
  }
}

// ---------------------------------------------------------------------------
// Main handler — mirrors photo-moderate's request handling structure
// Source: supabase/functions/photo-moderate/index.ts
// ---------------------------------------------------------------------------
serve(async (req) => {
  // MIRROR of photo-moderate CORS pattern
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
  // Auth gate — MIRROR of photo-moderate JWT auth pattern
  // Source: supabase/functions/photo-moderate/index.ts lines 138–154
  // Require an authenticated caller. Without auth, any anonymous visitor could
  // burn Anthropic tokens by hitting this endpoint.
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

  // ANTHROPIC_API_KEY check — MIRROR of menu-refresh pattern (500 if missing)
  // Source: supabase/functions/menu-refresh/index.ts lines 1324–1329
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Input validation
  const rawPhotoUrls = body.photo_urls
  if (!Array.isArray(rawPhotoUrls) || rawPhotoUrls.length === 0) {
    return new Response(JSON.stringify({ error: 'photo_urls required (non-empty array)' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const restaurantId = typeof body.restaurant_id === 'string' ? body.restaurant_id.trim() : ''
  if (!restaurantId) {
    return new Response(JSON.stringify({ error: 'restaurant_id required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Validate restaurant_id is a UUID (format: 8-4-4-4-12 hex digits)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(restaurantId)) {
    return new Response(JSON.stringify({ error: 'invalid restaurant_id' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const restaurantName = typeof body.restaurant_name === 'string' ? body.restaurant_name.trim() : 'this restaurant'

  // Cap at 4 images (ignore beyond)
  const photoUrls = (rawPhotoUrls as unknown[]).slice(0, 4)

  // ---------------------------------------------------------------------------
  // URL validation + ownership check — MIRROR of photo-moderate URL parsing
  // Source: supabase/functions/photo-moderate/index.ts lines 188–238
  //
  // Every URL must be:
  //   1. A valid https:// URL
  //   2. From THIS Supabase project's origin
  //   3. A public storage object path: /storage/v1/object/public/<bucket>/...
  //   4. In the `menu-photos` bucket (not dish-photos, not avatars)
  //   5. First path segment after the bucket == authUser.id (ownership)
  //
  // Using new URL() rather than substring matching per photo-moderate's
  // rationale: URL parsing normalizes origin separately from path, preventing
  // path-traversal sequences ('..') and query-string tricks from bypassing
  // the checks.
  // ---------------------------------------------------------------------------
  const expectedOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''

  for (const rawUrl of photoUrls) {
    if (typeof rawUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'All photo_urls must be strings' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (!rawUrl.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'All photo_urls must be https' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl)
    } catch {
      return new Response(JSON.stringify({ error: 'photo_url is not a valid URL' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!expectedOrigin || parsedUrl.origin !== expectedOrigin) {
      return new Response(JSON.stringify({ error: 'photo_url must come from this Supabase project' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Strip leading slash and split. Reject empty segments and path-traversal
    // markers ('.' / '..') so we can't be tricked into addressing a different
    // file from what the textual path appears to claim.
    // Expected layout: /storage/v1/object/public/<bucket>/<user_id>/<rest...>
    const segments = parsedUrl.pathname.replace(/^\/+/, '').split('/')
    if (segments.some(s => s === '' || s === '.' || s === '..')) {
      return new Response(JSON.stringify({ error: 'photo_url has invalid path segments' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const [s0, s1, s2, s3, bucket, ownerSegment, photoRestaurantIdSegment] = segments
    if (s0 !== 'storage' || s1 !== 'v1' || s2 !== 'object' || s3 !== 'public') {
      return new Response(JSON.stringify({ error: 'photo_url must point to a public storage object' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Bucket allowlist: only menu-photos. Callers cannot pass dish-photos or
    // any other bucket URL to extract a menu from an arbitrary image.
    if (bucket !== 'menu-photos') {
      return new Response(JSON.stringify({ error: 'photo_url must point to the menu-photos bucket' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Ownership check — MIRROR of photo-moderate lines 235–238
    // Upload paths are {user_id}/{restaurant_id}/{ts}-{n}.jpg — the first path
    // segment after the bucket prefix is the owner's UUID. Reject mismatches:
    // without this, an authenticated user could pass any other user's photo URL
    // and trigger a Sonnet call (token spend) against someone else's upload.
    if (!ownerSegment || ownerSegment !== authUser.id) {
      return new Response(JSON.stringify({ error: 'Photo does not belong to caller' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Restaurant ID binding check — ensure the photo's restaurant_id segment
    // matches the input restaurant_id. This prevents attributing a photo
    // uploaded for one restaurant to a different restaurant.
    if (!photoRestaurantIdSegment || photoRestaurantIdSegment !== restaurantId) {
      return new Response(JSON.stringify({ error: 'Photo was not uploaded for this restaurant' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Rate limit — MIRROR of photo-moderate check_and_record_rate_limit call
  // Source: supabase/functions/photo-moderate/index.ts lines 243–251
  // Action 'extract_menu_from_photo', limit 10/min (spec §2 + §1 rate-limit table)
  // ---------------------------------------------------------------------------
  const { data: rateCheck } = await authClient.rpc('check_and_record_rate_limit', {
    p_action: 'extract_menu_from_photo',
    p_max_attempts: 10,
    p_window_seconds: 60,
  })
  if (rateCheck && !rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', retry_after: rateCheck.retry_after_seconds }),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  // ---------------------------------------------------------------------------
  // Extraction — call Sonnet vision with the menu photos
  // ---------------------------------------------------------------------------
  let extracted: MenuExtractionResult
  try {
    extracted = await extractMenuFromImagesWithClaude(
      photoUrls as string[],
      restaurantName,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('extract-menu-from-photo: extraction failed', message)
    return new Response(JSON.stringify({ error: 'Menu extraction failed. Please try again.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // Zero dishes is not an error — the user's review UI will show an empty state.
  if (extracted.dishes.length === 0) {
    return new Response(
      JSON.stringify({ extraction_id: null, dishes: [], menu_section_order: [] }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  // ---------------------------------------------------------------------------
  // Persist extraction — service-role client, writes ONLY to menu_photo_extractions
  // MIRROR of menu-refresh service-role client creation pattern
  // Source: supabase/functions/menu-refresh/index.ts lines 1332–1334
  // ---------------------------------------------------------------------------
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseServiceKey) {
    console.error('extract-menu-from-photo: SUPABASE_SERVICE_ROLE_KEY not configured')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  // Service-role client: bypasses RLS for the INSERT into menu_photo_extractions.
  // menu_photo_extractions RLS allows only service-role writes (SELECT is
  // owner-gated: user_id = auth.uid()). Never use this client for the dishes table.
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  const { data: insertedRow, error: insertErr } = await serviceClient
    .from('menu_photo_extractions')
    .insert({
      user_id: authUser.id,
      restaurant_id: restaurantId,
      dishes: extracted.dishes,
      menu_section_order: extracted.menu_section_order,
    })
    .select('id')
    .single()

  if (insertErr || !insertedRow) {
    console.error('extract-menu-from-photo: failed to persist extraction', insertErr?.message)
    return new Response(JSON.stringify({ error: 'Failed to save extraction. Please try again.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      extraction_id: insertedRow.id,
      dishes: extracted.dishes,
      menu_section_order: extracted.menu_section_order,
    }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
