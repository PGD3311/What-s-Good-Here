-- Migration: 20260425_delete_account_advisory_lock.sql
--
-- Adds two SECURITY DEFINER functions used by the delete-account Edge Function
-- to serialize concurrent deletion requests for the same user via Postgres
-- advisory locks.
--
-- Context:
--   Two concurrent delete-account calls for the same user would both insert
--   pending_apple_revocations rows, both attempt revoke, and the "loser" would
--   log a false apple_revoke_cascade_mismatch (row 2 sees Apple revoked +
--   cascade failed because the user is already gone from row 1). Advisory locks
--   prevent the second call from entering the deletion flow at all.
--
-- Advisory lock key: hashtextextended('delete-account:<uuid>', 0) → bigint
--   - Stable across calls for the same userId
--   - Collision probability negligible for the number of concurrent users we have
--   - Released automatically when the service-role connection is returned to pool
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.try_advisory_lock_for_delete(UUID);
--   DROP FUNCTION IF EXISTS public.release_advisory_lock_for_delete(UUID);

-- ---------------------------------------------------------------------------
-- try_advisory_lock_for_delete
-- Returns TRUE if the lock was acquired, FALSE if already held by another session.
-- Non-blocking (pg_try_advisory_lock, not pg_advisory_lock).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.try_advisory_lock_for_delete(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_acquired BOOLEAN;
BEGIN
  SELECT pg_try_advisory_lock(hashtextextended('delete-account:' || p_user_id::text, 0))
    INTO lock_acquired;
  RETURN lock_acquired;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_advisory_lock_for_delete(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_advisory_lock_for_delete(UUID) TO service_role;

COMMENT ON FUNCTION public.try_advisory_lock_for_delete(UUID) IS
'Non-blocking advisory lock for delete-account flow. Returns TRUE if acquired.
Called by the delete-account Edge Function to prevent concurrent double-deletion.
Only callable by service_role.';

-- ---------------------------------------------------------------------------
-- release_advisory_lock_for_delete
-- Releases a lock previously acquired by try_advisory_lock_for_delete.
-- Safe to call even if the lock was not held (pg_advisory_unlock returns false,
-- not an error).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_advisory_lock_for_delete(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtextextended('delete-account:' || p_user_id::text, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_advisory_lock_for_delete(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_advisory_lock_for_delete(UUID) TO service_role;

COMMENT ON FUNCTION public.release_advisory_lock_for_delete(UUID) IS
'Releases the advisory lock acquired by try_advisory_lock_for_delete.
Called in the finally block of the delete-account Edge Function.
Only callable by service_role.';
