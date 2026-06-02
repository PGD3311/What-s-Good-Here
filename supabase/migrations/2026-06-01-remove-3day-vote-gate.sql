-- 2026-06-01 — Remove the undocumented 3-day account-age gate from vote counting.
--
-- ROOT CAUSE: the LIVE update_dish_avg_rating() trigger function counted a user's
-- vote toward dishes.total_votes / avg_rating / weighted_vote_count ONLY if that
-- user's account was >= 3 days old. This gate:
--   1. was applied directly to prod and never committed (not in schema.sql or any
--      migration) — silent source-of-truth drift;
--   2. is inconsistent with get_ranked_dishes (the ranked list counts ALL votes),
--      so the list and the dish-detail page disagreed (list 5 / detail 1);
--   3. is architecturally stale: the gate is time-based but only recomputed on a
--      vote write, so a vote from a <3-day account is never re-counted when the
--      account ages — it stays excluded indefinitely;
--   4. hides the majority of real votes on a launching app (most accounts are new)
--      and drops new-user-only dishes out of rankings (get_ranked_dishes filters on
--      dishes.total_votes > 0).
--
-- FIX: count every rating-bearing vote (with the existing 0.5x ai_estimated source
-- weighting), making total_votes a single, real, time-INDEPENDENT number that is
-- correct by construction and consistent with get_ranked_dishes. Anti-sybil, if
-- still wanted, belongs as a ranking-time weight — not by hiding the vote count.
--
-- This restores the function to the (ungated) definition already in schema.sql, so
-- no schema.sql change is required. Then backfills every dish to clear the drift.

-- 1. Replace the function body (trigger already points at it by name — no trigger
--    drop/recreate needed).
CREATE OR REPLACE FUNCTION update_dish_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dishes
  SET avg_rating = sub.avg_r,
      total_votes = sub.raw_count,
      weighted_vote_count = sub.weighted_count
  FROM (
    SELECT
      ROUND(
        (SUM(v.rating_10 * CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
         NULLIF(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)
        )::NUMERIC, 1
      ) AS avg_r,
      COUNT(*)::INT AS raw_count,
      COALESCE(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)::NUMERIC AS weighted_count
    FROM votes v
    WHERE v.dish_id = COALESCE(NEW.dish_id, OLD.dish_id)
      AND v.rating_10 IS NOT NULL
  ) sub
  WHERE dishes.id = COALESCE(NEW.dish_id, OLD.dish_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. One-time backfill: recompute every dish from the real votes using the exact
--    same formula as the trigger. LEFT JOIN + COALESCE so dishes with zero
--    rating-bearing votes correctly reset to total_votes=0, avg_rating=NULL,
--    weighted_vote_count=0. Idempotent — safe to re-run.
UPDATE dishes d
SET total_votes        = COALESCE(s.raw_count, 0),
    avg_rating         = s.avg_r,
    weighted_vote_count = COALESCE(s.weighted_count, 0)
FROM (
  SELECT dd.id,
    ROUND(
      (SUM(v.rating_10 * CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
       NULLIF(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)
      )::NUMERIC, 1) AS avg_r,
    COUNT(v.id)::INT AS raw_count,
    SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS weighted_count
  FROM dishes dd
  LEFT JOIN votes v ON v.dish_id = dd.id AND v.rating_10 IS NOT NULL
  GROUP BY dd.id
) s
WHERE d.id = s.id;

-- ROLLBACK (restores the prior gated behavior — note this re-introduces the bug):
-- CREATE OR REPLACE FUNCTION update_dish_avg_rating()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   UPDATE dishes
--   SET avg_rating = sub.avg_r, total_votes = sub.raw_count, weighted_vote_count = sub.weighted_count
--   FROM (
--     SELECT
--       ROUND((SUM(v.rating_10 * CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
--              NULLIF(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0))::NUMERIC, 1) AS avg_r,
--       COUNT(*)::INT AS raw_count,
--       COALESCE(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)::NUMERIC AS weighted_count
--     FROM votes v
--     WHERE v.dish_id = COALESCE(NEW.dish_id, OLD.dish_id)
--       AND v.rating_10 IS NOT NULL
--       AND (v.source = 'ai_estimated' OR EXISTS (
--         SELECT 1 FROM auth.users u WHERE u.id = v.user_id AND u.created_at <= NOW() - INTERVAL '3 days'))
--   ) sub
--   WHERE dishes.id = COALESCE(NEW.dish_id, OLD.dish_id);
--   RETURN COALESCE(NEW, OLD);
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- NOTE: replacing the function above only restores GATED behavior for FUTURE
-- writes. Existing dish aggregates stay at their (correct, ungated) values until
-- each dish is next touched — which is the desired end state, since the gate is
-- the bug. For a literal full restore of the prior gated numbers, also re-run a
-- gated backfill:
-- UPDATE dishes d
-- SET total_votes = COALESCE(s.raw_count, 0), avg_rating = s.avg_r, weighted_vote_count = COALESCE(s.weighted_count, 0)
-- FROM (
--   SELECT dd.id,
--     ROUND((SUM(v.rating_10 * CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
--            NULLIF(SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0))::NUMERIC, 1) AS avg_r,
--     COUNT(v.id)::INT AS raw_count,
--     SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS weighted_count
--   FROM dishes dd
--   LEFT JOIN votes v ON v.dish_id = dd.id AND v.rating_10 IS NOT NULL
--     AND (v.source = 'ai_estimated' OR EXISTS (
--       SELECT 1 FROM auth.users u WHERE u.id = v.user_id AND u.created_at <= NOW() - INTERVAL '3 days'))
--   GROUP BY dd.id
-- ) s WHERE d.id = s.id;
-- The forward backfill itself recomputes from source-of-truth votes, so recovery
-- from a bad forward run is simply re-running the (ungated) backfill UPDATE above.
