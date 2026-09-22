# One camera: Menu X-Ray absorbs snap-the-menu

**Date:** 2026-09-22 · **Owner:** Dan · **Status:** approved in conversation, building
**Amends:** `2026-06-10-menu-xray-design.md` (X-Ray) and retires `2026-06-09-menu-photo-fallback-design.md` (snap-the-menu)

## 1. Why

Two features, built two days apart in June, start with the same gesture — photograph a menu — and diverge:
X-Ray *reads* (ratings overlay) and quietly *writes* for logged-in users (background ingest of unmatched
dishes, no confirmation). Snap-the-menu *writes* with a full review screen (checkboxes, price edits) and
lives buried at the bottom of the restaurant page's Menu tab. Dan: "why do we have two… just taking a
photo and updating would be easier." One camera, one photo, the app tells you what's good and asks
about what's missing.

## 2. The flow (all users)

1. Tap the camera (homepage header or restaurant page header — unchanged entry points, plus the
   restaurant empty state now routes here instead of opening a modal).
2. Confirm the restaurant (existing chip), snap the menu (existing sweep).
3. One results screen — the existing paper-menu X-Ray view. Every line we know shows its rating.
4. **New:** lines we don't have are listed under **"Not in the app yet · N"** with ONE button:
   - Logged in: **"Add these N"** → dishes created → toast "Added N to {restaurant}" → section reads
     "N added ✓" and the rows keep their `+` mark (be the first to rate).
   - Guest: **"Sign in to add these"** → login modal. After login the user re-scans (v1; the staged
     list is owner-bound and guests have no owner).
5. Nothing is written without that tap. The quiet background ingest is removed.

What goes away: the "Add / improve the menu" buttons (both), `MenuPhotoUploadModal`, `menuPhotosApi`,
the `extract-menu-from-photo` edge function (X-Ray already extracts). The review screen's checkboxes
and price editing go: one tap or nothing. `commit-menu-dishes` and the `menu_photo_extractions`
staging table stay — they are the trusted write path.

## 3. Architecture

```
menu-xray (edge fn, unchanged auth/rate limits, Haiku extraction, pg_trgm match)
  ├─ plannedDishes = buildIngestList(items, matched, existing)   (existing, cap 40)
  ├─ logged in → INSERT menu_photo_extractions { user_id, restaurant_id, dishes: plannedDishes,
  │              menu_section_order }  → response.extraction_id          (NO dish writes)
  ├─ guest     → no row, extraction_id: null (list still shown)
  ├─ photo proof + menu_scans audit row: unchanged (ingested_count = 0 at scan time)
  └─ response items: { …, addable: boolean }   (replaces `ingested`)

client: "Add these N" → commit-menu-dishes { extraction_id, includes: [0..N-1] }
  (existing fn: owner check, 24h TTL, atomic single-use claim, name-dedupe upsert, never deletes,
   its own rate limit — untouched)
```

Why reuse the staging table instead of returning dish fields to the client: commit-menu-dishes was
built so the client never supplies dish names/categories — it can only say "yes" to what the server
extracted. Keeping that posture costs one INSERT per logged-in scan.

Rate limits: the scan-time `check_menu_ingest_rate_limit` call is dropped (it gated the silent
writes); `commit-menu-dishes` already has its own limit. Scan limits unchanged.

Model: extraction stays on Haiku 4.5 — the June measurement found it ~2× faster than Sonnet on menu
vision at equal or better recall, and latency is the UX here. One string to change if that stops
being true.

## 4. Guest vs logged-in (replaces X-Ray §5 table rows)

| | Guest | Logged in |
|---|---|---|
| Ratings overlay | ✅ | ✅ |
| "Not in the app yet" list | ✅ (read-only) | ✅ |
| Add them | sign-in prompt | one tap |
| Anything written without the tap | never | never |

## 5. Out of scope

Editing names/prices before adding (was in snap; dropped — fix on the dish page). Guest add-after-login
without re-scan. Merging X-Ray's private `menu-scans` photo bucket with snap's public `menu-photos`
bucket (leave both; `menu-photos` is now unused and can be dropped in a cleanup migration).

## 6. Follow-ups this creates

- Delete `extract-menu-from-photo` in the dashboard once this ships (repo deletion in the PR).
- Cleanup migration: drop the `menu-photos` bucket + policies (unused).
- `menu_scans.ingested_count` is now always 0 at scan time; either drop it or have commit write back.
