-- pg_trgm trigram index on profiles.display_name to accelerate the substring
-- ILIKE search inside search_user_follows (PR #209). At current profile
-- counts the post-JOIN Seq Scan is fast, but ILIKE '%foo%' has no good
-- alternative once a single user accumulates ~5K+ follows. Shipping the
-- index pre-emptively is cheap (one GIN entry per profile) and lets the
-- planner pick it up automatically as the data grows.
--
-- gin_trgm_ops supports ILIKE / LIKE substring matching natively.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON profiles
  USING gin (display_name gin_trgm_ops);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_profiles_display_name_trgm;
-- -- pg_trgm extension can stay; other migrations may depend on it later.
