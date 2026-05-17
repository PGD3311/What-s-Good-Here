-- Fix: profiles.follower_count and following_count have been stale since
-- launch because the protect_profile_fields BEFORE-UPDATE trigger
-- unconditionally reverts those columns to their OLD values — including
-- when the legitimate update_follow_counts trigger tries to maintain them
-- on follow/unfollow. Every counter increment has been silently dropped.
--
-- This migration:
-- 1. Teaches protect_profile_fields to honor a session-local opt-in flag
--    'app.allow_follow_count_update' (same pattern as the existing
--    'app.allow_curator_grant' opt-in for is_local_curator).
-- 2. Updates update_follow_counts to set that flag before updating.
-- 3. One-time backfills follower_count and following_count from the
--    follows table for every profile.
--
-- Direct client UPDATEs to profiles still cannot tamper with these
-- columns because the client session doesn't set the flag.

-- 1. Updated profile-fields guard
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.allow_follow_count_update', true) IS DISTINCT FROM 'true' THEN
    NEW.follower_count := OLD.follower_count;
    NEW.following_count := OLD.following_count;
  END IF;
  IF current_setting('app.allow_curator_grant', true) IS DISTINCT FROM 'true' THEN
    NEW.is_local_curator := OLD.is_local_curator;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger now opts in before issuing its UPDATE
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Transaction-local flag (set_config third arg `true`) — visible to all
  -- statements in this transaction but cleared on commit/rollback, so it
  -- doesn't leak to other sessions. Anyone wrapping a long transaction
  -- around their own UPDATE could see the bypass, but a regular client
  -- can't set this flag without explicit SECURITY DEFINER plumbing.
  PERFORM set_config('app.allow_follow_count_update', 'true', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.followed_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.followed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. One-time backfill of stale counts.
-- LOCK follows in SHARE mode for the duration of the DO block so the
-- snapshot is consistent — without this, a concurrent follow could land
-- after the COUNT(*) reads but before the backfill UPDATE completes,
-- causing the new follow's trigger increment to be overwritten by the
-- backfill's stale total.
DO $$
BEGIN
  PERFORM set_config('app.allow_follow_count_update', 'true', true);
  LOCK TABLE follows IN SHARE MODE;
  UPDATE profiles p
  SET
    follower_count = COALESCE((SELECT COUNT(*) FROM follows WHERE followed_id = p.id), 0),
    following_count = COALESCE((SELECT COUNT(*) FROM follows WHERE follower_id = p.id), 0);
END $$;

-- ROLLBACK:
-- This migration corrects stale data; reverting the function definitions
-- would stop new counts from being maintained but leave the backfilled
-- numbers in place (they would simply drift again over time). No data
-- loss in either direction. To revert the function bodies, restore the
-- pre-migration versions from schema.sql history.
