-- 2026-05-03: Update daily-scraper-dispatch cron to use cron_secret
--
-- The original `20260216120000_enable_scraper_cron.sql` migration scheduled
-- pg_cron to call /functions/v1/scraper-dispatcher with
-- `Authorization: Bearer ${service_role_key}`. Both scraper-dispatcher and
-- restaurant-scraper auth via auth.getUser() + admins row. Since a service
-- role key is NOT a user JWT, getUser() returns no user and the cron call
-- has been silently rejected with 401 — the events/specials pipeline has
-- not run via cron since this guard was added.
--
-- Fix: switch the cron caller to the same CRON_SECRET shared-secret pattern
-- used by menu-refresh (PR #58 / #82). Both Edge Functions now accept
-- `Bearer ${CRON_SECRET}` as a valid auth path in addition to the admin
-- user JWT.
--
-- PRE-DEPLOY MANUAL STEP (Supabase dashboard):
--   1. Confirm `cron_secret` exists in vault (re-used from menu-refresh
--      setup; if missing, generate via `openssl rand -hex 32` and add it
--      under Project Settings → Vault → New secret).
--   2. Edge Functions env: set CRON_SECRET to the SAME value on BOTH
--      `scraper-dispatcher` and `restaurant-scraper`
--      (Settings → Edge Functions → <function> → Manage secrets).
--   3. Then run this migration in the SQL editor.
--   4. Verify a cron run: `SELECT jobname, status, return_message FROM
--      cron.job_run_details ORDER BY end_time DESC LIMIT 5;`

SELECT cron.unschedule('daily-scraper-dispatch');

SELECT cron.schedule(
  'daily-scraper-dispatch',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/scraper-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job is registered with the new headers
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'daily-scraper-dispatch';

-- ROLLBACK:
-- SELECT cron.unschedule('daily-scraper-dispatch');
-- SELECT cron.schedule(
--   'daily-scraper-dispatch',
--   '0 11 * * *',
--   $$
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/scraper-dispatcher',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- Note: rolling back the cron alone leaves both functions still rejecting
-- service_role bearers. To fully revert, also revert the verify_jwt and
-- in-function CRON_SECRET changes for scraper-dispatcher and
-- restaurant-scraper.
