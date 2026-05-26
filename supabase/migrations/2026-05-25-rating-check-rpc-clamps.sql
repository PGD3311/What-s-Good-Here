-- DB integrity hardening — audit findings P0 + P1.
--
-- Three changes, all defensive:
-- 1. CHECK constraint on votes.rating_10 (1-10 range). Without this, any
--    authenticated user can submit rating_10 = 99.9 or -50 and silently
--    corrupt dish avg_rating, consensus_avg, and downstream
--    user_rating_bias calculations. DECIMAL(3, 1) by itself permits
--    values up to ±99.9.
-- 2. Server-side range guard inside submit_vote_atomic so the error
--    message is human-readable (constraint violations bubble up as raw
--    SQLSTATE codes otherwise).
-- 3. Parameter clamps on get_ranked_dishes + get_restaurants_within_radius
--    so radius_miles, filter_dietary_tags can't be used to trigger
--    unbounded geo scans or oversized array predicates.
--
-- See docs/audits/2026-05-25-codebase-audit.md for the full audit report.

BEGIN;

-- ============================================================
-- 1. CHECK constraint on votes.rating_10
-- ============================================================
-- Add as NOT VALID first (instant, no scan). Audit existing rows. If
-- clean, promote to VALIDATE so the planner trusts it. If dirty, leave
-- NOT VALID and warn; new inserts/updates are still rejected.
ALTER TABLE votes
  DROP CONSTRAINT IF EXISTS rating_10_in_range;

ALTER TABLE votes
  ADD CONSTRAINT rating_10_in_range
    CHECK (rating_10 IS NULL OR (rating_10 >= 1 AND rating_10 <= 10))
    NOT VALID;

DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM votes
    WHERE rating_10 IS NOT NULL AND (rating_10 < 1 OR rating_10 > 10);

  IF bad_count = 0 THEN
    ALTER TABLE votes VALIDATE CONSTRAINT rating_10_in_range;
    RAISE NOTICE 'rating_10_in_range: constraint validated (0 prior violations).';
  ELSE
    RAISE WARNING
      'rating_10_in_range: % existing rows out of range — constraint left NOT VALID. Inspect and fix before running VALIDATE CONSTRAINT.',
      bad_count;
  END IF;
END $$;

-- ============================================================
-- 2. submit_vote_atomic — add range guard
-- ============================================================
-- Same body as schema.sql with the added range check. Constraint above
-- is the ultimate safety net; this guard gives callers a friendly
-- 22023 error message instead of a raw 23514 constraint violation.

CREATE OR REPLACE FUNCTION submit_vote_atomic(
  p_dish_id UUID,
  p_user_id UUID,
  p_rating_10 DECIMAL DEFAULT NULL,
  p_review_text TEXT DEFAULT NULL,
  p_purity_score DECIMAL DEFAULT NULL,
  p_war_score DECIMAL DEFAULT NULL,
  p_badge_hash TEXT DEFAULT NULL
)
RETURNS votes AS $$
DECLARE
  submitted_vote votes;
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_rating_10 IS NULL THEN
    RAISE EXCEPTION 'rating_10 is required';
  END IF;

  IF p_rating_10 < 1 OR p_rating_10 > 10 THEN
    RAISE EXCEPTION 'rating_10 must be between 1 and 10 (got %)', p_rating_10
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO votes (
    dish_id, user_id, rating_10, review_text, review_created_at,
    purity_score, war_score, badge_hash, source
  )
  VALUES (
    p_dish_id, p_user_id, p_rating_10, p_review_text,
    CASE WHEN p_review_text IS NOT NULL THEN NOW() ELSE NULL END,
    p_purity_score, p_war_score, p_badge_hash, 'user'
  )
  ON CONFLICT (dish_id, user_id) WHERE source = 'user'
  DO UPDATE SET
    rating_10 = EXCLUDED.rating_10,
    review_text = EXCLUDED.review_text,
    review_created_at = CASE
      WHEN EXCLUDED.review_text IS DISTINCT FROM votes.review_text
        THEN (CASE WHEN EXCLUDED.review_text IS NOT NULL THEN NOW() ELSE NULL END)
      ELSE votes.review_created_at
    END,
    purity_score = COALESCE(EXCLUDED.purity_score, votes.purity_score),
    war_score = COALESCE(EXCLUDED.war_score, votes.war_score),
    badge_hash = COALESCE(EXCLUDED.badge_hash, votes.badge_hash)
  RETURNING * INTO submitted_vote;

  RETURN submitted_vote;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. get_ranked_dishes — radius + dietary_tags clamps
-- ============================================================
-- Body is a VERBATIM copy of the schema.sql canonical body with two
-- clamps added in the DECLARE block:
--   v_radius      := LEAST(GREATEST(COALESCE(radius_miles, 50), 1), 500)
--   v_dietary_tags truncates filter_dietary_tags to first 20 entries
-- All references to radius_miles inside the query use v_radius now;
-- all references to filter_dietary_tags use v_dietary_tags.

CREATE OR REPLACE FUNCTION get_ranked_dishes(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_miles INT DEFAULT 50,
  filter_category TEXT DEFAULT NULL,
  filter_town TEXT DEFAULT NULL,
  filter_dietary_tags TEXT[] DEFAULT NULL
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
  order_url TEXT,
  description TEXT,
  dietary_tags TEXT[]
) AS $$
DECLARE
  v_radius INT := LEAST(GREATEST(COALESCE(radius_miles, 50), 1), 500);
  lat_delta DECIMAL := v_radius / 69.0;
  lng_delta DECIMAL := v_radius / (69.0 * COS(RADIANS(user_lat)));
BEGIN
  IF filter_dietary_tags IS NOT NULL AND array_length(filter_dietary_tags, 1) > 20 THEN
    RAISE EXCEPTION 'filter_dietary_tags accepts at most 20 entries (got %)', array_length(filter_dietary_tags, 1)
      USING ERRCODE = '22023';
  END IF;
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
    SELECT * FROM restaurants_with_distance WHERE distance <= v_radius
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
      SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 0 END)
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
    fr.order_url,
    d.description,
    d.dietary_tags
  FROM dishes d
  INNER JOIN filtered_restaurants fr ON d.restaurant_id = fr.id
  LEFT JOIN votes v ON d.id = v.dish_id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN recent_vote_counts rvc ON rvc.dish_id = d.id
  LEFT JOIN best_photos bp ON bp.dish_id = d.id
  WHERE (filter_category IS NULL OR d.category = filter_category)
    AND d.parent_dish_id IS NULL
    AND (
      filter_dietary_tags IS NULL
      OR array_length(filter_dietary_tags, 1) IS NULL
      OR d.dietary_tags @> filter_dietary_tags
    )
  GROUP BY d.id, d.name, fr.id, fr.name, fr.town, d.category, d.tags, fr.cuisine,
           d.price, d.photo_url, fr.distance, fr.lat, fr.lng,
           fr.address, fr.phone, fr.website_url, fr.toast_slug, fr.order_url,
           vs.total_child_votes, vs.child_count,
           bv.best_name, bv.best_rating,
           d.value_score, d.value_percentile,
           rvc.recent_votes,
           bp.photo_url,
           d.description, d.dietary_tags
  ORDER BY search_score DESC NULLS LAST, total_votes DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. get_restaurants_within_radius — radius clamp
-- ============================================================

CREATE OR REPLACE FUNCTION get_restaurants_within_radius(
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_radius_miles INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat DECIMAL,
  lng DECIMAL,
  is_open BOOLEAN,
  cuisine TEXT,
  town TEXT,
  google_place_id TEXT,
  website_url TEXT,
  phone TEXT,
  distance_miles DECIMAL,
  dish_count BIGINT,
  avg_rating DECIMAL,
  total_votes BIGINT
) AS $$
DECLARE
  v_radius INT := LEAST(GREATEST(COALESCE(p_radius_miles, 50), 1), 500);
  lat_delta DECIMAL := v_radius / 69.0;
  lng_delta DECIMAL := v_radius / (69.0 * COS(RADIANS(p_lat)));
BEGIN
  RETURN QUERY
  WITH nearby AS (
    SELECT r.id, r.name, r.address, r.lat, r.lng, r.is_open, r.cuisine, r.town,
           r.google_place_id, r.website_url, r.phone,
           ROUND((
             3959 * ACOS(
               LEAST(1.0, GREATEST(-1.0,
                 COS(RADIANS(p_lat)) * COS(RADIANS(r.lat)) *
                 COS(RADIANS(r.lng) - RADIANS(p_lng)) +
                 SIN(RADIANS(p_lat)) * SIN(RADIANS(r.lat))
               ))
             )
           )::NUMERIC, 2) AS distance_miles
    FROM restaurants r
    WHERE r.lat BETWEEN (p_lat - lat_delta) AND (p_lat + lat_delta)
      AND r.lng BETWEEN (p_lng - lng_delta) AND (p_lng + lng_delta)
  )
  SELECT
    n.id, n.name, n.address, n.lat, n.lng, n.is_open, n.cuisine, n.town,
    n.google_place_id, n.website_url, n.phone,
    n.distance_miles,
    COUNT(d.id)::BIGINT AS dish_count,
    ROUND(AVG(d.avg_rating) FILTER (WHERE d.avg_rating IS NOT NULL AND d.total_votes > 0)::NUMERIC, 1) AS avg_rating,
    COALESCE(SUM(d.total_votes), 0)::BIGINT AS total_votes
  FROM nearby n
  LEFT JOIN dishes d ON d.restaurant_id = n.id AND d.parent_dish_id IS NULL
  WHERE n.distance_miles <= v_radius
  GROUP BY n.id, n.name, n.address, n.lat, n.lng, n.is_open, n.cuisine, n.town,
           n.google_place_id, n.website_url, n.phone, n.distance_miles
  ORDER BY n.distance_miles ASC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

COMMIT;

-- ROLLBACK:
-- BEGIN;
--   ALTER TABLE votes DROP CONSTRAINT IF EXISTS rating_10_in_range;
--   -- Restore submit_vote_atomic, get_ranked_dishes, get_restaurants_within_radius
--   -- to their pre-migration bodies from git history (schema.sql before this PR).
-- COMMIT;
