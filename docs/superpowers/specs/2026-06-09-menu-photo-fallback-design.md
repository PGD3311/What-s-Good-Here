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

## Architecture

```
User taps "📷 Add the menu"  (RestaurantMenu / MenuImportStatus CTA)
  → MenuPhotoUploadModal: pick/snap 1-N images
  → client: validate + compress + EXIF-strip (reuse dishPhotosApi helpers)
  → upload to storage bucket `menu-photos`  ({restaurant_id}/{user_id}/{ts}-{n}.jpg)
  → photo-moderate edge fn per image (safety: reject unsafe; menu pages aren't "food photos"
     so RELAX the is_food_photo gate for this caller — see §4)
  → extract-menu-from-photo edge fn (JWT): vision-extract dishes from the photo URLs
  → REVIEW UI: list extracted dishes (name/category/price/section), user unchecks junk + edits
  → confirm → bulk-add via existing dish-create path (source attribution = user_photo)
  → restaurant page refetches; dishes appear
```

## Components

### 1. Migration `2026-06-09-menu-photos.sql`
- **Storage bucket `menu-photos`** (private), RLS: authenticated users may INSERT objects under `{restaurant_id}/{auth.uid()}/...`; read via signed URL or service role. Mirror the `dish-photos` policies.
- **Rate-limit action**: nothing schema-side needed if reusing `check_and_record_rate_limit(action, limit)` (same RPC `parse-menu`/`photo-moderate` use). Use action `'extract_menu_from_photo'`, 10/min/user.
- **Dish provenance (optional, additive):** add `dishes.created_via TEXT` (nullable, no constraint that blocks votes — per `reference_check_constraint_blocks_updates`, do NOT add a row-wide CHECK on the mutable dishes row). Values e.g. `'menu_photo'`. Analytics only; never gates anything. If this complicates the build, skip it — provenance is nice-to-have.
- Include a `-- ROLLBACK:` block (drop bucket policies + column).

### 2. Edge function `extract-menu-from-photo`
Mirror `photo-moderate`'s auth/rate-limit pattern (it's the closest precedent):
- **Auth:** JWT required; verify the caller. **Ownership:** the submitted `photo_url`(s) must live under the caller's `{restaurant_id}/{uid}/` prefix in `menu-photos` (same ownership check shape as `photo-moderate`'s URL-vs-uid check). Reject otherwise.
- **Rate limit:** `check_and_record_rate_limit('extract_menu_from_photo', 10)` before the Sonnet call.
- **Input:** `{ photo_urls: string[], restaurant_id: uuid, restaurant_name: string }` (cap at e.g. 4 images).
- **Extraction:** download images server-side as base64 (reuse the menu-refresh image path's robots.txt-bypass rationale) and call Sonnet vision with the **menu-refresh `MENU_EXTRACTION_PROMPT`** (extract the prompt into `_shared/` OR copy it; keep ONE source of truth — prefer importing from a shared module both functions use, but note the dashboard-inlining drift constraint).
- **Output:** `{ dishes: ExtractedDish[], menu_section_order: string[] }` — NO DB writes here. The function only extracts; the client reviews; a separate confirmed-add path writes. (Keeps the function side-effect-free and the human in the loop.)
- **Safety:** the function does NOT write dishes, so the blast radius of a bad call is zero. Content safety on the *image* is handled by the `photo-moderate` step before extraction.
- **CORS/secrets:** `ANTHROPIC_API_KEY`, same as menu-refresh. verify_jwt at the gateway (like photo-moderate), not CRON_SECRET.

### 3. API client `src/api/menuPhotosApi.js`
- `uploadMenuPhotos(restaurantId, files): Promise<string[]>` — validate/compress/EXIF-strip (reuse `dishPhotosApi` helpers), upload to `menu-photos`, return the object URLs. Client-side `checkPhotoUploadRateLimit()` precheck.
- `extractFromPhotos({ restaurantId, restaurantName, photoUrls }): Promise<{dishes, menu_section_order}>` — invoke the edge function with the user's JWT (supabase.functions.invoke).
- Follows the `src/api/` pattern (try/catch + createClassifiedError + logger).

### 4. `photo-moderate` reuse
`photo-moderate` classifies `is_food_photo` + `is_unsafe` and is allowlisted to `dish-photos`/`avatars` buckets. For menu photos: (a) add `menu-photos` to its bucket allowlist; (b) a photo of a *menu* is not a "food photo," so for this flow we only enforce `is_unsafe === false` (reject unsafe/explicit), and ignore `is_food_photo`. Simplest: pass a flag or a new action that skips the food-photo requirement. Keep fail-closed on moderation errors.

### 5. UI `src/components/menu/MenuPhotoUploadModal.jsx` (+ barrel)
- Bottom-sheet/modal (follow `feedback_bottom_sheet_explicit_height` — explicit height, not maxHeight).
- Steps: pick/snap images → "checking + reading the menu…" spinner → **review list** (each extracted dish: name, category chip, price, section; checkbox to include; inline edit name/price) → "Add N dishes" button.
- Auth gate: if not logged in, show `<LoginModal>` (per CLAUDE.md auth-gate pattern).
- Confirm → create dishes via the existing dish-create path (`dishesApi.createDish` or the manager bulk-add RPC — pick whichever already validates `validateUserContent` + content safety). Each created dish: `created_via='menu_photo'` if the column exists.
- Styling: brand tokens / Amatic SC headers per CLAUDE.md; no Tailwind color classes.

### 6. CTA wiring
- `MenuImportStatus.jsx` (empty/failed state, `:34-48`): add a primary "📷 Add the menu" button opening the modal.
- `RestaurantMenu.jsx` (always-available): a secondary "Add/improve the menu by photo" affordance even when a menu exists (additive, never overwrites — merges by name).
- Wire modal open/close state in `RestaurantDetail.jsx`; on success, refetch dishes (`useDishes` invalidate).

## Build order (each step Codex-reviewed before the next — Dan's instruction)

1. Migration (bucket + RLS + rate-limit action + optional `created_via`).
2. `extract-menu-from-photo` edge function (+ `photo-moderate` allowlist/flag change).
3. `menuPhotosApi` client.
4. `MenuPhotoUploadModal` + CTA wiring + refetch.

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
