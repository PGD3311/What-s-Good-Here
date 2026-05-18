-- Extend get_friends_votes_for_restaurant to include review_text and photo_url
-- so the new per-friend "what they ordered here" popup can render each visit
-- in full (rating + written review + their uploaded photo) without an extra
-- round-trip.
--
-- review_text comes from votes.review_text (already exists, 200-char cap).
-- photo_url comes from dish_photos via LEFT JOIN on (dish_id, user_id) —
-- dish_photos has UNIQUE(dish_id, user_id), so at most one row per pair.
-- We restrict to status IN ('featured', 'community') so hidden/rejected
-- moderation states don't leak through.
--
-- CREATE OR REPLACE cannot widen the RETURNS TABLE shape, so DROP first
-- (matching 20260516_friends_votes_rpcs_avatar_url.sql's pattern).

DROP FUNCTION IF EXISTS get_friends_votes_for_restaurant(UUID, UUID);

CREATE OR REPLACE FUNCTION get_friends_votes_for_restaurant(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_url TEXT, dish_id UUID, dish_name TEXT,
  rating_10 DECIMAL(3, 1), voted_at TIMESTAMPTZ, category_expertise TEXT,
  review_text TEXT, photo_url TEXT
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
    END,
    v.review_text,
    dp.photo_url
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  LEFT JOIN dish_photos dp ON dp.dish_id = d.id
    AND dp.user_id = f.followed_id
    AND dp.status IN ('featured', 'community')
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY d.name, v.created_at DESC;
END;
$$;

-- ROLLBACK: drop this and re-run the prior signature from
-- supabase/migrations/20260516_friends_votes_rpcs_avatar_url.sql (the
-- 8-column version with avatar_url but no review_text / photo_url).
-- DROP FUNCTION IF EXISTS get_friends_votes_for_restaurant(UUID, UUID);
-- Then paste the get_friends_votes_for_restaurant block from that migration.
