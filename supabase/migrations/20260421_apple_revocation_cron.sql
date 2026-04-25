-- supabase/migrations/20260421_apple_revocation_cron.sql
--
-- Lease RPC for the apple-revocation-retry cron worker. Uses
-- FOR UPDATE SKIP LOCKED so multiple workers can run concurrently without
-- contention or double-revocation. Stale leases (>10min) are reclaimed.
--
-- The cron schedule itself is COMMENTED OUT in this migration. It activates
-- in B3-activate, after Apple Dev verification + Vault credential upload.
-- Until then, the function exists but is never invoked; the queue grows
-- but won't drain.

CREATE OR REPLACE FUNCTION public.lease_apple_revocations(
  p_limit INT,
  p_instance_id TEXT,
  p_stale_lock_ms INT
) RETURNS TABLE (
  id UUID,
  apple_sub TEXT,
  encrypted_refresh_token TEXT,
  key_version TEXT,
  client_id_type TEXT,
  attempts INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- IMPORTANT: qualify all column refs with the table alias `p` (or sub-query
  -- alias `sub`) because RETURNS TABLE column names become local variables
  -- inside the function body (per CLAUDE.md §1.5). Bare `id` would be
  -- ambiguous between the RETURNS TABLE column and the joined table column.
  RETURN QUERY
  UPDATE public.pending_apple_revocations p
     SET locked_at = NOW(),
         locked_by = p_instance_id
    WHERE p.id IN (
      SELECT sub.id
        FROM public.pending_apple_revocations sub
       WHERE sub.next_attempt_at <= NOW()
         AND sub.attempts < 10
         AND NOT sub.dead_letter
         AND NOT sub.unrevokable
         AND (sub.locked_at IS NULL OR sub.locked_at < NOW() - make_interval(secs => p_stale_lock_ms / 1000.0))
       ORDER BY sub.next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT p_limit
    )
  RETURNING
    p.id,
    p.apple_sub,
    p.encrypted_refresh_token,
    p.key_version,
    p.client_id_type,
    p.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lease_apple_revocations(INT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_apple_revocations(INT, TEXT, INT) TO service_role;

COMMENT ON FUNCTION public.lease_apple_revocations(INT, TEXT, INT) IS
'Lease RPC for apple-revocation-retry cron worker. Atomically claims up to p_limit retry-eligible rows using FOR UPDATE SKIP LOCKED, reclaiming stale leases older than p_stale_lock_ms ms. Only callable by service_role.';

-- =============================================================================
-- pg_cron schedule — ACTIVATE IN B3-ACTIVATE
-- =============================================================================
-- Uncomment and run AFTER Apple Dev verification clears + Vault is populated.
--
-- SELECT cron.schedule(
--   'apple-revocation-retry',
--   '*/15 * * * *',
--   $$
--     SELECT net.http_post(
--       url := 'https://vpioftosgdkyiwvhxewy.supabase.co/functions/v1/apple-revocation-retry',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );

-- ROLLBACK:
--   SELECT cron.unschedule('apple-revocation-retry');
--   DROP FUNCTION IF EXISTS public.lease_apple_revocations(INT, TEXT, INT);
