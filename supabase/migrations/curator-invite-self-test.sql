-- Curator-invite UX fixes:
-- 1. accept_curator_invite no longer consumes the token when the creator
--    clicks their own link — testing/previewing is safe again.
-- 2. get_curator_invite_details exposes is_creator so the page can show
--    "this is your own link" instead of an Accept button.
-- 3. Friendlier user-facing copy for already-used and expired states.
--
-- Run in Supabase SQL editor against project vpioftosgdkyiwvhxewy.

BEGIN;

CREATE OR REPLACE FUNCTION get_curator_invite_details(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'error', 'This invite was already claimed. Ask the person who sent it to mint a new one.');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('valid', false, 'error', 'This invite has expired. Ask the person who sent it to mint a new one.');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'expires_at', v_invite.expires_at,
    'is_creator', (auth.uid() IS NOT NULL AND v_invite.created_by = auth.uid())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

COMMIT;

-- Verify with:
--   -- creator clicks their own link → success=false, is_creator=true, no consumption
--   SELECT accept_curator_invite('<token-you-just-minted>');
--   SELECT used_by FROM curator_invites WHERE token = '<token>';  -- should still be NULL
--
-- ROLLBACK:
-- BEGIN;
--   CREATE OR REPLACE FUNCTION get_curator_invite_details(p_token TEXT)
--   RETURNS JSON AS $$
--   DECLARE v_invite RECORD;
--   BEGIN
--     SELECT * INTO v_invite FROM curator_invites WHERE token = p_token;
--     IF NOT FOUND THEN RETURN json_build_object('valid', false, 'error', 'Invite not found'); END IF;
--     IF v_invite.used_by IS NOT NULL THEN RETURN json_build_object('valid', false, 'error', 'Invite already used'); END IF;
--     IF v_invite.expires_at < NOW() THEN RETURN json_build_object('valid', false, 'error', 'Invite has expired'); END IF;
--     RETURN json_build_object('valid', true, 'expires_at', v_invite.expires_at);
--   END;
--   $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--
--   CREATE OR REPLACE FUNCTION accept_curator_invite(p_token TEXT)
--   RETURNS JSON AS $$
--   DECLARE v_invite RECORD; v_user_id UUID; v_display_name TEXT; v_list_id UUID;
--   BEGIN
--     v_user_id := auth.uid();
--     IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Not authenticated'); END IF;
--     SELECT * INTO v_invite FROM curator_invites WHERE token = p_token FOR UPDATE;
--     IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Invite not found'); END IF;
--     IF v_invite.used_by IS NOT NULL THEN RETURN json_build_object('success', false, 'error', 'Invite already used'); END IF;
--     IF v_invite.expires_at < NOW() THEN RETURN json_build_object('success', false, 'error', 'Invite has expired'); END IF;
--     UPDATE profiles SET is_local_curator = true WHERE id = v_user_id;
--     SELECT display_name INTO v_display_name FROM profiles WHERE id = v_user_id;
--     INSERT INTO local_lists (user_id, title, is_active)
--     VALUES (v_user_id, COALESCE(v_display_name, 'My') || '''s Top 10', false)
--     ON CONFLICT (user_id) DO NOTHING RETURNING id INTO v_list_id;
--     IF v_list_id IS NULL THEN SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id; END IF;
--     UPDATE curator_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;
--     RETURN json_build_object('success', true, 'list_id', v_list_id);
--   END;
--   $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- COMMIT;
