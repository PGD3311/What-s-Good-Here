-- Audit 2026-04-16 — Phase 2 (admin-only + MEDIUM fixes)
-- Source: AUDIT-SUPABASE-2026-04-16.md
--
-- Fixes bundled in this migration:
--   #4  Keyset pagination for get_open_reports (replaces OFFSET)
--   #11 Partial index on dish_photos (featured/community only)
--   #12 dishes.total_votes INT → BIGINT (prevents 2.1B overflow)
--   #13 Missing idx_events_created_by (idx_specials_created_by already exists)
--
-- Safe to run more than once — CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE,
-- and ALTER TABLE is idempotent against BIGINT.
--
-- Signature change on get_open_reports is SAFE — it has no client callers yet
-- (grep verified in src/ at time of writing).

BEGIN;

-- ============================================================================
-- #11: partial index on dish_photos for featured/community only
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dish_photos_featured_community
  ON dish_photos(dish_id, quality_score DESC)
  WHERE status IN ('featured', 'community');


-- ============================================================================
-- #12: dishes.total_votes INT → BIGINT
--   INT caps at 2.147B; trigger-maintained column, so no backfill.
--   Downstream RPCs that declare `total_votes INT` in their return type will
--   cast implicitly. They remain correct at current scale and can be updated
--   incrementally if a dish ever exceeds INT range.
--   NOTE: two dependencies block the ALTER and must be dropped + recreated:
--     - view category_median_prices (schema.sql:327)
--     - trigger trigger_compute_value_score (schema.sql:2082) which lists
--       total_votes in its UPDATE OF clause
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_compute_value_score ON dishes;
DROP VIEW IF EXISTS category_median_prices;

ALTER TABLE dishes
  ALTER COLUMN total_votes SET DATA TYPE BIGINT;

CREATE OR REPLACE VIEW category_median_prices
WITH (security_invoker = true) AS
SELECT category,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
  COUNT(*) AS dish_count
FROM dishes
WHERE price IS NOT NULL AND price > 0 AND total_votes >= 8
GROUP BY category;

CREATE TRIGGER trigger_compute_value_score
  BEFORE INSERT OR UPDATE OF avg_rating, total_votes, price, category ON dishes
  FOR EACH ROW EXECUTE FUNCTION compute_value_score();


-- ============================================================================
-- #13: FK index on events.created_by
--   (specials.created_by already has idx_specials_created_by at schema.sql:424)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);


-- ============================================================================
-- #4: keyset pagination for get_open_reports
--   Signature changes:
--     BEFORE: get_open_reports(p_limit INT, p_offset INT)
--     AFTER:  get_open_reports(p_limit INT, p_cursor_open_count BIGINT,
--                               p_cursor_created_at TIMESTAMPTZ, p_cursor_id UUID)
--   No client callers today (src/ grep returned 0 matches), so this is safe.
-- ============================================================================

DROP FUNCTION IF EXISTS get_open_reports(INT, INT);

CREATE OR REPLACE FUNCTION get_open_reports(
  p_limit INT DEFAULT 50,
  p_cursor_open_count BIGINT DEFAULT NULL,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  report_id UUID, reporter_id UUID, reporter_name TEXT,
  reported_type TEXT, reported_id UUID, reported_user_id UUID, reported_user_name TEXT,
  reason TEXT, details TEXT, target_snapshot JSONB, created_at TIMESTAMPTZ,
  target_user_open_report_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  p_limit := LEAST(GREATEST(p_limit, 1), 200);

  -- Cursor guard: require all three parts OR none. Partial cursors would make
  -- the tuple comparison return NULL and silently produce empty pages.
  -- NOTE: open_count is a live aggregate, so rows can shift between pages if
  -- reports are opened/closed during moderation. Acceptable for admin use.
  IF NOT (
    (p_cursor_open_count IS NULL AND p_cursor_created_at IS NULL AND p_cursor_id IS NULL)
    OR
    (p_cursor_open_count IS NOT NULL AND p_cursor_created_at IS NOT NULL AND p_cursor_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Partial cursor: pass all three of p_cursor_open_count, p_cursor_created_at, p_cursor_id (or none).';
  END IF;

  RETURN QUERY
  WITH open_counts AS (
    SELECT reported_user_id, COUNT(*)::BIGINT AS open_count
    FROM reports
    WHERE status = 'open' AND reported_user_id IS NOT NULL
    GROUP BY reported_user_id
  )
  SELECT r.id, r.reporter_id, rp.display_name,
    r.reported_type, r.reported_id, r.reported_user_id, up.display_name,
    r.reason, r.details, r.target_snapshot, r.created_at,
    COALESCE(oc.open_count, 0)
  FROM reports r
  LEFT JOIN profiles rp ON rp.id = r.reporter_id
  LEFT JOIN profiles up ON up.id = r.reported_user_id
  LEFT JOIN open_counts oc ON oc.reported_user_id = r.reported_user_id
  WHERE r.status = 'open'
    AND (
      p_cursor_open_count IS NULL
      OR (COALESCE(oc.open_count, 0), r.created_at, r.id)
         < (p_cursor_open_count, p_cursor_created_at, p_cursor_id)
    )
  ORDER BY COALESCE(oc.open_count, 0) DESC, r.created_at DESC, r.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_open_reports(INT, BIGINT, TIMESTAMPTZ, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_open_reports(INT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated;

COMMIT;


-- ============================================================================
-- Post-deploy verification
-- ============================================================================
--
-- 1. First page:
--   SELECT * FROM get_open_reports(50);
--
-- 2. Next page (pass back last row's values):
--   SELECT * FROM get_open_reports(
--     50,
--     <target_user_open_report_count from last row>,
--     <created_at from last row>,
--     <report_id from last row>
--   );
--
-- 3. Confirm BIGINT column:
--   SELECT data_type FROM information_schema.columns
--   WHERE table_name = 'dishes' AND column_name = 'total_votes';
--   -- expect: bigint
--
-- 4. Confirm new indexes exist:
--   SELECT indexname FROM pg_indexes
--   WHERE indexname IN (
--     'idx_events_created_by',
--     'idx_dish_photos_featured_community'
--   );
