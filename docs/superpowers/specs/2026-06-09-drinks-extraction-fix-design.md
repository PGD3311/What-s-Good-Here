# Drinks Extraction Fix — Design Spec

**Date:** 2026-06-09
**Gap:** #6 in `2026-06-09-menu-pipeline-gap-map.md`
**Scope:** `supabase/functions/menu-refresh/` only (edge function). No frontend, no schema.

## Problem

The candidate discovery layer is food-only by design. In `menu-candidates.ts`:
- `NEGATIVE_KEYWORDS` scores `drinks -6, beverages -6, cocktails -6, wines -5, beers -5, spirits -5`.
- Gate: PDFs pass at `score >= 0`, images at `score > 0`.
- So a separate `Cocktails.pdf` / `Drinks-Menu.png` scores negative and is **never sent to Sonnet.**
- `findSubMenuPages` `SUB_MENU_NEGATIVE_TEXT` also skips `/drinks`, `/cocktails`, `/bar`, `/wine`.

Result: `cocktails` and `coffee` (both valid categories the prompt wants) are only
extracted when inline with the food menu. Most restaurants split them onto a separate
menu → drinks silently missing.

## Goal

When the food extraction yields **zero** drink dishes (no `cocktails` and no `coffee`),
attempt one additional extraction on the single best drinks asset or drinks sub-page,
and merge the result. Food extraction is never demoted or changed.

## Decision (Dan, 2026-06-09 — revised after Codex review)

**Gate the drinks pass on a low-coverage heuristic, not strict zero.** Codex flagged
that the food prompt already extracts `coffee`/`cocktails` inline (`index.ts:218,220`),
so a single inline drink (one brunch bloody mary, one drip coffee) would make
`drinkCount > 0` and suppress the recovery pass even when a separate 20-item cocktail
list exists — the exact case we're fixing.

**Trigger:** run the drinks pass when BOTH
- the primary extraction produced **fewer than `DRINK_RECOVERY_THRESHOLD` (= 5)** dishes
  with category `cocktails` or `coffee`, AND
- a **dedicated drinks asset or sub-page exists** (positive drink score; see §1/§2).

Still capped at **one** extra Sonnet call, so cost stays near-zero. The asset-exists
half of the gate means restaurants with one combined menu (no separate drinks source)
never trigger it regardless of count.

## Design

### 1. Drinks scorer (`menu-candidates.ts`)

Add an inverted keyword model and a discovery function that mirrors the food one:

- `DRINK_POSITIVE_KEYWORDS`: `cocktails +5`, `drinks +5`, `beverages +4`, `bar +3`,
  `coffee +4`, `espresso +3`, `cafe +2`, `wine +2` (a "wine & cocktails" sheet still
  carries cocktails), `happy[\s-]?hour +2`.
- `DRINK_NEGATIVE_KEYWORDS`: reuse the food-noise negatives (`logo/favicon/icon/header/
  banner/hero/avatar/thumbnail/gallery -8..-10`, `allergen/nutrition/giftcard/terms/
  privacy/policy/application/employment/job/contract/waiver/rules` negatives) PLUS
  `food -4, dinner -3, lunch -3, breakfast -3, brunch -3, entrees -2` so a food menu
  doesn't win the drink track.
- `scoreDrinkCandidate(url, context)` — same structure as `scoreCandidate`, drink weights.
- `discoverDrinkCandidates(html, baseUrl): MenuCandidate[]` — same extraction as
  `discoverMenuCandidates` (reuse `extractRawMatches`), scored with the drink model,
  **a symmetric positive gate (PDF `> 0`, image `> 0`)**, sorted desc. NOTE the
  difference from the food path: food PDFs pass at `>= 0` because a restaurant PDF is
  usually a menu, but that prior does NOT transfer to drinks (Codex finding) — a neutral
  opaque PDF could become the "best drinks asset" and burn the call on the wrong source.
  Require real positive drink evidence. No neutral-image fallback (don't burn vision on
  unsignaled images).

Tag is implicit (the function it came from); no schema change to `MenuCandidate`.

### 2. Drinks sub-page finder (`menu-candidates.ts`)

`findDrinkSubPages(html, baseUrl, max = 1): string[]`
- Anchor-text/path patterns: `/cocktails`, `/drinks`, `/bar`, `/beverages`,
  `/drink-menu`, `/bar-menu`, `/cocktail-menu`, and anchor text matching
  `\bcocktails?\b | \bdrinks?\b | \bbar menu\b | \bbeverages?\b`.
- Exclude food anchors (`food/dinner/lunch/brunch/breakfast`) and the standard noise
  (`gift card/catering/private/events`).
- Same-origin only; skip PDF/image hrefs (those are asset candidates); dedup; cap at `max`.

### 3. Extraction hint (`menu-refresh/index.ts`)

Add an optional `extractionHint?: string` parameter to `extractMenuWithClaude`,
`extractMenuFromImagesWithClaude`, and `extractMenuFromPdfsWithClaude`, appended to the
user text block (system prompt unchanged). Drinks hint:

> "This is the restaurant's DRINKS menu. Extract ONLY alcoholic cocktails (category
> `cocktails`) and coffee drinks (category `coffee`), following the cocktail and coffee
> rules in your instructions. Do not extract wine, beer, or non-alcoholic beverages."

The system prompt's existing wine/beer/mocktail/RTD exclusions still apply, so the drinks
pass yields only valid `cocktails`/`coffee` rows.

### 4. Integration points (`menu-refresh/index.ts`, queue mode) — pinned to real branches

Codex correctly flagged that "after the gate, before upsert" is NOT one clean spot.
There are two distinct success branches and several early returns. Pin it explicitly:

**Shared helper.** Factor the recovery into one function so both branches call it:

```
// runDrinkRecovery(extracted, { rawHtml, renderedHtml, menuUrl, restaurantName,
//                              candidates, triedUrls }) → { dishes, sections, telemetry }
//   drinkCount = extracted.dishes.filter(d => d.category==='cocktails' || d.category==='coffee').length
//   if (drinkCount >= DRINK_RECOVERY_THRESHOLD) return no-op
//   // 1. drink ASSETS: discoverDrinkCandidates over the BEST html we have
//   //    (renderedHtml if renderSucceeded, else rawHtml) so JS-injected drink
//   //    PDFs/images surfaced by Browserless are included (Codex finding).
//   //    Allow the single best drink-scored asset EVEN IF triedUrls has it
//   //    (re-ask a mixed "Food & Drinks.pdf" with the drink-only hint).
//   // 2. else drink SUB-PAGE: findDrinkSubPages(html, menuUrl, 1) → fetch → text.
//   // 3. if no drink source found → no-op (this is the 'asset exists' half of the gate).
//   // 4. extract with the drinks hint (§3); merge additive; return telemetry.
```

**Branch A — main HTML/asset path.** Call `runDrinkRecovery` **after** the BentoBox
group backfill (`index.ts:2117`) and **before** `upsertDishes`. Running after the Bento
backfill is required (Codex finding): the backfill mutates `extracted.dishes` to assign
`menu_group` from `bentoSectionGroups` by section name, so merging drink rows earlier
risks a section-name collision stamping a Bento group onto a drink row. Drink rows are
appended with `menu_group = null` after the backfill has already run.

**Branch B — direct-PDF shortcut.** The direct-PDF branch (`index.ts:1502-1582`) upserts
and returns early, so Branch A never runs for food-PDF menus. Add a `runDrinkRecovery`
call there too (a food-PDF restaurant very commonly has a separate drinks PDF/page on
the site). Here `candidates`/rendered HTML don't exist, so recovery uses the homepage/
website HTML if available; if not, it no-ops (acceptable — Branch B is already a
narrow shortcut).

**Where it does NOT run (explicit):**
- **Total extraction failure** (`no_dishes`, `index.ts:2033`) exits before the gate and
  does NOT trigger drink recovery. Rationale: a restaurant with zero food dishes is a
  blank-page problem owned by the photo fallback (Gaps 2/4/5), not the drinks fix. We do
  not want to half-populate a restaurant with only its cocktail list.
- **Gated / closed / hash-unchanged** early returns are unaffected (no upsert happens).

- Reuse the existing `dishKey` merge/dedup pattern (name+section, lowercase); drinks additive.
- Append any new drink `menu_section`s to `menu_section_order` (after existing entries).
- Telemetry: a **separate** `drink_pass` block in `error_context`
  (`{ triggered, drink_count_before, source: 'image'|'pdf'|'sub-page'|null, url, dishes_found }`).
  Do NOT overload the closed `ExtractionAttempt.strategy` union (`index.ts:689`) or the
  `winningStrategy` computed at `index.ts:2063` (Codex finding).
- Bounded: at most ONE extra Sonnet call, only when `drinkCount < DRINK_RECOVERY_THRESHOLD`
  AND a positive-scored drink source exists.

### 5. Fingerprint bump

The drinks pass changes stored output, so bump `CURRENT_EXTRACTOR_FINGERPRINT`: append
`|drinks-pass-v1`. Per the 2-step pattern, this invalidates the hash short-circuit so
restaurants re-extract on their next cron pass and pick up drinks.

**Cost note:** a fingerprint bump makes the nightly stale-refresh cron re-run every open
restaurant over time (bounded by 14-day staleness + 3 jobs/min throughput, so it rolls
gradually, not all at once). **Confirm Anthropic credit balance before deploy** (per
`feedback_anthropic_credit_balance`).

**Cheaper accelerated rollout (Codex finding):** this fix can ONLY change restaurants
that currently have no `cocktails` and no `coffee` dishes (and few — under the
threshold). Instead of a blunt `force_all` backfill, enqueue a targeted one-shot batch
of exactly those restaurants (`is_open = true`, `menu_url IS NOT NULL`, and no/few
cocktail/coffee dishes). Far fewer Sonnet calls than re-running the whole inventory.
Gradual nightly rollout is also safe if we don't need drinks immediately.

## Safety / non-regression

- One combined menu → no separate drink asset/sub-page → `drinkCount` may be >0 anyway,
  or no candidate found → **zero behavior change.**
- "Drinks" asset that's actually wine-only → prompt returns ~0 dishes → one bounded
  wasted call, no bad rows.
- Drinks pass is purely additive — cannot trip the confidence gate (runs after it) and
  cannot remove food dishes.
- SSRF: drink asset/sub-page fetches go through the same `safeFetch` / `fetchRawHtml` +
  `isBlockedHostname` guards as every other fetch. No new external-fetch surface beyond
  same-origin sub-pages and same-page assets.

## Testing

- `menu-candidates.test.ts`: `scoreDrinkCandidate` (cocktail PDF positive, food PDF
  negative under drink model, logo/giftcard rejected), `discoverDrinkCandidates`
  (gate behavior), `findDrinkSubPages` (matches `/cocktails`, rejects `/dinner`,
  same-origin only, cap).
- `extractors.test.ts`: hint param is appended and doesn't break category sanitization.
- **Cross-category name collision regression (Codex finding):** `upsertDishes` matches
  existing rows by exact lowercase name first (`index.ts:1071,1188`), so a new drink row
  could overwrite an existing non-drink row of the same name (e.g. `Affogato` dessert vs
  coffee). Add a test asserting a same-name, different-category drink row does not clobber
  the food row's category/section.
- Manual verification: pick a real MV restaurant with a separate cocktail menu, run a
  single-restaurant extraction, confirm cocktails/coffee land with correct categories
  and food is unchanged. (index.ts integration isn't unit-testable under Vitest due to
  Deno URL imports — candidate-level tests + one live run is the coverage.)

## Deploy

Edge function deploy. Repo `_shared/ssrf.ts` is inlined in the deployed
`menu-candidates.ts` (known drift). Edit repo files, then deploy via the Supabase
dashboard "Edit" UI (Dan has access) or CLI redeploy from repo. Bump fingerprint in the
same deploy.

## Out of scope (separate specs)

Reachability (Gap 7), verification pass, never-blank UX (Gap 5), photo fallback
(Gaps 2/4/5), reliable enqueue + transient retry (Gaps 1/3).
