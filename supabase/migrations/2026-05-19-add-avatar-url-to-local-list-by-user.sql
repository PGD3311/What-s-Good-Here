-- 2026-05-19: Add avatar_url to get_local_list_by_user RPC return shape.
-- Spec: enables the curator detail page (LocalsCurator.jsx) to render a
-- profile photo above the curator's name so people can actually see who
-- the local is.
--
-- IMPORTANT: This RPC has TWO definitions in schema.sql — the second
-- (around line 5550) is the LIVE version because it adds the H3 viewer-
-- blocked-curator WHERE clause. This migration replaces the live one,
-- preserving the `is_blocked_pair` check.
--
-- RETURNS TABLE shape changes require DROP FUNCTION first — CREATE OR
-- REPLACE alone rejects return-type changes. Wrap in BEGIN/COMMIT so RPC
-- callers block-and-wait instead of seeing "function does not exist"
-- during the DROP→CREATE window.
--
-- No SQL rollback needed (drop the column from RETURNS TABLE if absolutely
-- needed). Readding it manually would just mean restoring the prior body
-- without `p.avatar_url`.

BEGIN;

DROP FUNCTION IF EXISTS get_local_list_by_user(UUID);

CREATE OR REPLACE FUNCTION get_local_list_by_user(target_user_id UUID)
RETURNS TABLE (
  list_id UUID, title TEXT, description TEXT, user_id UUID,
  display_name TEXT, avatar_url TEXT, "position" INT, dish_id UUID, dish_name TEXT,
  restaurant_name TEXT, restaurant_id UUID, avg_rating NUMERIC,
  total_votes BIGINT, category TEXT, note TEXT,
  restaurant_lat FLOAT, restaurant_lng FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT ll.id, ll.title, ll.description, ll.user_id, p.display_name, p.avatar_url,
    li."position", d.id, d.name, r.name, r.id, d.avg_rating, d.total_votes,
    d.category, li.note, r.lat, r.lng
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  JOIN local_list_items li ON li.list_id = ll.id
  JOIN dishes d ON d.id = li.dish_id
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = target_user_id
    AND ll.is_active = true
    AND ((select auth.uid()) IS NULL
         OR NOT is_blocked_pair((select auth.uid()), target_user_id))
  ORDER BY li."position";
$$;

GRANT EXECUTE ON FUNCTION get_local_list_by_user(UUID) TO anon, authenticated;

COMMIT;
