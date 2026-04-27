-- Curator-flag trigger bypass.
--
-- protect_profile_fields_trigger unconditionally reverts is_local_curator
-- to its previous value on every UPDATE — including legitimate SECURITY
-- DEFINER calls from accept_curator_invite. Result: every recipient who
-- accepted an invite saw the token consumed in the DB but their profile
-- silently never got the curator flag. Every accept appeared to "work"
-- and then did nothing.
--
-- Fix: trigger now respects a transaction-local setting
-- (app.allow_curator_grant). accept_curator_invite sets it before the
-- UPDATE, so its mutation gets through. Direct client UPDATEs don't
-- set it, so self-grants are still blocked.
--
-- Run in Supabase SQL editor against project vpioftosgdkyiwvhxewy.

BEGIN;

CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Counters are derived state — never settable by anyone.
  NEW.follower_count := OLD.follower_count;
  NEW.following_count := OLD.following_count;

  -- Curator flag: revert unless the caller explicitly opted in via
  -- set_config('app.allow_curator_grant', 'true', true) inside a
  -- SECURITY DEFINER function. SET LOCAL semantics mean the opt-in
  -- only lasts for the current transaction.
  IF current_setting('app.allow_curator_grant', true) IS DISTINCT FROM 'true' THEN
    NEW.is_local_curator := OLD.is_local_curator;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accept_curator_invite(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_display_name TEXT;
  v_list_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'This invite was already claimed. Ask the person who sent it to mint a new one.');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'This invite has expired. Ask the person who sent it to mint a new one.');
  END IF;
  -- Self-click guard runs AFTER used/expired checks so the creator gets the
  -- accurate state for a dead token instead of "this is your own link".
  IF v_invite.created_by = v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'is_creator', true,
      'error', 'This is your own invite link. Share it with the person you want to invite.'
    );
  END IF;

  -- Opt in to bypass protect_profile_fields_trigger for THIS transaction
  -- only. SET LOCAL clears at COMMIT/ROLLBACK; no leak to other RPCs.
  PERFORM set_config('app.allow_curator_grant', 'true', true);

  UPDATE profiles SET is_local_curator = true WHERE id = v_user_id;

  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_user_id;

  INSERT INTO local_lists (user_id, title, is_active)
  VALUES (v_user_id, COALESCE(v_display_name, 'My') || '''s Top 10', false)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN
    SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;
  END IF;

  UPDATE curator_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'list_id', v_list_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backfill: anyone who consumed an invite token is by definition supposed
-- to be a curator. Run this once after deploying the trigger fix to
-- repair profiles that silently never got the flag set.
DO $$
BEGIN
  PERFORM set_config('app.allow_curator_grant', 'true', true);
  UPDATE profiles
     SET is_local_curator = true
   WHERE is_local_curator = false
     AND id IN (SELECT used_by FROM curator_invites WHERE used_by IS NOT NULL);
END $$;

COMMIT;

-- Verify with:
--   -- Dennis (or any backfilled user) should now show is_local_curator = true:
--   SELECT id, display_name, is_local_curator
--     FROM profiles
--    WHERE id IN (SELECT used_by FROM curator_invites WHERE used_by IS NOT NULL);
--
--   -- Self-grant should still be blocked. As a normal authenticated user:
--   UPDATE profiles SET is_local_curator = true WHERE id = auth.uid();
--   SELECT is_local_curator FROM profiles WHERE id = auth.uid();  -- still false
--
-- ROLLBACK:
-- BEGIN;
--   CREATE OR REPLACE FUNCTION protect_profile_fields()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     NEW.is_local_curator := OLD.is_local_curator;
--     NEW.follower_count := OLD.follower_count;
--     NEW.following_count := OLD.following_count;
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
--
--   -- Restore prior accept_curator_invite (without the set_config call).
--   -- Body is identical to migrations/curator-invite-self-test.sql; copy
--   -- from there and re-apply if rolling back this migration.
-- COMMIT;
-- Note: this does NOT roll back the backfill. Affected users would
-- need is_local_curator manually reverted to false (with trigger
-- temporarily disabled) — but you almost certainly don't want to do
-- that, since they legitimately accepted invites.
