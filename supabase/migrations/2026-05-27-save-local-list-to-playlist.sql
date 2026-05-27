-- Clone a curator's Local List into the caller's playlists as a new private playlist.
-- 2026-05-27
-- Additive only: no schema changes. Single atomic copy avoids 10 round-trips
-- + per-add rate limits when the recipient clones a full Top 10.

CREATE OR REPLACE FUNCTION clone_local_list_to_playlist(p_curator_user_id UUID)
RETURNS TABLE (playlist_id UUID, copied_count INT, slug TEXT, title TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_curator_name TEXT;
  v_new_playlist user_playlists;
  v_copied INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_user = p_curator_user_id THEN
    RAISE EXCEPTION 'Cannot clone your own list' USING ERRCODE = 'P0001';
  END IF;
  IF is_blocked_pair(v_user, p_curator_user_id) THEN
    RAISE EXCEPTION 'Cannot clone this list' USING ERRCODE = '42501';
  END IF;

  -- Curator's display_name drives the new playlist title.
  SELECT p.display_name INTO v_curator_name
  FROM profiles p WHERE p.id = p_curator_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curator not found' USING ERRCODE = 'P0002';
  END IF;
  -- profiles.display_name is NOT NULL via the handle_new_user trigger
  -- (eater-XXXX placeholder). Defensive fallback if that invariant ever
  -- regresses so we don't blow up the recipient flow.
  v_curator_name := COALESCE(v_curator_name, 'A local');

  PERFORM fn_check_content_blocklist(LEFT(v_curator_name || '''s picks', 60), 'Playlist title');

  -- Verify the curator has an active list. Defensive: client should already
  -- know this from get_local_list_by_user, but RLS allows arbitrary user IDs.
  PERFORM 1 FROM local_lists ll
   WHERE ll.user_id = p_curator_user_id AND ll.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Curator has no active list' USING ERRCODE = 'P0002';
  END IF;

  -- Create the destination playlist (private by default — recipient can publish later).
  INSERT INTO user_playlists (user_id, title, description, is_public, slug)
  VALUES (
    v_user,
    LEFT(v_curator_name || '''s picks', 60),
    'Saved from ' || v_curator_name || '''s Local List',
    false,
    fn_playlist_slug_from_title(LEFT(v_curator_name || '''s picks', 60), v_user)
  )
  RETURNING * INTO v_new_playlist;

  -- Lock the curator's parent list row AND the existing item rows for the
  -- duration of this transaction. FOR SHARE OF ll blocks the curator's
  -- add/replace paths (which take FOR UPDATE on local_lists), so no new
  -- items can be inserted between blocklist validation and the items copy
  -- below. FOR SHARE OF li blocks direct UPDATE/DELETE on existing items.
  PERFORM 1
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  WHERE ll.user_id = p_curator_user_id AND ll.is_active = true
  FOR SHARE OF ll, li;

  -- Validate curator-supplied notes against the content blocklist before
  -- copying. add_dish_to_playlist enforces this on every new note; mirror
  -- that behavior on clone so the blocklist can be tightened after the fact.
  PERFORM fn_check_content_blocklist(li.note, 'Note')
  FROM local_list_items li
  JOIN local_lists ll ON ll.id = li.list_id
  WHERE ll.user_id = p_curator_user_id
    AND ll.is_active = true
    AND li.note IS NOT NULL;

  -- Copy items in curator's order. We renumber positions starting at 1 in case
  -- the curator's list has gaps (constraint is 1..10, so usually 1..N already).
  WITH src AS (
    SELECT li.dish_id, li.note,
           ROW_NUMBER() OVER (ORDER BY li."position") AS new_pos
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    WHERE ll.user_id = p_curator_user_id AND ll.is_active = true
  )
  INSERT INTO user_playlist_items (playlist_id, dish_id, position, note)
  SELECT v_new_playlist.id, src.dish_id, src.new_pos, src.note
  FROM src;

  GET DIAGNOSTICS v_copied = ROW_COUNT;

  IF v_copied = 0 THEN
    RAISE EXCEPTION 'Curator has no items to clone' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY SELECT v_new_playlist.id, v_copied, v_new_playlist.slug, v_new_playlist.title;
END;
$$;

REVOKE EXECUTE ON FUNCTION clone_local_list_to_playlist(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION clone_local_list_to_playlist(UUID) TO authenticated, service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS clone_local_list_to_playlist(UUID);
