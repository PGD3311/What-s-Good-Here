-- Audit 2026-04-16 — Supabase best-practices fixes
-- Source: AUDIT-SUPABASE-2026-04-16.md
--
-- Fixes bundled in this migration:
--   CRITICAL
--     #1  N+1 in get_ranked_dishes best_photos CTE (is_blocked_pair per row)
--     #2  N+1 in get_open_reports (correlated subquery in SELECT)
--     #3  Missing composite index idx_votes_dish_source_rating
--     #5  N+1 in follows_select_not_blocked RLS policy
--   HIGH
--     #7  Missing idx_votes_user_dish_created (friends' votes hot path)
--     #9  Missing idx_votes_source_created (weighted vote filters)
--     #10 Missing reports_target_status_idx composite
--
-- Run this in Supabase SQL Editor. Safe to run more than once — all statements
-- use CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS, and CREATE OR REPLACE.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block; Supabase's
-- SQL Editor wraps statements in one, so we use CREATE INDEX (blocking) here.
-- All indexes are small compared to the votes table volume; build time should
-- be seconds. If you need non-blocking builds, paste each CREATE INDEX block
-- into the editor on its own (Supabase will run it outside a transaction).

BEGIN;

-- ============================================================================
-- #3, #7, #9: new composite indexes on votes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_votes_dish_source_rating
  ON votes(dish_id, source, rating_10)
  WHERE rating_10 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_votes_user_dish_created
  ON votes(user_id, dish_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_source_created
  ON votes(source, created_at DESC);


-- ============================================================================
-- #10: composite on reports for admin filtering by (user, status)
-- ============================================================================

CREATE INDEX IF NOT EXISTS reports_target_status_idx
  ON reports(reported_user_id, status, created_at DESC)
  WHERE reported_user_id IS NOT NULL;


-- ============================================================================
-- #5: follows_select_not_blocked — inline NOT EXISTS instead of 2x is_blocked_pair
-- ============================================================================

DROP POLICY IF EXISTS "follows_select_public" ON follows;
DROP POLICY IF EXISTS "follows_select_not_blocked" ON follows;
CREATE POLICY "follows_select_not_blocked" ON follows
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = (select auth.uid())
             AND (ub.blocked_id = follower_id OR ub.blocked_id = followed_id))
         OR (ub.blocked_id = (select auth.uid())
             AND (ub.blocker_id = follower_id OR ub.blocker_id = followed_id))
    )
  );


-- ============================================================================
-- #2: get_open_reports — pre-aggregate counts in a CTE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_open_reports(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
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
  p_offset := GREATEST(p_offset, 0);

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
  ORDER BY COALESCE(oc.open_count, 0) DESC, r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_open_reports(INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_open_reports(INT, INT) TO authenticated;


-- ============================================================================
-- #1: get_ranked_dishes — best_photos CTE replaces is_blocked_pair() call
--     with inline NOT EXISTS so Postgres hash-joins user_blocks once.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_ranked_dishes(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_miles INT DEFAULT 50,
  filter_category TEXT DEFAULT NULL,
  filter_town TEXT DEFAULT NULL
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_town TEXT,
  category TEXT,
  tags TEXT[],
  cuisine TEXT,
  price DECIMAL,
  photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  distance_miles DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  value_score DECIMAL,
  value_percentile DECIMAL,
  search_score DECIMAL,
  featured_photo_url TEXT,
  restaurant_lat DECIMAL,
  restaurant_lng DECIMAL,
  restaurant_address TEXT,
  restaurant_phone TEXT,
  restaurant_website_url TEXT,
  toast_slug TEXT,
  order_url TEXT
) AS $$
DECLARE
  lat_delta DECIMAL := radius_miles / 69.0;
  lng_delta DECIMAL := radius_miles / (69.0 * COS(RADIANS(user_lat)));
BEGIN
  RETURN QUERY
  WITH global_stats AS (
    SELECT COALESCE(AVG(dishes.avg_rating), 7.0) AS global_mean
    FROM dishes
    WHERE dishes.total_votes > 0 AND dishes.avg_rating IS NOT NULL
  ),
  nearby_restaurants AS (
    SELECT r.id, r.name, r.town, r.lat, r.lng, r.cuisine,
           r.address, r.phone, r.website_url, r.toast_slug, r.order_url
    FROM restaurants r
    WHERE r.is_open = true
      AND r.lat BETWEEN (user_lat - lat_delta) AND (user_lat + lat_delta)
      AND r.lng BETWEEN (user_lng - lng_delta) AND (user_lng + lng_delta)
      AND (filter_town IS NULL OR r.town = filter_town)
  ),
  restaurants_with_distance AS (
    SELECT
      nr.id, nr.name, nr.town, nr.lat, nr.lng, nr.cuisine,
      nr.address, nr.phone, nr.website_url, nr.toast_slug, nr.order_url,
      ROUND((
        3959 * ACOS(
          LEAST(1.0, GREATEST(-1.0,
            COS(RADIANS(user_lat)) * COS(RADIANS(nr.lat)) *
            COS(RADIANS(nr.lng) - RADIANS(user_lng)) +
            SIN(RADIANS(user_lat)) * SIN(RADIANS(nr.lat))
          ))
        )
      )::NUMERIC, 2) AS distance
    FROM nearby_restaurants nr
  ),
  filtered_restaurants AS (
    SELECT * FROM restaurants_with_distance WHERE distance <= radius_miles
  ),
  variant_stats AS (
    SELECT
      d.parent_dish_id,
      COUNT(DISTINCT d.id)::INT AS child_count,
      SUM(COALESCE(ds.vote_count, 0))::NUMERIC AS total_child_votes
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS vote_count
      FROM votes v GROUP BY v.dish_id
    ) ds ON ds.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id
  ),
  best_variants AS (
    SELECT DISTINCT ON (d.parent_dish_id)
      d.parent_dish_id,
      d.name AS best_name,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS best_rating
    FROM dishes d
    LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id, d.id, d.name
    HAVING COUNT(v.id) >= 1
    ORDER BY d.parent_dish_id, AVG(v.rating_10) DESC NULLS LAST, COUNT(v.id) DESC
  ),
  recent_vote_counts AS (
    SELECT votes.dish_id, COUNT(*)::INT AS recent_votes
    FROM votes
    WHERE votes.created_at > NOW() - INTERVAL '14 days'
    GROUP BY votes.dish_id
  ),
  best_photos AS (
    -- H3: exclude photos authored by users the viewer has blocked.
    -- Inline NOT EXISTS so Postgres hash-joins user_blocks once instead of
    -- invoking is_blocked_pair() per dish_photo row.
    SELECT DISTINCT ON (dp.dish_id)
      dp.dish_id,
      dp.photo_url
    FROM dish_photos dp
    INNER JOIN dishes d2 ON dp.dish_id = d2.id
    INNER JOIN filtered_restaurants fr2 ON d2.restaurant_id = fr2.id
    WHERE dp.status IN ('featured', 'community')
      AND d2.parent_dish_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = (select auth.uid()) AND ub.blocked_id = dp.user_id)
           OR (ub.blocker_id = dp.user_id AND ub.blocked_id = (select auth.uid()))
      )
    ORDER BY dp.dish_id,
      CASE dp.source_type WHEN 'restaurant' THEN 0 ELSE 1 END,
      CASE dp.status WHEN 'featured' THEN 0 ELSE 1 END,
      dp.quality_score DESC NULLS LAST,
      dp.created_at DESC
  )
  SELECT
    d.id AS dish_id,
    d.name AS dish_name,
    fr.id AS restaurant_id,
    fr.name AS restaurant_name,
    fr.town AS restaurant_town,
    d.category,
    d.tags,
    fr.cuisine,
    d.price,
    d.photo_url,
    COALESCE(vs.total_child_votes,
      SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)
    )::BIGINT AS total_votes,
    COALESCE(ROUND(
      (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                ELSE 0 END) /
       NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                       WHEN v.source = 'ai_estimated' THEN 0.5
                       ELSE 0 END), 0)
      )::NUMERIC, 1), 0) AS avg_rating,
    fr.distance AS distance_miles,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_name AS best_variant_name,
    bv.best_rating AS best_variant_rating,
    d.value_score,
    d.value_percentile,
    dish_search_score(
      COALESCE(ROUND(
        (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                  WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                  ELSE 0 END) /
         NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                         WHEN v.source = 'ai_estimated' THEN 0.5
                         ELSE 0 END), 0)
        )::NUMERIC, 1), 0),
      COALESCE(vs.total_child_votes,
        SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::NUMERIC,
      fr.distance,
      COALESCE(rvc.recent_votes, 0),
      (SELECT global_mean FROM global_stats)
    ) AS search_score,
    bp.photo_url AS featured_photo_url,
    fr.lat AS restaurant_lat,
    fr.lng AS restaurant_lng,
    fr.address AS restaurant_address,
    fr.phone AS restaurant_phone,
    fr.website_url AS restaurant_website_url,
    fr.toast_slug,
    fr.order_url
  FROM dishes d
  INNER JOIN filtered_restaurants fr ON d.restaurant_id = fr.id
  LEFT JOIN votes v ON d.id = v.dish_id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN recent_vote_counts rvc ON rvc.dish_id = d.id
  LEFT JOIN best_photos bp ON bp.dish_id = d.id
  WHERE (filter_category IS NULL OR d.category = filter_category)
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, fr.id, fr.name, fr.town, d.category, d.tags, fr.cuisine,
           d.price, d.photo_url, fr.distance, fr.lat, fr.lng,
           fr.address, fr.phone, fr.website_url, fr.toast_slug, fr.order_url,
           vs.total_child_votes, vs.child_count,
           bv.best_name, bv.best_rating,
           d.value_score, d.value_percentile,
           rvc.recent_votes,
           bp.photo_url
  ORDER BY search_score DESC NULLS LAST, total_votes DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMIT;


-- ============================================================================
-- Post-deploy verification queries (run interactively, not in the migration)
-- ============================================================================
--
-- Confirm the new indexes exist and have a non-zero idx_scan after a few ranked
-- queries:
--
--   SELECT indexrelname, idx_scan, idx_tup_read
--   FROM pg_stat_user_indexes
--   WHERE indexrelname IN (
--     'idx_votes_dish_source_rating',
--     'idx_votes_user_dish_created',
--     'idx_votes_source_created',
--     'reports_target_status_idx'
--   );
--
-- Confirm get_ranked_dishes now hits the new index. Expect:
--   Index Scan using idx_votes_dish_source_rating on votes
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM get_ranked_dishes(NULL, NULL, NULL, NULL, 'popular', 50);
--
-- Confirm get_open_reports no longer shows SubPlan in the plan:
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM get_open_reports(50, 0);
