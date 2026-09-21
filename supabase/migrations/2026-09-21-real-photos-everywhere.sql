-- 2026-09-21 — Real photos everywhere (home list + restaurant page)
--
-- 1. get_restaurant_dishes returns featured_photo_url (best user photo per
--    dish) so the restaurant page can show the same frame as the homepage.
--    Return type changes → DROP + CREATE (CREATE OR REPLACE can't add columns).
-- 2. get_ranked_dishes' best_photos CTE includes the 'hidden' (low-quality)
--    tier as a last resort. Tier ranks the gallery; it doesn't erase the only
--    real photo a dish has. Done by rewriting the LIVE definition via
--    pg_get_functiondef so we never clobber drift between repo and prod.
-- 3. Null out the 11 Unsplash stock URLs left in dishes.photo_url by old seed
--    data. Rule: no stock photos, ever. Nothing reads this column for display
--    after this change, but the data shouldn't exist.
--
-- Verify first (optional): SELECT pg_get_functiondef('public.get_restaurant_dishes(uuid)'::regprocedure);
-- and diff against the body below before running.

BEGIN;

-- ---------- 1. get_restaurant_dishes + featured_photo_url ----------
DROP FUNCTION IF EXISTS get_restaurant_dishes(UUID);

CREATE OR REPLACE FUNCTION get_restaurant_dishes(
  p_restaurant_id UUID
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  category TEXT,
  menu_section TEXT,
  menu_group TEXT,
  price DECIMAL,
  photo_url TEXT,
  featured_photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_id UUID,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  tags TEXT[],
  description TEXT,
  dietary_tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH variant_stats AS (
    SELECT
      d.parent_dish_id,
      COUNT(DISTINCT d.id)::INT AS child_count,
      SUM(COALESCE(ds.vote_count, 0))::NUMERIC AS total_child_votes,
      CASE
        WHEN SUM(COALESCE(ds.vote_count, 0)) > 0
        THEN ROUND((SUM(COALESCE(ds.rating_sum, 0)) / NULLIF(SUM(COALESCE(ds.vote_count, 0)), 0))::NUMERIC, 1)
        ELSE NULL
      END AS combined_avg_rating
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS vote_count,
        SUM(COALESCE(v.rating_10, 0) * (CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::DECIMAL AS rating_sum
      FROM votes v GROUP BY v.dish_id
    ) ds ON ds.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id
  ),
  best_variants AS (
    SELECT DISTINCT ON (d.parent_dish_id)
      d.parent_dish_id, d.id AS best_id, d.name AS best_name,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS best_rating
    FROM dishes d
    LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id, d.id, d.name
    HAVING COUNT(v.id) >= 1
    ORDER BY d.parent_dish_id, AVG(v.rating_10) DESC NULLS LAST, COUNT(v.id) DESC
  ),
  dish_vote_stats AS (
    SELECT d.id AS dish_id, COUNT(v.id)::BIGINT AS direct_votes,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS direct_avg
    FROM dishes d LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NULL
    GROUP BY d.id
  )
  SELECT
    d.id AS dish_id, d.name AS dish_name, r.id AS restaurant_id, r.name AS restaurant_name,
    d.category, d.menu_section, d.menu_group, d.price, d.photo_url,
    bp.photo_url AS featured_photo_url,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0)::BIGINT AS total_votes,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) AS avg_rating,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_id AS best_variant_id, bv.best_name AS best_variant_name, bv.best_rating AS best_variant_rating,
    d.tags,
    d.description,
    d.dietary_tags
  FROM dishes d
  INNER JOIN restaurants r ON d.restaurant_id = r.id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN dish_vote_stats dvs ON dvs.dish_id = d.id
  -- Best real (user-uploaded) photo per dish, same policy as get_ranked_dishes'
  -- best_photos: restaurant-sourced first, then featured > community > hidden,
  -- then quality, then newest. Moderation-rejected never. Blocked authors never.
  LEFT JOIN LATERAL (
    SELECT dp.photo_url
    FROM dish_photos dp
    WHERE dp.dish_id = d.id
      AND dp.status IN ('featured', 'community', 'hidden')
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = (select auth.uid()) AND ub.blocked_id = dp.user_id)
           OR (ub.blocker_id = dp.user_id AND ub.blocked_id = (select auth.uid()))
      )
    ORDER BY
      CASE dp.source_type WHEN 'restaurant' THEN 0 ELSE 1 END,
      CASE dp.status WHEN 'featured' THEN 0 WHEN 'community' THEN 1 ELSE 2 END,
      dp.quality_score DESC NULLS LAST,
      dp.created_at DESC
    LIMIT 1
  ) bp ON true
  WHERE d.restaurant_id = p_restaurant_id
    AND r.is_open = true
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, r.id, r.name, d.category, d.menu_section, d.menu_group, d.price, d.photo_url, bp.photo_url, d.tags,
           vs.total_child_votes, vs.combined_avg_rating, vs.child_count,
           dvs.direct_votes, dvs.direct_avg,
           bv.best_id, bv.best_name, bv.best_rating,
           d.description, d.dietary_tags
  ORDER BY
    CASE WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) >= 5 THEN 0 ELSE 1 END,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) DESC NULLS LAST,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_restaurant_dishes(UUID) TO anon, authenticated;

-- ---------- 2. get_ranked_dishes best_photos: include 'hidden' ----------
DO $do$
DECLARE src TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_ranked_dishes(numeric,numeric,integer,text,text,text[])'::regprocedure) INTO src;
  IF position('dp.status IN (''featured'', ''community'')' IN src) = 0 THEN
    RAISE EXCEPTION 'get_ranked_dishes: best_photos WHERE clause not found — body drifted, inspect before patching';
  END IF;
  IF position('CASE dp.status WHEN ''featured'' THEN 0 ELSE 1 END' IN src) = 0 THEN
    RAISE EXCEPTION 'get_ranked_dishes: best_photos ORDER BY tier CASE not found — body drifted, inspect before patching';
  END IF;
  src := replace(src, 'dp.status IN (''featured'', ''community'')', 'dp.status IN (''featured'', ''community'', ''hidden'')');
  src := replace(src, 'CASE dp.status WHEN ''featured'' THEN 0 ELSE 1 END', 'CASE dp.status WHEN ''featured'' THEN 0 WHEN ''community'' THEN 1 ELSE 2 END');
  EXECUTE src;
END
$do$;

-- ---------- 3. purge stock seed photos ----------
UPDATE dishes SET photo_url = NULL WHERE photo_url LIKE 'https://images.unsplash.com/%';

COMMIT;

-- Smoke:
-- SELECT dish_name, featured_photo_url FROM get_restaurant_dishes('<aalias-restaurant-id>') WHERE featured_photo_url IS NOT NULL;
-- SELECT dish_name FROM get_ranked_dishes(41.4545, -70.5623, 10) WHERE featured_photo_url IS NOT NULL;  -- Dirty Banana should now appear
-- SELECT count(*) FROM dishes WHERE photo_url LIKE '%unsplash%';  -- 0

-- ROLLBACK:
-- (1) DROP FUNCTION get_restaurant_dishes(UUID); then re-run the previous definition from schema.sql @ main before this commit
--     (identical minus the featured_photo_url column + LATERAL join).
-- (2) DO $do$ DECLARE src TEXT; BEGIN
--       SELECT pg_get_functiondef('public.get_ranked_dishes(numeric,numeric,integer,text,text,text[])'::regprocedure) INTO src;
--       src := replace(src, 'dp.status IN (''featured'', ''community'', ''hidden'')', 'dp.status IN (''featured'', ''community'')');
--       src := replace(src, 'CASE dp.status WHEN ''featured'' THEN 0 WHEN ''community'' THEN 1 ELSE 2 END', 'CASE dp.status WHEN ''featured'' THEN 0 ELSE 1 END');
--       EXECUTE src; END $do$;
-- (3) No SQL rollback for the photo_url purge — they were Unsplash stock URLs and must not come back.
