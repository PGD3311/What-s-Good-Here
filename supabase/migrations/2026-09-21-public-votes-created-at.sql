-- 2026-09-21 — public_votes exposes created_at
--
-- Public profiles (/user/:id) built their "food story" grid by reading the
-- votes table directly, but since the 2026-04-10 RLS audit that table only
-- returns the viewer's OWN rows. Result: every public profile has shown
-- "No food story yet" to everyone except its owner. The fix reads through
-- public_votes (already the source for dish-page reviews, respects blocks),
-- which needs the vote timestamp for ordering. Appending a column is a safe
-- CREATE OR REPLACE VIEW (no dependents change shape).

CREATE OR REPLACE VIEW public_votes AS
SELECT
  id, dish_id, rating_10, review_text, review_created_at, user_id, source, created_at
FROM votes
WHERE auth.uid() IS NULL
   OR NOT is_blocked_pair(auth.uid(), user_id);

-- Smoke:
-- SELECT created_at FROM public_votes LIMIT 1;

-- ROLLBACK:
-- CREATE OR REPLACE VIEW public_votes AS
-- SELECT id, dish_id, rating_10, review_text, review_created_at, user_id, source
-- FROM votes WHERE auth.uid() IS NULL OR NOT is_blocked_pair(auth.uid(), user_id);
-- (Postgres refuses to DROP a column via CREATE OR REPLACE VIEW — run
--  DROP VIEW public_votes; then the CREATE above. Nothing depends on the view.)
