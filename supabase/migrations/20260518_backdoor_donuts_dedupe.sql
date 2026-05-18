-- Data migration: deduplicate Back Door Donuts (2026-05-18).
--
-- Menu had 77 dishes; 23 were duplicate pairs. Pattern: every donut
-- was imported twice — once short-form ("Boston Cream") and once with
-- the food-type suffix ("Boston Cream Donut"). A few cookies / pastries
-- did the same.
--
-- Keepers: more descriptive name (with the suffix). 77 → 54 dishes.
--
-- Same DO-block strategy as the Red Cat dedupe — migrate votes /
-- favorites / dish_photos / local_list_items / user_playlist_items
-- from loser to keeper before deleting each loser. votes scoped to
-- source='user' for the UNIQUE pre-delete (partial index).
--
-- Only 1 vote exists on the entire menu (Coconut Donut, not in this
-- dedupe set) — no rating data at risk.

BEGIN;

SET LOCAL row_security = off;

DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      -- (keeper, loser)
      -- Donut pairs (17): suffix-form keeps, short-form drops
      ('ecf53257-1c45-4586-974a-b7d3249c3916'::uuid, '22969c90-e392-486e-ac5b-3fc2a1e4f6b5'::uuid), -- Apple Cider Donut
      ('2360108a-ec6c-4d79-9807-0a0c12c3e4c2'::uuid, 'b19065d2-a694-4283-b6e8-85ac1fa86972'::uuid), -- Boston Cream Donut
      ('51ad1828-cbd2-42ee-911c-f3cdb12c2b12'::uuid, '6ee1f121-0f3c-42d0-bb0d-d8d239b9ce58'::uuid), -- Buttercrunch Donut
      ('311eabac-ff96-4dec-8b87-8818e150a08a'::uuid, '489f53a8-4610-4b60-97a1-0c3dcbabb17d'::uuid), -- Buttermilk Glazed Donut
      ('c57556ad-d15c-4106-8c29-3514e0f495ef'::uuid, '0092636b-ce3f-41fa-914c-222c0444a07d'::uuid), -- Chocolate Coconut Donut
      ('386c3b40-7fdd-47eb-b377-b2c37aae6672'::uuid, '51356eb7-f743-4d4a-aed8-afced880482d'::uuid), -- Chocolate Frosted Donut
      ('88c1ae6b-ebb6-430f-9224-e81a21b165c1'::uuid, 'abda605b-641e-4bf6-8c33-d4a186168215'::uuid), -- Chocolate Glazed Donut
      ('535374c3-a2a0-421d-a970-f5dc43a183f4'::uuid, 'a8fa0360-b6c6-42d3-9b59-ddb0cf336b2f'::uuid), -- Cinnamon Sugar Donut
      ('9211cad8-d273-4bb2-8c8c-63c6b42b9d98'::uuid, '6a8232c1-d8d0-4edb-88e1-8f36d6c32b95'::uuid), -- Double Chocolate Donut
      ('a37bad72-0337-4523-850b-7499987525ae'::uuid, '3b38e634-5bc5-48c7-a040-a55e4a1844a8'::uuid), -- GF Boston Cream Donut
      ('da4ffff0-d78b-46d3-bcb6-54357b237e8c'::uuid, '5d831203-7dac-41e0-9b21-0cf9bbe74806'::uuid), -- GF Chocolate Frosted Donut
      ('5d2d056f-1f1e-4de1-b9e8-4725b1530437'::uuid, '21c97c9e-9144-4b76-bfa5-bfaa8a902fee'::uuid), -- Honey Dipped Donut
      ('e2a6253f-d104-4157-b3fb-1240498d0cde'::uuid, 'd57bd9c3-a020-4354-9d06-9e94c40b0da2'::uuid), -- Lemon Jelly Donut
      ('daea5859-ff98-4bfe-a40e-c1378d0b4ee1'::uuid, 'ac4f3847-7200-42a0-a92e-c5e3e6e4bb78'::uuid), -- Maple Bacon Donut
      ('d8514280-9bde-41ed-9161-17c424062563'::uuid, '72f2706d-5d19-4d8f-8dc3-c826325ab13f'::uuid), -- Old Fashioned Donut
      ('d44539e9-8b16-42a2-979a-13e860beb3df'::uuid, '4ca315a0-86ea-4b0b-a45f-d736842d292f'::uuid), -- Plain GF Donut
      ('df348b73-eb40-4236-ba12-db8c3a901fcf'::uuid, '2fe6a7f7-9209-4851-8291-ff1d43f4a947'::uuid), -- Raspberry Jelly Donut
      -- Cookies / pastries (6)
      ('1c188b74-c331-46f0-ac10-8de1dae6d285'::uuid, '131ac9a2-9a8b-4560-89e2-d78f2a017aea'::uuid), -- Black & White Cookie ← B&W
      ('dfc343d8-e04b-48bb-92f8-08f4de5636c7'::uuid, '109b4b87-c8f7-4aec-ba59-b2ff483814d7'::uuid), -- Brownie ← Brownies
      ('69a0776a-2469-49e3-a5c0-147c56412c20'::uuid, 'db79cdf7-e45d-47a3-a86d-9d20e8fa7331'::uuid), -- Eclair ← Eclairs (Small)
      ('e5b9dcba-4a4d-4beb-9d03-d3e22f029f6f'::uuid, '42d3242a-37d6-4da4-9770-1cef1c8f10cb'::uuid), -- Florentine Cookie ← Florentine
      ('a7356a17-e0fe-4bce-8374-a5953f1cb690'::uuid, '1963e245-21f8-4f33-817c-ee7f309ff96d'::uuid), -- Hermit Cookie ← Hermit
      ('6a09e41e-f17a-4b4e-bfbd-6797d7ca211a'::uuid, 'b4c1c349-dba3-4f26-8a59-c47ac21b95c0'::uuid)  -- Ham, Egg & Cheese Croissant ← (extra-comma variant)
    ) AS pairs(keeper, loser)
  LOOP
    -- votes: UNIQUE is partial (WHERE source='user'). Scope the conflict
    -- check to user votes only so we don't over-delete ai_estimated rows.
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

    -- user_playlist_items: UNIQUE(playlist_id, dish_id)
    DELETE FROM user_playlist_items
      WHERE dish_id = pair.loser
        AND playlist_id IN (SELECT playlist_id FROM user_playlist_items WHERE dish_id = pair.keeper);
    UPDATE user_playlist_items SET dish_id = pair.keeper WHERE dish_id = pair.loser;

    DELETE FROM dishes WHERE id = pair.loser;

    RAISE NOTICE 'Merged % into %', pair.loser, pair.keeper;
  END LOOP;
END $$;

-- Verify: Back Door Donuts should have 54 dishes after.
SELECT COUNT(*) AS final_dish_count
FROM dishes
WHERE restaurant_id = '29650b0a-0e08-4f9e-b478-a13a2672e6fe'::uuid;

COMMIT;

-- ROLLBACK: data migration; restore from auto-snapshot if needed.
