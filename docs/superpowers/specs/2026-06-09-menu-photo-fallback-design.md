# Menu-Photo Fallback ("Snap the Menu") — Design Spec

**Date:** 2026-06-09
**Gaps:** #2/#4/#5 in `2026-06-09-menu-pipeline-gap-map.md` — the true 100% coverage closer for menus that exist nowhere machine-readable (Instagram-only, Toast, hard SPAs).
**Scope:** new edge function + new storage bucket + new API client + new UI component + CTA wiring + one migration. Frontend + backend.

## Problem

Auto-extraction (web scrape + render + drinks + SPA-capture) can't reach a menu that exists only as a photo on Instagram, a Toast page that 403s, or an SPA gated behind interaction. A human standing in the restaurant can always **photograph the paper menu**. The vision extractor already exists (`menu-refresh`'s `extractMenuFromImagesWithClaude` + prompt), but it's CRON-gated and never user-callable. This feature gives any logged-in user a "snap the menu" path that turns a photo into reviewed, added dishes.

## Decisions (Dan, 2026-06-09)

- **Who:** any logged-in user (not manager-only).
- **Review step:** extract → show the user what was found → user approves/edits → then add. (Catches vision hallucinations before they hit the catalog.)
- **Entry point:** always available on a restaurant page (not just empty ones) — safe because the upsert is additive and never deletes (`reference_menu_refresh_never_deletes`), so a photo can only *add/merge*, never wipe a good menu.

## Architecture (revised after Codex review)

```
User taps "📷 Add the menu"  (RestaurantMenu / MenuImportStatus CTA)
  → MenuPhotoUploadModal: pick/snap 1-N images
  → client: validate + compress + EXIF-strip (reuse dishPhotosApi helpers)
  → upload to PUBLIC bucket `menu-photos`, OWNER-FIRST path {auth.uid()}/{restaurant_id}/{ts}-{n}.jpg
     (owner-first so photo-moderate's "<owner> == auth.uid()" check passes; public so its
      /object/public/<bucket>/<owner>/ URL contract + getPublicUrl() work — same as dish-photos)
  → photo-moderate edge fn per image (UNCHANGED: it already treats a menu as is_food_photo=true,
     so we only allowlist the `menu-photos` bucket; reject is_unsafe; fail-closed)
  → extract-menu-from-photo edge fn (JWT, NO writes): vision-extract dishes from the photo URLs
  → REVIEW UI: list extracted dishes (name/category/price/section/desc), user unchecks junk + edits
  → commit-menu-dishes edge fn (JWT, service-role write): upsert reviewed dishes with
     dedupe-by-name + FULL metadata (menu_section/group/description/dietary_tags), preserving
     votes/photos — reuses menu-refresh's merge logic. created_via='menu_photo'.
  → restaurant page refetches; dishes appear
```

**Why two server functions, not a client insert (Codex Critical #2):** `dishesApi.create()` writes only name/category/price, does no dedupe (→ duplicates against the existing menu), and is capped at 20 dishes/hr (a 30-item menu partially fails). `dishes` INSERT RLS is intentionally open, so a raw client path is also a spam vector. Routing the confirmed add through a **service-role edge function** with its own rate limit + name-dedupe + metadata preservation fixes all of: lost structure, duplicates, partial-fail, and abuse surface.

## Components

### 1. Migration `2026-06-09-menu-photos.sql`
- **Storage bucket `menu-photos`** — **PUBLIC** (matches `dish-photos`; photo-moderate's URL contract requires `/object/public/<bucket>/<owner>/` and `dishPhotosApi` uses `getPublicUrl()`). RLS on `storage.objects`: authenticated users may INSERT/UPDATE objects whose **first path segment == `auth.uid()`** (owner-first), mirroring the `dish-photos` insert policy verbatim. Public read.
- **Rate-limit actions**: reuse `check_and_record_rate_limit(action, limit)` (same RPC parse-menu/photo-moderate use) — `'extract_menu_from_photo'` (10/min) and `'commit_menu_dishes'` (a few/hour, e.g. 6 — bounds how many full menus one user can commit). No schema change for these.
- **Dish provenance (additive, safe):** add `dishes.created_via TEXT` nullable, **no CHECK** (per `reference_check_constraint_blocks_updates` — a row-wide CHECK on mutable `dishes` would block vote-trigger updates; nullable passive column is confirmed safe). Value `'menu_photo'`. Analytics only.
- Include a `-- ROLLBACK:` block (drop bucket + policies + column).

### 2. Edge function `extract-menu-from-photo`
Mirror `photo-moderate`'s auth/rate-limit pattern (it's the closest precedent):
- **Auth:** JWT required; verify the caller. **Ownership:** the submitted `photo_url`(s) must live under the caller's `{restaurant_id}/{uid}/` prefix in `menu-photos` (same ownership check shape as `photo-moderate`'s URL-vs-uid check). Reject otherwise.
- **Rate limit:** `check_and_record_rate_limit('extract_menu_from_photo', 10)` before the Sonnet call.
- **Input:** `{ photo_urls: string[], restaurant_id: uuid, restaurant_name: string }` (cap at e.g. 4 images).
- **Extraction:** download images server-side as base64 (reuse the menu-refresh image path's robots.txt-bypass rationale) and call Sonnet vision with the `MENU_EXTRACTION_PROMPT`. **Prompt sharing (Codex):** a `_shared/` module does NOT eliminate dashboard drift — Supabase deploys each function as its own bundle, so a shared prompt still requires co-deploying both functions. **Decision: duplicate the prompt** into this function with a loud provenance comment (`// MIRROR of menu-refresh MENU_EXTRACTION_PROMPT — keep in sync`), same pragmatic pattern as the inlined SSRF guard. Co-deploy note in the deploy section.
- **Output:** `{ dishes: ExtractedDish[], menu_section_order: string[] }` — **NO DB writes.** Extraction is side-effect-free; the client reviews; the separate `commit-menu-dishes` function (§2b) writes.
- **Safety:** zero blast radius (no writes). Image safety via the `photo-moderate` step before extraction.
- **CORS/secrets:** `ANTHROPIC_API_KEY`. verify_jwt at the gateway (like photo-moderate), NOT CRON_SECRET.

### 2b. Edge function `commit-menu-dishes` (the confirmed-add write path)
The piece Codex flagged as essential — replaces a raw client insert.
- **Auth:** JWT required; verify caller.
- **Rate limit:** `check_and_record_rate_limit('commit_menu_dishes', 6)` (per hour) — bounds full-menu commits per user.
- **Input:** `{ restaurant_id: uuid, dishes: ReviewedDish[] }` where each reviewed dish carries name/category/price/menu_section/description/dietary_tags (the fields the review UI exposes). Cap dish count (e.g. ≤120).
- **Write (service role):** upsert with **name-dedupe against existing dishes** for that restaurant — reuse the exact-name + normalized-key matching from menu-refresh's `upsertDishes` (duplicate the `normalizeDishKey` + match logic; keep provenance comment). Insert new dishes (with `created_via='menu_photo'`, `created_by=<caller uid>`), update changed fields on existing matches, **preserve votes/photos** (never delete). Run each name through `validateUserContent` server-side; drop anything that fails.
- **Why service role (not the 20/hr client RPC):** avoids the partial-fail on a 30-item menu and the open-INSERT-RLS spam path; abuse is bounded by the function's own per-hour limit + the requirement that the dishes came from a moderated extraction.
- **Output:** `{ inserted, updated, skipped }`.

### 3. API client `src/api/menuPhotosApi.js`
- `uploadMenuPhotos(restaurantId, files): Promise<string[]>` — validate/compress/EXIF-strip (reuse `dishPhotosApi` helpers), upload to PUBLIC `menu-photos` at `{uid}/{restaurantId}/...`, return `getPublicUrl()` URLs. Client-side `checkPhotoUploadRateLimit()` precheck.
- `extractFromPhotos({ restaurantId, restaurantName, photoUrls }): Promise<{dishes, menu_section_order}>` — invoke `extract-menu-from-photo` with the user's JWT (`supabase.functions.invoke`).
- `commitDishes({ restaurantId, dishes }): Promise<{inserted,updated,skipped}>` — invoke `commit-menu-dishes` with JWT.
- Follows the `src/api/` pattern (try/catch + createClassifiedError + logger).

### 4. `photo-moderate` reuse (minimal change)
`photo-moderate` already classifies a **menu as `is_food_photo=true`** (its prompt explicitly counts menus), and is allowlisted to `dish-photos`/`avatars`. The ONLY change needed: **add `menu-photos` to its bucket allowlist.** Do NOT add a skip-food-gate flag (Codex — it widens moderation semantics for no gain). Keep it fail-closed. The owner-first public path makes its existing `<owner> == auth.uid()` check work unchanged.

### 5. UI `src/components/menu/MenuPhotoUploadModal.jsx` (+ barrel)
- Bottom-sheet/modal (follow `feedback_bottom_sheet_explicit_height` — explicit height, not maxHeight).
- Steps: pick/snap images → "checking + reading the menu…" spinner → **review list** (each extracted dish: name, category chip, price, section; checkbox to include; inline edit name/price) → "Add N dishes" button.
- Auth gate: if not logged in, show `<LoginModal>` (per CLAUDE.md auth-gate pattern).
- Confirm → `menuPhotosApi.commitDishes({ restaurantId, dishes })` (the §2b server-side write path with dedupe + metadata). NOT `dishesApi.create` (Codex — loses metadata, duplicates, 20/hr cap, open-RLS spam). The review UI still runs `validateUserContent` client-side on edited names for instant feedback; the commit function re-validates server-side (authoritative).
- Styling: brand tokens / Amatic SC headers per CLAUDE.md; no Tailwind color classes.

### 6. CTA wiring
- `MenuImportStatus.jsx` (empty/failed state, `:34-48`): add a primary "📷 Add the menu" button opening the modal.
- `RestaurantMenu.jsx` (always-available): a secondary "Add/improve the menu by photo" affordance even when a menu exists (additive, never overwrites — merges by name).
- Wire modal open/close state in `RestaurantDetail.jsx`; on success, refetch dishes (`useDishes` invalidate).

## Build order (each step Codex-reviewed before the next — Dan's instruction)

1. Migration (public `menu-photos` bucket + owner-first RLS + `created_via` column) + add `menu-photos` to photo-moderate's allowlist.
2. `extract-menu-from-photo` edge function (vision, no writes; duplicated prompt).
3. `commit-menu-dishes` edge function (service-role upsert + name-dedupe + metadata + validateUserContent + rate limit).
4. `menuPhotosApi` client (upload + extract + commit).
5. `MenuPhotoUploadModal` (upload → moderate → extract → review → commit) + CTA wiring in MenuImportStatus/RestaurantMenu + dishes refetch.

**Deploy note:** `extract-menu-from-photo` duplicates the menu-refresh prompt — when that prompt changes, co-deploy both. All three edge functions deploy via the Supabase dashboard (preserve any inlined shared code).

## Safety / non-regression

- Extraction function writes nothing — a bad extraction can't corrupt data; the user-review step + additive merge are the guards.
- Auth: JWT + photo-ownership prefix check; rate-limited; image safety via `photo-moderate` (fail-closed).
- Additive upsert means "always available" can't wipe a good menu.
- All user text (edited dish names) passes `validateUserContent`. No row-wide CHECK constraints on `dishes` (vote-blocking risk).
- Storage: private bucket, per-user prefix RLS.

## Testing

- Edge function: Deno test for auth/ownership/rate-limit gating + a stubbed extraction shape; live smoke on a real menu photo.
- `menuPhotosApi`: Vitest with mocked supabase (mirror existing api tests).
- UI: Vitest for the review-list include/edit logic; manual run of the full snap→review→add flow.
- Each step: `npm run build` + `npm run lint` + Codex review of the diff before proceeding.

## Out of scope

The other gaps (reachability URL discovery already specced; reliable enqueue/retry). This spec is the photo path + its never-blank entry point only.
