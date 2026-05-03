-- 2026-05-03: IP-based rate limiting for unauthenticated Places proxy callers
--
-- The Places Edge Functions (places-autocomplete, places-details,
-- places-nearby-search) run with verify_jwt=false and accept guest traffic
-- so the Add Restaurant flow works for anonymous users. Until now, only
-- authenticated callers were rate-limited (via the existing
-- check_and_record_rate_limit which is keyed on auth.uid()), leaving
-- guests free to drain the Google Places quota.
--
-- This migration introduces an IP-keyed companion limiter so all three
-- functions can apply a per-IP cap to anonymous traffic.
--
-- Codex security HIGH.

-- New table — separate from `rate_limits` so that table's NOT NULL user_id
-- + FK to auth.users stays intact. RLS is enabled with no public policies;
-- the SECURITY DEFINER RPC below is the only entry point.
CREATE TABLE IF NOT EXISTS ip_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ip_rate_limits_lookup_idx
  ON ip_rate_limits (ip_address, action, created_at DESC);

ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY;

-- Companion to check_and_record_rate_limit, keyed on caller IP. The Edge
-- Functions extract the IP from cf-connecting-ip / x-forwarded-for and
-- pass it as a TEXT that we cast to INET inside the function (cast failure
-- returns "allowed: true" — fail-open is acceptable for a defense-in-depth
-- layer that runs alongside the Google Places quota and Cloudflare WAF).
CREATE OR REPLACE FUNCTION check_and_record_ip_rate_limit(
  p_ip TEXT, p_action TEXT, p_max_attempts INT DEFAULT 30, p_window_seconds INT DEFAULT 60
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ip INET;
  v_count INT;
  v_oldest TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
  v_retry_after INT;
BEGIN
  IF p_ip IS NULL OR length(trim(p_ip)) = 0 THEN
    -- No IP available (server-to-server, dashboard tester) — let it through.
    RETURN jsonb_build_object('allowed', true);
  END IF;

  BEGIN
    v_ip := p_ip::INET;
  EXCEPTION WHEN others THEN
    -- Malformed IP — fail open. Don't return an obvious error that would
    -- give a probing client information about parsing rules.
    RETURN jsonb_build_object('allowed', true);
  END;

  v_cutoff := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  SELECT COUNT(*), MIN(created_at) INTO v_count, v_oldest
  FROM ip_rate_limits
  WHERE ip_address = v_ip AND action = p_action AND created_at > v_cutoff;

  IF v_count >= p_max_attempts THEN
    v_retry_after := EXTRACT(EPOCH FROM (v_oldest + (p_window_seconds || ' seconds')::INTERVAL - NOW()))::INT;
    IF v_retry_after < 0 THEN v_retry_after := 0; END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after,
      'message', 'Too many requests. Please wait ' || v_retry_after || ' seconds.'
    );
  END IF;

  INSERT INTO ip_rate_limits (ip_address, action) VALUES (v_ip, p_action);

  RETURN jsonb_build_object('allowed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION check_and_record_ip_rate_limit(TEXT, TEXT, INT, INT)
  TO anon, authenticated, service_role;

-- Schedule cleanup of stale entries (>1 day old) — companion to the existing
-- cleanup-old-rate-limits cron. Idempotent — re-running is safe.
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-old-ip-rate-limits',
    '17 * * * *',
    $cron$DELETE FROM ip_rate_limits WHERE created_at < NOW() - INTERVAL '1 day'$cron$
  );
EXCEPTION WHEN duplicate_object THEN
  -- Already scheduled, skip.
  NULL;
END $$;

-- ROLLBACK:
-- SELECT cron.unschedule('cleanup-old-ip-rate-limits');
-- DROP FUNCTION IF EXISTS check_and_record_ip_rate_limit(TEXT, TEXT, INT, INT);
-- DROP TABLE IF EXISTS ip_rate_limits;
