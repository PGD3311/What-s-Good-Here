-- 2026-05-20: Enqueue NULL-fingerprint restaurants for Path A reprocessing
--
-- Background:
-- Tonight's v1.3 backfill (PRs #232, #236, #241) ran Path B (force_all=true)
-- against ~130 restaurants. 49 succeeded; 81 still have
-- extractor_fingerprint IS NULL because Path B's dumb extractor can't handle
-- JS-rendered Squarespace/Wix/Square menus (no iframe-follow, no Browserless
-- render, no PDF/image strategies).
--
-- They're now also blocked from the daily `create-menu-refresh-jobs` cron at
-- 3am because tonight's batch pre-stamp set menu_last_checked = NOW(), so the
-- 14-day staleness filter treats them as "fresh."
--
-- This migration does two things:
--
--   1. Updates the daily cron filter to ALSO enqueue rows where
--      extractor_fingerprint IS NULL. Going forward, every future fingerprint
--      bump self-deploys via this cron — no manual backfill scripts.
--
--   2. One-shot INSERT to enqueue the 81 stuck rows RIGHT NOW. The per-minute
--      `process-menu-import-queue` cron (Path A — the smart extractor) drains
--      them at 3/min, so expected wall time is ~30-60 min for the batch.
--
-- ---------------------------------------------------------------------------
-- Single-source-of-truth pattern for future fingerprint bumps:
--
--   The fingerprint string lives in ONE place: the CURRENT_EXTRACTOR_FINGERPRINT
--   constant in supabase/functions/menu-refresh/index.ts. This migration's SQL
--   never names the string — it only checks `IS NULL`.
--
--   To bump the extractor (new prompt version, new model, new schema field):
--     1. Bump CURRENT_EXTRACTOR_FINGERPRINT constant in menu-refresh/index.ts,
--        deploy the edge function.
--     2. Run (in SQL Editor or a one-off migration):
--          UPDATE restaurants SET extractor_fingerprint = NULL
--          WHERE extractor_fingerprint = '<previous-value>';
--     3. The next daily cron tick enqueues every wiped row; the per-minute
--        cron drains. Inventory refreshes over ~the rate Path A processes.
-- ---------------------------------------------------------------------------

-- Step 1: Update daily cron filter to include fingerprint=NULL rows.
SELECT cron.unschedule('create-menu-refresh-jobs');

SELECT cron.schedule(
  'create-menu-refresh-jobs',
  '0 3 * * *',
  $$
  INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
  SELECT r.id, 'refresh', 0
  FROM restaurants r
  WHERE r.is_open = true
    AND r.menu_url IS NOT NULL
    AND (
      r.menu_last_checked IS NULL
      OR r.menu_last_checked < NOW() - INTERVAL '14 days'
      OR r.extractor_fingerprint IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM menu_import_jobs mij
      WHERE mij.restaurant_id = r.id
        AND mij.status IN ('pending', 'processing')
    )
    AND NOT EXISTS (
      SELECT 1 FROM menu_import_jobs mij
      WHERE mij.restaurant_id = r.id
        AND mij.status = 'dead'
        AND mij.created_at > NOW() - INTERVAL '30 days'
    )
  ON CONFLICT (restaurant_id) WHERE status IN ('pending', 'processing') DO NOTHING
  $$
);

-- Step 2: One-shot enqueue of the 81 stuck restaurants.
--
-- Intentionally bypasses the daily cron's 30-day dead-job cooldown. Those
-- dead jobs were created under an older extractor (often pre-fingerprint).
-- The fingerprint=NULL signal is the explicit "retry under new extractor"
-- trigger. Re-enqueueing here lets Path A's smart pipeline (iframe-follow,
-- Browserless render, PDF, image candidates) take a fresh shot.
--
-- The unique-active partial index (menu_import_jobs_one_active_per_restaurant)
-- still prevents any double-enqueue with an in-flight job. Safe to re-run:
-- this INSERT skips restaurants that already have a pending/processing job,
-- and restaurants that succeed and get their fingerprint stamped drop out of
-- the WHERE clause naturally.
--
-- Priority 5 puts these between the 3am daily rotation (priority 0) and the
-- user-facing AddRestaurantModal flow (priority 10) — they drain ahead of
-- routine refreshes but yield to live user requests.
INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
SELECT r.id, 'refresh', 5
FROM restaurants r
WHERE r.is_open = true
  AND r.menu_url IS NOT NULL
  AND r.extractor_fingerprint IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM menu_import_jobs mij
    WHERE mij.restaurant_id = r.id
      AND mij.status IN ('pending', 'processing')
  )
ON CONFLICT (restaurant_id) WHERE status IN ('pending', 'processing') DO NOTHING;

-- Verification queries (run after migration):
--
--   -- Cron schedule was updated:
--   SELECT jobname, schedule, substring(command, 1, 400)
--   FROM cron.job WHERE jobname = 'create-menu-refresh-jobs';
--
--   -- Jobs were enqueued (expect ~81 pending immediately, draining over time):
--   SELECT status, COUNT(*) FROM menu_import_jobs
--   WHERE created_at > NOW() - INTERVAL '5 minutes'
--   GROUP BY status;
--
--   -- Stuck count drops as Path A processes:
--   SELECT COUNT(*) FROM restaurants
--   WHERE menu_url IS NOT NULL AND is_open = true AND extractor_fingerprint IS NULL;

-- ROLLBACK:
--   -- Revert the cron filter (restores the original 14-day-only stale gate):
--   SELECT cron.unschedule('create-menu-refresh-jobs');
--   SELECT cron.schedule(
--     'create-menu-refresh-jobs',
--     '0 3 * * *',
--     $$
--     INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
--     SELECT r.id, 'refresh', 0
--     FROM restaurants r
--     WHERE r.is_open = true
--       AND r.menu_url IS NOT NULL
--       AND (r.menu_last_checked IS NULL OR r.menu_last_checked < NOW() - INTERVAL '14 days')
--       AND NOT EXISTS (
--         SELECT 1 FROM menu_import_jobs mij
--         WHERE mij.restaurant_id = r.id AND mij.status IN ('pending', 'processing')
--       )
--       AND NOT EXISTS (
--         SELECT 1 FROM menu_import_jobs mij
--         WHERE mij.restaurant_id = r.id
--           AND mij.status = 'dead'
--           AND mij.created_at > NOW() - INTERVAL '30 days'
--       )
--     $$
--   );
--   -- The Step 2 one-shot INSERT cannot be cleanly rolled back. Pending jobs
--   -- it enqueued can be cancelled manually if needed:
--   --   UPDATE menu_import_jobs SET status = 'dead', error_code = 'cancelled',
--   --     error_message = 'Rolled back by operator', updated_at = NOW()
--   --   WHERE status = 'pending' AND priority = 5 AND created_at > '<migration timestamp>';
