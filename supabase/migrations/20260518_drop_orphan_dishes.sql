-- Drop 461 orphan dishes with restaurant_id = NULL (2026-05-18).
--
-- These were import artifacts — invisible in the app (every dish-fetching
-- RPC filters on restaurant_id) but bloating the dishes table. Verified
-- zero votes / photos / favorites against any of them before this runs.
--
-- All FK CASCADE on dish_id, so any straggler rows in dish_photos /
-- favorites / votes / local_list_items / user_playlist_items drop along
-- with the parent dish.

BEGIN;

SET LOCAL row_security = off;

-- Snapshot the count we're about to delete, for the RAISE NOTICE.
DO $$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM dishes WHERE restaurant_id IS NULL;
  RAISE NOTICE 'Deleting % orphan dishes', n;
END $$;

DELETE FROM dishes WHERE restaurant_id IS NULL;

-- Verify: no orphans should remain.
SELECT COUNT(*) AS remaining_orphans
FROM dishes WHERE restaurant_id IS NULL;

COMMIT;
