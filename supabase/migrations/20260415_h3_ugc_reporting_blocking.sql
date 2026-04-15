-- =============================================
-- H3 — UGC Reporting + Blocking
-- Apple Guideline 1.2 (hard gate for App Store submission)
-- =============================================
-- Spec: docs/superpowers/specs/2026-04-15-h3-ugc-reporting-blocking.md (v3.2)
-- Reviewed: Codex gpt-5.4 x3 rounds — shipped with verdict "ship"
--
-- Deploy: Run this entire file in Supabase SQL Editor. Idempotent where
-- possible (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE).
-- =============================================


-- ---------------------------------------------
-- 1. TABLES
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_type TEXT NOT NULL
    CHECK (reported_type IN ('dish', 'review', 'photo', 'user')),
  reported_id UUID NOT NULL,
  -- Denormalized author of reported content. Null only when the content has
  -- no author (dish with NULL created_by). Populated by submit_report RPC.
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'spam', 'hate_speech', 'harassment', 'misinformation',
      'inappropriate_content', 'impersonation', 'other'
    )),
  details TEXT CHECK (details IS NULL OR length(details) <= 500),
  -- Evidence snapshot at report time; shape varies per reported_type.
  target_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique on active statuses — re-report allowed after dismissal,
-- audit trail preserved (no DELETE).
CREATE UNIQUE INDEX IF NOT EXISTS reports_active_unique_idx
  ON reports (reporter_id, reported_type, reported_id)
  WHERE status IN ('open', 'reviewed', 'actioned');

CREATE INDEX IF NOT EXISTS reports_queue_idx
  ON reports (created_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS reports_by_target_user_idx
  ON reports (reported_user_id, created_at DESC)
  WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_by_reporter_idx
  ON reports (reporter_id, created_at DESC);


CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);


-- ---------------------------------------------
-- 2. HELPER FUNCTION — is_blocked_pair
-- Self-restricting: returns TRUE only when caller IS p_viewer (or is
-- service_role). Safe to GRANT to anon + authenticated because the body
-- gates via auth.uid() equality.
-- ---------------------------------------------

CREATE OR REPLACE FUNCTION is_blocked_pair(p_viewer UUID, p_subject UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_viewer IS NOT NULL
    AND p_subject IS NOT NULL
    AND (
      p_viewer = (select auth.uid())
      OR auth.role() = 'service_role'
    )
    AND EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = p_viewer AND blocked_id = p_subject)
         OR (blocker_id = p_subject AND blocked_id = p_viewer)
    );
$$;

REVOKE EXECUTE ON FUNCTION is_blocked_pair(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION is_blocked_pair(UUID, UUID) TO anon, authenticated;


-- ---------------------------------------------
-- 3. RLS — new tables
-- ---------------------------------------------

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Reports: admin-only SELECT. Reporter reads via get_my_reports RPC.
DROP POLICY IF EXISTS "reports_select_admin" ON reports;
CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE USING (is_admin());

-- No INSERT policy — submissions via submit_report RPC (SECURITY DEFINER)
-- No DELETE — audit trail preserved

-- Blocks: users read own, no direct INSERT/DELETE (via RPCs)
DROP POLICY IF EXISTS "user_blocks_select_own" ON user_blocks;
CREATE POLICY "user_blocks_select_own" ON user_blocks
  FOR SELECT USING ((select auth.uid()) = blocker_id);


-- ---------------------------------------------
-- 4. RLS — existing tables tightened for block filter
-- ---------------------------------------------

-- follows: SELECT hides rows where either participant is blocked by viewer
DROP POLICY IF EXISTS "follows_select_public" ON follows;
DROP POLICY IF EXISTS "follows_select_not_blocked" ON follows;
CREATE POLICY "follows_select_not_blocked" ON follows
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR (
      NOT is_blocked_pair((select auth.uid()), follower_id)
      AND NOT is_blocked_pair((select auth.uid()), followed_id)
    )
  );

-- follows: INSERT rejects if a block exists either direction
DROP POLICY IF EXISTS "follows_insert_own" ON follows;
DROP POLICY IF EXISTS "follows_insert_own_not_blocked" ON follows;
CREATE POLICY "follows_insert_own_not_blocked" ON follows
  FOR INSERT WITH CHECK (
    (select auth.uid()) = follower_id
    AND NOT is_blocked_pair((select auth.uid()), followed_id)
  );

-- dish_photos: SELECT excludes rows authored by blocked users
DROP POLICY IF EXISTS "Public read access" ON dish_photos;
DROP POLICY IF EXISTS "dish_photos_select_not_blocked" ON dish_photos;
CREATE POLICY "dish_photos_select_not_blocked" ON dish_photos
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR NOT is_blocked_pair((select auth.uid()), user_id)
  );


-- ---------------------------------------------
-- 5. public_votes VIEW — embed block filter
-- This view is the primary surface dish detail uses for reviews.
-- ---------------------------------------------

CREATE OR REPLACE VIEW public_votes AS
SELECT
  id, dish_id, rating_10, review_text, review_created_at, user_id, source
FROM votes
WHERE auth.uid() IS NULL
   OR NOT is_blocked_pair(auth.uid(), user_id);


-- ---------------------------------------------
-- 6. WRITE RPCs
-- ---------------------------------------------

-- submit_report — validate cheap → resolve target → self-check → rate limit → insert
CREATE OR REPLACE FUNCTION submit_report(
  p_reported_type TEXT,
  p_reported_id UUID,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter_id UUID;
  v_reported_user_id UUID;
  v_target_exists BOOLEAN;
  v_snapshot JSONB;
  v_rate_limit JSONB;
  v_report_id UUID;
BEGIN
  v_reporter_id := (select auth.uid());
  IF v_reporter_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Cheap validation first (no quota burn on invalid inputs)
  IF p_reported_type NOT IN ('dish', 'review', 'photo', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reported_type');
  END IF;

  IF p_reason NOT IN ('spam','hate_speech','harassment','misinformation',
                      'inappropriate_content','impersonation','other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reason');
  END IF;

  IF p_details IS NOT NULL AND length(p_details) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details too long (max 500 chars)');
  END IF;

  -- Resolve target + build snapshot
  CASE p_reported_type
    WHEN 'dish' THEN
      SELECT
        d.created_by,
        jsonb_build_object(
          'dish_name', d.name,
          'restaurant_name', r.name,
          'category', d.category
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dishes d
      LEFT JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = p_reported_id;

    WHEN 'review' THEN
      -- votes.user_id is NOT NULL; NULL means row not found
      SELECT v.user_id,
        jsonb_build_object(
          'review_text', v.review_text,
          'rating_10', v.rating_10,
          'dish_id', v.dish_id,
          'dish_name', d.name,
          'author_name', p.display_name
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM votes v
      LEFT JOIN dishes d ON d.id = v.dish_id
      LEFT JOIN profiles p ON p.id = v.user_id
      WHERE v.id = p_reported_id;

    WHEN 'photo' THEN
      SELECT dp.user_id,
        jsonb_build_object(
          'photo_url', dp.photo_url,
          'dish_id', dp.dish_id,
          'dish_name', d.name,
          'author_name', p.display_name
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dish_photos dp
      LEFT JOIN dishes d ON d.id = dp.dish_id
      LEFT JOIN profiles p ON p.id = dp.user_id
      WHERE dp.id = p_reported_id;

    WHEN 'user' THEN
      SELECT p.id,
        jsonb_build_object(
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM profiles p
      WHERE p.id = p_reported_id;
  END CASE;

  IF v_target_exists IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reported content not found');
  END IF;

  -- Self-check (v_reported_user_id may be null for orphan dishes)
  IF v_reported_user_id IS NOT NULL AND v_reported_user_id = v_reporter_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot report your own content');
  END IF;

  -- Rate limit LAST — only burn quota on otherwise-valid submissions
  v_rate_limit := check_and_record_rate_limit('report', 10, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO reports (
    reporter_id, reported_type, reported_id, reported_user_id,
    reason, details, target_snapshot
  ) VALUES (
    v_reporter_id, p_reported_type, p_reported_id, v_reported_user_id,
    p_reason, NULLIF(TRIM(p_details), ''), v_snapshot
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'You already reported this. Our team is reviewing it.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;


-- block_user — atomic: block row + follow cleanup + notification cleanup
CREATE OR REPLACE FUNCTION block_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocker_id UUID;
  v_rate_limit JSONB;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF v_blocker_id = p_blocked_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block yourself');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_blocked_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_rate_limit := check_and_record_rate_limit('block', 30, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id)
  VALUES (v_blocker_id, p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  -- Follow cleanup both directions
  DELETE FROM follows
  WHERE (follower_id = v_blocker_id AND followed_id = p_blocked_id)
     OR (follower_id = p_blocked_id AND followed_id = v_blocker_id);

  -- Notification cleanup between these two users
  DELETE FROM notifications
  WHERE (user_id = v_blocker_id AND (data->>'follower_id') = p_blocked_id::text)
     OR (user_id = p_blocked_id AND (data->>'follower_id') = v_blocker_id::text);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION block_user(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_blocker_id UUID;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM user_blocks
  WHERE blocker_id = v_blocker_id AND blocked_id = p_blocked_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION unblock_user(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;


-- review_report — admin sets status + reviewed_by + reviewed_at + notes
CREATE OR REPLACE FUNCTION review_report(
  p_report_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := (select auth.uid());
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_action NOT IN ('reviewed', 'dismissed', 'actioned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE reports
  SET status = p_action,
      reviewed_by = v_admin,
      reviewed_at = NOW(),
      reviewer_notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------
-- 7. READ RPCs
-- ---------------------------------------------

CREATE OR REPLACE FUNCTION get_my_blocks()
RETURNS TABLE (
  blocked_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  blocked_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ub.blocked_id, p.display_name, p.avatar_url, ub.created_at
  FROM user_blocks ub
  LEFT JOIN profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = (select auth.uid())
  ORDER BY ub.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_blocks() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_blocks() TO authenticated;


CREATE OR REPLACE FUNCTION get_my_reports()
RETURNS TABLE (
  report_id UUID,
  reported_type TEXT,
  reported_id UUID,
  reason TEXT,
  details TEXT,
  target_snapshot JSONB,
  status TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.reported_type, r.reported_id, r.reason, r.details,
         r.target_snapshot, r.status, r.created_at, r.reviewed_at
  FROM reports r
  WHERE r.reporter_id = (select auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_reports() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_reports() TO authenticated;


CREATE OR REPLACE FUNCTION get_open_reports(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  report_id UUID,
  reporter_id UUID,
  reporter_name TEXT,
  reported_type TEXT,
  reported_id UUID,
  reported_user_id UUID,
  reported_user_name TEXT,
  reason TEXT,
  details TEXT,
  target_snapshot JSONB,
  created_at TIMESTAMPTZ,
  target_user_open_report_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  p_limit := LEAST(GREATEST(p_limit, 1), 200);
  p_offset := GREATEST(p_offset, 0);

  RETURN QUERY
  SELECT
    r.id, r.reporter_id, rp.display_name,
    r.reported_type, r.reported_id, r.reported_user_id, up.display_name,
    r.reason, r.details, r.target_snapshot, r.created_at,
    COALESCE((
      SELECT COUNT(*) FROM reports r2
      WHERE r2.reported_user_id = r.reported_user_id AND r2.status = 'open'
    ), 0) AS target_user_open_report_count
  FROM reports r
  LEFT JOIN profiles rp ON rp.id = r.reporter_id
  LEFT JOIN profiles up ON up.id = r.reported_user_id
  WHERE r.status = 'open'
  ORDER BY target_user_open_report_count DESC, r.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_open_reports(INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_open_reports(INT, INT) TO authenticated;


-- ---------------------------------------------
-- 8. UPDATED RPCs — block-aware filters
-- ---------------------------------------------

-- get_ranked_dishes — only the best_photos CTE changes; vote aggregation stays global
CREATE OR REPLACE FUNCTION get_ranked_dishes(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_miles INT DEFAULT 50,
  filter_category TEXT DEFAULT NULL,
  filter_town TEXT DEFAULT NULL
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_town TEXT,
  category TEXT,
  tags TEXT[],
  cuisine TEXT,
  price DECIMAL,
  photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  distance_miles DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  value_score DECIMAL,
  value_percentile DECIMAL,
  search_score DECIMAL,
  featured_photo_url TEXT,
  restaurant_lat DECIMAL,
  restaurant_lng DECIMAL,
  restaurant_address TEXT,
  restaurant_phone TEXT,
  restaurant_website_url TEXT,
  toast_slug TEXT,
  order_url TEXT
) AS $$
DECLARE
  lat_delta DECIMAL := radius_miles / 69.0;
  lng_delta DECIMAL := radius_miles / (69.0 * COS(RADIANS(user_lat)));
BEGIN
  RETURN QUERY
  WITH global_stats AS (
    SELECT COALESCE(AVG(dishes.avg_rating), 7.0) AS global_mean
    FROM dishes
    WHERE dishes.total_votes > 0 AND dishes.avg_rating IS NOT NULL
  ),
  nearby_restaurants AS (
    SELECT r.id, r.name, r.town, r.lat, r.lng, r.cuisine,
           r.address, r.phone, r.website_url, r.toast_slug, r.order_url
    FROM restaurants r
    WHERE r.is_open = true
      AND r.lat BETWEEN (user_lat - lat_delta) AND (user_lat + lat_delta)
      AND r.lng BETWEEN (user_lng - lng_delta) AND (user_lng + lng_delta)
      AND (filter_town IS NULL OR r.town = filter_town)
  ),
  restaurants_with_distance AS (
    SELECT
      nr.id, nr.name, nr.town, nr.lat, nr.lng, nr.cuisine,
      nr.address, nr.phone, nr.website_url, nr.toast_slug, nr.order_url,
      ROUND((
        3959 * ACOS(
          LEAST(1.0, GREATEST(-1.0,
            COS(RADIANS(user_lat)) * COS(RADIANS(nr.lat)) *
            COS(RADIANS(nr.lng) - RADIANS(user_lng)) +
            SIN(RADIANS(user_lat)) * SIN(RADIANS(nr.lat))
          ))
        )
      )::NUMERIC, 2) AS distance
    FROM nearby_restaurants nr
  ),
  filtered_restaurants AS (
    SELECT * FROM restaurants_with_distance WHERE distance <= radius_miles
  ),
  variant_stats AS (
    SELECT
      d.parent_dish_id,
      COUNT(DISTINCT d.id)::INT AS child_count,
      SUM(COALESCE(ds.vote_count, 0))::NUMERIC AS total_child_votes
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS vote_count
      FROM votes v GROUP BY v.dish_id
    ) ds ON ds.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id
  ),
  best_variants AS (
    SELECT DISTINCT ON (d.parent_dish_id)
      d.parent_dish_id,
      d.name AS best_name,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS best_rating
    FROM dishes d
    LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id, d.id, d.name
    HAVING COUNT(v.id) >= 1
    ORDER BY d.parent_dish_id, AVG(v.rating_10) DESC NULLS LAST, COUNT(v.id) DESC
  ),
  recent_vote_counts AS (
    SELECT votes.dish_id, COUNT(*)::INT AS recent_votes
    FROM votes
    WHERE votes.created_at > NOW() - INTERVAL '14 days'
    GROUP BY votes.dish_id
  ),
  best_photos AS (
    -- H3: exclude photos authored by users blocked by the viewer
    SELECT DISTINCT ON (dp.dish_id)
      dp.dish_id,
      dp.photo_url
    FROM dish_photos dp
    INNER JOIN dishes d2 ON dp.dish_id = d2.id
    INNER JOIN filtered_restaurants fr2 ON d2.restaurant_id = fr2.id
    WHERE dp.status IN ('featured', 'community')
      AND d2.parent_dish_id IS NULL
      AND NOT is_blocked_pair((select auth.uid()), dp.user_id)
    ORDER BY dp.dish_id,
      CASE dp.source_type WHEN 'restaurant' THEN 0 ELSE 1 END,
      CASE dp.status WHEN 'featured' THEN 0 ELSE 1 END,
      dp.quality_score DESC NULLS LAST,
      dp.created_at DESC
  )
  SELECT
    d.id AS dish_id,
    d.name AS dish_name,
    fr.id AS restaurant_id,
    fr.name AS restaurant_name,
    fr.town AS restaurant_town,
    d.category,
    d.tags,
    fr.cuisine,
    d.price,
    d.photo_url,
    COALESCE(vs.total_child_votes,
      SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)
    )::BIGINT AS total_votes,
    COALESCE(ROUND(
      (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                ELSE 0 END) /
       NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                       WHEN v.source = 'ai_estimated' THEN 0.5
                       ELSE 0 END), 0)
      )::NUMERIC, 1), 0) AS avg_rating,
    fr.distance AS distance_miles,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_name AS best_variant_name,
    bv.best_rating AS best_variant_rating,
    d.value_score,
    d.value_percentile,
    dish_search_score(
      COALESCE(ROUND(
        (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                  WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                  ELSE 0 END) /
         NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                         WHEN v.source = 'ai_estimated' THEN 0.5
                         ELSE 0 END), 0)
        )::NUMERIC, 1), 0),
      COALESCE(vs.total_child_votes,
        SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::NUMERIC,
      fr.distance,
      COALESCE(rvc.recent_votes, 0),
      (SELECT global_mean FROM global_stats)
    ) AS search_score,
    bp.photo_url AS featured_photo_url,
    fr.lat AS restaurant_lat,
    fr.lng AS restaurant_lng,
    fr.address AS restaurant_address,
    fr.phone AS restaurant_phone,
    fr.website_url AS restaurant_website_url,
    fr.toast_slug,
    fr.order_url
  FROM dishes d
  INNER JOIN filtered_restaurants fr ON d.restaurant_id = fr.id
  LEFT JOIN votes v ON d.id = v.dish_id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN recent_vote_counts rvc ON rvc.dish_id = d.id
  LEFT JOIN best_photos bp ON bp.dish_id = d.id
  WHERE (filter_category IS NULL OR d.category = filter_category)
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, fr.id, fr.name, fr.town, d.category, d.tags, fr.cuisine,
           d.price, d.photo_url, fr.distance, fr.lat, fr.lng,
           fr.address, fr.phone, fr.website_url, fr.toast_slug, fr.order_url,
           vs.total_child_votes, vs.child_count,
           bv.best_name, bv.best_rating,
           d.value_score, d.value_percentile,
           rvc.recent_votes,
           bp.photo_url
  ORDER BY search_score DESC NULLS LAST, total_votes DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- get_smart_snippet — exclude reviews by blocked users
CREATE OR REPLACE FUNCTION get_smart_snippet(p_dish_id UUID)
RETURNS TABLE (
  review_text TEXT,
  rating_10 DECIMAL,
  display_name TEXT,
  user_id UUID,
  review_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE v_viewer_id UUID := (select auth.uid());
BEGIN
  RETURN QUERY
  SELECT v.review_text, v.rating_10, p.display_name, v.user_id, v.review_created_at
  FROM votes v
  INNER JOIN profiles p ON v.user_id = p.id
  WHERE v.dish_id = p_dish_id
    AND v.review_text IS NOT NULL AND v.review_text != ''
    AND (v_viewer_id IS NULL OR NOT is_blocked_pair(v_viewer_id, v.user_id))
  ORDER BY
    CASE WHEN v.rating_10 >= 9 THEN 0 ELSE 1 END,
    v.rating_10 DESC NULLS LAST,
    v.review_created_at DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- get_friends_votes_for_dish — caller guard + block filter
CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.display_name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END AS category_expertise
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id AND v.dish_id = p_dish_id
  JOIN dishes d ON d.id = p_dish_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY v.created_at DESC;
END;
$$;


-- get_friends_votes_for_restaurant — caller guard + block filter
CREATE OR REPLACE FUNCTION get_friends_votes_for_restaurant(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  dish_id UUID,
  dish_name TEXT,
  rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.display_name, d.id, d.name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY d.name, v.created_at DESC;
END;
$$;


-- get_taste_compatibility — caller guard + block short-circuit
CREATE OR REPLACE FUNCTION get_taste_compatibility(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS TABLE (
  shared_dishes INT,
  avg_difference DECIMAL(3, 1),
  compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF is_blocked_pair(p_user_id, p_other_user_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH shared AS (
    SELECT a.rating_10 AS rating_a, b.rating_10 AS rating_b
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
    WHERE a.user_id = p_user_id AND b.user_id = p_other_user_id
      AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
  )
  SELECT
    COUNT(*)::INT,
    ROUND(AVG(ABS(rating_a - rating_b))::NUMERIC, 1),
    CASE
      WHEN COUNT(*) >= 3 THEN ROUND((100 - (AVG(ABS(rating_a - rating_b))::NUMERIC / 9.0 * 100)))::INT
      ELSE NULL
    END
  FROM shared;
END;
$$;


-- get_similar_taste_users — caller guard + block filter (full rewrite to plpgsql)
CREATE OR REPLACE FUNCTION get_similar_taste_users(
  p_user_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  shared_dishes INT,
  compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT b.user_id AS other_id,
           COUNT(*)::INT AS shared,
           ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT AS compat
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
      AND b.user_id != p_user_id
      AND b.rating_10 IS NOT NULL
    WHERE a.user_id = p_user_id AND a.rating_10 IS NOT NULL
    GROUP BY b.user_id
    HAVING COUNT(*) >= 3
  )
  SELECT c.other_id, p.display_name, c.shared, c.compat
  FROM candidates c
  JOIN profiles p ON p.id = c.other_id
  WHERE NOT EXISTS (
    SELECT 1 FROM follows f
    WHERE f.follower_id = p_user_id AND f.followed_id = c.other_id
  )
  AND NOT is_blocked_pair(p_user_id, c.other_id)
  ORDER BY c.compat DESC, c.shared DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) TO authenticated;


-- get_category_experts — block filter inline
CREATE OR REPLACE FUNCTION get_category_experts(
  p_category TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  badge_tier TEXT,
  follower_count BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (ub.user_id)
    ub.user_id, p.display_name,
    CASE WHEN b.key LIKE 'authority_%' THEN 'authority' ELSE 'specialist' END AS badge_tier,
    COALESCE(fc.cnt, 0) AS follower_count
  FROM user_badges ub
  JOIN badges b ON ub.badge_key = b.key
  JOIN profiles p ON ub.user_id = p.id
  LEFT JOIN (SELECT followed_id, COUNT(*) AS cnt FROM follows GROUP BY followed_id) fc
    ON fc.followed_id = ub.user_id
  WHERE b.category = p_category AND b.family = 'category'
    AND (
      (select auth.uid()) IS NULL
      OR NOT is_blocked_pair((select auth.uid()), ub.user_id)
    )
  ORDER BY ub.user_id,
    CASE WHEN b.key LIKE 'authority_%' THEN 0 ELSE 1 END,
    COALESCE(fc.cnt, 0) DESC
  LIMIT p_limit;
$$;


-- get_local_lists_for_homepage — filter uses auth.uid(), NOT p_viewer_id
-- (p_viewer_id kept for compatibility_pct calculation only)
CREATE OR REPLACE FUNCTION get_local_lists_for_homepage(p_viewer_id UUID DEFAULT NULL)
RETURNS TABLE (
  list_id UUID,
  user_id UUID,
  title TEXT,
  description TEXT,
  display_name TEXT,
  avatar_url TEXT,
  curator_tagline TEXT,
  item_count INT,
  preview_dishes TEXT[],
  compatibility_pct INT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.id AS list_id,
    ll.user_id,
    ll.title,
    ll.description,
    p.display_name,
    p.avatar_url,
    ll.curator_tagline,
    (SELECT COUNT(*)::INT FROM local_list_items WHERE list_id = ll.id) AS item_count,
    (SELECT ARRAY_AGG(d.name ORDER BY li."position")
     FROM local_list_items li
     JOIN dishes d ON d.id = li.dish_id
     WHERE li.list_id = ll.id AND li."position" <= 4) AS preview_dishes,
    CASE
      WHEN p_viewer_id IS NOT NULL AND p_viewer_id != ll.user_id THEN (
        SELECT CASE
          WHEN COUNT(*) >= 3 THEN ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT
          ELSE NULL
        END
        FROM votes a
        JOIN votes b ON a.dish_id = b.dish_id
        WHERE a.user_id = p_viewer_id AND b.user_id = ll.user_id
          AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
      )
      ELSE NULL
    END AS compatibility_pct
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  WHERE ll.is_active = true
    AND (
      (select auth.uid()) IS NULL
      OR NOT is_blocked_pair((select auth.uid()), ll.user_id)
    )
  ORDER BY RANDOM()
  LIMIT 8;
$$;


-- get_local_list_by_user — return empty when viewer blocked the target curator
CREATE OR REPLACE FUNCTION get_local_list_by_user(target_user_id UUID)
RETURNS TABLE (
  list_id UUID,
  title TEXT,
  description TEXT,
  user_id UUID,
  display_name TEXT,
  "position" INT,
  dish_id UUID,
  dish_name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  avg_rating NUMERIC,
  total_votes INT,
  category TEXT,
  note TEXT,
  restaurant_lat FLOAT,
  restaurant_lng FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.id AS list_id,
    ll.title,
    ll.description,
    ll.user_id,
    p.display_name,
    li."position",
    d.id AS dish_id,
    d.name AS dish_name,
    r.name AS restaurant_name,
    r.id AS restaurant_id,
    d.avg_rating,
    d.total_votes,
    d.category,
    li.note,
    r.lat AS restaurant_lat,
    r.lng AS restaurant_lng
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  JOIN local_list_items li ON li.list_id = ll.id
  JOIN dishes d ON d.id = li.dish_id
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = target_user_id
    AND ll.is_active = true
    AND (
      (select auth.uid()) IS NULL
      OR NOT is_blocked_pair((select auth.uid()), target_user_id)
    )
  ORDER BY li."position";
$$;


-- ---------------------------------------------
-- End of migration. Run verification queries from spec after applying.
-- ---------------------------------------------
