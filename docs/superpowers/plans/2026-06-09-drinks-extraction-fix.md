# Drinks Extraction Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover cocktail/coffee menus that live on a separate drinks asset or sub-page, which the food-biased candidate scorer currently never sends to the LLM.

**Architecture:** Add an inverted "drinks" scorer + drinks sub-page finder to `menu-candidates.ts`. In `menu-refresh/index.ts`, after a food extraction succeeds, if it found fewer than 5 cocktail/coffee dishes AND a positive-scored drinks source exists, run ONE extra LLM extraction on the best drinks asset/sub-page with a drinks-only hint and merge the rows. Additive, capped at one extra call, food never changes.

**Tech Stack:** TypeScript, Deno (Supabase Edge Function), Vitest (for the pure `menu-candidates.ts` helpers), Anthropic Sonnet (`claude-sonnet-4-6`).

**Spec:** `docs/superpowers/specs/2026-06-09-drinks-extraction-fix-design.md`
**Gap map:** `docs/superpowers/specs/2026-06-09-menu-pipeline-gap-map.md` (Gap 6)

---

## File Structure

- **Modify** `supabase/functions/menu-refresh/menu-candidates.ts`
  - Refactor `scoreCandidate` to delegate to a shared `scoreWith(positive, negative, ...)`.
  - Add `DRINK_POSITIVE_KEYWORDS`, `DRINK_NEGATIVE_KEYWORDS`, `scoreDrinkCandidate`, `discoverDrinkCandidates`.
  - Add drink sub-page patterns + `findDrinkSubPages`.
- **Modify** `supabase/functions/menu-refresh/menu-candidates.test.ts` (Vitest) — tests for all of the above.
- **Modify** `supabase/functions/menu-refresh/index.ts`
  - `DRINK_RECOVERY_THRESHOLD`, `DRINK_RECOVERY_HINT` constants.
  - Optional `extractionHint` param on `extractMenuWithClaude`, `extractMenuFromImagesWithClaude`, `extractMenuFromPdfsWithClaude`.
  - `runDrinkRecovery(...)` helper.
  - Call sites: Branch A (after BentoBox group backfill, before `upsertDishes`) + Branch B (direct-PDF success branch).
  - Bump `CURRENT_EXTRACTOR_FINGERPRINT` (append `|drinks-pass-v1`).

Run all Vitest steps from repo root: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts`.

---

## Task 1: Shared scorer + drinks keyword model

**Files:**
- Modify: `supabase/functions/menu-refresh/menu-candidates.ts`
- Test: `supabase/functions/menu-refresh/menu-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `menu-candidates.test.ts`:

```ts
import { scoreDrinkCandidate } from './menu-candidates.ts' // add to existing import line

describe('scoreDrinkCandidate', () => {
  it('positive: cocktails in URL', () => {
    expect(scoreDrinkCandidate('https://x.com/cocktails.pdf').score).toBeGreaterThan(0)
  })
  it('positive: drinks menu image', () => {
    expect(scoreDrinkCandidate('https://x.com/Drinks-Menu.png').score).toBeGreaterThan(0)
  })
  it('positive: coffee menu', () => {
    expect(scoreDrinkCandidate('https://x.com/coffee-menu.pdf').score).toBeGreaterThan(0)
  })
  it('negative: a FOOD menu scores negative under the drink model', () => {
    expect(scoreDrinkCandidate('https://x.com/dinner-menu.pdf').score).toBeLessThan(0)
  })
  it('negative: logo rejected', () => {
    expect(scoreDrinkCandidate('https://x.com/logo.png').score).toBeLessThan(0)
  })
  it('negative: gift card rejected', () => {
    expect(scoreDrinkCandidate('https://x.com/gift-cards.pdf').score).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t scoreDrinkCandidate`
Expected: FAIL — `scoreDrinkCandidate is not exported` / not a function.

- [ ] **Step 3: Implement**

In `menu-candidates.ts`, add the drink keyword arrays after `NEGATIVE_KEYWORDS`:

```ts
// Drinks scorer — inverted from the food model. Used by the drinks-recovery
// pass to surface a SEPARATE cocktail/coffee menu (food assets score these
// terms strongly negative, so they never reach the LLM otherwise). Food terms
// are negative here so a food menu can't win the drink track. Noise negatives
// are intentionally duplicated (not shared) so this never perturbs the food
// scorer above.
const DRINK_POSITIVE_KEYWORDS: KeywordWeight[] = [
  { pattern: /\bcocktails?\b/i, weight: 5 },
  { pattern: /\bdrinks?\b/i, weight: 5 },
  { pattern: /\bbeverages?\b/i, weight: 4 },
  { pattern: /\bcoffee\b/i, weight: 4 },
  { pattern: /\bespresso\b/i, weight: 3 },
  { pattern: /\bbar[\s-]?menu\b/i, weight: 4 },
  { pattern: /\bbar\b/i, weight: 2 },
  { pattern: /\bcaf[eé]\b/i, weight: 2 },
  { pattern: /\bwines?\b/i, weight: 2 },
  { pattern: /\bhappy[\s-]?hour\b/i, weight: 2 },
]

const DRINK_NEGATIVE_KEYWORDS: KeywordWeight[] = [
  // Food suppressors — a food menu must not win the drink track.
  { pattern: /\bfood\b/i, weight: -4 },
  { pattern: /\bdinner\b/i, weight: -4 },
  { pattern: /\blunch\b/i, weight: -4 },
  { pattern: /\bbreakfast\b/i, weight: -4 },
  { pattern: /\bbrunch\b/i, weight: -4 },
  { pattern: /\bentrees?\b/i, weight: -2 },
  // Noise (duplicated from the food NEGATIVE_KEYWORDS on purpose).
  { pattern: /\ballergens?\b/i, weight: -8 },
  { pattern: /\bnutrition(al)?\b/i, weight: -6 },
  { pattern: /\bgift[\s-]?cards?\b/i, weight: -8 },
  { pattern: /\bgiftcards?\b/i, weight: -8 },
  { pattern: /\bcatering\b/i, weight: -4 },
  { pattern: /\bprivate[\s-]?events?\b/i, weight: -6 },
  { pattern: /\bterms\b/i, weight: -10 },
  { pattern: /\bprivacy\b/i, weight: -10 },
  { pattern: /\bpolicy\b/i, weight: -8 },
  { pattern: /\bapplication\b/i, weight: -8 },
  { pattern: /\bemployment\b/i, weight: -10 },
  { pattern: /\bjob\b/i, weight: -8 },
  { pattern: /\bcontract\b/i, weight: -8 },
  { pattern: /\bwaiver\b/i, weight: -10 },
  { pattern: /\brules\b/i, weight: -6 },
  { pattern: /\blogo\b/i, weight: -10 },
  { pattern: /\bfavicon\b/i, weight: -10 },
  { pattern: /\bicon\b/i, weight: -8 },
  { pattern: /\bheader\b/i, weight: -8 },
  { pattern: /\bbanner\b/i, weight: -8 },
  { pattern: /\bhero\b/i, weight: -8 },
  { pattern: /\bavatar\b/i, weight: -8 },
  { pattern: /\bthumbnail\b/i, weight: -6 },
  { pattern: /\bgallery\b/i, weight: -6 },
]
```

Refactor `scoreCandidate` to delegate to a shared scorer (behavior unchanged), then add `scoreDrinkCandidate`. Replace the existing `export function scoreCandidate(...)` body with:

```ts
function scoreWith(
  positive: KeywordWeight[],
  negative: KeywordWeight[],
  url: string,
  context: string,
): { score: number; evidence: string; hasNegative: boolean } {
  const decoded = `${normalize(url)} ${normalize(context)}`
  let score = 0
  let hasNegative = false
  const hits: string[] = []
  for (const { pattern, weight } of positive) {
    if (pattern.test(decoded)) { score += weight; hits.push(`+${weight}:${pattern.source}`) }
  }
  for (const { pattern, weight } of negative) {
    if (pattern.test(decoded)) { score += weight; hasNegative = true; hits.push(`${weight}:${pattern.source}`) }
  }
  return { score, evidence: hits.join(' '), hasNegative }
}

export function scoreCandidate(url: string, context: string = ''): { score: number; evidence: string; hasNegative: boolean } {
  return scoreWith(POSITIVE_KEYWORDS, NEGATIVE_KEYWORDS, url, context)
}

export function scoreDrinkCandidate(url: string, context: string = ''): { score: number; evidence: string; hasNegative: boolean } {
  return scoreWith(DRINK_POSITIVE_KEYWORDS, DRINK_NEGATIVE_KEYWORDS, url, context)
}
```

- [ ] **Step 4: Run tests to verify pass (new + existing scorer tests)**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t scoreDrinkCandidate`
Expected: PASS.
Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t scoreCandidate`
Expected: PASS (refactor preserved food behavior).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/menu-refresh/menu-candidates.ts supabase/functions/menu-refresh/menu-candidates.test.ts
git commit -m "feat(menu-refresh): add drinks-biased candidate scorer"
```

---

## Task 2: discoverDrinkCandidates

**Files:**
- Modify: `supabase/functions/menu-refresh/menu-candidates.ts`
- Test: `supabase/functions/menu-refresh/menu-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { discoverDrinkCandidates } from './menu-candidates.ts' // add to import line

describe('discoverDrinkCandidates', () => {
  const base = 'https://r.com/menu'
  it('surfaces a cocktail PDF that the food scorer would reject', () => {
    const html = `<a href="/files/Cocktail-Menu.pdf">Cocktails</a>`
    const out = discoverDrinkCandidates(html, base)
    expect(out.length).toBe(1)
    expect(out[0].url).toContain('Cocktail-Menu.pdf')
  })
  it('does NOT surface a plain food dinner PDF', () => {
    const html = `<a href="/files/Dinner-Menu.pdf">Dinner</a>`
    expect(discoverDrinkCandidates(html, base).length).toBe(0)
  })
  it('rejects a neutral opaque PDF (positive gate, not >=0)', () => {
    const html = `<a href="/files/upload-83fa.pdf">x</a>`
    expect(discoverDrinkCandidates(html, base).length).toBe(0)
  })
  it('sorts by score descending', () => {
    const html = `<a href="/wine.pdf">w</a><a href="/cocktail-drinks.pdf">c</a>`
    const out = discoverDrinkCandidates(html, base)
    expect(out[0].url).toContain('cocktail-drinks.pdf')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t discoverDrinkCandidates`
Expected: FAIL — `discoverDrinkCandidates is not a function`.

- [ ] **Step 3: Implement**

Add to `menu-candidates.ts` (near `discoverMenuCandidates`):

```ts
/**
 * Discover drinks-menu candidates (separate cocktail/coffee assets) on a page,
 * scored with the inverted drink model and a SYMMETRIC positive gate
 * (pdf > 0, image > 0). The food path passes PDFs at >= 0 because a restaurant
 * PDF is usually a menu — that prior does NOT hold for drinks, so a neutral
 * opaque PDF must not become the "best drinks asset" and burn the extra call.
 * No neutral-image fallback. Sorted by score desc.
 */
export function discoverDrinkCandidates(html: string, baseUrl: string): MenuCandidate[] {
  const raw = extractRawMatches(html, baseUrl)
  const out: MenuCandidate[] = []
  for (const r of raw) {
    const type = classifyType(r.url)
    if (!type) continue
    const { score, evidence } = scoreDrinkCandidate(r.url, r.context)
    if (score > 0) out.push({ url: r.url, type, score, source: r.source, evidence })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t discoverDrinkCandidates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/menu-refresh/menu-candidates.ts supabase/functions/menu-refresh/menu-candidates.test.ts
git commit -m "feat(menu-refresh): discoverDrinkCandidates with positive-only gate"
```

---

## Task 3: findDrinkSubPages

**Files:**
- Modify: `supabase/functions/menu-refresh/menu-candidates.ts`
- Test: `supabase/functions/menu-refresh/menu-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { findDrinkSubPages } from './menu-candidates.ts' // add to import line

describe('findDrinkSubPages', () => {
  const base = 'https://r.com/menu'
  it('finds a /cocktails sub-page', () => {
    const html = `<a href="/cocktails">Cocktails</a>`
    expect(findDrinkSubPages(html, base)).toEqual(['https://r.com/cocktails'])
  })
  it('finds /bar-menu via anchor text', () => {
    const html = `<a href="/bar-menu">Bar Menu</a>`
    expect(findDrinkSubPages(html, base)).toEqual(['https://r.com/bar-menu'])
  })
  it('ignores food sub-pages', () => {
    const html = `<a href="/dinner">Dinner</a>`
    expect(findDrinkSubPages(html, base)).toEqual([])
  })
  it('ignores cross-origin links', () => {
    const html = `<a href="https://other.com/cocktails">Cocktails</a>`
    expect(findDrinkSubPages(html, base)).toEqual([])
  })
  it('caps at max', () => {
    const html = `<a href="/cocktails">c</a><a href="/drinks">d</a><a href="/bar">b</a>`
    expect(findDrinkSubPages(html, base, 1).length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t findDrinkSubPages`
Expected: FAIL — `findDrinkSubPages is not a function`.

- [ ] **Step 3: Implement**

Add to `menu-candidates.ts` (after `findSubMenuPages`):

```ts
const DRINK_SUB_PAGE_PATH_PATTERNS = [
  /\/(?:[\w-]*-)?cocktails?(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?drinks?(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?bar(?:-menu)?\/?$/i,
  /\/(?:[\w-]*-)?beverages?(?:-menu)?\/?$/i,
]
const DRINK_SUB_PAGE_ANCHOR_PATTERNS = [
  /\bcocktails?\b/i,
  /\bdrinks?\b/i,
  /\bbar[\s-]?menu\b/i,
  /\bbeverages?\b/i,
]
const DRINK_SUB_PAGE_NEGATIVE_TEXT = [
  /\bfood\b/i, /\bdinner\b/i, /\blunch\b/i, /\bbrunch\b/i, /\bbreakfast\b/i,
  /\bgift[\s-]?cards?\b/i, /\bcatering\b/i, /\bprivate\b/i, /\bevents?\b/i,
]

/**
 * Find drinks/cocktail/bar sub-pages on a parent menu page. Mirror of
 * findSubMenuPages but inverted: food anchors are disqualified, drink anchors
 * qualify. Same-origin only; assets skipped; capped at `max` (default 1 —
 * the drinks-recovery pass tries at most one source).
 */
export function findDrinkSubPages(html: string, baseUrl: string, max = 1): string[] {
  const base = new URL(baseUrl)
  const baseKey = base.origin + base.pathname + base.search
  const found = new Set<string>([baseKey])
  const out: string[] = []
  const anchorRegex = /<a\b[^>]*\shref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = anchorRegex.exec(html)) !== null) {
    let absolute: URL
    try { absolute = new URL(m[1], base) } catch { continue }
    if (absolute.origin !== base.origin) continue
    if (PDF_EXT.test(absolute.href) || IMAGE_EXT.test(absolute.href)) continue
    const innerText = stripTags(m[2]).replace(/&amp;/gi, '&').replace(/&#38;/g, '&').slice(0, 100)
    if (DRINK_SUB_PAGE_NEGATIVE_TEXT.some(p => p.test(innerText))) continue
    const pathMatches = DRINK_SUB_PAGE_PATH_PATTERNS.some(p => p.test(absolute.pathname))
    const textMatches = DRINK_SUB_PAGE_ANCHOR_PATTERNS.some(p => p.test(innerText))
    if (!pathMatches && !textMatches) continue
    const target = absolute.origin + absolute.pathname + absolute.search
    if (found.has(target)) continue
    found.add(target)
    out.push(target)
    if (out.length >= max) break
  }
  return out
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts -t findDrinkSubPages`
Expected: PASS.

- [ ] **Step 5: Run the FULL menu-candidates suite (no regressions)**

Run: `npx vitest run supabase/functions/menu-refresh/menu-candidates.test.ts`
Expected: PASS (all existing + new).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/menu-refresh/menu-candidates.ts supabase/functions/menu-refresh/menu-candidates.test.ts
git commit -m "feat(menu-refresh): findDrinkSubPages for /cocktails and /bar sub-pages"
```

---

## Task 4: index.ts — constants + extractionHint param

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts`

No Vitest (Deno file). Verify with `deno check` if Deno is installed; otherwise rely on Task 1–3 unit tests + the live run in Task 7.

- [ ] **Step 1: Add the import**

In the existing `menu-candidates.ts` import line in `index.ts`, add `discoverDrinkCandidates`, `findDrinkSubPages`:

```ts
import { discoverMenuCandidates, findMenuIframes, findSubMenuPages, isBlockedHostname, isKnownMenuIframeHost, safeFetch, discoverDrinkCandidates, findDrinkSubPages, type MenuCandidate } from './menu-candidates.ts'
```

- [ ] **Step 2: Add constants**

Near `THIN_EXTRACTION_THRESHOLD` / `PRICE_COVERAGE_FLOOR`:

```ts
// Drinks recovery (Gap 6): if a food extraction found FEWER than this many
// cocktail/coffee dishes AND a dedicated drinks asset/sub-page exists, run one
// extra LLM pass on the best drinks source. Low (not zero) because the food
// prompt already extracts inline drinks — one brunch bloody mary must not
// suppress recovery of a separate 20-item cocktail list.
const DRINK_RECOVERY_THRESHOLD = 5

const DRINK_RECOVERY_HINT = 'This is the restaurant\'s DRINKS menu. Extract ONLY alcoholic cocktails (category "cocktails") and coffee drinks (category "coffee"), following the cocktail and coffee rules in your instructions. Do not extract wine, beer, or non-alcoholic beverages.'
```

- [ ] **Step 3: Thread `extractionHint` into the three extractors**

For `extractMenuWithClaude`, change the signature and the user message:

```ts
async function extractMenuWithClaude(content: string, restaurantName: string, extractionHint?: string): Promise<MenuExtractionResult> {
  // ...
  messages: [
    {
      role: 'user',
      content: `Extract the full menu from "${restaurantName}":\n\n${content}${extractionHint ? `\n\n${extractionHint}` : ''}`,
    },
  ],
```

For `extractMenuFromImagesWithClaude`, add `extractionHint?: string` as the last param and append it to the pushed text block:

```ts
content.push({
  type: 'text',
  text: `Extract the full menu from "${restaurantName}" from the ${successful.length === 1 ? 'attached image' : `${successful.length} attached images`}. The images are page-ordered. If different images represent different services (breakfast, lunch, dinner), preserve those as menu sections.${extractionHint ? `\n\n${extractionHint}` : ''}`,
})
```

For `extractMenuFromPdfsWithClaude`, add `extractionHint?: string` as the last param and append it to the pushed text block:

```ts
content.push({
  type: 'text',
  text: `Extract the full menu from "${restaurantName}" from the ${httpsUrls.length === 1 ? 'attached PDF' : `${httpsUrls.length} attached PDFs`}. Combine all dishes into a single output. If different PDFs represent different meal services (breakfast, lunch, dinner), preserve those as menu sections.${extractionHint ? `\n\n${extractionHint}` : ''}`,
})
```

- [ ] **Step 4: Type-check (best effort)**

Run: `deno check supabase/functions/menu-refresh/index.ts` (if Deno installed)
Expected: no errors. If Deno is not installed, skip and rely on the live run.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/menu-refresh/index.ts
git commit -m "feat(menu-refresh): drinks-recovery constants + extractionHint param"
```

---

## Task 5: index.ts — runDrinkRecovery helper

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts`

- [ ] **Step 1: Add the helper** (above `serve(...)`, near the other extraction helpers)

```ts
/**
 * Drinks recovery (Gap 6). When the food extraction found few cocktail/coffee
 * dishes, try ONE extra LLM pass on the best dedicated drinks source and return
 * the additive drink dishes + any new sections. Caller merges. Bounded to one
 * Sonnet call. `html` should be the BEST html available (rendered if we
 * rendered, else raw) so JS-injected drink assets are visible.
 */
async function runDrinkRecovery(
  extracted: MenuExtractionResult,
  opts: {
    html: string
    menuUrl: string
    restaurantName: string
    triedUrls: Set<string>
  },
): Promise<{ dishes: ExtractedDish[]; sections: string[]; telemetry: Record<string, unknown> }> {
  const drinkCountBefore = extracted.dishes.filter(
    d => d.category === 'cocktails' || d.category === 'coffee',
  ).length
  const telemetry: Record<string, unknown> = {
    triggered: false, drink_count_before: drinkCountBefore, source: null, url: null, dishes_found: 0,
  }
  if (drinkCountBefore >= DRINK_RECOVERY_THRESHOLD) {
    return { dishes: [], sections: [], telemetry }
  }

  // Prefer a drink ASSET. Allow the single best drink-scored asset even if it
  // was already tried by the food pass — re-asking a mixed "Food & Drinks.pdf"
  // with the drink-only hint is the whole point.
  const drinkAssets = discoverDrinkCandidates(opts.html, opts.menuUrl)
  let result: MenuExtractionResult | null = null
  let source: string | null = null
  let usedUrl: string | null = null

  if (drinkAssets.length > 0) {
    const best = drinkAssets[0]
    usedUrl = best.url
    source = best.type // 'image' | 'pdf'
    opts.triedUrls.add(best.url)
    try {
      result = best.type === 'image'
        ? await extractMenuFromImagesWithClaude([best.url], opts.restaurantName, DRINK_RECOVERY_HINT)
        : await extractMenuFromPdfsWithClaude([best.url], opts.restaurantName, DRINK_RECOVERY_HINT)
    } catch (err) {
      console.error(`${opts.restaurantName}: drink asset extraction failed:`, err instanceof Error ? err.message : String(err))
    }
  }

  // No asset (or asset yielded nothing) → try ONE drinks sub-page (text).
  if (!result || result.dishes.length === 0) {
    const subPages = findDrinkSubPages(opts.html, opts.menuUrl, 1)
    if (subPages.length > 0) {
      const subUrl = subPages[0]
      try {
        const subFetch = await fetchRawHtml(subUrl)
        if (subFetch.type === 'pdf') {
          result = await extractMenuFromPdfsWithClaude([subFetch.pdfUrl], opts.restaurantName, DRINK_RECOVERY_HINT)
          source = 'pdf'; usedUrl = subUrl
        } else {
          const subText = extractMenuTextFromHtml(subFetch.html)
          if (subText.length >= 50) {
            result = await extractMenuWithClaude(subText, opts.restaurantName, DRINK_RECOVERY_HINT)
            source = 'sub-page'; usedUrl = subUrl
          }
        }
      } catch (err) {
        console.error(`${opts.restaurantName}: drink sub-page failed:`, err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (!result || result.dishes.length === 0) {
    return { dishes: [], sections: [], telemetry }
  }

  // Keep only valid drink rows (the hint + system prompt already constrain to
  // cocktails/coffee, but enforce here so a mis-tagged row can't sneak in).
  const drinkDishes = result.dishes
    .filter(d => d.category === 'cocktails' || d.category === 'coffee')
    .map(d => ({ ...d, menu_group: null as string | null }))

  telemetry.triggered = true
  telemetry.source = source
  telemetry.url = usedUrl
  telemetry.dishes_found = drinkDishes.length
  return { dishes: drinkDishes, sections: result.menu_section_order, telemetry }
}
```

- [ ] **Step 2: Add a merge helper call at Branch A** (main path, AFTER the BentoBox group backfill block that ends near `index.ts:2117`, BEFORE `const stats = await upsertDishes(...)`):

```ts
// --- Drinks recovery (Gap 6) ---
const drinkHtml = renderSucceeded ? extractionContent : rawText // best html we have
let drinkPass: Record<string, unknown> = { triggered: false }
{
  const rec = await runDrinkRecovery(extracted, {
    html: rawHtml, // raw HTML for asset/anchor discovery (rendered text isn't HTML)
    menuUrl,
    restaurantName: restaurant.name,
    triedUrls,
  })
  drinkPass = rec.telemetry
  if (rec.dishes.length > 0) {
    const existingKeys = new Set(
      extracted.dishes.map(d => `${d.name.toLowerCase()}|${(d.menu_section || '').toLowerCase()}`),
    )
    for (const d of rec.dishes) {
      const k = `${d.name.toLowerCase()}|${(d.menu_section || '').toLowerCase()}`
      if (!existingKeys.has(k)) { extracted.dishes.push(d); existingKeys.add(k) }
    }
    for (const sec of rec.sections) {
      if (!extracted.menu_section_order.includes(sec)) extracted.menu_section_order.push(sec)
    }
  }
}
```

> NOTE on `html`: discovery needs HTML markup (anchors/img tags), so pass `rawHtml`. The rendered *text* (`extractionContent`) is stripped of tags and can't be scanned for assets. If a render produced new HTML, the main pipeline already merged those candidates into `candidates`; a follow-up improvement can pass rendered HTML here, but rawHtml is correct and safe for v1. Remove the unused `drinkHtml` line if your linter flags it.

Then add `drink_pass: drinkPass` to the success-path `error_context` object on the `menu_import_jobs` update (the object that already includes `winning_strategy`, `attempts`, etc.).

- [ ] **Step 3: Add the same recovery at Branch B** (direct-PDF success branch, after `pdfExtracted` upsert is computed but BEFORE its `upsertDishes` — or immediately after `extractMenuFromPdfsWithClaude` returns dishes and before `upsertDishes(supabase, restaurant.id, pdfExtracted)`):

```ts
// Drinks recovery for direct-PDF menus: the food PDF won't contain the
// cocktail list. Use the restaurant website HTML if we can fetch it.
{
  let html = ''
  try {
    const site = restaurant.website_url || restaurant.menu_url
    if (site) {
      const f = await fetchRawHtml(site)
      if (f.type === 'html') html = f.html
    }
  } catch { /* no-op: best effort */ }
  if (html) {
    const rec = await runDrinkRecovery(pdfExtracted, {
      html, menuUrl: restaurant.website_url || menuUrl, restaurantName: restaurant.name, triedUrls: new Set(),
    })
    if (rec.dishes.length > 0) {
      const existingKeys = new Set(pdfExtracted.dishes.map(d => `${d.name.toLowerCase()}|${(d.menu_section || '').toLowerCase()}`))
      for (const d of rec.dishes) {
        const k = `${d.name.toLowerCase()}|${(d.menu_section || '').toLowerCase()}`
        if (!existingKeys.has(k)) { pdfExtracted.dishes.push(d); existingKeys.add(k) }
      }
    }
  }
}
```

> `restaurant` in Branch B is selected with `menu_url, website_url` already (see the queue `select` at the top of the job loop), so both fields are available.

- [ ] **Step 4: Type-check (best effort)**

Run: `deno check supabase/functions/menu-refresh/index.ts` (if Deno installed)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/menu-refresh/index.ts
git commit -m "feat(menu-refresh): wire drinks-recovery into main + direct-PDF paths"
```

---

## Task 6: Bump extractor fingerprint

**Files:**
- Modify: `supabase/functions/menu-refresh/index.ts`

- [ ] **Step 1: Append the segment**

Change `CURRENT_EXTRACTOR_FINGERPRINT` by appending `|drinks-pass-v1`:

```ts
const CURRENT_EXTRACTOR_FINGERPRINT = 'sonnet-4-6|prompt-v6|pipeline-v2|desc150+dietary-v2|cocktails-v1|thin-fallback-v1|bentobox-jsonld-v1|conservas-skip-v1|menu-groups-v2|drinks-pass-v1'
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/menu-refresh/index.ts
git commit -m "chore(menu-refresh): bump extractor fingerprint for drinks-pass-v1"
```

---

## Task 7: Deploy + live verification + targeted backfill

**Manual steps — coordinate with Dan. Do NOT skip the credit check.**

- [ ] **Step 1: Confirm Anthropic credit balance** (per `feedback_anthropic_credit_balance`) — the fingerprint bump triggers gradual re-extraction.

- [ ] **Step 2: Deploy the edge function** to the live project (`vpioftosgdkyiwvhxewy`) via the Supabase dashboard "Edit" UI (Dan has access) or CLI redeploy from repo. The deployed `menu-candidates.ts` inlines the SSRF guard (known drift) — preserve that inline block when pasting; only add the new exports.

- [ ] **Step 3: Live single-restaurant verification.** Pick a real MV restaurant that has a SEPARATE cocktail menu and currently shows no cocktails in the app. Enqueue a single job (POST `{ "restaurant_id": "<uuid>" }` to menu-refresh, or via the queue), wait for the cron, and confirm in the app:
  - cocktails/coffee now appear with correct categories,
  - food dishes are unchanged (count + sections),
  - `menu_import_jobs.error_context.drink_pass` shows `triggered: true` and `dishes_found > 0`.

- [ ] **Step 4: Targeted backfill (cheaper than force_all).** Enqueue refresh jobs ONLY for restaurants this fix can change — open, with a menu_url, and with fewer than `DRINK_RECOVERY_THRESHOLD` cocktail/coffee dishes:

```sql
-- Run in Supabase SQL Editor (live project). Idempotent: skips restaurants with an active job.
INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
SELECT r.id, 'refresh', 0
FROM restaurants r
WHERE r.is_open = true
  AND r.menu_url IS NOT NULL
  AND (SELECT count(*) FROM dishes d
       WHERE d.restaurant_id = r.id
         AND d.category IN ('cocktails','coffee')) < 5
  AND NOT EXISTS (
    SELECT 1 FROM menu_import_jobs mij
    WHERE mij.restaurant_id = r.id AND mij.status IN ('pending','processing')
  );
```

- [ ] **Step 5: Monitor** the first batch via `menu_import_jobs` (`drink_pass` telemetry, error rates) before letting the nightly cron carry the rest.

---

## Self-Review (completed during planning)

- **Spec coverage:** §1 scorer → Task 1; §2 sub-page finder → Task 3; §1 discover → Task 2; §3 hint → Task 4; §4 integration (both branches, after-bento ordering, triedUrls relaxation, separate telemetry, no-run-on-failure) → Task 5; §5 fingerprint + targeted backfill → Tasks 6–7; cross-category collision regression → see note below.
- **Cross-category collision (Codex nice-to-have):** `upsertDishes` lives in the Deno `index.ts` and isn't Vitest-reachable, so a true unit test isn't feasible here. Mitigated structurally: `runDrinkRecovery` only emits `cocktails`/`coffee` rows, and Branch A dedup keys on name+section before merge. Verified behaviorally in Task 7 Step 3 (food dishes unchanged). Flagged for a future Deno-level upsert test.
- **Placeholder scan:** none.
- **Type consistency:** `runDrinkRecovery` returns `{ dishes: ExtractedDish[]; sections: string[]; telemetry }`; callers use `rec.dishes` / `rec.sections` / `rec.telemetry`. Extractor hint param is optional+last on all three functions. `MenuCandidate` reused unchanged.
