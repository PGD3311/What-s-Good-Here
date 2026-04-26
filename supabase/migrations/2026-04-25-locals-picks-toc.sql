-- Locals' Picks: TOC route data layer (additive only)
-- Adds: get_local_picks_consensus, get_local_picks_curators,
--       search_local_picks, get_local_picks_index
-- DOES NOT remove get_locals_aggregate — that ships in
-- 2026-04-25-locals-picks-toc-cleanup.sql AFTER the homepage cuts over.

-- ============================================================
-- 1. Consensus — dishes >=2 active locals picked
-- ============================================================
DROP FUNCTION IF EXISTS get_local_picks_consensus();
CREATE OR REPLACE FUNCTION get_local_picks_consensus()
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  pick_count INT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id          AS dish_id,
    d.name        AS dish_name,
    r.id          AS restaurant_id,
    r.name        AS restaurant_name,
    d.avg_rating,
    COUNT(DISTINCT ll.user_id)::INT AS pick_count
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
  GROUP BY d.id, d.name, r.id, r.name, d.avg_rating
  HAVING COUNT(DISTINCT ll.user_id) >= 2
  ORDER BY pick_count DESC, d.avg_rating DESC NULLS LAST, d.name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_consensus() TO anon, authenticated;

-- ============================================================
-- 2. Curators — every active curator + their #1 pick + follower count + item count
-- ============================================================
DROP FUNCTION IF EXISTS get_local_picks_curators();
CREATE OR REPLACE FUNCTION get_local_picks_curators()
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  curator_tagline TEXT,
  follower_count INT,
  item_count INT,
  top_dish_id UUID,
  top_dish_name TEXT,
  top_restaurant_id UUID,
  top_restaurant_name TEXT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.user_id,
    p.display_name,
    p.avatar_url,
    ll.curator_tagline,
    COALESCE((SELECT COUNT(*)::INT FROM follows f WHERE f.followed_id = ll.user_id), 0) AS follower_count,
    (SELECT COUNT(*)::INT FROM local_list_items li2 WHERE li2.list_id = ll.id) AS item_count,
    top.dish_id          AS top_dish_id,
    top.dish_name        AS top_dish_name,
    top.restaurant_id    AS top_restaurant_id,
    top.restaurant_name  AS top_restaurant_name
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  LEFT JOIN LATERAL (
    SELECT
      d.id   AS dish_id,
      d.name AS dish_name,
      r.id   AS restaurant_id,
      r.name AS restaurant_name
    FROM local_list_items li
    JOIN dishes d      ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    WHERE li.list_id = ll.id AND li.position = 1
    LIMIT 1
  ) top ON TRUE
  WHERE ll.is_active = true
  ORDER BY follower_count DESC, p.display_name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_curators() TO anon, authenticated;

-- ============================================================
-- 3. Search — ILIKE across dish/restaurant/curator/note, prefix-match boost
-- ============================================================
DROP FUNCTION IF EXISTS search_local_picks(TEXT);
CREATE OR REPLACE FUNCTION search_local_picks(p_query TEXT)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  curator_user_id UUID,
  curator_display_name TEXT,
  "position" INT,
  note TEXT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id           AS dish_id,
    d.name         AS dish_name,
    r.id           AS restaurant_id,
    r.name         AS restaurant_name,
    d.avg_rating,
    ll.user_id     AS curator_user_id,
    p.display_name AS curator_display_name,
    li."position",
    li.note
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN profiles p     ON p.id = ll.user_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
    AND p_query IS NOT NULL
    AND length(trim(p_query)) > 0
    AND (
      d.name         ILIKE '%' || p_query || '%'
      OR r.name      ILIKE '%' || p_query || '%'
      OR p.display_name ILIKE '%' || p_query || '%'
      OR li.note     ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE WHEN d.name ILIKE p_query || '%' THEN 0 ELSE 1 END,
    d.name ASC,
    p.display_name ASC
  LIMIT 100;
$$;
GRANT EXECUTE ON FUNCTION search_local_picks(TEXT) TO anon, authenticated;

-- ============================================================
-- 4. Index — A-Z by dish, with curator-names array
-- ============================================================
DROP FUNCTION IF EXISTS get_local_picks_index();
CREATE OR REPLACE FUNCTION get_local_picks_index()
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  avg_rating NUMERIC,
  pick_count INT,
  curator_names TEXT[]
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    d.id          AS dish_id,
    d.name        AS dish_name,
    r.id          AS restaurant_id,
    r.name        AS restaurant_name,
    d.avg_rating,
    COUNT(DISTINCT ll.user_id)::INT AS pick_count,
    ARRAY_AGG(DISTINCT p.display_name ORDER BY p.display_name) AS curator_names
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  JOIN profiles p     ON p.id = ll.user_id
  JOIN dishes d       ON d.id = li.dish_id
  JOIN restaurants r  ON r.id = d.restaurant_id
  WHERE ll.is_active = true
  GROUP BY d.id, d.name, r.id, r.name, d.avg_rating
  ORDER BY d.name ASC;
$$;
GRANT EXECUTE ON FUNCTION get_local_picks_index() TO anon, authenticated;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_local_picks_consensus();
-- DROP FUNCTION IF EXISTS get_local_picks_curators();
-- DROP FUNCTION IF EXISTS search_local_picks(TEXT);
-- DROP FUNCTION IF EXISTS get_local_picks_index();
