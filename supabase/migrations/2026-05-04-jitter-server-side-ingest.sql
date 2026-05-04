-- 2026-05-04: Move jitter sample ingest to a server-side RPC
--
-- Until now, clients inserted directly into `jitter_samples` (RLS policy
-- "Users can insert own jitter samples" allowed it). The merge_jitter_sample
-- trigger then promoted the sample into jitter_profiles, and the UI used
-- those profiles to show public trust badges.
--
-- Codex security HIGH: a user could fabricate sample_data (any JSONB
-- shape, any values) and forge a "high consistency human" trust badge
-- without ever typing a real keystroke. There is no plausibility check.
--
-- Fix: drop the client INSERT policy and require all sample submissions
-- to go through a SECURITY DEFINER RPC `submit_jitter_sample` that:
--   1. Validates required keys are present.
--   2. Rejects values outside human plausibility bounds (timing in ms).
--   3. Rate-limits the user to 30 samples/min.
--   4. Inserts on behalf of the caller (auth.uid()).
-- Reads (jitter_profiles + jitter_samples SELECT) are unchanged.

CREATE OR REPLACE FUNCTION submit_jitter_sample(p_sample_data jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_sample_id UUID;
  v_mean_inter_key DECIMAL;
  v_std_inter_key DECIMAL;
  v_mean_dwell DECIMAL;
  v_std_dwell DECIMAL;
  v_total_keystrokes INT;
  v_recent_count INT;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_sample_data IS NULL OR jsonb_typeof(p_sample_data) <> 'object' THEN
    RAISE EXCEPTION 'sample_data must be a JSON object';
  END IF;

  -- Required keys. The merge_jitter_sample trigger reads these to update
  -- the running profile, so missing values would corrupt the profile.
  v_mean_inter_key := NULLIF(p_sample_data->>'mean_inter_key', '')::DECIMAL;
  v_std_inter_key  := NULLIF(p_sample_data->>'std_inter_key', '')::DECIMAL;
  v_total_keystrokes := NULLIF(p_sample_data->>'total_keystrokes', '')::INT;

  IF v_mean_inter_key IS NULL OR v_std_inter_key IS NULL OR v_total_keystrokes IS NULL THEN
    RAISE EXCEPTION 'sample_data missing required keys (mean_inter_key, std_inter_key, total_keystrokes)';
  END IF;

  -- Plausibility bounds (timing in ms, count for keystrokes). Reject
  -- impossible-for-humans values AND scripted-perfect zero-variance ones.
  IF v_mean_inter_key < 30 OR v_mean_inter_key > 5000 THEN
    RAISE EXCEPTION 'mean_inter_key out of plausible range (30..5000)';
  END IF;
  IF v_std_inter_key < 5 OR v_std_inter_key > 2000 THEN
    RAISE EXCEPTION 'std_inter_key out of plausible range (5..2000)';
  END IF;
  IF v_total_keystrokes < 1 OR v_total_keystrokes > 100000 THEN
    RAISE EXCEPTION 'total_keystrokes out of plausible range (1..100000)';
  END IF;

  -- Optional dwell metrics — validate if present.
  IF p_sample_data ? 'mean_dwell' AND p_sample_data->>'mean_dwell' IS NOT NULL THEN
    v_mean_dwell := (p_sample_data->>'mean_dwell')::DECIMAL;
    IF v_mean_dwell < 10 OR v_mean_dwell > 1000 THEN
      RAISE EXCEPTION 'mean_dwell out of plausible range (10..1000)';
    END IF;
  END IF;
  IF p_sample_data ? 'std_dwell' AND p_sample_data->>'std_dwell' IS NOT NULL THEN
    v_std_dwell := (p_sample_data->>'std_dwell')::DECIMAL;
    IF v_std_dwell < 1 OR v_std_dwell > 500 THEN
      RAISE EXCEPTION 'std_dwell out of plausible range (1..500)';
    END IF;
  END IF;

  -- Per-user rate limit. Legitimate flow is 1 sample per submitted
  -- review; 30/min leaves headroom for retries while still bounding
  -- profile-shaping spam.
  SELECT COUNT(*) INTO v_recent_count
  FROM jitter_samples
  WHERE user_id = v_user_id AND collected_at > NOW() - INTERVAL '1 minute';
  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION 'Too many jitter samples in the last minute';
  END IF;

  INSERT INTO jitter_samples (user_id, sample_data)
  VALUES (v_user_id, p_sample_data)
  RETURNING id INTO v_sample_id;

  RETURN v_sample_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_jitter_sample(jsonb) TO authenticated;

-- Drop the direct-insert policy. After this runs, all jitter_samples
-- inserts must come through submit_jitter_sample().
DROP POLICY IF EXISTS "Users can insert own jitter samples" ON jitter_samples;

-- ROLLBACK:
-- The client used to do `supabase.from('jitter_samples').insert(...)`.
-- After this migration that path is denied by RLS — the new RPC is the
-- only entry point. To roll back the server-side gate:
--
--   DROP FUNCTION IF EXISTS submit_jitter_sample(jsonb);
--   CREATE POLICY "Users can insert own jitter samples" ON jitter_samples
--     FOR INSERT WITH CHECK (auth.uid() = user_id);
--
-- The client code that called the RPC will need to be reverted to the
-- direct insert OR left calling the RPC and the RPC re-created — choose
-- based on which side of the deploy is rolling back.
--
-- No data destruction; the policy/RPC swap is purely an authz change.
