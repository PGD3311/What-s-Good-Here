-- Drop get_local_picks_index — Index tab on /locals was removed (UX call: search beats it,
-- alphabetical browse doesn't earn its keep at current scale, three tabs dilutes attention).
-- Safe to run as soon as the corresponding PR's deploy is live.
DROP FUNCTION IF EXISTS get_local_picks_index();

-- ROLLBACK:
-- Restore the function from supabase/migrations/2026-04-25-locals-picks-toc.sql section 4
-- (the CREATE OR REPLACE FUNCTION get_local_picks_index() block).
