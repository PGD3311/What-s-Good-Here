# Menu-URL Reachability Fix — Design Spec

**Date:** 2026-06-09
**Gap:** #7 in `2026-06-09-menu-pipeline-gap-map.md`
**Scope:** `supabase/functions/menu-refresh/` only. No frontend, no schema.

## Problem

`findMenuUrl(websiteUrl)` (in `index.ts`) probes a fixed `MENU_PATHS` list with **`HEAD`** requests and returns the first that responds `ok`. On a miss, the queue loop falls back to dumping the **homepage** at the extractor. Two real failure modes:

1. **HEAD false-negatives.** Many restaurant hosts (WordPress, Cloudflare, Wix) answer `405`/`403` to `HEAD` but `200` to `GET`. The real `/menu` is missed → homepage fallback.
2. **Half-working homepage fallback is worse than failing.** If the homepage carries a few featured/special dishes, extraction returns ~5–10 dishes — **not empty, not thin enough** to trigger `findSubMenuPages` — so the real full-menu page is never visited. Result: a partial/wrong menu that *looks* populated. (Matches the "not enough" symptom.)

## Goal

Land on the restaurant's actual menu page far more often, and stop silently extracting a homepage's handful of featured dishes as if they were the whole menu.

## Decision (Dan, 2026-06-09 — revised after Codex review)

**Anchor-discovery FIRST, parallel path-probe as fallback, hash-clear on URL change.** Codex flagged the original GET-probe-first design as unsound: (a) ~25 sequential 5s probes ≈ 100-125s, dangerously near the 150s edge timeout; (b) SPA shells that 200 every route would lock in a fake `/food-menu`; (c) a changed `menu_url` wouldn't force re-extraction because of the `menu_content_hash` short-circuit. The revision below fixes all three.

## Design

### 1. `findBestMenuLink(html, baseUrl): string | null` (new, `menu-candidates.ts`)

Returns the single best **food-menu page** anchor on a homepage, or `null`. Uses a
**dedicated menu-link scorer** — NOT the asset `scoreCandidate` (which positively scores
"raw bar"/"seafood" and lacks nav negatives).

- Parse anchors (reuse the anchor regex / `stripTags`). Score `href path + anchor text`.
- **Positives:** `menu +5`, `food +3`, `dinner/lunch/brunch/breakfast +2`.
- **Negatives:** `drinks/wine/cocktail/bar -4`, `about/contact/reservations?/order(-online)?/catering/events/gift-?cards?/careers?/jobs/blog/news/gallery/press/private -5`, and the raw/oyster-bar seafood guard from the drinks work.
- **Eligibility:** skip `PDF_EXT`/`IMAGE_EXT` hrefs (assets handled elsewhere); skip the base page itself; require `score > 0`.
- **Host scope (precise, no public-suffix list):** let `baseHost` = the base URL's hostname with a leading `www.` stripped. Accept the link's host `h` iff `h === baseHost` **or** `h === 'www.' + baseHost` **or** `h.endsWith('.' + baseHost)` (proper subdomain, e.g. `menu.foo.com`/`order.foo.com` for base `foo.com` or `www.foo.com`). Reject everything else. Still fetched later through `safeFetch` (SSRF-guarded).
- **Ranking:** prefer an anchor whose text or path contains the `menu` token; tiebreak by score, then shorter path.

Unit-testable (Vitest), mirrors `findDrinkSubPages`.

### 2. `findMenuUrl` restructure (`index.ts`)

```
async function findMenuUrl(websiteUrl):
  normalize base
  // Step A (PRIMARY) — anchor discovery: follow the link the site itself exposes.
  // One homepage GET; far more accurate than blind probing and avoids the
  // sequential-probe time bomb. SPA homepages whose links are JS-injected just
  // yield null here and fall through to Step B.
  try:
    home = fetchRawHtml(base)
    if home.type === 'html':
      link = findBestMenuLink(home.html, base)
      if link: return link
  catch: /* best effort */

  // Step B (FALLBACK) — PARALLEL path probe, bounded wall-time.
  // Fire all MENU_PATHS probes concurrently (GET, 3s abort each, body cancelled).
  // Take the highest-priority path (MENU_PATHS order) that passes acceptProbe().
  results = await Promise.allSettled(MENU_PATHS.map(p => probe(base + p)))
  return first path (in MENU_PATHS order) whose probe resolved accepted, else null

probe(url): GET via safeFetch, 3s abort, read status + res.url, cancel body,
            return { accepted: res.ok && acceptProbe(res, url), url }
```

**`acceptProbe(res, probedUrl)` guard** (hardened soft-404 / SPA defense):
- Reject if the final `res.url` host differs from the probed host (off-origin bounce).
- Normalize pathnames (lowercase, strip trailing slash). Reject if the final pathname is root (`''`/`/`) or an index page (`/index.html?`, `/home`) while we probed a non-root path (redirect-to-home soft-404).
- Reject if the final pathname no longer contains the probed path's last segment (e.g. `/menu` → `/order-online` bounce).
- This does NOT fully defeat a true SPA that serves a distinct-looking 200 at every route, but anchor-discovery (Step A) is the primary path and SPA shells are handled downstream by the render/BentoBox/confidence-gate machinery. Step B no longer runs first, so it can't pre-empt anchor discovery.

**Timeouts:** each `probe` clears its abort timer in a `finally` (fixes the existing leak where a thrown `HEAD` left its timer alive). Parallel + 3s cap ⇒ Step B wall-time ≈ 3s regardless of path count.

### 3. Widen `MENU_PATHS`

Add `/the-menu`, `/our-food`, `/eats`, `/food-menus`, `/menu/food`. Keep specific-before-generic ordering (it now also defines Step B priority among accepted probes).

### 4. Re-discover stored-homepage rows + force re-extraction on URL change (caller, `index.ts`)

Today the queue loop only calls `findMenuUrl` when `!menuUrl` (`index.ts:~1528`). That means a restaurant already pointed at its **homepage root** (a past homepage-fallback victim) never gets re-discovered — so this fix wouldn't reach exactly the rows it's meant to correct (Codex blocker).

**Change the trigger:** run `findMenuUrl` when `!menuUrl` **OR** when the stored `menuUrl`'s normalized pathname is root (`''`/`/`) i.e. it equals the website root — meaning we only ever had the homepage. Concretely:

```
const storedIsHomepageRoot = menuUrl && (() => {
  try { const p = new URL(menuUrl).pathname.replace(/\/+$/, ''); return p === '' } catch { return false }
})()
if ((!menuUrl || storedIsHomepageRoot) && (websiteUrl || menuUrl)) {
  const found = await findMenuUrl(websiteUrl || menuUrl)
  if (found && found !== menuUrl) {
    menuUrl = found
    dbUpdates.menu_url = found
    dbUpdates.menu_content_hash = null   // force re-extract of the corrected URL
  }
}
```

**Force re-extraction:** whenever `findMenuUrl` yields a URL **different from the stored `restaurant.menu_url`**, also set `dbUpdates.menu_content_hash = null`. This defeats the `menu_content_hash` short-circuit (`index.ts:~1739`) so the corrected URL is re-extracted unconditionally on this run (Codex Critical #1). The direct-PDF and batch-fallback paths are unaffected (they don't hash-short-circuit PDF-backed rows). Adapt to the real variable names/structure of the existing `if (!menuUrl && websiteUrl)` block.

## Safety / non-regression

- Caller still persists the discovered URL and keeps the homepage fallback when `findMenuUrl` returns `null` — unchanged.
- Worst-case added latency: one homepage GET (Step A) + a single ~3s parallel probe window (Step B) — far below today's potential 100s+ sequential HEAD cost, and well clear of the 150s edge timeout.
- SSRF: every fetch goes through `safeFetch`/`fetchRawHtml` (host + redirect-hop validation). `findBestMenuLink` only parses HTML; subdomain-of-base acceptance is still validated at fetch time.
- No fingerprint bump (output schema unchanged). The §4 hash-clear is what guarantees corrected URLs actually re-extract. Targeted re-enqueue: restaurants whose `menu_url` equals their website root (homepage-fallback victims) or is null.

## Testing

- `menu-candidates.test.ts` (Vitest): `findBestMenuLink` — picks `/menu` over `/about`, prefers a "menu"-texted link, rejects cross-origin, rejects PDF/image hrefs, returns null when no menu link, drinks/catering links excluded.
- `findMenuUrl` is Deno + network (not Vitest-reachable): verify with `deno check` + a live run on a restaurant whose menu sits at a non-standard path or behind a HEAD-405 host. Confirm `restaurants.menu_url` gets persisted to the real menu page.

## Deploy

Edge function deploy (same as the drinks fix — Supabase dashboard, preserve inlined SSRF guard). No fingerprint bump. Optional targeted re-enqueue: restaurants whose `menu_url` equals their website root (homepage-fallback victims) or is null.

## Out of scope

Other gaps (never-blank UX, photo fallback, reliable enqueue, transient-retry) — separate specs.
