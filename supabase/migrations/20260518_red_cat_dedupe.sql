-- Data migration: deduplicate Red Cat Kitchen dishes (2026-05-18).
--
-- Two duplication patterns:
--   1. Brussels sprouts — same dish under two different names.
--   2. Frank's Beverly Hills Noodle Show — every variant exists twice,
--      once with "w/" and once with "with" (clearly a menu-refresh quirk).
--
-- Strategy per pair: migrate votes / favorites / dish_photos / local_list_items
-- / user_playlist_items from the loser to the keeper. For each table that
-- enforces UNIQUE(dish_id, user_id) or similar, delete loser-side rows where
-- the keeper already has one for the same user (prevents UNIQUE conflict on
-- the UPDATE). Then DELETE the loser dish.
--
-- The update_dish_rating_on_vote trigger fires per row, so the keeper and
-- loser dishes' avg_rating / total_votes recalculate automatically.
--
-- Wrapped in a transaction so any failure rolls back the whole thing.

BEGIN;

-- Defensive: this migration UPDATEs cross-user rows in favorites/playlists/
-- etc. Those tables' RLS policies are owner-only on UPDATE. The Supabase
-- dashboard SQL editor runs as postgres (superuser) which already bypasses
-- RLS, but being explicit guards against accidental execution under a
-- non-superuser session — it fails loud rather than silently dropping rows.
SET LOCAL row_security = off;

DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      -- (keeper, loser)
      ('263cee6a-0bad-49ec-bf27-5623ed1c0001'::uuid, '0c8207b4-bf03-4e93-b1d2-4cbdc066e7ae'::uuid), -- Brussels sprouts
      ('4a19ee5e-0db1-4c32-b33b-e17daa657eba'::uuid, '52589242-84a2-469a-81a3-b1f99ff57525'::uuid), -- Noodle Show: Snow Crab
      ('8fe8fec5-4376-4d20-9b20-e9583c22aa64'::uuid, '2b0512ed-662d-4b96-80fa-5e99ab03c653'::uuid), -- Noodle Show: Teriyaki Chicken
      ('58b229af-519f-4bb9-b2a4-5556df5d6c58'::uuid, 'c091cb35-e9d5-4941-bf30-6379ab4145a3'::uuid), -- Noodle Show: Fat Moon Mushrooms
      ('e2c8f99b-30b0-4315-81f4-91387df968b2'::uuid, '2b4b341e-cae1-4982-995d-2c14523341f0'::uuid), -- Noodle Show: Duck
      ('d776f048-63dc-4d4d-b5a8-27fc977af495'::uuid, '5d03bcb4-b12a-48a9-a1ee-b80b3efd876a'::uuid)  -- Noodle Show: Seared Yellowfin Tuna
    ) AS pairs(keeper, loser)
  LOOP
    -- votes: UNIQUE is partial — only WHERE source='user'. Scope the conflict
    -- check to that subset so we don't accidentally drop loser ai_estimated
    -- rows that wouldn't have collided.
    DELETE FROM votes
      WHERE dish_id = pair.loser
        AND source = 'user'
        AND user_id IN (
          SELECT user_id FROM votes
          WHERE dish_id = pair.keeper AND source = 'user'
        );
    UPDATE votes SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    -- favorites: UNIQUE(user_id, dish_id)
    DELETE FROM favorites
      WHERE dish_id = pair.loser
        AND user_id IN (SELECT user_id FROM favorites WHERE dish_id = pair.keeper);
    UPDATE favorites SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    -- dish_photos: UNIQUE(dish_id, user_id)
    DELETE FROM dish_photos
      WHERE dish_id = pair.loser
        AND user_id IN (SELECT user_id FROM dish_photos WHERE dish_id = pair.keeper);
    UPDATE dish_photos SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    -- local_list_items: UNIQUE(list_id, dish_id)
    DELETE FROM local_list_items
      WHERE dish_id = pair.loser
        AND list_id IN (SELECT list_id FROM local_list_items WHERE dish_id = pair.keeper);
    UPDATE local_list_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    -- user_playlist_items: UNIQUE(playlist_id, dish_id) (assumed; if the index
    -- doesn't exist this UPDATE just succeeds, no harm)
    DELETE FROM user_playlist_items
      WHERE dish_id = pair.loser
        AND playlist_id IN (SELECT playlist_id FROM user_playlist_items WHERE dish_id = pair.keeper);
    UPDATE user_playlist_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    -- bias_events has dish_id with CASCADE — let it drop along with the dish.
    -- parent_dish_id on dishes also SET NULL on delete; no variants exist for
    -- these losers (verified by hand 2026-05-18).

    DELETE FROM dishes WHERE id = pair.loser;

    RAISE NOTICE 'Merged % into %', pair.loser, pair.keeper;
  END LOOP;
END $$;

-- Verify: Red Cat should have 28 dishes after, and no "w/" Noodle Show rows
-- nor "Crispy Brussels Sprouts" should remain.
SELECT COUNT(*) AS final_dish_count
FROM dishes
WHERE restaurant_id = 'cf7d0245-399a-496c-a675-dfca2a963dd9'::uuid;

COMMIT;

-- ROLLBACK strategy: data migration; not idempotent. To revert, restore
-- from the pre-migration backup (Supabase auto-snapshots daily). The lost
-- dishes' previous IDs are recoverable from the snapshot, but the merged
-- votes / favorites / photos will need manual reattribution from the
-- snapshot's vote rows.
