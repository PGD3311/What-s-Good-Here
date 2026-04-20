-- 2026-04-19: Update process-menu-import-queue cron to use cron_secret
--
-- The menu-refresh edge function now requires Authorization: Bearer $CRON_SECRET
-- (in addition to verify_jwt = false at the gateway). Update the cron caller
-- to pass that secret from vault instead of the legacy service_role_key, which
-- the Functions gateway stopped accepting around 2026-04-12 and which would
-- not satisfy the new in-function check anyway.
--
-- PRE-DEPLOY MANUAL STEP (Supabase dashboard):
--   1. Generate a high-entropy secret (e.g. `openssl rand -hex 32`)
--   2. Vault: add secret named 'cron_secret' with that value
--      (Supabase dashboard → Project Settings → Vault → New secret)
--   3. Edge Functions env: set CRON_SECRET to the SAME value on the
--      menu-refresh function (Settings → Edge Functions → menu-refresh)
--   4. Then run this migration in the SQL editor.

SELECT cron.unschedule('process-menu-import-queue');

SELECT cron.schedule(
  'process-menu-import-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/menu-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"mode": "queue"}'::jsonb
  );
  $$
);

-- Verify the job is registered with the new headers
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'process-menu-import-queue';

-- ROLLBACK:
-- SELECT cron.unschedule('process-menu-import-queue');
-- SELECT cron.schedule(
--   'process-menu-import-queue',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/menu-refresh',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
--     ),
--     body := '{"mode": "queue"}'::jsonb
--   );
--   $$
-- );
-- Note: if rolling back, also revert the menu-refresh function's verify_jwt setting
-- and remove the in-function CRON_SECRET check.
