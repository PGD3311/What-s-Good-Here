-- Menu X-Ray (2026-06-11): menu_scans audit table, private storage bucket,
-- batch pg_trgm match RPC, fail-closed rate limiters.
-- All additive (CREATE IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING).
-- No rollback block needed: drop the new objects to revert; nothing existing is altered.

-- 1. Audit table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,   -- NULL = guest scan
  photo_path TEXT,                                             -- NULL for guests (no photo retained)
  extracted JSONB,
  matched_count INT NOT NULL DEFAULT 0,
  ingested_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE menu_scans ENABLE ROW LEVEL SECURITY;
-- Inserts happen via service role only (no INSERT policy on purpose).
DROP POLICY IF EXISTS "menu_scans_select_own" ON menu_scans;
CREATE POLICY "menu_scans_select_own" ON menu_scans
  FOR SELECT USING (menu_scans.user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS idx_menu_scans_restaurant ON menu_scans(restaurant_id, created_at DESC);

-- 2. Private storage bucket --------------------------------------------------
-- Client converts HEIC -> JPEG before upload (canvas re-encode), and Anthropic
-- only accepts jpeg/png/webp/gif, so the allowlist is deliberately narrow.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-scans', 'menu-scans', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
-- No storage.objects policies: private bucket, service-role-only read/write.

-- 3. (No trigram index.) match_menu_dishes scores similarity() over a
-- regexp-normalized expression scoped to one restaurant's dishes (~50-200
-- rows) — a GIN trgm index on name would never be used by that access
-- pattern (similarity() in ORDER BY doesn't use trgm indexes; only % / <-> do).

-- 4. Batch match RPC -----------------------------------------------------------
-- Returns the TOP TWO candidates per query name (rank 1 and 2) so the edge
-- function can apply the accept rule (threshold + top1-vs-top2 margin) and a
-- category tiebreak. 0.30 floor just trims noise; the real accept threshold
-- lives in the edge function.
CREATE OR REPLACE FUNCTION match_menu_dishes(p_restaurant_id UUID, p_names TEXT[])
RETURNS TABLE (
  query_name TEXT,
  rank INT,
  dish_id UUID,
  dish_name TEXT,
  dish_category TEXT,
  avg_rating DECIMAL,
  total_votes BIGINT,
  price DECIMAL,
  sim REAL
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH queries AS (
    SELECT unnest(p_names) AS qname
  ), normalized AS (
    SELECT queries.qname,
           trim(regexp_replace(lower(queries.qname), '[^a-z0-9]+', ' ', 'g')) AS qnorm
    FROM queries
  ), ranked AS (
    SELECT normalized.qname,
           d.id, d.name, d.category, d.avg_rating, d.total_votes, d.price,
           similarity(trim(regexp_replace(lower(d.name), '[^a-z0-9]+', ' ', 'g')), normalized.qnorm) AS s,
           ROW_NUMBER() OVER (
             PARTITION BY normalized.qname
             ORDER BY similarity(trim(regexp_replace(lower(d.name), '[^a-z0-9]+', ' ', 'g')), normalized.qnorm) DESC,
                      d.total_votes DESC, d.id
           ) AS rn
    FROM normalized
    JOIN dishes d ON d.restaurant_id = p_restaurant_id
  )
  SELECT ranked.qname, ranked.rn::INT, ranked.id, ranked.name, ranked.category,
         ranked.avg_rating, ranked.total_votes, ranked.price, ranked.s
  FROM ranked
  WHERE ranked.rn <= 2 AND ranked.s > 0.30;
$$;

-- 5. Rate limiters ---------------------------------------------------------------
-- Logged-in scans: 5/min per user (existing user-keyed limiter, auth.uid based).
CREATE OR REPLACE FUNCTION check_menu_scan_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('menu_scan', 5, 60);
$$;

-- Ingest throttle: at most 3 ingesting scans per user per hour.
CREATE OR REPLACE FUNCTION check_menu_ingest_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('menu_scan_ingest', 3, 3600);
$$;

-- Guest scans: FAIL-CLOSED IP limiter. Unlike check_and_record_ip_rate_limit
-- (fail-open, fine for Places proxies behind Google quotas), this endpoint
-- burns LLM tokens — unverifiable callers are rejected.
CREATE OR REPLACE FUNCTION check_and_record_ip_rate_limit_strict(
  p_ip TEXT, p_action TEXT, p_max_attempts INT DEFAULT 10, p_window_seconds INT DEFAULT 3600
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
    RETURN jsonb_build_object('allowed', false, 'message', 'Could not verify request origin.');
  END IF;
  BEGIN
    v_ip := p_ip::INET;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('allowed', false, 'message', 'Could not verify request origin.');
  END;

  v_cutoff := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  SELECT COUNT(*), MIN(ip_rate_limits.created_at) INTO v_count, v_oldest
  FROM ip_rate_limits
  WHERE ip_rate_limits.ip_address = v_ip
    AND ip_rate_limits.action = p_action
    AND ip_rate_limits.created_at > v_cutoff;

  IF v_count >= p_max_attempts THEN
    v_retry_after := EXTRACT(EPOCH FROM (v_oldest + (p_window_seconds || ' seconds')::INTERVAL - NOW()))::INT;
    IF v_retry_after < 0 THEN v_retry_after := 0; END IF;
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after,
      'message', 'Too many requests. Please wait ' || v_retry_after || ' seconds.');
  END IF;

  INSERT INTO ip_rate_limits (ip_address, action) VALUES (v_ip, p_action);
  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- 6. Grants ----------------------------------------------------------------------
-- Lock down who can call the new functions. The match RPC and strict IP
-- limiter are edge-function-only (service role); the two user wrappers are
-- called with the end-user's JWT (authenticated role).
REVOKE EXECUTE ON FUNCTION match_menu_dishes(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_menu_dishes(UUID, TEXT[]) TO service_role;
REVOKE EXECUTE ON FUNCTION check_and_record_ip_rate_limit_strict(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_and_record_ip_rate_limit_strict(TEXT, TEXT, INT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION check_menu_scan_rate_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_menu_scan_rate_limit() TO authenticated;
REVOKE EXECUTE ON FUNCTION check_menu_ingest_rate_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_menu_ingest_rate_limit() TO authenticated;
