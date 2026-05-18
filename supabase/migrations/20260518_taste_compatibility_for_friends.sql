-- Batch version of get_taste_compatibility so the friends-here surfaces can
-- render a "X% match" chip per friend without N+1 round-trips. Same math as
-- the single-pair function (avg ABS difference, normalized to 0..100, needs
-- >=3 shared dishes), but takes an array of friend IDs and returns one row
-- per friend including those with fewer shared dishes (compatibility_pct is
-- NULL for those; UI hides the chip).
--
-- Block filter respected: blocked friends drop out entirely. Caller guard
-- mirrors get_taste_compatibility.
--
-- New shape, so no DROP required (no existing function with this name).

CREATE OR REPLACE FUNCTION get_taste_compatibility_for_friends(
  p_user_id UUID,
  p_friend_ids UUID[]
)
RETURNS TABLE (
  user_id UUID,
  shared_dishes INT,
  compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH pairs AS (
    SELECT
      f.followed_id AS friend_id,
      a.rating_10 AS rating_a,
      b.rating_10 AS rating_b
    FROM follows f
    JOIN votes a ON a.user_id = p_user_id
    JOIN votes b ON b.user_id = f.followed_id AND b.dish_id = a.dish_id
    WHERE f.follower_id = p_user_id
      AND f.followed_id = ANY(p_friend_ids)
      AND NOT is_blocked_pair(p_user_id, f.followed_id)
      AND a.rating_10 IS NOT NULL
      AND b.rating_10 IS NOT NULL
  ),
  agg AS (
    SELECT
      friend_id,
      COUNT(*)::INT AS shared,
      AVG(ABS(rating_a - rating_b))::NUMERIC AS avg_diff
    FROM pairs
    GROUP BY friend_id
  )
  -- Include every requested friend, even those with zero shared rated
  -- dishes, so callers can iterate the input list without re-zipping.
  SELECT
    fid AS user_id,
    COALESCE(agg.shared, 0) AS shared_dishes,
    CASE
      WHEN COALESCE(agg.shared, 0) >= 3
        THEN ROUND(100 - (agg.avg_diff / 9.0 * 100))::INT
      ELSE NULL
    END AS compatibility_pct
  FROM UNNEST(p_friend_ids) AS fid
  LEFT JOIN agg ON agg.friend_id = fid
  WHERE NOT is_blocked_pair(p_user_id, fid);
END;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_taste_compatibility_for_friends(UUID, UUID[]);
