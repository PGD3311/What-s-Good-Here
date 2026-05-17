-- search_user_follows: paginated alphabetical search of a user's
-- followers or following list. Mirrors the hardening pattern in
-- search_users_with_followers (input validation, limit clamp, security
-- definer + locked search_path).
--
-- Returns (display_name, id) tuple-ordered rows for stable cursor pagination.

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
  -- Cursor is "active" only when both halves are present. A half-set cursor
  -- would make the tuple comparison (display_name, id) > (cursor_name, NULL)
  -- evaluate to NULL — filtering every row out (empty-page bug). Treat any
  -- partial cursor as "no cursor" so callers degrade gracefully.
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
      SELECT p.id, p.display_name, p.avatar_url, p.follower_count,
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
      SELECT p.id, p.display_name, p.avatar_url, p.follower_count,
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
-- DROP FUNCTION IF EXISTS search_user_follows(UUID, TEXT, TEXT, TEXT, UUID, INT);
