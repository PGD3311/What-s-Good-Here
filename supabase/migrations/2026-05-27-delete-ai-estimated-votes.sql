-- Delete all AI-estimated votes pre-launch
-- 2026-05-27
-- Context: Dan decided to nuke seeded ai_estimated votes so the launch app shows real user signal only.
-- MIN_VOTES_FOR_RANKING also drops from 5 → 1 in src/constants/app.js so dishes with even 1 user vote
-- still appear ranked in the top 10. Raise back to 5/10 as traffic grows.

-- PREVIEW: what will be deleted
SELECT
  COUNT(*) FILTER (WHERE source = 'ai_estimated') AS ai_votes_to_delete,
  COUNT(*) FILTER (WHERE source = 'user')          AS user_votes_kept,
  COUNT(DISTINCT dish_id) FILTER (WHERE source = 'ai_estimated') AS dishes_affected
FROM votes;

-- DELETE: triggers update_dish_avg_rating per row → dishes.avg_rating + total_votes + weighted_vote_count
-- automatically recompute. No FKs reference votes.id, no cascade risk.
DELETE FROM votes WHERE source = 'ai_estimated';

-- VERIFY: should show 0 ai_estimated, real user vote count unchanged
SELECT
  source,
  COUNT(*) AS vote_count,
  COUNT(DISTINCT dish_id) AS dishes
FROM votes
GROUP BY source
ORDER BY source;

-- SANITY: how many dishes still have ≥1 vote (these are the only ones that'll rank now)
SELECT COUNT(*) AS dishes_with_votes
FROM dishes
WHERE total_votes > 0;

-- ROLLBACK: no SQL rollback possible — deleted ai_estimated votes are gone.
-- Recovery requires re-running the original seed scripts:
--   supabase/seed/seed-google-reviews.sql
--   supabase/seed/seed-curated-reviews.sql
--   supabase/seed/seed-broader-mv.sql
-- Those scripts are idempotent enough to re-seed cleanly if needed.
