-- search_users_with_followers: server-side ranked user search.
--
-- Replaces the client-side approach in followsApi.searchUsers which:
--   1. Pulled the first 20 substring matches from profiles (in whatever
--      order Postgres returned them — effectively arbitrary).
--   2. Fetched follower counts for those 20 in a second query.
--   3. Sorted by follower count in JS.
--
-- The bug: step (1) limited BEFORE we knew follower counts, so a high-
-- follower user could be invisible if 20+ low-follower users alphabetically
-- preceded them on the substring match.
--
-- This RPC computes follower counts inline via a left join on a counts
-- subquery, orders by follower_count DESC then display_name ASC, and
-- applies the LIMIT only at the very end. Results are now actually the top-
-- N matches by follower count.
--
-- Caller-side sanitization (sanitizeSearchQuery, ILIKE-safe) is still
-- applied in followsApi before invoking this — same defense-in-depth as
-- before.

CREATE OR REPLACE FUNCTION search_users_with_followers(
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  follower_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Guard: require auth. Anonymous user search isn't a feature we offer.
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Guard: require a non-trivial query so we don't return the entire user
  -- table when called with empty / 1-char input.
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN;
  END IF;

  -- Guard: clamp the limit. 100 is plenty for any UI surface; preventing
  -- accidental "show me everyone" calls.
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 20;
  ELSIF p_limit > 100 THEN
    p_limit := 100;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    COALESCE(c.follower_count, 0)::BIGINT AS follower_count
  FROM profiles p
  LEFT JOIN (
    SELECT followed_id, COUNT(*) AS follower_count
    FROM follows
    GROUP BY followed_id
  ) c ON c.followed_id = p.id
  WHERE p.display_name ILIKE '%' || trim(p_query) || '%'
  ORDER BY follower_count DESC, p.display_name ASC
  LIMIT p_limit;
END;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS search_users_with_followers(TEXT, INT);
