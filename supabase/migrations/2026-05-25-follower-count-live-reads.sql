-- Switch follower-list reads from the denormalized profiles.follower_count
-- column to live COUNT(*) against the follows table.
--
-- The denormalized column has drifted multiple times (see
-- 20260516_fix_follower_count_trigger.sql for the prior incident). The trigger
-- architecture is load-bearing on protect_profile_fields honoring the
-- 'app.allow_follow_count_update' bypass, but several sync migrations and the
-- curator-flag-trigger-bypass migration redefine the trigger functions
-- WITHOUT that bypass — re-running any of them silently downgrades the fix.
-- This migration eliminates the read-side dependency so UX never sees drift.
--
-- The column itself stays for one release as a soak period; a follow-up
-- migration drops it once we're confident no other readers remain.

-- 1. get_follower_counts: batch live follower-count lookup for a set of
--    user IDs. Used by _paginateFollows after fetching the recency-ordered
--    follow rows. Returns one row per user_id present in the follows table;
--    callers must default missing IDs to 0.
CREATE OR REPLACE FUNCTION get_follower_counts(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  follower_count INT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.followed_id AS user_id, COUNT(*)::INT AS follower_count
  FROM follows f
  WHERE f.followed_id = ANY(p_user_ids)
  GROUP BY f.followed_id;
$$;

GRANT EXECUTE ON FUNCTION get_follower_counts(UUID[]) TO anon, authenticated;

-- 2. search_user_follows: same shape as before, but follower_count is now
--    a live subquery against follows instead of p.follower_count.
CREATE OR REPLACE FUNCTION search_user_follows(
  p_user_id UUID,
  p_direction TEXT,
  p_query TEXT,
  p_cursor_name TEXT DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  follower_count INT,
  followed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_query TEXT := NULLIF(TRIM(COALESCE(p_query, '')), '');
  v_use_cursor BOOLEAN := (p_cursor_name IS NOT NULL AND p_cursor_id IS NOT NULL);
BEGIN
  IF p_direction NOT IN ('followers', 'following') THEN
    RAISE EXCEPTION 'Invalid direction: %, must be followers or following', p_direction
      USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_direction = 'followers' THEN
    RETURN QUERY
      SELECT p.id, p.display_name, p.avatar_url,
             (SELECT COUNT(*)::INT FROM follows ff WHERE ff.followed_id = p.id) AS follower_count,
             f.created_at AS followed_at
      FROM follows f
      JOIN profiles p ON p.id = f.follower_id
      WHERE f.followed_id = p_user_id
        AND (v_query IS NULL OR p.display_name ILIKE '%' || v_query || '%')
        AND (NOT v_use_cursor
             OR (p.display_name, p.id) > (p_cursor_name, p_cursor_id))
      ORDER BY p.display_name ASC, p.id ASC
      LIMIT v_limit;
  ELSE
    RETURN QUERY
      SELECT p.id, p.display_name, p.avatar_url,
             (SELECT COUNT(*)::INT FROM follows ff WHERE ff.followed_id = p.id) AS follower_count,
             f.created_at AS followed_at
      FROM follows f
      JOIN profiles p ON p.id = f.followed_id
      WHERE f.follower_id = p_user_id
        AND (v_query IS NULL OR p.display_name ILIKE '%' || v_query || '%')
        AND (NOT v_use_cursor
             OR (p.display_name, p.id) > (p_cursor_name, p_cursor_id))
      ORDER BY p.display_name ASC, p.id ASC
      LIMIT v_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION search_user_follows(UUID, TEXT, TEXT, TEXT, UUID, INT) TO anon, authenticated;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_follower_counts(UUID[]);
-- And restore search_user_follows from migrations/20260516_search_user_follows.sql.
