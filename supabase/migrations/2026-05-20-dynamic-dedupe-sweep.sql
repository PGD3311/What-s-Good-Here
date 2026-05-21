-- 2026-05-20 night: corpus-wide dish dedupe sweep (dynamic edition).
--
-- Background:
-- Tonight's v3/v4/v5 re-extraction cycles created ~54 duplicate dishes across
-- ~50 unique groups. Each duplicate group is the SAME dish that got extracted
-- twice with cosmetic name differences (e.g., "Frank's Famous Noodle Show
-- with Fat Moon Mushrooms" vs "Frank's Famous Noodle Show! w/ Fat Moon
-- Mushrooms"). The 2026-05-18 hand-listed dedupe (20260518_mv_dedupe_sweep.sql)
-- pre-dated these new dupes.
--
-- This migration uses the SAME merge pattern (votes/favorites/photos/list/
-- playlist items re-pointed to keeper, then loser deleted) but enumerates
-- duplicate pairs DYNAMICALLY via a window-function CTE instead of a
-- hand-listed VALUES table. Safer when corpus has shifted between when the
-- list was generated and when the migration runs.
--
-- Already applied to vpioftosgdkyiwvhxewy via SQL Editor; this is the
-- source-of-truth commit.
--
-- Duplicate detection: case-insensitive, punctuation-stripped name match
-- within the same restaurant. Group keeper selection: highest total_votes,
-- tiebreak on longest description, tiebreak on most-recent created_at.
--
-- Future dupes will recur as cron re-extracts menus. Possible follow-ups
-- (deferred to v1.3+):
--   - Run this migration on a schedule (e.g. nightly after the 3am cron)
--   - Tighten the upsert key in menu-refresh to match across cosmetic
--     variants (with/w/, !/missing punct, smart-quote vs ascii apostrophe)

BEGIN;

SET LOCAL row_security = off;

DO $$
DECLARE
  pair RECORD;
  pair_count INT := 0;
BEGIN
  FOR pair IN
    WITH normalized AS (
      SELECT
        id,
        restaurant_id,
        lower(trim(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))) AS norm_name,
        total_votes,
        length(coalesce(description, '')) AS desc_len,
        created_at
      FROM dishes
      WHERE restaurant_id IS NOT NULL
    ),
    ranked AS (
      SELECT
        id,
        restaurant_id,
        norm_name,
        ROW_NUMBER() OVER (
          PARTITION BY restaurant_id, norm_name
          ORDER BY total_votes DESC, desc_len DESC, created_at DESC
        ) AS rn,
        FIRST_VALUE(id) OVER (
          PARTITION BY restaurant_id, norm_name
          ORDER BY total_votes DESC, desc_len DESC, created_at DESC
        ) AS keeper_id
      FROM normalized
      WHERE norm_name <> ''
    )
    SELECT keeper_id AS keeper, id AS loser
    FROM ranked
    WHERE rn > 1
  LOOP
    DELETE FROM votes WHERE dish_id = pair.loser AND source='user'
      AND user_id IN (SELECT user_id FROM votes WHERE dish_id=pair.keeper AND source='user');
    UPDATE votes SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM favorites WHERE dish_id = pair.loser
      AND user_id IN (SELECT user_id FROM favorites WHERE dish_id=pair.keeper);
    UPDATE favorites SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM dish_photos WHERE dish_id = pair.loser
      AND user_id IN (SELECT user_id FROM dish_photos WHERE dish_id=pair.keeper);
    UPDATE dish_photos SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM local_list_items WHERE dish_id = pair.loser
      AND list_id IN (SELECT list_id FROM local_list_items WHERE dish_id=pair.keeper);
    UPDATE local_list_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM user_playlist_items WHERE dish_id = pair.loser
      AND playlist_id IN (SELECT playlist_id FROM user_playlist_items WHERE dish_id=pair.keeper);
    UPDATE user_playlist_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM dishes WHERE id = pair.loser;
    pair_count := pair_count + 1;
  END LOOP;
  RAISE NOTICE 'Merged % loser dishes into their keepers', pair_count;
END $$;

-- Post-check: should now be 0
SELECT COUNT(*) AS remaining_duplicates
FROM (
  SELECT
    restaurant_id,
    lower(trim(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))) AS norm_name,
    ROW_NUMBER() OVER (
      PARTITION BY restaurant_id, lower(trim(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')))
      ORDER BY id
    ) AS rn
  FROM dishes
  WHERE restaurant_id IS NOT NULL
) ranked
WHERE rn > 1;

COMMIT;

-- ROLLBACK: no SQL rollback possible — this migration deletes rows and
-- re-points FKs. Recovery requires restore from backup. Verified on
-- 2026-05-20 night: ran cleanly with 0 remaining duplicates afterward,
-- merged 54 loser rows from 50 groups.
