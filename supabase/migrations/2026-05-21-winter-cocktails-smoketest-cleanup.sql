-- 2026-05-21 morning cleanup pass.
--
-- Two surgical deletes, scoped from a manual inventory review post-launch
-- of the cocktail extraction work (PR #251, #246, #252):
--
-- 1. Thirteen winter/holiday cocktails that bled in from off-season menu
--    pages (Boarding House, Landfall, The Pearl, The Wharf). Menus had not
--    been refreshed since the off-season scrape, so seasonal items like
--    "Mistletoe Mule" and "Pumpkin Espresso Martini" were surfacing in
--    late-May search results. The next menu_refresh cron tick will re-pull
--    each restaurant's current menu — if these items truly are year-round
--    at that venue, they'll re-appear.
--
-- 2. Two SmokeTestCafe rows from 2026-04-14 test runs (address: "1 Smoke
--    Test St"). Cascades clean any test dishes/votes attached.
--
-- Already applied to vpioftosgdkyiwvhxewy via SQL Editor; verified 0 rows
-- remaining of either type. This is the source-of-truth commit.

BEGIN;

SET LOCAL row_security = off;

-- 1) Winter / holiday cocktails (cascades to votes, favorites, photos via FK)
DELETE FROM dishes WHERE id IN (
  '33689220-3429-4558-a2df-bff941a5cd23',  -- Boarding House: (NOT) HOT BUTTERED RUM
  '4e639ce5-ce79-4975-8a80-96d99d3f975c',  -- Boarding House: Fire Side Chai
  '9eec4d07-c376-475f-8d97-af89f65f89f1',  -- Boarding House: Jalisco Holiday
  'eebefa3b-fc0d-42b9-89e4-ef4d25c8ae2c',  -- Landfall: Autumn Rum Punch
  'a8f9df47-f0e1-433d-bb21-9d8ec1a4290d',  -- Landfall: Autumn Sangria
  '2b7ea860-bfc4-4199-a380-4248eba4a857',  -- The Pearl: (NOT) HOT BUTTERED RUM
  'ae5e8d44-d44a-472a-9ce9-cf381b6b69bc',  -- The Pearl: Fire Side Chai
  '4ccf4ce7-c5d9-4b0b-ad44-9a07864f08d7',  -- The Pearl: Jalisco Holiday
  '8236de1d-8ef5-4dc8-8a9a-cb663a5bc7c6',  -- The Wharf: Mistletoe Mule
  '68323c33-e947-41d9-8bf1-f1f6d86b8dc1',  -- The Wharf: Peppermint
  '3f34b2bd-07ea-4146-a9c2-03e856062afe',  -- The Wharf: Peppermint Martini
  'b270e34a-d2ba-4d39-899a-858f15f0a3ab',  -- The Wharf: Snickerdoodle
  'a7db0ace-d022-463b-8bac-9214e21aae71'   -- The Wharf: Snickerdoodle Martini
);

-- 2) SmokeTestCafe rows (cascades restaurant → dishes → votes)
DELETE FROM restaurants WHERE id IN (
  '732fbeca-8e83-4f28-bc95-a66359b80c46',  -- SmokeTestCafe-1776195539099
  '79b61004-686c-4791-8b85-0b2468ed9bd1'   -- SmokeTestCafe-1776130614621
);

COMMIT;

-- ROLLBACK: not cleanly possible — deletes cascade to dependent rows.
-- Recovery would require restore from backup. Verified clean on 2026-05-21.
