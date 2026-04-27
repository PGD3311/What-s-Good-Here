-- Enable Supabase Realtime broadcasts on the dishes table.
--
-- Why: client-side search reads from a React Query cache (useAllDishes,
-- queryKey ['allDishes']) populated by dishesApi.getAllSearchable. Pre-fix,
-- nothing invalidated that cache after dish writes — newly-inserted dishes
-- (manual add, menu-refresh cron, admin tools, restaurant cascade delete)
-- were invisible to homepage search until the 5-min staleTime expired or
-- the component remounted. Subscribing to dishes-table row events lets the
-- hook auto-invalidate on any change without per-write-site plumbing.
--
-- Idempotent: if `dishes` is already in the publication (re-running this),
-- ALTER PUBLICATION will error. Wrap in a DO block so reruns are safe.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE dishes;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'dishes is already in supabase_realtime publication — no-op';
END $$;

-- ROLLBACK:
-- ALTER PUBLICATION supabase_realtime DROP TABLE dishes;
