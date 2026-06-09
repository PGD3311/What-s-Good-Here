# SPA Render Capture + Block Escalation — Design Spec

**Date:** 2026-06-09
**Gap:** reachability (Gap 7 family) — the "blank on JS-shell sites" failure (e.g. Aalia's).
**Scope:** `supabase/functions/menu-refresh/` only. No frontend, no schema.

## Problem (diagnosed live on Aalia's)

Aalia's enqueue returned `error_code: page_too_short`, `drink_pass: null`. Root cause in `index.ts`:

```ts
// Render fallback #1  (index.ts:1692)
if (extractionContent.length < 50 && cmsRequiresRender(cms)) { ...render... }
```

`cmsRequiresRender` (`cms-detect.ts`) returns true ONLY for `wix`/`square`/`weebly`. Aalia's is a custom React/Next SPA — not a recognized CMS — so the render is skipped, and the code bails at the `page_too_short` gate (`index.ts:1715`) → `dead`. **The browser-render tool that would capture it is gated on recognizing the brand of shell.** Any custom SPA whose raw HTML is an empty shell dies the same way.

(Note: render fallback #2 at `index.ts:1984` *does* fire on `rawTextLen < SPARSE_TEXT_THRESHOLD` regardless of CMS — but it's on the **0-dishes** path, which a `<50`-char page never reaches because `page_too_short` exits first.)

## Goal

Capture JS-shell sites (custom SPAs, not just known CMSs) by rendering whenever the raw page is empty, and recover 403/Cloudflare-blocked sites via the residential `/unblock` proxy that already exists in `browserless.ts` but is never called. Never silent-dead: a page we still can't read gets flagged for manual import, not buried.

## Design

### Step 1 — Render on *thinness*, not CMS brand (the Aalia's killer)

Change render fallback #1 (`index.ts:1692`) to fire whenever the extracted text is empty, regardless of detected CMS — an empty text body *is* a JS shell by definition:

```ts
// before:
if (extractionContent.length < 50 && cmsRequiresRender(cms)) {
// after:
if (extractionContent.length < 50) {
```

CMS detection stays only as a **timeout hint** — keep the existing `waitForTimeoutMs: 12000` (Wix needs the longest hydrate; it's a safe upper bound for generic SPAs too). `rendererAttempted = true` is still set so render fallback #2 doesn't double-render. Bounded: one extra Browserless render only for pages that previously bailed at `page_too_short` (near-certain shells), never for content-rich pages.

**Asset-only render hole (Codex):** candidate rediscovery currently lives *inside* the `renderedText.length >= 50` block (`index.ts:~1702-1707`). A render that surfaces a JS-injected menu **image/PDF** but little body text would still bail at the `page_too_short` guard (`1715`) without ever trying those candidates. Two coupled changes:
1. After a successful render, **always** re-run `candidates = mergeCandidates(candidates, discoverMenuCandidates(renderedHtml, menuUrl))` regardless of `renderedText` length (move it out of the `>=50` block, gated only on a non-empty `renderedHtml`).
2. Soften the `page_too_short` guard at `1715` to `if (extractionContent.length < 50 && candidates.length === 0)` — only bail when there's neither text nor any asset candidate to try. (Asset extraction at `~1807` already runs before the HTML-text path, so surviving the guard with candidates present means they get tried.)

### Step 2 — Escalate to the residential `/unblock` proxy on a block

`browserless.ts` already implements `fetchRenderedHtml(url, { useUnblock: true })` (residential proxy + `/unblock` pipeline) and throws `BrowserlessError` with `code: 'TARGET_ERROR'` when the target returns 4xx (e.g. Cloudflare/scraper 403). It is never invoked. Add a thin wrapper used by the menu-page render sites:

```ts
// Block-like target statuses worth a residential-proxy retry. NOT all 4xx —
// BrowserlessError code 'TARGET_ERROR' fires for any target >= 400 (browserless.ts),
// so escalating on 404/410/500 would just waste residential units (Codex).
const UNBLOCK_RETRY_STATUSES = new Set([401, 403, 429, 503])

async function renderWithUnblockFallback(url, opts): Promise<string> {
  try {
    return await fetchRenderedHtml(url, opts)
  } catch (err) {
    if (err instanceof BrowserlessError && UNBLOCK_RETRY_STATUSES.has(err.status)) {
      return await fetchRenderedHtml(url, { ...opts, useUnblock: true })
    }
    throw err
  }
}
```

Use `renderWithUnblockFallback` in place of the direct `fetchRenderedHtml` calls in render fallback #1 (`~1694`) and render fallback #2 (`~1986`). (Leave the iframe-host render path as-is for now — those are already gated to known menu hosts.)

**Initial-fetch 403 recovery:** in the fetch catch (`index.ts:1485-1498`), today a `403` from `fetchRawHtml` writes `fetch_failed` and retries/dies. Before failing, if the classified error is a block (`classified.code === 'fetch_error'` and `String(classified.context.http_status)` ∈ {`'401'`,`'403'`,`'429'`,`'503'`} — note `http_status` is stored as a **string** by `classifyError`, `index.ts:500`), attempt `renderWithUnblockFallback(menuUrl, { useUnblock: true, gotoTimeout: 45000, waitForTimeoutMs: 12000 })`; if it returns ≥50 chars of extractable text, synthesize `fetchResult = { type: 'html', html }` and continue the normal pipeline instead of failing.

**State-ordering caveat (Codex):** the render-state vars (`rendererAttempted`, `renderSucceeded`, `renderError`, `renderedTextLen`) are declared at `index.ts:~1591`, *after* the fetch catch. So the catch cannot set `rendererAttempted = true` directly. Declare a `let prefetchRendered = false` **before** the `try`, set it `true` in the catch on a successful unblock recovery, and initialize `let rendererAttempted = prefetchRendered` at the existing declaration site. This prevents render fallback #2 (`~1984`, gated on `!rendererAttempted`) from double-rendering and keeps Step 3 telemetry correct. If the unblock render also fails/empty, fall through to today's `fetch_failed` behavior.

**Caveat:** on this recovery path `rawHash` (`~1621`) hashes the *rendered* HTML, not the raw fetch — acceptable (the raw fetch was a 403 with no usable body). And a Cloudflare/access-denied block that returns a **verbose non-2xx HTML body** won't enter the fetch catch at all (`fetchRawHtml` tolerates long non-2xx HTML, `index.ts:~609-624`), so this recovery only helps *thrown* `HTTP 401/403/429/503`. Detecting verbose block pages is out of scope here.

### Step 3 — Never silent-dead (small, included)

When we still end at `page_too_short` *after* a render attempt (`index.ts:1715` branch, with `rendererAttempted === true`), also set `needs_manual_menu = true` on the restaurant before the job update, so an unreadable site surfaces in the manual-import queue (and the future photo-OCR path) instead of dying invisibly. Pure-additive flag; doesn't change retry/dead logic.

## Cost / timeout

- Step 1 adds one render to jobs that previously bailed at `page_too_short` (shells only) — not to content-rich pages. Render fallback #2's existing sparse-text trigger already renders many of these on the 0-dishes path; Step 1 just moves the capture earlier for the empty-text case.
- Step 2 adds at most ONE extra render (the `/unblock` retry), and only on a 403/Cloudflare block. Residential `/unblock` units cost more (per `browserless.ts` pricing notes) but fire rarely.
- Each `fetchRenderedHtml` is ≤60s wall-clock. **Queue mode** (the user-add path) claims **3** jobs/run (`claim_menu_import_jobs` p_limit:3); **batch fallback mode** processes up to `MAX_RESTAURANTS_PER_RUN = 10` (`index.ts:337`). A single slow job doing fetch + 1-2 renders + extraction can consume most of the ~150s edge idle-timeout (`index.ts:~2321`). This is **timeout-recoverable**, not comfortably-within-budget: the batch pre-stamp + stalled-job recovery (5-min lock reset) re-queue any job killed mid-render, so a timeout costs a retry, not a stuck row. **No change to per-run job count.**
- `BROWSERLESS_API_KEY` must be set on the deployed function (it already is — render fallbacks #1/#2 use it today).

## Safety / non-regression

- Step 1 only loosens a gate in the **content < 50** branch — content-rich pages are unaffected.
- `renderWithUnblockFallback` is a strict superset of `fetchRenderedHtml`: same behavior unless the error is a target-side block, in which case it retries once. Non-block errors propagate unchanged.
- Initial-403 recovery only triggers on 401/403/429 and only *adds* a recovery attempt before the existing failure path — it can't make a currently-succeeding fetch worse.
- No fingerprint bump (extractor output schema unchanged). Restaurants stuck at `page_too_short`/`fetch_failed` will be re-attempted on their next cron/backoff; a targeted re-enqueue of `error_code IN ('page_too_short','fetch_error')` rows accelerates it.
- SSRF: `/unblock` fetches the same restaurant-controlled `menuUrl` already validated/used by the normal render path; no new target surface (Browserless fetches it server-side either way).

## Testing

- `cms-detect.test.ts` (Vitest) already covers detection; no change there.
- The render-gating + escalation live in the Deno `index.ts` (not Vitest-reachable). Verify with `deno check` (new code type-clean; only pre-existing `SupabaseClient` errors remain) + a **live run on Aalia's**: re-enqueue → expect the render to fire (no longer `page_too_short`) and either dishes extracted or, if still unreadable, `needs_manual_menu = true` instead of a bare dead job.
- If `renderWithUnblockFallback` is extracted into a tiny pure helper, add a Vitest/Deno unit test asserting it retries with `useUnblock` only on `TARGET_ERROR`/403 and rethrows other errors. (Optional — the branch logic is small; live run is the primary check.)

## Deploy

Edge-function deploy via Supabase dashboard (same reconciliation as the drinks fix — SSRF inlined into `menu-candidates.ts`, no `_shared/` import). Confirm `BROWSERLESS_API_KEY` env is set on the function. Optional targeted re-enqueue of `page_too_short`/`fetch_error` restaurants after deploy.

## Out of scope

Menu-URL discovery (the separate `2026-06-09-menu-url-reachability-fix-design.md`), and the photo-OCR human fallback (the only fix for sites with no machine-readable menu anywhere — the real 100% closer).
