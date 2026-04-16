-- Audit 2026-04-16 — Phase 4 (return-type consistency for total_votes)
-- Source: AUDIT-SUPABASE-2026-04-16.md closing notes
--
-- Context: phase 2 widened dishes.total_votes from INT to BIGINT. Three RPCs
-- still declared `total_votes INT` in their RETURNS TABLE signature. At
-- current scale the implicit BIGINT → INT downcast is safe, but if a dish
-- ever exceeds INT range (2.147B) those RPCs would raise an overflow error.
-- Standardize on BIGINT now while the change is cheap.
--
-- RPCs touched:
--   - get_my_local_list()
--   - get_local_list_by_user(UUID)
--
-- (get_local_list_by_user has two shadowed definitions in schema.sql; the
-- deployed one is the H3 UGC override at schema.sql:4723, replicated below.)
--
-- Changing a RETURNS TABLE column type requires DROP FUNCTION + CREATE, not
-- just CREATE OR REPLACE.

BEGIN;

-- ============================================================================
-- get_my_local_list
-- ============================================================================

DROP FUNCTION IF EXISTS get_my_local_list();

CREATE OR REPLACE FUNCTION get_my_local_list()
RETURNS TABLE (
  list_id UUID,
  title TEXT,
  description TEXT,
  curator_tagline TEXT,
  is_active BOOLEAN,
  "position" INT,
  dish_id UUID,
  dish_name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  avg_rating NUMERIC,
  total_votes BIGINT,
  category TEXT,
  note TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ll.id AS list_id,
    ll.title,
    ll.description,
    ll.curator_tagline,
    ll.is_active,
    li."position",
    d.id AS dish_id,
    d.name AS dish_name,
    r.name AS restaurant_name,
    r.id AS restaurant_id,
    d.avg_rating,
    d.total_votes,
    d.category,
    li.note
  FROM local_lists ll
  LEFT JOIN local_list_items li ON li.list_id = ll.id
  LEFT JOIN dishes d ON d.id = li.dish_id
  LEFT JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = auth.uid()
  ORDER BY li."position";
$$;


-- ============================================================================
-- get_local_list_by_user (H3 UGC override — blocks viewers pair-blocked with curator)
-- ============================================================================

DROP FUNCTION IF EXISTS get_local_list_by_user(UUID);

CREATE OR REPLACE FUNCTION get_local_list_by_user(target_user_id UUID)
RETURNS TABLE (
  list_id UUID, title TEXT, description TEXT, user_id UUID,
  display_name TEXT, "position" INT, dish_id UUID, dish_name TEXT,
  restaurant_name TEXT, restaurant_id UUID, avg_rating NUMERIC,
  total_votes BIGINT, category TEXT, note TEXT,
  restaurant_lat FLOAT, restaurant_lng FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT ll.id, ll.title, ll.description, ll.user_id, p.display_name,
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

COMMIT;


-- ============================================================================
-- Post-deploy verification
-- ============================================================================
--
-- Confirm both RPCs now declare total_votes as bigint:
--
--   SELECT
--     p.proname        AS function_name,
--     pg_get_function_result(p.oid) AS return_shape
--   FROM pg_proc p
--   WHERE p.proname IN ('get_my_local_list', 'get_local_list_by_user')
--     AND pg_function_is_visible(p.oid);
--
-- Both return_shape strings should contain `total_votes bigint`.
