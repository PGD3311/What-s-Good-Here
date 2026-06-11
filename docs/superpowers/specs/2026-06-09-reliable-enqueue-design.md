# Reliable Enqueue + Transient Retry — Design Spec

**Date:** 2026-06-09
**Gaps:** #1 + #3 in `2026-06-09-menu-pipeline-gap-map.md`.
**Scope:** one SQL migration (DB trigger + cron change). No edge-fn or frontend code changes required (frontend `createJob` stays as-is, belt-and-suspenders).

## Problem

- **Gap 1 — enqueue is fire-and-forget + swallowed.** `AddRestaurantModal.jsx` does `menuImportApi.createJob(...).catch(err => logger.warn(...))`. If that RPC call fails (network/RLS/transient), the restaurant row exists with **no import job and nothing ever retries** → permanent blank.
- **Gap 3 — dead jobs frozen 30 days, even on transient failures.** After 3 attempts a job → `dead`. The nightly `create-menu-refresh-jobs` cron skips any restaurant with a dead job <30 days old. A transient outage (Browserless down, Anthropic 429, DNS blip) burns all 3 attempts in ~3.5h (backoff 5→30→180 min) → `dead` → blank for a month even after the cause clears.

## Design

### Part A (Gap 1) — DB-trigger enqueue (structural guarantee)
Add an `AFTER INSERT ON restaurants` trigger that enqueues the initial job, so a restaurant **cannot** exist without a job regardless of whether the client call succeeds:

```sql
CREATE OR REPLACE FUNCTION trg_enqueue_menu_import_on_restaurant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only user-created restaurants (the Gap 1 fire-and-forget case). Discovery /
  -- bulk-seed inserts (created_by NULL) are left to the nightly stale-refresh cron
  -- so a large discovery batch can't flood the queue.
  IF NEW.created_by IS NOT NULL THEN
    PERFORM enqueue_menu_import(NEW.id, 'initial', 10);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_menu_import_on_restaurant ON restaurants;
CREATE TRIGGER enqueue_menu_import_on_restaurant
  AFTER INSERT ON restaurants
  FOR EACH ROW EXECUTE FUNCTION trg_enqueue_menu_import_on_restaurant();
```

- `enqueue_menu_import` is already idempotent (partial-unique index `one_active_per_restaurant` + `ON CONFLICT DO NOTHING`), so the trigger + the frontend's belt-and-suspenders `createJob` call can both fire and only one job is created.
- SECURITY DEFINER lets the trigger insert into the service-role-only `menu_import_jobs`.
- The trigger fires inside the insert transaction, so by the time `restaurantsApi.create()` returns, the job exists. The frontend `createJob` stays (it returns `job_id` for status polling and is harmless/idempotent).
- **Gating on `created_by IS NOT NULL`** scopes this precisely to the user-add case (Gap 1) and avoids enqueuing a job per row on a `discover-restaurants` / backfill batch.

### Part B (Gap 3) — transient-vs-terminal dead retry
Classify `error_code`s:
- **TRANSIENT** (self-heals; re-enqueue soon): `fetch_timeout`, `dns_error`, `claude_error`, `unknown_error`.
- **TERMINAL** (won't change on its own; rely on the photo fallback / longer wait): `no_menu_url`, `no_dishes`, `page_too_short`, `parse_error`, `fetch_error`.

Modify the nightly `create-menu-refresh-jobs` cron's dead-exclusion so a **transient** dead older than 6 hours no longer blocks re-enqueue, while **terminal** deads keep the 30-day exclusion:

```sql
AND NOT EXISTS (
  SELECT 1 FROM menu_import_jobs mij
  WHERE mij.restaurant_id = r.id AND mij.status = 'dead'
    AND (
      (mij.error_code NOT IN ('fetch_timeout','dns_error','claude_error','unknown_error')
         AND mij.created_at > NOW() - INTERVAL '30 days')
      OR (mij.error_code IN ('fetch_timeout','dns_error','claude_error','unknown_error')
         AND mij.created_at > NOW() - INTERVAL '6 hours')
    )
)
```

- A restaurant whose only recent deads are transient + >6h old becomes eligible at the next nightly run → self-heals within ~1 day instead of 30.
- The cron still requires `menu_url IS NOT NULL`, so `no_menu_url` deads (no URL) are not resurrected here — those are the photo-fallback's job (#320). That's the right division.
- Cadence note: the cron runs daily (3am), so transient recovery is "within a day," not minutes. A dedicated hourly resurrect-transient cron would tighten that; deferred as a v2 (daily is already a 30×improvement).

The edge function's per-job retry (3 attempts, exponential backoff) is unchanged — Part B only changes when a *dead* job gets a fresh job created.

## Migration `2026-06-09-reliable-enqueue.sql`
1. The trigger function + trigger (Part A).
2. `cron.unschedule('create-menu-refresh-jobs')` then `cron.schedule(...)` with the new dead-exclusion (Part B). Copy the existing cron body verbatim except the dead-exclusion block. (This cron is a pure SQL INSERT — no `net.http_post`/vault secret, unlike the queue-processor cron.)
3. `-- ROLLBACK:` block (drop trigger + function; reschedule the cron with the original 30-day-only exclusion).

## Safety / non-regression
- Trigger is additive + idempotent; worst case a duplicate enqueue attempt that the unique index absorbs. Gated to user-created rows.
- Cron change only *loosens* the dead-exclusion for transient errors — it can't cause a terminal/no-URL restaurant to be re-tried in a tight loop (those stay excluded 30 days), and active-job + staleness guards are unchanged, so it won't double-enqueue or re-burn Sonnet on fresh rows.
- No change to the queue processor, the per-job backoff, or the frontend.

## Testing
- Migrations aren't unit-testable here; verify by:
  - Insert a restaurant with a `created_by` → confirm a `menu_import_jobs` row appears (trigger). Insert one with `created_by = NULL` → confirm NO job (gating).
  - Confirm `cron.job` shows the rescheduled `create-menu-refresh-jobs` with the new command (`SELECT jobname, command FROM cron.job WHERE jobname='create-menu-refresh-jobs'`).
  - Spot: a restaurant with a 7-hour-old `dead` job whose `error_code='claude_error'` is now eligible for the nightly re-enqueue; one with `error_code='no_dishes'` is not.
- Codex-review the migration before deploy.

## Deploy
Run the migration in the Supabase SQL editor (it `unschedule`s + reschedules the cron and creates the trigger). Idempotent (`CREATE OR REPLACE`, `DROP ... IF EXISTS`). No edge-fn redeploy, no app build.

## Out of scope
Gap 2 (no-URL restaurants) — covered by the photo fallback. A faster (hourly) transient-resurrect cron — deferred.
