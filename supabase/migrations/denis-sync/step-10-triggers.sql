-- =============================================
-- 10. TRIGGERS
-- =============================================

-- 10a. Update follow counts
-- Opts into the protect_profile_fields bypass via the
-- 'app.allow_follow_count_update' transaction-local flag — without this,
-- every counter increment is silently reverted by the protect trigger.
-- See migrations/20260516_fix_follower_count_trigger.sql for context.
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trigger_update_follow_counts ON follows;
CREATE TRIGGER trigger_update_follow_counts
  AFTER INSERT OR DELETE ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 10b. Notify on follow
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT display_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  INSERT INTO notifications (user_id, type, data)
  VALUES (NEW.followed_id, 'follow', jsonb_build_object('follower_id', NEW.follower_id, 'follower_name', COALESCE(follower_name, 'Someone')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_on_follow ON follows;
CREATE TRIGGER trigger_notify_on_follow
  AFTER INSERT ON follows FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- 10c. Vote insert: set vote_position, category_snapshot, update user_rating_stats
CREATE OR REPLACE FUNCTION on_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_vote_count INT;
  dish_category TEXT;
BEGIN
  SELECT COUNT(*) INTO current_vote_count FROM votes WHERE dish_id = NEW.dish_id AND id != NEW.id;
  NEW.vote_position := current_vote_count + 1;

  SELECT category INTO dish_category FROM dishes WHERE id = NEW.dish_id;
  NEW.category_snapshot := dish_category;

  IF NEW.rating_10 IS NOT NULL THEN
    INSERT INTO user_rating_stats (user_id, votes_pending) VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET votes_pending = user_rating_stats.votes_pending + 1, updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS vote_insert_trigger ON votes;
CREATE TRIGGER vote_insert_trigger BEFORE INSERT ON votes FOR EACH ROW EXECUTE FUNCTION on_vote_insert();

-- 10d. Consensus check after vote (MAD-based)
CREATE OR REPLACE FUNCTION check_consensus_after_vote()
RETURNS TRIGGER AS $$
DECLARE
  total_votes_count INT;
  consensus_avg NUMERIC(3, 1);
  v RECORD;
  user_bias_before NUMERIC(3, 1);
  user_bias_after NUMERIC(3, 1);
  user_deviation NUMERIC(3, 1);
  is_early BOOLEAN;
  dish_name_snapshot TEXT;
  consensus_threshold INT := 5;
BEGIN
  IF NEW.rating_10 IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*), ROUND(AVG(rating_10), 1) INTO total_votes_count, consensus_avg
  FROM votes WHERE dish_id = NEW.dish_id AND rating_10 IS NOT NULL;

  IF total_votes_count >= consensus_threshold THEN
    IF NOT EXISTS (SELECT 1 FROM dishes WHERE id = NEW.dish_id AND consensus_ready = TRUE) THEN
      SELECT name INTO dish_name_snapshot FROM dishes WHERE id = NEW.dish_id;

      UPDATE dishes SET consensus_rating = consensus_avg, consensus_ready = TRUE,
        consensus_votes = total_votes_count, consensus_calculated_at = NOW()
      WHERE id = NEW.dish_id;

      FOR v IN SELECT * FROM votes WHERE dish_id = NEW.dish_id AND scored_at IS NULL AND rating_10 IS NOT NULL
      LOOP
        user_deviation := ROUND(v.rating_10 - consensus_avg, 1);
        is_early := v.vote_position <= 3;

        SELECT rating_bias INTO user_bias_before FROM user_rating_stats WHERE user_id = v.user_id;
        IF user_bias_before IS NULL THEN user_bias_before := 0.0; END IF;

        UPDATE votes SET scored_at = NOW() WHERE id = v.id;

        SELECT ROUND(AVG(ABS(votes.rating_10 - d.consensus_rating)), 1) INTO user_bias_after
        FROM votes JOIN dishes d ON votes.dish_id = d.id
        WHERE votes.user_id = v.user_id AND d.consensus_ready = TRUE
          AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL;

        IF user_bias_after IS NULL THEN user_bias_after := ABS(user_deviation); END IF;

        INSERT INTO bias_events (user_id, dish_id, dish_name, user_rating, consensus_rating, deviation, was_early_voter, bias_before, bias_after)
        VALUES (v.user_id, v.dish_id, dish_name_snapshot, v.rating_10, consensus_avg, user_deviation, is_early, user_bias_before, user_bias_after);

        INSERT INTO user_rating_stats (user_id, rating_bias, votes_with_consensus, votes_pending, dishes_helped_establish, bias_label)
        VALUES (v.user_id, user_bias_after, 1, -1, CASE WHEN is_early THEN 1 ELSE 0 END, get_bias_label(user_bias_after))
        ON CONFLICT (user_id) DO UPDATE SET
          rating_bias = user_bias_after,
          votes_with_consensus = user_rating_stats.votes_with_consensus + 1,
          votes_pending = GREATEST(0, user_rating_stats.votes_pending - 1),
          dishes_helped_establish = user_rating_stats.dishes_helped_establish + CASE WHEN is_early THEN 1 ELSE 0 END,
          bias_label = get_bias_label(user_bias_after),
          updated_at = NOW();

        UPDATE user_rating_stats SET category_biases = jsonb_set(
          COALESCE(category_biases, '{}'::jsonb), ARRAY[v.category_snapshot],
          (SELECT to_jsonb(ROUND(AVG(votes.rating_10 - d.consensus_rating), 1))
           FROM votes JOIN dishes d ON votes.dish_id = d.id
           WHERE votes.user_id = v.user_id AND d.consensus_ready = TRUE
             AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL
             AND votes.category_snapshot = v.category_snapshot), TRUE)
        WHERE user_id = v.user_id;
      END LOOP;
    ELSE
      SELECT name INTO dish_name_snapshot FROM dishes WHERE id = NEW.dish_id;

      UPDATE dishes SET consensus_rating = consensus_avg,
        consensus_votes = total_votes_count, consensus_calculated_at = NOW()
      WHERE id = NEW.dish_id;

      user_deviation := ROUND(NEW.rating_10 - consensus_avg, 1);
      is_early := FALSE;

      SELECT rating_bias INTO user_bias_before FROM user_rating_stats WHERE user_id = NEW.user_id;
      IF user_bias_before IS NULL THEN user_bias_before := 0.0; END IF;

      UPDATE votes SET scored_at = NOW() WHERE id = NEW.id;

      SELECT ROUND(AVG(ABS(votes.rating_10 - d.consensus_rating)), 1) INTO user_bias_after
      FROM votes JOIN dishes d ON votes.dish_id = d.id
      WHERE votes.user_id = NEW.user_id AND d.consensus_ready = TRUE
        AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL;

      IF user_bias_after IS NULL THEN user_bias_after := ABS(user_deviation); END IF;

      INSERT INTO bias_events (user_id, dish_id, dish_name, user_rating, consensus_rating, deviation, was_early_voter, bias_before, bias_after)
      VALUES (NEW.user_id, NEW.dish_id, dish_name_snapshot, NEW.rating_10, consensus_avg, user_deviation, is_early, user_bias_before, user_bias_after);

      INSERT INTO user_rating_stats (user_id, rating_bias, votes_with_consensus, votes_pending, dishes_helped_establish, bias_label)
      VALUES (NEW.user_id, user_bias_after, 1, -1, 0, get_bias_label(user_bias_after))
      ON CONFLICT (user_id) DO UPDATE SET
        rating_bias = user_bias_after,
        votes_with_consensus = user_rating_stats.votes_with_consensus + 1,
        votes_pending = GREATEST(0, user_rating_stats.votes_pending - 1),
        bias_label = get_bias_label(user_bias_after),
        updated_at = NOW();

      UPDATE user_rating_stats SET category_biases = jsonb_set(
        COALESCE(category_biases, '{}'::jsonb), ARRAY[NEW.category_snapshot],
        (SELECT to_jsonb(ROUND(AVG(votes.rating_10 - d.consensus_rating), 1))
         FROM votes JOIN dishes d ON votes.dish_id = d.id
         WHERE votes.user_id = NEW.user_id AND d.consensus_ready = TRUE
           AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL
           AND votes.category_snapshot = NEW.category_snapshot), TRUE)
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS consensus_check_trigger ON votes;
CREATE TRIGGER consensus_check_trigger AFTER INSERT ON votes FOR EACH ROW EXECUTE FUNCTION check_consensus_after_vote();

-- 10e. Update dish avg_rating on vote changes (source-weighted)
CREATE OR REPLACE FUNCTION update_dish_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dishes SET avg_rating = sub.avg_r, total_votes = sub.cnt
  FROM (
    SELECT
      ROUND(
        (SUM(rating_10 * CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
         NULLIF(SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)
        )::NUMERIC, 1
      ) AS avg_r,
      SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::BIGINT AS cnt
    FROM votes WHERE dish_id = COALESCE(NEW.dish_id, OLD.dish_id) AND rating_10 IS NOT NULL
  ) sub
  WHERE dishes.id = COALESCE(NEW.dish_id, OLD.dish_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_dish_rating_on_vote ON votes;
CREATE TRIGGER update_dish_rating_on_vote
  AFTER INSERT OR UPDATE OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION update_dish_avg_rating();

-- 10f. Compute value_score on dish insert/update
CREATE OR REPLACE FUNCTION compute_value_score()
RETURNS TRIGGER AS $$
DECLARE
  v_median DECIMAL;
BEGIN
  IF NEW.price IS NULL OR NEW.price <= 0 OR NEW.total_votes < 8 OR NEW.avg_rating IS NULL THEN
    NEW.value_score := NULL;
    NEW.category_median_price := NULL;
    RETURN NEW;
  END IF;

  SELECT median_price INTO v_median
  FROM category_median_prices
  WHERE category = NEW.category;

  IF v_median IS NULL THEN
    NEW.value_score := NULL;
    NEW.category_median_price := NULL;
    RETURN NEW;
  END IF;

  NEW.category_median_price := v_median;
  NEW.value_score := ROUND(
    ((0.50 * NEW.avg_rating + 0.50 * (NEW.avg_rating / LOG(GREATEST(NEW.price / v_median, 0.1) + 2))) * 10)::NUMERIC,
    2
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_compute_value_score ON dishes;
CREATE TRIGGER trigger_compute_value_score
  BEFORE INSERT OR UPDATE OF avg_rating, total_votes, price, category ON dishes
  FOR EACH ROW EXECUTE FUNCTION compute_value_score();

-- 10g. Batch recalculate value percentiles
CREATE OR REPLACE FUNCTION recalculate_value_percentiles()
RETURNS VOID AS $$
BEGIN
  UPDATE dishes d SET
    category_median_price = cmp.median_price,
    value_score = ROUND(
      ((0.50 * d.avg_rating + 0.50 * (d.avg_rating / LOG(GREATEST(d.price / cmp.median_price, 0.1) + 2))) * 10)::NUMERIC,
      2
    )
  FROM category_median_prices cmp
  WHERE cmp.category = d.category
    AND d.price IS NOT NULL AND d.price > 0
    AND d.total_votes >= 8
    AND d.avg_rating IS NOT NULL;

  UPDATE dishes SET value_score = NULL, value_percentile = NULL, category_median_price = NULL
  WHERE price IS NULL OR price <= 0 OR total_votes < 8 OR avg_rating IS NULL;

  UPDATE dishes d SET value_percentile = ranked.pct
  FROM (
    SELECT id,
      ROUND((PERCENT_RANK() OVER (PARTITION BY category ORDER BY value_score ASC) * 100)::NUMERIC, 2) AS pct
    FROM dishes
    WHERE value_score IS NOT NULL
      AND category IN (
        SELECT category FROM dishes WHERE value_score IS NOT NULL GROUP BY category HAVING COUNT(*) >= 8
      )
  ) ranked
  WHERE d.id = ranked.id;

  UPDATE dishes SET value_percentile = NULL
  WHERE value_score IS NOT NULL
    AND category NOT IN (
      SELECT category FROM dishes WHERE value_score IS NOT NULL GROUP BY category HAVING COUNT(*) >= 8
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10h. Jitter sample merge trigger
CREATE OR REPLACE FUNCTION merge_jitter_sample()
RETURNS TRIGGER AS $$
DECLARE
  existing_profile JSONB;
  new_sample JSONB;
  sample_count INTEGER;
  new_confidence TEXT;
  new_consistency DECIMAL(4, 3);
BEGIN
  new_sample := NEW.sample_data;

  SELECT profile_data, review_count INTO existing_profile, sample_count
  FROM jitter_profiles WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    INSERT INTO jitter_profiles (user_id, profile_data, review_count, confidence_level, consistency_score, last_updated)
    VALUES (
      NEW.user_id,
      new_sample,
      1,
      'low',
      0,
      NOW()
    );
  ELSE
    sample_count := sample_count + 1;

    IF sample_count >= 15 THEN
      new_confidence := 'high';
    ELSIF sample_count >= 5 THEN
      new_confidence := 'medium';
    ELSE
      new_confidence := 'low';
    END IF;

    new_consistency := 0;
    IF existing_profile ? 'mean_inter_key' AND new_sample ? 'mean_inter_key'
       AND (existing_profile->>'mean_inter_key')::DECIMAL > 0 THEN
      new_consistency := GREATEST(0, LEAST(1,
        1.0 - ABS(
          (new_sample->>'mean_inter_key')::DECIMAL - (existing_profile->>'mean_inter_key')::DECIMAL
        ) / (existing_profile->>'mean_inter_key')::DECIMAL
      ));
      IF (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) > 0 THEN
        new_consistency := (
          (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) *
          (sample_count - 1) + new_consistency
        ) / sample_count;
      END IF;
    END IF;

    UPDATE jitter_profiles SET
      profile_data = jsonb_build_object(
        'mean_inter_key', ROUND((
          COALESCE((existing_profile->>'mean_inter_key')::DECIMAL, 0) * (sample_count - 1) +
          COALESCE((new_sample->>'mean_inter_key')::DECIMAL, 0)
        ) / sample_count, 2),
        'std_inter_key', ROUND((
          COALESCE((existing_profile->>'std_inter_key')::DECIMAL, 0) * (sample_count - 1) +
          COALESCE((new_sample->>'std_inter_key')::DECIMAL, 0)
        ) / sample_count, 2),
        'mean_dwell', CASE
          WHEN new_sample ? 'mean_dwell' AND new_sample->>'mean_dwell' IS NOT NULL
          THEN ROUND((
            COALESCE((existing_profile->>'mean_dwell')::DECIMAL, (new_sample->>'mean_dwell')::DECIMAL) * (sample_count - 1) +
            (new_sample->>'mean_dwell')::DECIMAL
          ) / sample_count, 2)
          ELSE existing_profile->'mean_dwell'
        END,
        'std_dwell', CASE
          WHEN new_sample ? 'std_dwell' AND new_sample->>'std_dwell' IS NOT NULL
          THEN ROUND((
            COALESCE((existing_profile->>'std_dwell')::DECIMAL, (new_sample->>'std_dwell')::DECIMAL) * (sample_count - 1) +
            (new_sample->>'std_dwell')::DECIMAL
          ) / sample_count, 2)
          ELSE existing_profile->'std_dwell'
        END,
        'bigram_signatures', COALESCE(existing_profile->'bigram_signatures', '{}'::JSONB) ||
                             COALESCE(new_sample->'bigram_signatures', '{}'::JSONB),
        'fatigue_drift', new_sample->'fatigue_drift',
        'total_keystrokes', COALESCE((existing_profile->>'total_keystrokes')::INTEGER, 0) +
          COALESCE((new_sample->>'total_keystrokes')::INTEGER, 0)
      ),
      review_count = sample_count,
      confidence_level = new_confidence,
      consistency_score = ROUND(new_consistency::NUMERIC, 3),
      last_updated = NOW()
    WHERE user_id = NEW.user_id;
  END IF;

  DELETE FROM jitter_samples
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM jitter_samples
      WHERE user_id = NEW.user_id
      ORDER BY collected_at DESC
      LIMIT 30
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS jitter_sample_merge ON jitter_samples;
CREATE TRIGGER jitter_sample_merge
  AFTER INSERT ON jitter_samples
  FOR EACH ROW
  EXECUTE FUNCTION merge_jitter_sample();


