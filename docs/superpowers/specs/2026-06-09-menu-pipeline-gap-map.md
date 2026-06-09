# Menu Pipeline Gap Map — "Works Every Time"

**Date:** 2026-06-09
**Goal:** When a user (or curator) adds a restaurant, the restaurant page reliably
populates with the correct menu — dishes, drinks, descriptions, and the right
sections — *or* presents a clear path to a correct menu. Never a silent blank.
Currently succeeds ~50% of the time.

**Honest framing:** 100% *auto-extraction from a URL* is impossible — some menus
exist only as an Instagram photo, a Toast page that 403s scrapers, or a JS app we
can't read. The achievable goal is **100% coverage**: auto when we can, a graceful
"building your menu" state while we try, and a **photo-snap fallback** (any logged-in
user) that always works because a human can photograph a paper menu. Plus quality
fixes so the auto path is right more often.

---

## The flow (as built)

1. `AddRestaurantModal` → `restaurantsApi.create()` inserts the `restaurants` row.
2. Fire-and-forget `menuImportApi.createJob(id, 'initial')` → RPC `enqueue_menu_import`
   inserts a `menu_import_jobs` row (priority 10, idempotent: one active job/restaurant).
3. pg_cron `process-menu-import-queue` runs every 60s → POSTs `{"mode":"queue"}` to the
   `menu-refresh` edge function with the `cron_secret`.
4. `menu-refresh` claims up to 3 jobs (`claim_menu_import_jobs`, priority DESC so
   `initial` jumps ahead of nightly `refresh`), discovers menu URL/assets, runs the
   multi-strategy extractor (PDF / JSON-LD / image vision / HTML text / sub-pages /
   iframes / Browserless render), confidence-gates, and upserts dishes.
5. Nightly cron `create-menu-refresh-jobs` (3 AM) re-enqueues `refresh` jobs for stale
   menus (`menu_last_checked` NULL or >14d), **but only where `menu_url IS NOT NULL`**
   and **not if a `dead` job exists in the last 30 days**.

---

## Permanent-blank black holes (created, but a menu NEVER appears)

### Gap 1 — Enqueue is fire-and-forget and swallowed
`AddRestaurantModal.jsx:204` & `:331`:
`menuImportApi.createJob(...).catch(err => logger.warn(...))`. If that RPC call fails
(network, RLS, transient), the restaurant exists with **no job and nothing retries.**
- **Root fix:** enqueue from a DB trigger on `restaurants` INSERT, so a restaurant
  structurally cannot exist without a job. Frontend call becomes belt-and-suspenders.

### Gap 2 — No menu URL → dead → excluded forever
Manual adds (or Google returns no website) → extractor hits `no_menu_url` → 3 attempts
→ `dead`. The nightly re-enqueue cron requires `menu_url IS NOT NULL`
(`add-menu-import-queue.sql:172`), so these restaurants are **never reconsidered**.
- **Root fix:** the photo fallback (Gap 5) covers no-URL restaurants; also allow the
  nightly cron / a recovery path to revisit `needs_manual_menu` / no-URL restaurants.

### Gap 3 — Dead jobs frozen for 30 days, even on transient failures
3 failures → `dead`, even when the cause was transient (Browserless down, Anthropic
429, DNS blip). Nightly cron skips any restaurant with a dead job <30 days old
(`add-menu-import-queue.sql:179-184`). One bad night = a month of blank.
- **Root fix:** distinguish transient vs. terminal `error_code`s; auto-retry transient
  deaths sooner (hours, not 30 days). Terminal causes route to the photo fallback.

### Gap 4 — Confidence-gate "completed but empty"
The gate marks the job `completed`, writes 0 dishes, and stamps the current
hash+fingerprint (`index.ts` low-confidence branch). Nightly staleness won't refire
(fresh timestamp); even at 14 days the hash+fingerprint short-circuit returns
"unchanged." **Only a manual fingerprint bump ever retries it.** Permanent blank.
- **Root fix:** a gated restaurant should set `needs_manual_menu = true` (it does) AND
  surface the photo fallback to users, instead of silently completing.

### Gap 5 — No escape hatch for the user
Every failure above is invisible. No "menu loading," no "add a photo." The
`useMenuImportStatus` hook exists and is tested but is **not wired into the restaurant
page**, so even the job status we already track isn't shown.
- **Root fix:** never-blank UX (poll job status → "building your menu") + the
  photo-snap fallback (any logged-in user) as the universal closer.

---

## Quality leaks (a menu appears, but it's wrong)

### Gap 6 — Drinks systematically dropped
`menu-candidates.ts` scores `drinks/beverages/cocktails/wine/beer/spirits` strongly
negative, and the candidate gate (PDF `score >= 0`, image `score > 0`) means a separate
`Cocktails.pdf` / `Drinks-Menu.png` is **never sent to Sonnet**. `findSubMenuPages`
likewise skips `/drinks`, `/cocktails`, `/bar`. So cocktails/coffee only get extracted
when inline with food — most restaurants split them onto a separate menu.
- **Fix (FIRST code target):** a dedicated drinks-candidate track + drinks sub-page
  finder; try the best food asset AND the best drinks asset (with a prompt hint), merge.
  See the drinks-fix design doc.

### Gap 7 — Wrong menu URL → homepage shell
`findMenuUrl` probes a fixed path list; on a miss it falls back to the homepage, which
is a nav shell → thin/wrong/hallucinated extraction.
- **Fix:** follow on-page "Menu" anchor links (and Google Places menu URL) before
  falling back to the homepage.

### Gap 8 — Descriptions missing
Rule 13 nulls "marketing copy"; the image/PDF path loses description text more often;
no recovery pass. Result: dishes with blank descriptions.
- **Fix:** revisit the description rule + consider a targeted re-ask when coverage is low.

---

## Build order

1. **Drinks fix (Gap 6)** — most concrete, self-contained edge-function win. *(started)*
2. **Reachability (Gap 7)** — better menu-URL discovery.
3. **Verification pass** — gate quality before writing (covers Gaps 7/8 sneaking through).
4. **Never-blank UX (Gap 5)** — wire `useMenuImportStatus` into the restaurant page.
5. **Photo-snap fallback (Gaps 2/4/5)** — any logged-in user; reuses
   `extractMenuFromImagesWithClaude`. The universal closer for 100% coverage.
6. **Reliable enqueue + retry (Gaps 1/3)** — DB-trigger enqueue; transient-death retry.

Each gets its own design → plan → implementation cycle.
