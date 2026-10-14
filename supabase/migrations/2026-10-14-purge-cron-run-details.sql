-- Purge pg_cron run history daily.
--
-- Incident 2026-10-10: job 23 (menu-refresh) runs every minute, so
-- cron.job_run_details grew to 409 MB and net._http_response bloated to
-- 170 MB. pg_net's own cleanup DELETE took 12-15 min per pass, starving the
-- Micro instance; PostgREST requests 504'd and the app showed no dishes.
-- Fixed live by truncating net._http_response and trimming run history to
-- the last day. This job keeps run history bounded going forward.
--
-- Already applied in production 2026-10-14 (jobid 32).

SELECT cron.schedule(
  'purge-cron-run-details',
  '30 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$
);

-- ROLLBACK:
-- SELECT cron.unschedule('purge-cron-run-details');
