-- Granular RPC: append a single dish to the caller's Top 10.
--
-- Why a dedicated RPC instead of reusing save_my_local_list?
-- save_my_local_list is full-list-replace (DELETE + INSERT) with no
-- revision check. Calling it from Dish.jsx with a stale React Query
-- cache would silently clobber concurrent edits in another tab. This
-- RPC reads list state inside the transaction and only INSERTs, so
-- there's no lost-update class of bug.
--
-- Run in Supabase SQL editor against project vpioftosgdkyiwvhxewy.

BEGIN;

CREATE OR REPLACE FUNCTION add_dish_to_my_local_list(p_dish_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_list_id UUID;
  v_item_count INT;
  v_next_position INT;
  v_dish_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT is_local_curator() THEN
    RETURN json_build_object('success', false, 'error', 'Not a local curator');
  END IF;

  IF p_dish_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'dish_id required');
  END IF;

  SELECT EXISTS (SELECT 1 FROM dishes WHERE id = p_dish_id) INTO v_dish_exists;
  IF NOT v_dish_exists THEN
    RETURN json_build_object('success', false, 'error', 'Dish not found');
  END IF;

  -- Lock the list row so concurrent appends serialize cleanly.
  SELECT id INTO v_list_id
    FROM local_lists
   WHERE user_id = v_user_id
   FOR UPDATE;

  IF v_list_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No list found — accept an invite first');
  END IF;

  SELECT COUNT(*) INTO v_item_count FROM local_list_items WHERE list_id = v_list_id;

  IF EXISTS (SELECT 1 FROM local_list_items WHERE list_id = v_list_id AND dish_id = p_dish_id) THEN
    RETURN json_build_object(
      'success', true,
      'already_present', true,
      'item_count', v_item_count
    );
  END IF;

  IF v_item_count >= 10 THEN
    RETURN json_build_object(
      'success', false,
      'list_full', true,
      'item_count', v_item_count,
      'error', 'Top 10 is full — remove a dish in My List first'
    );
  END IF;

  -- Append at the next position.
  v_next_position := v_item_count + 1;

  INSERT INTO local_list_items (list_id, dish_id, "position", note)
  VALUES (v_list_id, p_dish_id, v_next_position, NULL);

  -- Promote the list to active now that it has at least one item, matching
  -- save_my_local_list's behaviour (is_active = item_count > 0).
  UPDATE local_lists SET is_active = true WHERE id = v_list_id AND is_active = false;

  RETURN json_build_object(
    'success', true,
    'already_present', false,
    'item_count', v_next_position
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verify with:
--   -- as a curator (must have an existing local_list row):
--   SELECT add_dish_to_my_local_list('<some-dish-uuid>');     -- expect success
--   SELECT add_dish_to_my_local_list('<same-dish-uuid>');     -- expect already_present=true
--   -- after 10 items:
--   SELECT add_dish_to_my_local_list('<eleventh-dish-uuid>'); -- expect list_full=true
--   -- as a non-curator:
--   SELECT add_dish_to_my_local_list('<some-dish-uuid>');     -- expect 'Not a local curator'
--
-- ROLLBACK:
-- BEGIN;
--   DROP FUNCTION IF EXISTS add_dish_to_my_local_list(UUID);
-- COMMIT;
