# Menu-Refresh Backfill — Fix Infinite Loop on Failure Paths

**Date:** 2026-05-19 (planned)
**Origin:** Issue surfaced during v1.3 dish descriptions backfill on 2026-05-18 (see `project_menu_refresh_backfill_infinite_loop.md` memory)
**Estimated time:** ~45-60 min total (edit + codex + deploy + re-run backfill)

---

## Goal

Fix the `menu-refresh` Edge Function so the `force_all=true` batch backfill cycles through restaurants correctly instead of infinite-looping on the same unextractable ones. After fix, re-run the v1.3 description backfill cleanly across all ~177 restaurants.

## Problem statement

On 2026-05-18 during the v1.3 description backfill, the script (`scripts/backfill-menu-descriptions.sh`) hit an infinite loop:

- Iterations 1, 2, 3, ... all processed the **exact same 8 restaurants** (Rocco's Pizzeria, Highlands General, The Port Hunter, Katama General Store, S&S Kitchenette, Bobby B's Restaurant & Bakery, Catboat, Le Grenier French Restaurant, Mikado Asian Bistro)
- All 8 had legitimate skip/error reasons (DNS-broken URLs, HTTP 404, page too short, no dishes found, hash match, JSON parse errors on huge HTML)
- `total_inserted: 0, total_updated: 0` on every iteration — zero new dishes populated
- After SQL-marking the 9 stuck IDs manually, iteration 2 picked a *different* 8 — but the same loop pattern repeated with the new 8

Backfill terminated at iteration ~8 with only the original 8 restaurants (from the very first pre-bug run) actually backfilled. **~169 restaurants still need descriptions.**

## Root cause

Two compounding issues in `supabase/functions/menu-refresh/index.ts`:

1. **No `ORDER BY` on the batch query.** The `force_all=true` branch (`serve(req)` handler, around line 1593) selects restaurants without any ordering. Postgres returns rows in implementation-defined order (typically insertion order), so the query keeps returning the same restaurants on every call.

2. **`menu_last_checked` only updates on success.** The success path (around line 1500-1505) updates `restaurants.menu_last_checked = now()`. All failure paths (no-dishes, page-too-short, fetch errors, hash_unchanged short-circuit) leave `menu_last_checked` unchanged. So failed restaurants stay "fresh" by the staleness check forever.

Either fix alone solves the loop; both together is the robust answer.

## Specific changes

### File: `supabase/functions/menu-refresh/index.ts`

**Change 1: Add ORDER BY to the batch query**

Around line 1593 (after `let restaurants: Array<...>`), in the batch fallback block. Find:

```ts
let query = supabase
  .from('restaurants')
  .select('id, name, menu_url, menu_content_hash')
  .not('menu_url', 'is', null)
  .eq('is_open', true)
```

Add an ORDER BY clause before the `.or(...)` / `.limit(...)`:

```ts
let query = supabase
  .from('restaurants')
  .select('id, name, menu_url, menu_content_hash')
  .not('menu_url', 'is', null)
  .eq('is_open', true)
  .order('menu_last_checked', { ascending: true, nullsFirst: true })
```

Rationale: cycles through least-recently-checked restaurants first. Combined with change 2 below, every processed restaurant gets pushed to the back of the queue.

**Change 2: Update `menu_last_checked` on EVERY job outcome**

There are 4-5 places in `serve(req)` where a job terminates without setting `menu_last_checked`. Find them by searching for `menu_import_jobs` updates that don't have a paired `restaurants` update.

Specific paths (line numbers from current `main`, may drift slightly):

| Path | Where | Action |
|---|---|---|
| Success (already correct) | ~line 1500-1505 | ✅ keep as is |
| `hash_unchanged` short-circuit | ~line 1193 (search for `reason: 'hash_unchanged'`) | Add `await supabase.from('restaurants').update({ menu_last_checked: new Date().toISOString() }).eq('id', restaurant.id)` before the early continue |
| `page_too_short` | ~line 1303 (search for `'page_too_short'`) | Same update before the `continue` |
| `no_dishes` after all strategies failed | ~line 1463-1466 (search for `attempts.find(a => a.dishes_found > 0)?.strategy ?? 'html'` — the negative branch leads here) | Same update |
| Catch block / job failure | ~line 1640 (the `catch (err)` after the job-processing try) | Same update |

Pattern for each:

```ts
await supabase.from('restaurants').update({
  menu_last_checked: new Date().toISOString(),
}).eq('id', restaurant.id)
```

Do NOT update `menu_content_hash` on failure paths — leave it null/unchanged so a future successful extraction can still detect "no change since last successful pull."

### File: `supabase/functions/menu-refresh/index.test.ts` (likely doesn't exist yet)

This is integration territory and we don't currently have orchestration tests for the function — the existing 132 tests cover the pure helpers (`extractors.ts`, `menu-candidates.ts`, etc.).

Skip writing a new test file for this fix. Verify manually instead (see "Verification" below).

## Test plan

1. **Local sanity** — `npm run test -- --run` should still pass (132 menu-refresh tests, expected). No tests should fail since we're not changing tested code.

2. **Codex review** — `/codex-cli` skill, default `gpt-5.3-codex` + `medium`. Prompt should ask for: (a) any missed failure path that still doesn't update `menu_last_checked`, (b) whether `nullsFirst: true` is correct Supabase query syntax (it is — verify it generates `NULLS FIRST` SQL), (c) any race condition between the success-path update and the failure-path update.

3. **Deploy** to production via Supabase Dashboard. Only `index.ts` changes (menu-candidates.ts unchanged from current `main`).

## Verification

After deploy:

1. **Reset the test bed** — mark the previously-stuck restaurants back to null so we can verify the new ordering works:

```sql
-- Restaurants we marked manually on 2026-05-18 + the new 8 from iterations 1+2
UPDATE restaurants SET menu_last_checked = NULL
WHERE id IN (
  'fa030eb4-55b8-4bc6-a6d2-50fafa14f782',  -- Rocco's
  '312cdf8c-0bf2-4894-b43e-d49a0c6fc5b3',  -- Highlands General
  '5d1b8666-4fe6-400f-9282-f4b97c9a3b6e',  -- The Port Hunter
  '9851c285-6ba6-4f78-bff0-ff7ba692acdd',  -- Katama General
  '845710b2-b07c-4429-8c08-cf2de679ccef',  -- S&S Kitchenette
  '6c10a076-f420-4592-9def-97d0bf655098',  -- Bobby B's
  '7531d345-d6ba-435c-b6cf-f1c10a1d040f',  -- Catboat
  'fb6cde5d-379b-4b3f-a350-a02b816c47ef',  -- Le Grenier
  '97bb644c-9d42-47ff-b7e7-8e2c843f5369',  -- Mikado
  'c93aa88b-9cc5-4ef9-b78e-59d6671729b6',  -- Vineyard Grocer
  '01245424-1548-4560-9c0f-3e23c97dd4b0',  -- Edgartown Pizza
  '246def84-2763-49bb-a946-9d124b0f49a8',  -- Tony's Market
  '6741a3e3-d5b5-4d70-8910-3a29d6e2b29c',  -- Vineyard Caribbean
  '169fae98-5974-402a-94e7-6cf8eac1ed69',  -- El Barco
  '0e1e8ba2-0da6-4318-a649-33ca9aed76bb'   -- Edgartown Meat & Fish
);
```

(Not strictly necessary — the new ordering will work on any state — but it lets us prove the fix on the same failure set.)

2. **Single-iteration test** — POST one batch and confirm:

```bash
curl -X POST "https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/menu-refresh?force_all=true&limit=8" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: response shows 8 restaurants. Run it again — second call should show **8 DIFFERENT restaurants** (not the same set). If still the same set, change 1 didn't take. If a different set, but some duplicates linger, change 2 missed a failure path.

3. **Re-launch full backfill** — same script as before:

```bash
export SUPABASE_URL="https://vpioftosgdkyiwvhxewy.supabase.co"
export CRON_SECRET="<from Supabase function secrets>"
./scripts/backfill-menu-descriptions.sh
```

Expected:
- ~22 iterations total (177 ÷ 8)
- Each iteration shows DIFFERENT restaurants from the previous
- `total_inserted` + `total_updated` should grow each iteration for restaurants that DO extract
- Script terminates with `✓ Done. Total restaurants backfilled: ~170`
- Wall time: ~25-45 min

4. **Final DB check:**

```sql
SELECT
  COUNT(DISTINCT d.restaurant_id) FILTER (WHERE d.description IS NOT NULL) AS restaurants_done,
  COUNT(*) FILTER (WHERE d.description IS NOT NULL) AS dishes_with_descriptions,
  COUNT(*) FILTER (WHERE d.dietary_tags <> '{}') AS dishes_with_dietary_tags,
  (SELECT COUNT(*) FROM restaurants WHERE menu_url IS NOT NULL AND is_open) AS total_eligible
FROM dishes d;
```

Expected: `restaurants_done` should be at least 80-100 (every restaurant whose menu can actually be extracted). `dishes_with_descriptions` should be 1000-3000+. `dishes_with_dietary_tags` will reveal whether any MV menus actually use explicit V/GF labels — first real data point on that question.

## Commit + PR

Follow the same pattern as PR #229 (Phase 2 extractor):

- Branch: `fix/menu-refresh-backfill-cycle`
- Title: `fix(menu-refresh): cycle through restaurants by menu_last_checked, update on failure paths`
- Body: link to this plan + the project memory + a one-line summary of changes
- Codex before commit (per standing rule)
- Admin-merge after CI greens

## Out of scope

- **Data quality of broken menu URLs.** Several MV restaurants have menus we just can't extract: DNS-broken URLs (Rocco's, Le Grenier), HTTP 404 (El Barco), JSON parse errors on huge HTML (Edgartown Pizza), JS-rendered iframes our Browserless config doesn't render (State Road / checkle.menu). Those are individual data-quality follow-ups — file separately as needed.
- **Dedupe pass for zombie dishes.** Some restaurants have leftover seed entries that don't match current menu names (e.g. Atria's `Beet Salad`, Alchemy's `Tuna Tartare*` with asterisk). Tomorrow's backfill will populate descriptions for the matched ones; the zombies will persist with null descriptions. Follow the existing dedupe-migration pattern (`chore(data): Back Door Donuts dedupe migration`, `chore(data): mass dedupe sweep`) as a separate effort.
