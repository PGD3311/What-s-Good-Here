# Menu X-Ray — Design Spec

**Date:** 2026-06-10
**Owner:** Dan (concept) · this doc is the validated design from the brainstorm session
**Status:** Approved design, pending implementation plan
**Origin:** Dan's build brief + interactive demo (`WGH-Menu-Xray.zip`, 2026-06-10)

---

## 1. What it is

Point your camera at a restaurant menu → the app reads it, matches every line to our
dishes database, and shows the island's ratings projected onto the menu. Dishes with
enough votes show their score in the app's rating colors. Dishes without votes become
invitations to rate. One optional tap — **"Just tell me what to get"** — gives a single
decisive answer when the data supports one.

Every scan also quietly freshens our menu data: extracted dishes we don't have get
added (logged-in scans only), with the photo kept as ground-truth proof. The consumer
wow feature and the menu-photo OCR content-acquisition direction
(`project_menu_photo_ocr_direction`) are **one pipeline with two consumers**.

### Why now

- Coverage reality (queried 2026-06-10): 7,288 dishes / 172 restaurants; **3 dishes
  have ≥5 votes; 156 have 1–4; only 2 restaurants have a rankable dish.** The scan is
  designed sparse-first: its main v1 job is *collecting* ratings and menus, not
  displaying saturated verdicts. Verdict density compounds into next season.
- ~70% of the build was already roadmapped as menu-photo OCR. Downside case (zero
  consumer adoption) still yields the menu-capture tool we committed to building.
- The scan moment is filmable/shareable — the cheapest growth channel available.

### Decisions locked in brainstorm

1. **Real votes only.** No AI-estimated/seeded verdicts. Dishes below the vote
   threshold show neutral/invitation states.
2. **Quiet ingest.** Unmatched extracted dishes are auto-upserted (additive only) from
   logged-in users' scans. Guests get the full overlay but **no content writes**: no
   dish ingest, no photo retention — only a metadata scan-log row in `menu_scans`
   (for rate-limit forensics and abuse visibility).
3. **Entry: global + restaurant page, with confirm chip.** GPS proposes, human
   confirms before anything commits. No confirmed restaurant → no scan.
4. **Verdict ladder reuses app constants.** Threshold is `MIN_VOTES_FOR_RANKING`
   (imported, never hardcoded — currently **3** pre-launch, planned to rise to 5 then
   10 as volume grows; the ladder tracks it automatically). Colors via
   `getRatingColor` (green ≥ 8.0, amber ≥ 6.0). Below-threshold votes = "Early" tier.
5. **No verdict words on chips.** Rating number + color only (Dan: "just show the
   rating and its color"). The only worded chip is `🆕 be the first`. Never any
   negative label — brand rule: celebrate winners, let numbers speak for the rest.
6. **Re-rendered X-Ray view**, not chips anchored on the photo. Claude vision returns
   no pixel geometry; photo-anchoring would force a second OCR vendor and janky
   placement. Scan animation plays over the photo, result renders as clean WGH UI.
7. **"Just tell me what to get" ships in v1, data-gated** — renders only when the
   restaurant has a dish at or above `MIN_VOTES_FOR_RANKING`.
8. **Architecture: one new self-contained `menu-xray` Edge Function** (Approach 1).
   Not client-orchestrated; not bolted onto menu-refresh.
9. **Step zero: validation spike.** 10 real phone photos of MV menus through the
   existing extractor before any UI work. Go/no-go + similarity-threshold calibration.
10. **Codex reviews step-by-step.** Each component gets its own sequential
    `/codex-cli` pass (migration → RPC → edge function → verdict util → scan UI →
    decide overlay). Never one big batched review.

---

## 2. User flow

1. Entry: camera icon on homepage header **or** "Scan the menu" button on
   `RestaurantDetail` (passes `restaurantId` via route state). Both → `/scan`
   (new lazy-loaded page).
2. **Resolve:** without context, `useNearbyRestaurant` proposes: "📍 At Nancy's?
   ✓ / change". *Change* or no GPS → mini-picker (nearest list + search). Shutter
   disabled until confirmed.
3. **Capture:** `<input accept="image/*" capture="environment">` (no new Capacitor
   plugin). Client downscales to ~1600px JPEG before upload.
4. **Scan moment:** photo fills screen; scan-line sweep animation plays while the
   edge function call runs. Animation is the loading state with a **minimum sweep
   duration (~1.5s)** — fast responses wait for one full sweep; slow responses keep
   the sweep looping. No artificial cap beyond the minimum.
5. **Develop:** photo dims; X-Ray view renders — restaurant header, summary line
   ("2 crowd favorites · 14 dishes · 5 new to the map"), sections with rows + chips
   popping in staggered, best dish starred (★). Photo proof thumbnail top-right,
   rendered from the **local capture already in memory** (never downloaded back from
   storage — the bucket stays private, no signed URLs needed in v1).
6. **Act:** rows tappable — matched → dish page; Early/New → rate flow (login gate
   here, same as voting everywhere). `🎯 Just tell me what to get` at bottom when
   data-gated condition met → full-screen verdict overlay.
7. **Re-scan:** replaces the view (v1; merge across menu pages is deferred polish).

## 3. Verdict ladder

Single pure util `getVerdict(avgRating, totalVotes)` in `src/utils/verdict.js`.
Consumed by chips, summary line, and decide overlay.

| Tier | Condition | Chip shows |
|---|---|---|
| Rated | `totalVotes >= MIN_VOTES_FOR_RANKING` | `● 9.4` — number colored by `getRatingColor` (green ≥ 8.0, amber ≥ 6.0). No words. |
| Early | 1 to threshold−1 votes | `9.2 · 2 votes`, muted gray — visibly provisional |
| New | 0 votes / just ingested | `🆕 be the first` — dashed gold outline; the only worded chip |

- Thresholds come from existing constants — a dish must never show green on the scan
  and amber on its own page.
- No negative branch exists. Low-rated dishes show a muted number, nothing more.
- Decide overlay is the one place with editorial voice ("Get the Hot Lobster Roll" /
  "The island has spoken") because the user explicitly asked for an opinion. Shows
  dish name (Amatic SC), rating, vote count, 1–2 "also great" alternates (other
  greens, else ambers).

## 4. Architecture

```
client (/scan page)
  └─ ONE call: POST /functions/v1/menu-xray  { restaurantId, imageBase64 }
       0. input validation — decoded image ≤ 5MB (Anthropic cap), magic-byte MIME
          sniff (JPEG/PNG/WebP/HEIC only), reject otherwise before any spend
       1. check_menu_scan_rate_limit RPC — 5/min per user; guests per-IP and
          FAIL-CLOSED (missing/invalid IP → reject; stricter than the Places-proxy
          limiter, because each call burns LLM tokens)
       2. Claude vision (Sonnet) → { isMenu, sections[{name, items[{name, price,
          description, category}]}] } — menu-refresh prompt family + VALID_CATEGORIES;
          category is a first-class contract field (dishes.category is NOT NULL)
       3. match_menu_dishes RPC — batch pg_trgm match for all names, one round trip
       4. logged-in? → quiet-ingest unmatched dishes, REUSING menu-refresh's
          normalization + dedupe gates (normalized keys, category awareness, price
          sanity) — not naive name-only; additive only, never deletes, never touches
          votes; capped per user (dish-create rate-limit pattern, 20/hr) and gated on
          extraction confidence
       5. logged-in? → photo → private `menu-scans` storage bucket; ALL scans →
          metadata row in menu_scans (guest rows carry no photo)
  └─ response payload → X-Ray view renders; verdict tiers computed client-side
```

### Response payload

```json
{
  "restaurant": { "id": "…", "name": "Nancy's" },
  "sections": [{ "name": "Mains", "items": [
    { "name": "Hot Lobster Roll", "price": 34, "category": "seafood",
      "match": { "dishId": "…", "avgRating": 9.4, "totalVotes": 12, "similarity": 0.82 },
      "ingested": false }
  ]}],
  "best": { "dishId": "…", "name": "…", "avgRating": 9.4, "totalVotes": 12 },
  "summary": { "matched": 14, "ingested": 5, "unreadable": false }
}
```

`match` is null for unmatched items; `ingested: true` marks rows added by this scan.
`best` is null unless some dish has ≥5 votes (gates the decide button).

### New server pieces (all in one migration + one function)

1. **`menu-xray` Edge Function** — self-contained single file (dashboard-deployable,
   per our deploy-drift constraint). No URL fetching (photo arrives in the request
   body), but the real attack surface is untrusted binary input + token burn +
   storage abuse — countered by the validation in step 0, fail-closed guest
   limiting, logged-in-only storage writes, and the per-user ingest cap.
   Service-role writes.
2. **`match_menu_dishes(p_restaurant uuid, p_names text[])` RPC** — normalizes
   (lowercase, strip prices/punctuation/whitespace) both sides; a match is accepted
   when `similarity() > 0.45` **and** it clears a top-1 vs top-2 margin (≥ 0.1, or
   top-1 ≥ 0.6 outright) so near-ties don't project the wrong dish's rating;
   category agreement breaks remaining ties. Both knobs calibrated by the spike.
   Returns `dish_id, name, avg_rating, total_votes, price, similarity`. All column
   references table-qualified (house rule).
3. **`check_menu_scan_rate_limit` RPC** — same pattern as
   `check_photo_upload_rate_limit` for users; the guest/IP variant **fails closed**
   (unlike `check_and_record_ip_rate_limit`, which fails open by design for the
   Places proxies — that trade-off is wrong for an LLM-backed endpoint).
4. **`menu_scans` table** — `id, restaurant_id, user_id (nullable), photo_path
   (nullable — null for guest scans), extracted jsonb, matched_count,
   ingested_count, created_at`. RLS: inserts via service role only; users select own
   rows. Audit trail for abuse/debugging + future self-learning-refresher training
   data.
5. **`menu-scans` storage bucket** — created in the migration with explicit policies
   (service-role write only, no public read), 5MB object cap, JPEG/PNG/WebP/HEIC
   MIME allowlist, path convention `<restaurant_id>/<scan_id>.jpg` — same hardening
   pattern as the dish-photos and avatars bucket migrations.
6. **Index:** `CREATE INDEX IF NOT EXISTS idx_dishes_name_trgm ON dishes USING gin
   (lower(name) gin_trgm_ops)`.

Migration is purely additive (no rollback block required; noted inline).
`supabase/schema.sql` updated first, then run in SQL Editor (house rule).
Cost: ~$0.02–0.04/scan (one Sonnet vision call); ~1k scans/mo ≈ $30. Existing
Anthropic key; no new vendors.

### Client pieces

- `src/pages/ScanMenu.jsx` — orchestration only
- `src/components/scan/` — `RestaurantConfirmChip`, `ScanCamera`, `ScanSweep`,
  `XRayResults`, `XRayRow`, `VerdictChip`, `DecideOverlay` (+ barrel)
- `src/api/menuScanApi.js` — `scanMenu()` per API-layer pattern
  (classified errors, logger)
- `src/hooks/useMenuScan.js` — React Query mutation wrapper
- `src/utils/verdict.js` — `getVerdict()` pure util
- Routes: `/scan` added to `App.jsx`, lazy via `lazyWithRetry()`
- Styling: design tokens only (`--color-rating`, `--color-accent-gold`, …), Outfit
  for chips, Amatic SC for the decide overlay headline

## 5. Guest vs logged-in

| Capability | Guest | Logged in |
|---|---|---|
| Scan + full X-Ray overlay | ✅ | ✅ |
| Quiet ingest of new dishes | ❌ (skipped) | ✅ (capped 20/hr, confidence-gated) |
| Photo retained in storage | ❌ | ✅ (proof for ingested dishes) |
| Scan-log metadata row | ✅ (no photo) | ✅ |
| Rate from a row | login gate (existing pattern) | ✅ |
| Rate limit | per-IP, fail-closed | 5/min per user |

Rationale: login-walling the scan kills shareability; anonymous content writes are
spam surface. Trust gradient matches consequence.

## 6. Error handling

| Case | Behavior |
|---|---|
| Blurry/dark/unreadable | Few/no items extracted → "Couldn't read this menu — try more light or get closer." Re-take. No writes. |
| Not a menu | `isMenu: false` → playful copy, no writes, scan still logged. |
| No restaurant nearby / GPS denied | Confirm step becomes pure search picker. Scan never proceeds unanchored. |
| Wrong GPS guess | Confirm chip — human approves before commit. |
| Zero matches | Not an error: all rows 🆕; summary celebrates "14 dishes added to the map." Sparse case is the designed case. |
| Offline / timeout | Classified error + one-tap retry (photo retained client-side). |
| Duplicate names in one scan | Best-similarity match wins; ingest dedupes via menu-refresh's normalized-key + category + price gates — re-scans can't dupe. |
| Handwritten/specials boards | No special-casing; vision handles, ingests normally. |
| Rate-limited | Friendly 429 + countdown. |

All errors via `createClassifiedError`; the sweep animation is the loading state; no
dead-end screens — every failure lands on a next action.

## 7. Testing & rollout

- **Step zero — validation spike (go/no-go):** 10 real phone photos of MV menus
  through the existing extractor. Measures read-rate + calibrates similarity
  threshold. ~1 day, ~$1. Per `feedback_validate_llm_prompts_against_real_data`.
- **Unit (Vitest):** `getVerdict` tier boundaries, name normalization,
  payload→view mapping.
- **Function tests (Deno):** fixture vision responses — match / ingest / guest-skip /
  not-a-menu paths (pattern: `menu-candidates.test.ts`).
- **SQL:** RPC test calls in SQL Editor before wiring; seeded similarity cases
  ("Hot Lobster Roll" ↔ "Lobster Roll (Hot)").
- **E2E (Playwright):** one spec, mocked function response → chips render.
- **Field test as rollout valve:** restaurant-page entry ships first; Dan + curators
  scan real menus for a few days; homepage camera icon is a one-line follow-up PR
  after field validation.
- **Analytics (PostHog):** `scan_started`, `scan_completed` (match/ingest counts),
  `scan_failed` (reason), `decide_opened`, `rate_from_scan`. **North-star metric:
  votes per scan.**
- **Ship vehicle:** web instantly via Vercel; iOS in next App Store build cycle.

## 8. Out of scope (v1)

- Live AR overlay on camera feed (v2 dream; requires text geometry/tracking)
- On-device OCR (cost optimization, revisit at scale)
- Multi-page scan merge (re-scan replaces view in v1)
- Personalized "97% your taste" verdicts (needs rating volume)
- Seeded/AI-estimated verdicts (explicitly rejected)
- Chips anchored to photo pixels (explicitly rejected for v1)

## 9. Open follow-ups created by this design

- Update `CURRENT_FOCUS.md` at implementation kickoff (it predates this project).
- Notify Denis via Agent Phone — new surface touching dishes upserts + a new edge
  function; check no collision with his open PRs.
- The `menu_scans` table feeds the self-learning-refresher idea
  (`project_self_learning_menu_refresher`) — note the connection, don't build it.
