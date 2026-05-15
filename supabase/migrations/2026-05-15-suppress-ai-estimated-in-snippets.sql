-- P0-3: stop AI-estimated reviews from leaking into user-visible review surfaces.
-- The display-layer filter lives in src/api/votesApi.js (getReviewsForDish,
-- getSmartSnippetForDish, getReviewsForRestaurant). This migration is the
-- belt-and-suspenders patch for the server-side RPC `get_smart_snippet`, which
-- is currently not called from src/ but remains exposed to other consumers
-- (Edge Functions, future callers).
--
-- AI votes (source='ai_estimated') continue to contribute to ranking via the
-- existing 0.5x weighting inside get_ranked_dishes and related aggregations.
-- They just stop surfacing as fake "@WGH Community" review text.
--
-- Run this in the Supabase SQL Editor (Denis's project: vpioftosgdkyiwvhxewy)
-- after the PR merges. Idempotent — CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION get_smart_snippet(p_dish_id UUID)
RETURNS TABLE (
  review_text TEXT, rating_10 DECIMAL, display_name TEXT,
  user_id UUID, review_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE v_viewer_id UUID := (select auth.uid());
BEGIN
  RETURN QUERY
  SELECT v.review_text, v.rating_10, p.display_name, v.user_id, v.review_created_at
  FROM votes v
  INNER JOIN profiles p ON v.user_id = p.id
  WHERE v.dish_id = p_dish_id
    AND v.review_text IS NOT NULL AND v.review_text != ''
    AND v.source != 'ai_estimated'
    AND (v_viewer_id IS NULL OR NOT is_blocked_pair(v_viewer_id, v.user_id))
  ORDER BY
    CASE WHEN v.rating_10 >= 9 THEN 0 ELSE 1 END,
    v.rating_10 DESC NULLS LAST,
    v.review_created_at DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verify: should return rows only when the dish has at least one human-source
-- review with non-empty text. AI-only dishes return zero rows.
-- SELECT * FROM get_smart_snippet('<dish-uuid>');

-- ROLLBACK:
-- Restore the previous function body by removing the
-- `AND v.source != 'ai_estimated'` clause. Equivalent body is in
-- supabase/migrations/20260415_h3_ugc_reporting_blocking.sql §get_smart_snippet.
