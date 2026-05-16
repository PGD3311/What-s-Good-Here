-- Extend get_friends_votes_for_dish and get_friends_votes_for_restaurant
-- to include avatar_url, so the dish-detail and restaurant-detail friend
-- chips can render profile pictures instead of initial-only circles.
--
-- Pure additive change to the RETURNS TABLE shape — existing consumers that
-- ignore the new column keep working.
--
-- See supabase/schema.sql for the prior shape and SECURITY DEFINER /
-- access-control logic — both preserved verbatim here.

CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_url TEXT, rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ, category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id AND v.dish_id = p_dish_id
  JOIN dishes d ON d.id = p_dish_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY v.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_friends_votes_for_restaurant(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_url TEXT, dish_id UUID, dish_name TEXT,
  rating_10 DECIMAL(3, 1), voted_at TIMESTAMPTZ, category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, d.id, d.name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY d.name, v.created_at DESC;
END;
$$;

-- No SQL rollback needed — CREATE OR REPLACE FUNCTION is idempotent and the
-- prior signature is preserved in supabase/schema.sql (lines ~5140 and ~5175).
-- To revert: re-run the version from schema.sql.
