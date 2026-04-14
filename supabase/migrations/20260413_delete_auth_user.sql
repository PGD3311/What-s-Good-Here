-- H1 Account Deletion (Apple Guideline 5.1.1(v))
--
-- The delete-account Edge Function calls this SECURITY DEFINER function instead of
-- supabase.auth.admin.deleteUser(). The admin API was returning a 500 "Database error
-- deleting user" for users with certain FK dependencies (e.g. rows in the `follows`
-- table), while raw DELETE FROM auth.users cascades cleanly. This function is the
-- workaround — it runs the DELETE with owner privileges, and the cascade handles the
-- rest (profiles, votes, favorites, dish_photos, follows, notifications received,
-- user_rating_stats, bias_events, user_badges, restaurant_managers, rate_limits,
-- jitter_profiles, jitter_samples, local_lists).
--
-- Access is restricted to service_role only. The Edge Function authenticates the
-- caller's JWT before invoking this, so a compromised client key cannot trigger
-- arbitrary user deletions.

CREATE OR REPLACE FUNCTION public.delete_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_auth_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_auth_user(uuid) IS
'Account deletion helper: deletes the auth.users row. Workaround for auth.admin.deleteUser returning 500 "Database error deleting user" when certain FK dependencies exist. Only callable by service_role from the delete-account Edge Function.';
