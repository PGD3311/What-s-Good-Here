-- 2026-05-25 — Check-ins v1
--
-- Adds the check_ins + check_in_dishes tables, RLS, and the submit/delete/get
-- RPCs that back the native-iOS "I've been here" feature. Spec:
-- docs/superpowers/specs/2026-05-25-check-ins-v1-spec.md
--
-- Replay-safe: all CREATE TABLE / CREATE INDEX use IF NOT EXISTS, and the
-- RPCs use CREATE OR REPLACE FUNCTION. Re-running the migration is a no-op
-- once it's been applied.

BEGIN;

-- =====================================================================
-- 1. Tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('live', 'logged')),

  -- Live: server-set to NOW(). Logged: client-supplied past timestamp.
  visited_at TIMESTAMPTZ NOT NULL,

  -- Only set for kind='live'. Useful for the v3 places-been map (sub-restaurant
  -- precision: street vs dock vs upstairs bar) and for proximity-threshold
  -- forensics if we tune the 150m gate later.
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- The distance the server computed at insert time for live check-ins.
  -- Lets us audit fraud or threshold drift without re-querying restaurant
  -- coordinates that may have moved.
  distance_m_at_checkin DOUBLE PRECISION,

  -- Optional free-text. 280-char hard cap in the RPC (UI also enforces).
  note TEXT,

  -- Future-proofing: lets us distinguish a manual entry from an auto-GPS
  -- live, an admin import, or a backfill. Mirrors votes.source semantics.
  source TEXT NOT NULL DEFAULT 'user_manual'
    CHECK (source IN ('user_manual', 'gps_live', 'admin_import', 'backfill')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS check_in_dishes (
  check_in_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  PRIMARY KEY (check_in_id, dish_id)
);

-- =====================================================================
-- 2. Indexes
-- =====================================================================

-- Supports the 1-hour live-dedupe lookup in submit_check_in AND scopes
-- the index small (only live rows). The NOW()-in-partial-predicate
-- attempt was rejected by Postgres, so the dedupe check moved into the
-- RPC body — this index just keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_check_ins_user_restaurant_live
  ON check_ins (user_id, restaurant_id, visited_at DESC)
  WHERE kind = 'live';

CREATE INDEX IF NOT EXISTS idx_check_ins_user_visited
  ON check_ins (user_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_check_ins_restaurant
  ON check_ins (restaurant_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_check_in_dishes_dish
  ON check_in_dishes (dish_id);

-- =====================================================================
-- 3. RLS
-- =====================================================================

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_dishes ENABLE ROW LEVEL SECURITY;

-- Read: own check-ins always; check-ins of "public" users (display_name set)
-- with block-list filtering. Mirrors profiles_select_public_or_own so a
-- restricted-profile user's check-ins aren't world-readable.
DROP POLICY IF EXISTS check_ins_select_own_or_public ON check_ins;
CREATE POLICY check_ins_select_own_or_public ON check_ins
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = check_ins.user_id
          AND p.display_name IS NOT NULL
      )
      AND (
        (select auth.uid()) IS NULL
        OR NOT is_blocked_pair((select auth.uid()), check_ins.user_id)
      )
    )
  );

DROP POLICY IF EXISTS check_ins_insert_own ON check_ins;
CREATE POLICY check_ins_insert_own ON check_ins
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS check_ins_delete_own ON check_ins;
CREATE POLICY check_ins_delete_own ON check_ins
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- check_in_dishes inherits visibility through its parent check_in. The
-- WITH CHECK clause requires the parent to belong to the caller, so a
-- viewer can't INSERT join-rows onto someone else's check-in.
DROP POLICY IF EXISTS check_in_dishes_via_check_in ON check_in_dishes;
CREATE POLICY check_in_dishes_via_check_in ON check_in_dishes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.id = check_in_dishes.check_in_id
        AND (
          ci.user_id = (select auth.uid())
          OR (
            EXISTS (
              SELECT 1 FROM profiles p
              WHERE p.id = ci.user_id
                AND p.display_name IS NOT NULL
            )
            AND (
              (select auth.uid()) IS NULL
              OR NOT is_blocked_pair((select auth.uid()), ci.user_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.id = check_in_dishes.check_in_id
        AND ci.user_id = (select auth.uid())
    )
  );

-- =====================================================================
-- 4. RPCs
-- =====================================================================

-- 4.1 submit_check_in: live + logged in one entry point. Distance check,
-- 1h dedupe, dish-tag validation, canonical rate limit.
CREATE OR REPLACE FUNCTION submit_check_in(
  p_restaurant_id UUID,
  p_kind TEXT,
  p_visited_at TIMESTAMPTZ DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_dish_ids UUID[] DEFAULT NULL
)
RETURNS check_ins AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_visited_at TIMESTAMPTZ;
  v_distance_m DOUBLE PRECISION;
  v_persist_distance DOUBLE PRECISION;
  v_source TEXT;
  v_rate JSONB;
  v_check_in check_ins;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_kind NOT IN ('live', 'logged') THEN
    RAISE EXCEPTION 'kind must be live or logged';
  END IF;

  IF p_note IS NOT NULL AND length(p_note) > 280 THEN
    RAISE EXCEPTION 'note exceeds 280 chars';
  END IF;

  v_rate := check_and_record_rate_limit('check_in', 20, 3600);
  IF NOT (v_rate->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'rate_limit: %', v_rate->>'message';
  END IF;

  IF p_kind = 'live' THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'live check-in requires lat/lng';
    END IF;

    -- Inline haversine. The codebase has no haversine_meters helper;
    -- existing nearby queries inline the same 6371000 * ACOS(...) form.
    -- GREATEST(-1.0, LEAST(1.0, ...)) clamps the inner expression to
    -- ACOS's valid domain — floating-point rounding can push it slightly
    -- above 1.0 or below -1.0, both of which would yield NaN.
    SELECT 6371000 * ACOS(
             GREATEST(-1.0, LEAST(1.0,
               COS(RADIANS(p_lat)) * COS(RADIANS(r.lat))
                 * COS(RADIANS(r.lng) - RADIANS(p_lng))
                 + SIN(RADIANS(p_lat)) * SIN(RADIANS(r.lat))
             ))
           )
      INTO v_distance_m
      FROM restaurants r WHERE r.id = p_restaurant_id;

    IF v_distance_m IS NULL THEN
      RAISE EXCEPTION 'restaurant not found';
    END IF;

    IF v_distance_m > 150 THEN
      RAISE EXCEPTION 'too far from restaurant for live check-in (%sm)', round(v_distance_m::numeric, 0);
    END IF;

    -- Advisory lock keyed on (user_id, restaurant_id) closes the race
    -- where two concurrent live submits could both pass the EXISTS check
    -- before either inserts. pg_advisory_xact_lock auto-releases at
    -- COMMIT/ROLLBACK. hashtextextended(user_id::text||restaurant_id::text)
    -- gives a stable 64-bit key per (user, restaurant) pair.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || p_restaurant_id::text, 0)
    );

    IF EXISTS (
      SELECT 1 FROM check_ins
      WHERE user_id = v_user_id
        AND restaurant_id = p_restaurant_id
        AND kind = 'live'
        AND visited_at > NOW() - INTERVAL '1 hour'
    ) THEN
      RAISE EXCEPTION 'duplicate: live check-in for this restaurant in the last hour';
    END IF;

    v_visited_at := NOW();
    v_persist_distance := v_distance_m;
    v_source := 'gps_live';
  ELSE
    IF p_visited_at IS NULL THEN
      RAISE EXCEPTION 'logged check-in requires visited_at';
    END IF;
    IF p_visited_at > NOW() THEN
      RAISE EXCEPTION 'visited_at cannot be in the future';
    END IF;
    v_visited_at := p_visited_at;
    v_persist_distance := NULL;
    v_source := 'user_manual';
  END IF;

  INSERT INTO check_ins (
    user_id, restaurant_id, kind, visited_at, lat, lng,
    distance_m_at_checkin, note, source
  )
  VALUES (
    v_user_id, p_restaurant_id, p_kind, v_visited_at,
    CASE WHEN p_kind = 'live' THEN p_lat END,
    CASE WHEN p_kind = 'live' THEN p_lng END,
    v_persist_distance,
    p_note,
    v_source
  )
  RETURNING * INTO v_check_in;

  -- Set-based dish tagging. The JOIN to dishes filters out dish_ids that
  -- don't belong to this restaurant so callers can't tag a stranger's
  -- menu by ID. ON CONFLICT silently drops duplicates in the input array.
  IF p_dish_ids IS NOT NULL AND array_length(p_dish_ids, 1) > 0 THEN
    INSERT INTO check_in_dishes (check_in_id, dish_id)
    SELECT v_check_in.id, d.id
    FROM dishes d
    JOIN unnest(p_dish_ids) AS x(id) ON x.id = d.id
    WHERE d.restaurant_id = p_restaurant_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_check_in;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION submit_check_in(UUID, TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID[]) TO authenticated;

-- 4.2 delete_check_in: returns true if a row was removed (i.e. owned by
-- the caller). RLS would already block other-owner deletes, but
-- returning a boolean makes optimistic-update rollback cleaner client-side.
CREATE OR REPLACE FUNCTION delete_check_in(p_check_in_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := (select auth.uid());
  v_deleted INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM check_ins
  WHERE id = p_check_in_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION delete_check_in(UUID) TO authenticated;

-- 4.3 get_user_check_ins: most-recent first, with restaurant denorm so the
-- client renders without a second round-trip. auth.uid() inside a
-- SECURITY DEFINER function returns the calling user's JWT subject (same
-- pattern as get_friends_votes_for_dish, etc.) — confirmed not the
-- function-owner identity.
CREATE OR REPLACE FUNCTION get_user_check_ins(p_user_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_town TEXT,
  kind TEXT,
  visited_at TIMESTAMPTZ,
  note TEXT,
  dish_count INT
) AS $$
  SELECT
    ci.id,
    ci.restaurant_id,
    r.name,
    r.town,
    ci.kind,
    ci.visited_at,
    ci.note,
    COALESCE(
      (SELECT COUNT(*) FROM check_in_dishes cid WHERE cid.check_in_id = ci.id)::INT,
      0
    )
  FROM check_ins ci
  JOIN restaurants r ON r.id = ci.restaurant_id
  WHERE ci.user_id = p_user_id
    AND (
      ci.user_id = (select auth.uid())
      OR (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = p_user_id AND p.display_name IS NOT NULL
        )
        AND (
          (select auth.uid()) IS NULL
          OR NOT is_blocked_pair((select auth.uid()), p_user_id)
        )
      )
    )
  ORDER BY ci.visited_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_user_check_ins(UUID, INT) TO anon, authenticated;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS get_user_check_ins(UUID, INT);
-- DROP FUNCTION IF EXISTS delete_check_in(UUID);
-- DROP FUNCTION IF EXISTS submit_check_in(UUID, TEXT, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, UUID[]);
-- DROP TABLE IF EXISTS check_in_dishes;
-- DROP TABLE IF EXISTS check_ins;
-- COMMIT;
--
-- Note: rollback drops all check-ins. There is no SQL recovery for
-- user-submitted notes/dish-tags lost in the drop — restore from the
-- pre-migration Supabase backup if you need them back.
