// supabase/functions/menu-xray/lib.ts
// Pure logic for the Menu X-Ray edge function. Self-contained on purpose:
// dashboard deploys cannot follow ../_shared or ../menu-refresh imports,
// so the shared pieces below are copied verbatim from their sources.

// --- Copied verbatim from supabase/functions/menu-refresh/index.ts (VALID_CATEGORIES) ---
export const VALID_CATEGORIES = [
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

// --- Copied verbatim from supabase/functions/menu-refresh/index.ts (MENU_EXTRACTION_PROMPT),
// with ONE addition: the final not-a-menu rule appended for photo input. ---
export const MENU_EXTRACTION_PROMPT = `You are extracting a restaurant menu for a food discovery app. Your job is to produce output that mirrors the restaurant's actual menu — a user reading it should feel like they're looking at the real thing.

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

(menu_group is null when the input has no GROUP markers.)

If the image is NOT a menu (a person, a pet, scenery, a receipt), return exactly: {"dishes": [], "not_a_menu": true}`

// --- Copied verbatim from supabase/functions/menu-refresh/extractors.ts (normalizeDishKey + helpers) ---
// Glue words collapsed away during normalization. Dietary shorthand
// letters (GF, V, VG, etc.) are intentionally NOT in this list — they
// are price-bearing identity tokens in practice (e.g., "GF Boston Cream"
// at $4 vs "Boston Cream" at $3.50 are different SKUs, not the same dish
// with a redundant marker).
const NORMALIZE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'with', 'of', 'on', 'in', 'or', 'over', 'n',
])

// Common menu-code abbreviations that get expanded so "Chix Wrap" matches
// "Chicken Wrap". Conservative list — only widely-used menu shorthand.
const NORMALIZE_ABBREV: Record<string, string> = {
  chix: 'chicken',
  chkn: 'chicken',
  brgr: 'burger',
  burg: 'burger',
}

// Tokens that are redundant inside a name because they restate the dish's
// category. Keyed by the category column value. Add carefully — anything
// listed here will collapse "Foo X" and "Foo" into the same key when
// category=X. Only include words specific enough that they uniquely restate
// the category (e.g., 'donut' for category=donuts is safe; 'roll' for
// category=lobster-roll is too broad because lots of dishes are rolls).
const CATEGORY_REDUNDANT_WORDS: Record<string, string[]> = {
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

// Matches parenthetical groups that contain at least one digit — used to
// collapse quantity/size info like "(3)" or "(10 pc)" into a single qty
// token so different counts stay distinct. Non-numeric parentheticals
// (e.g., "(Shrimp)", "(Half Dozen)", "(Ghana)") are LEFT IN PLACE — we
// can't reliably distinguish identity-neutral region tags from identity-
// bearing modifiers like protein options or portion sizes without a
// knowledge base. Erring on the side of "keep separate" prevents the
// upsert from silently merging different SKUs at different prices.
const NUMERIC_PAREN_RE = /\([^)]*\d[^)]*\)/g

/**
 * Build a normalized matching key for a dish name. Two dishes with the same
 * normalized key (within the same restaurant and category) should be treated
 * as the same dish for upsert purposes.
 *
 * Conservative — strips only structural noise (punctuation, parenthetical
 * tags, asterisks, dietary shorthand, redundant category words, common
 * menu-code abbreviations). Token order is normalized but content tokens
 * (sizes, modifiers, ingredients) are preserved, so "Half Roast Chicken"
 * and "Whole Roast Chicken" stay distinct.
 */
export function normalizeDishKey(rawName: string, category: string | null | undefined): string {
  if (!rawName) return ''
  const cat = (category || '').toLowerCase().trim()

  // Step 1: lowercase + Unicode-normalize so "café" matches "cafe" and
  // "jalapeño" matches "jalapeno". U+0300–U+036F is the combining-
  // diacritical-marks block, separated out by NFKD decomposition.
  const lowered = rawName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

  // Step 2: collapse numeric parens to qty tokens so quantity differences
  // ("(3)" vs "(6)") survive the rest of the pipeline. Non-numeric parens
  // are LEFT IN PLACE — their contents become regular tokens that
  // differentiate variants like "(Shrimp)" vs "(Steak)" or "(Half Dozen)"
  // vs "(Dozen)".
  const protectedParens = lowered.replace(NUMERIC_PAREN_RE, (m) => {
    const digits = m.match(/\d+/g)?.join('-') ?? ''
    return ` qty${digits} `
  })

  // Step 3: strip asterisks, apostrophes, and remaining punctuation.
  // Paren BRACKETS are stripped here (punctuation), but their contents
  // were already preserved as plain tokens by step 2 (for numeric) or
  // left in place (for non-numeric).
  const cleaned = protectedParens
    .replace(/[*]/g, ' ')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  const redundant = new Set(CATEGORY_REDUNDANT_WORDS[cat] || [])

  const tokens = cleaned
    .split(' ')
    .map((t) => NORMALIZE_ABBREV[t] ?? t)
    .filter((t) => t && !NORMALIZE_STOPWORDS.has(t))

  const filtered = tokens.filter((t) => !redundant.has(t))

  // If stripping category words would leave the name empty (rare — a dish
  // literally named "Donut" in category=donuts), fall back to the unfiltered
  // tokens so the key isn't ambiguous.
  const final = filtered.length > 0 ? filtered : tokens

  return final.slice().sort().join(' ')
}

// ---------------------------------------------------------------------------
// Menu X-Ray pure logic (original to this function)
// ---------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp']
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  // WebP requires BOTH the RIFF container header (bytes 0-3) and WEBP (bytes 8-11).
  'image/webp': (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
}

export function validateImagePayload(base64: string, mediaType: string): { ok: boolean; error?: string } {
  if (!base64 || typeof base64 !== 'string') return { ok: false, error: 'Missing image' }
  if (!ACCEPTED_MEDIA.includes(mediaType)) return { ok: false, error: 'Unsupported image type' }
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) return { ok: false, error: 'Image too large (5MB max)' }
  let head: Uint8Array
  try {
    const slice = atob(base64.slice(0, 24))
    head = Uint8Array.from(slice, (c) => c.charCodeAt(0))
  } catch {
    return { ok: false, error: 'Invalid image encoding' }
  }
  if (!MAGIC[mediaType](head)) return { ok: false, error: 'Image data does not match declared type' }
  return { ok: true }
}

export interface ExtractedItem {
  name: string
  category: string
  price?: number | null
  menu_section?: string | null
  description?: string | null
  dietary_tags?: string[]
}
export interface MatchRow {
  query_name: string
  rank: number
  dish_id: string
  dish_name: string
  dish_category: string
  avg_rating: number | null
  total_votes: number
  price: number | null
  sim: number
}

export const SIM_ACCEPT = 0.45
export const SIM_STRONG = 0.6
export const SIM_MARGIN = 0.1

export function decideMatches(items: ExtractedItem[], rows: MatchRow[]): Map<string, MatchRow> {
  const byName = new Map<string, MatchRow[]>()
  for (const r of rows) {
    const list = byName.get(r.query_name) || []
    list.push(r)
    byName.set(r.query_name, list)
  }
  // Name IS identity here: the match RPC queries by name, and dish ingest
  // dedupes by normalized name — so duplicate extracted names (same dish in
  // two sections) intentionally resolve once. First occurrence wins.
  const accepted = new Map<string, MatchRow>()
  const seenNames = new Set<string>()
  for (const item of items) {
    if (seenNames.has(item.name)) continue
    seenNames.add(item.name)
    const cands = (byName.get(item.name) || []).slice().sort((a, b) => a.rank - b.rank)
    const top = cands[0]
    if (!top || top.sim <= SIM_ACCEPT) continue
    const second = cands[1]
    const margin = second ? top.sim - second.sim : 1
    if (top.sim >= SIM_STRONG || margin >= SIM_MARGIN) {
      accepted.set(item.name, top)
      continue
    }
    // Near-tie: category agreement breaks it — but the agreeing row must
    // itself clear the accept threshold (a weak third candidate that merely
    // shares the category is not a match).
    const agreeing = cands.filter((c) => c.dish_category === item.category && c.sim > SIM_ACCEPT)
    if (agreeing.length === 1) accepted.set(item.name, agreeing[0])
  }
  return accepted
}

export interface ExistingDish { id: string; name: string; category: string; price: number | null }

// The prompt contract allows exactly these five tags; anything else from the
// model is dropped at the gate.
const ALLOWED_DIETARY_TAGS = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free']

export function buildIngestList(
  items: ExtractedItem[],
  matchedNames: Set<string>,
  existing: ExistingDish[],
): Array<{ name: string; category: string; price: number | null; menu_section: string | null; description: string | null; dietary_tags: string[] }> {
  const existingKeys = new Set(existing.map((d) => normalizeDishKey(d.name, d.category)))
  const seen = new Set<string>()
  const out = []
  for (const item of items) {
    if (matchedNames.has(item.name)) continue
    // Strip zero-width characters before the length gate so visually blank
    // names can't sneak through, then require a substantive normalized key.
    const name = (item.name || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
    if (name.length < 2 || name.length > 80) continue
    const key = normalizeDishKey(name, item.category)
    if (!key || key.length < 2 || existingKeys.has(key) || seen.has(key)) continue
    seen.add(key)
    const category = VALID_CATEGORIES.includes((item.category || '').toLowerCase())
      ? item.category.toLowerCase() : 'entree'
    const price = typeof item.price === 'number' && item.price > 0 && item.price < 500 ? item.price : null
    const dietaryTags = Array.isArray(item.dietary_tags)
      ? item.dietary_tags.filter((t): t is string => typeof t === 'string' && ALLOWED_DIETARY_TAGS.includes(t))
      : []
    out.push({
      name,
      category,
      price,
      menu_section: item.menu_section || null,
      description: item.description || null,
      dietary_tags: dietaryTags,
    })
  }
  return out
}
