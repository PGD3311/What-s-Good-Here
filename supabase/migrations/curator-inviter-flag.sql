-- Decouple curator-invite minting from full admin role.
-- Adds profiles.can_invite_curators flag, lets non-admin holders mint links.
-- Run in Supabase SQL editor against project vpioftosgdkyiwvhxewy.

BEGIN;

-- 1. New column on profiles. Default false; admins remain authorized via the
--    RPC's existing is_admin() branch, so existing flow is unchanged.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_invite_curators BOOLEAN DEFAULT false;

-- 2. Replace the RPC. Now allows EITHER is_admin() OR profile flag.
CREATE OR REPLACE FUNCTION create_curator_invite()
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND can_invite_curators = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO curator_invites (created_by)
  VALUES (auth.uid())
  RETURNING * INTO v_invite;

  RETURN json_build_object(
    'success', true,
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verify with:
--   SELECT pg_get_functiondef('create_curator_invite()'::regprocedure);
--   \d profiles  -- should now list can_invite_curators
--
-- Grant the flag to a specific user (non-admin):
--   UPDATE profiles SET can_invite_curators = true
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'community-manager@example.com');
--
-- ROLLBACK:
-- BEGIN;
--   CREATE OR REPLACE FUNCTION create_curator_invite()
--   RETURNS JSON AS $$
--   DECLARE
--     v_invite RECORD;
--   BEGIN
--     IF NOT is_admin() THEN
--       RETURN json_build_object('success', false, 'error', 'Admin only');
--     END IF;
--     INSERT INTO curator_invites (created_by)
--     VALUES (auth.uid())
--     RETURNING * INTO v_invite;
--     RETURN json_build_object('success', true, 'token', v_invite.token, 'expires_at', v_invite.expires_at);
--   END;
--   $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS can_invite_curators;
-- COMMIT;
