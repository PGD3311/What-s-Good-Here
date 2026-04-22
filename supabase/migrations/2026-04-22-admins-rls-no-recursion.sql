-- Fix infinite RLS recursion on admins table.
--
-- The prior policy queried `FROM admins` from inside its own USING clause,
-- which made Postgres re-apply the policy on the inner SELECT and return
-- 500 on every `GET /rest/v1/admins` call (caught 2026-04-22 in prod logs
-- on wghapp.com — admin status check was 500-ing for every logged-in user).
--
-- The true invariant the app needs is "a user can check their own admin
-- status." No caller reads the full admin list. Own-row semantics eliminate
-- recursion by construction without relying on SECURITY DEFINER as an
-- escape hatch.

DROP POLICY IF EXISTS "Admins can read admins" ON admins;
DROP POLICY IF EXISTS "Users can read own admin row" ON admins;

CREATE POLICY "Users can read own admin row" ON admins FOR SELECT USING (
  (select auth.uid()) = user_id
);

-- ROLLBACK: re-creates the broken recursive policy. Only use if a downstream
-- consumer genuinely needs cross-user admin reads AND you have a plan to
-- avoid the recursion (wrap the lookup in a SECURITY DEFINER function).
--
-- DROP POLICY IF EXISTS "Users can read own admin row" ON admins;
-- CREATE POLICY "Admins can read admins" ON admins FOR SELECT USING (
--   EXISTS (SELECT 1 FROM admins WHERE user_id = (select auth.uid()))
-- );
