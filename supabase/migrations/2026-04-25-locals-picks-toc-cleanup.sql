-- Cleanup: drop get_locals_aggregate now that the chalkboard cards that called it are gone.
DROP FUNCTION IF EXISTS get_locals_aggregate();

-- ROLLBACK:
-- Restore the function body from the previous schema.sql (or supabase/migrations/locals-aggregate.sql).
-- No data is lost by the drop; this RPC computes aggregates over local_lists/local_list_items.
