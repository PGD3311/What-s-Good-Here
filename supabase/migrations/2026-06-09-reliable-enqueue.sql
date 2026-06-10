-- Reliable enqueue + transient-dead retry (Gaps 1/3)
-- Spec: docs/superpowers/specs/2026-06-09-reliable-enqueue-design.md
-- Run in Supabase SQL editor. Idempotent.
--
-- Part A: a user-created restaurant ALWAYS gets an import job (DB trigger),
--   even if the frontend fire-and-forget createJob call fails (Gap 1). Also
--   re-enqueues when an operator later adds a website/menu URL to a restaurant
--   that had none.
-- Part B: a job that died from a TRANSIENT error self-heals within ~a day
--   instead of being frozen for 30 days (Gap 3).

-- ───────────────────────── Part A: trigger ─────────────────────────
-- Invoker rights (NOT security definer): the privileged write already lives in
-- enqueue_menu_import (SECURITY DEFINER; authenticated has EXECUTE). The PERFORM
-- is wrapped so an enqueue failure can NEVER abort the restaurant insert/update.
-- enqueue_menu_import is idempotent (one_active_per_restaurant partial unique
-- index + ON CONFLICT DO NOTHING), so trigger + the frontend's belt-and-suspenders
-- createJob both firing is safe.
CREATE OR REPLACE FUNCTION trg_enqueue_menu_import_on_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Only user-created restaurants (the Gap 1 case). Discovery / bulk-seed rows
  -- (created_by NULL) are left to the nightly stale-refresh cron so a large
  -- discovery batch can't flood the queue at insert time.
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only act when a URL went from absent -> present (operator filled
  -- in a website/menu later). Any other update is a no-op. This is safe against
  -- the queue processor's own menu_url/website_url discovery writes: those happen
  -- while a job is 'processing', so the enqueue below is absorbed by the
  -- active-job unique index (ON CONFLICT DO NOTHING).
  IF TG_OP = 'UPDATE' THEN
    IF NOT (
      (OLD.website_url IS NULL AND OLD.menu_url IS NULL)
      AND (NEW.website_url IS NOT NULL OR NEW.menu_url IS NOT NULL)
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  BEGIN
    PERFORM enqueue_menu_import(NEW.id, 'initial', 10);
  EXCEPTION WHEN OTHERS THEN
    -- Never let an enqueue hiccup abort the restaurant write (that's the whole
    -- point of Gap 1 — resilience). Log loudly instead.
    RAISE WARNING 'trg_enqueue_menu_import_on_restaurant: enqueue failed for restaurant %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enqueue_menu_import_on_restaurant ON restaurants;
CREATE TRIGGER enqueue_menu_import_on_restaurant
  AFTER INSERT OR UPDATE OF website_url, menu_url ON restaurants
  FOR EACH ROW EXECUTE FUNCTION trg_enqueue_menu_import_on_restaurant();

-- ───────────────────────── Part B: transient-dead retry ─────────────────────────
-- Rewrites the CURRENT create-menu-refresh-jobs cron (2026-05-20 version, which
-- added the extractor_fingerprint IS NULL self-requeue + ON CONFLICT guard —
-- both PRESERVED here). The ONLY change is the dead-job exclusion: a dead job
-- whose error is TRANSIENT (network/timeout/Claude/unknown, or a 408/425/429/5xx
-- fetch_error) now only blocks re-enqueue for 6 hours; TERMINAL deads keep the
-- 30-day cooldown. So a transient outage self-heals at the next nightly tick
-- instead of staying blank for a month.
DO $unschedule$
BEGIN
  PERFORM cron.unschedule('create-menu-refresh-jobs');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'create-menu-refresh-jobs was not scheduled; skipping unschedule';
END
$unschedule$;

SELECT cron.schedule(
  'create-menu-refresh-jobs',
  '0 3 * * *',
  $cron$
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
        AND (
          -- TERMINAL deads: 30-day cooldown
          (NOT (
             mij.error_code IN ('fetch_timeout','dns_error','claude_error','unknown_error')
             OR (mij.error_code = 'fetch_error'
                 AND COALESCE(mij.error_context->>'http_status', '') ~ '^(408|425|429|5[0-9][0-9])$')
           ) AND mij.created_at > NOW() - INTERVAL '30 days')
          -- TRANSIENT deads: only a 6-hour cooldown, then re-enqueue-eligible
          OR (
             (mij.error_code IN ('fetch_timeout','dns_error','claude_error','unknown_error')
              OR (mij.error_code = 'fetch_error'
                  AND COALESCE(mij.error_context->>'http_status', '') ~ '^(408|425|429|5[0-9][0-9])$'))
             AND mij.created_at > NOW() - INTERVAL '6 hours')
        )
    )
  ON CONFLICT (restaurant_id) WHERE status IN ('pending', 'processing') DO NOTHING
  $cron$
);

-- Verify:
--   SELECT jobname, schedule, substring(command,1,200) FROM cron.job WHERE jobname='create-menu-refresh-jobs';
--   -- trigger present:
--   SELECT tgname FROM pg_trigger WHERE tgrelid='restaurants'::regclass AND tgname='enqueue_menu_import_on_restaurant';

-- ───────────────────────── ROLLBACK ─────────────────────────
-- DROP TRIGGER IF EXISTS enqueue_menu_import_on_restaurant ON restaurants;
-- DROP FUNCTION IF EXISTS trg_enqueue_menu_import_on_restaurant();
-- -- Restore the pre-this-migration cron (2026-05-20 body: 30-day-only dead exclusion):
-- DO $rb$ BEGIN PERFORM cron.unschedule('create-menu-refresh-jobs'); EXCEPTION WHEN OTHERS THEN NULL; END $rb$;
-- SELECT cron.schedule('create-menu-refresh-jobs','0 3 * * *', $cron$
--   INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
--   SELECT r.id, 'refresh', 0 FROM restaurants r
--   WHERE r.is_open = true AND r.menu_url IS NOT NULL
--     AND (r.menu_last_checked IS NULL OR r.menu_last_checked < NOW() - INTERVAL '14 days' OR r.extractor_fingerprint IS NULL)
--     AND NOT EXISTS (SELECT 1 FROM menu_import_jobs mij WHERE mij.restaurant_id=r.id AND mij.status IN ('pending','processing'))
--     AND NOT EXISTS (SELECT 1 FROM menu_import_jobs mij WHERE mij.restaurant_id=r.id AND mij.status='dead' AND mij.created_at > NOW() - INTERVAL '30 days')
--   ON CONFLICT (restaurant_id) WHERE status IN ('pending','processing') DO NOTHING
-- $cron$);
