-- =============================================================
-- Manager DELETE policy follow-up (2026-04-16)
-- =============================================================
-- Refinement of 2026-04-16-manager-auth-hardening.sql.
--
-- Principle:
--   "A manager can fix and remove dishes up until the crowd has an opinion.
--    Once a dish has any user votes, it belongs to the crowd."
--
-- Why:
--   Scraper mistakes and ghost dishes (items never actually served) need a
--   cleanup path for managers — otherwise /manage feels broken. But once a
--   dish has even one user vote, the rating record belongs to the public.
--   Letting managers delete voted dishes turns WGH into Yelp: a curated
--   highlight reel where businesses hide embarrassing reviews.
--
-- Admin override still exists for edge cases (legal takedowns, true
-- duplicates, etc). Managers file a request; admins act.
-- =============================================================

DROP POLICY IF EXISTS "Admin or manager delete dishes" ON dishes;
CREATE POLICY "Admin or manager delete dishes" ON dishes FOR DELETE
  USING (
    is_admin()
    OR (is_restaurant_manager(restaurant_id) AND total_votes = 0)
  );

-- =============================================================
-- Verification:
--
--   -- Confirm policy shape:
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy
--   WHERE polrelid = 'dishes'::regclass
--     AND polcmd = 'd';
--
--   -- Smoke test as a manager JWT:
--   -- (dish with total_votes = 0) DELETE succeeds.
--   -- (dish with total_votes > 0) DELETE returns 0 rows affected (RLS blocks).
-- =============================================================
