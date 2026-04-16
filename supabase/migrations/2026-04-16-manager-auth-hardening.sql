-- =============================================================
-- Manager Auth Hardening (2026-04-16)
-- =============================================================
-- Codex audit surfaced three holes in the restaurant manager portal:
--
--   1. Managers could not actually UPDATE their own restaurants or DELETE
--      their own dishes — the UI promised these actions but RLS was admin-only.
--      Result: silent-failing buttons in /manage.
--
--   2. RLS allowed row-scoped updates on dishes/specials/events, but had
--      no column-level protection. A manager could open DevTools and write
--      directly to computed fields like avg_rating, consensus_rating,
--      weighted_vote_count, or to promotion flags like is_promoted.
--
--   3. RLS UPDATE policies on dishes/specials/events had USING but no
--      WITH CHECK — making field tampering less visible in policy intent.
--
-- This migration closes all three. Pattern mirrors the existing
-- profiles_update_own WITH CHECK + (separate) field-lock conventions.
--
-- Key technique: BEFORE UPDATE trigger that checks `current_user`. When
-- called from a SECURITY DEFINER function (vote aggregations, RPCs),
-- current_user switches to the function owner (postgres/supabase_admin)
-- so system writes pass through. When called directly by an authenticated
-- JWT (manager or plain user), current_user stays 'authenticated' and the
-- trigger freezes protected fields to their OLD values.
-- =============================================================

-- -------------------------------------------------------------
-- 1. dishes — freeze computed + identity fields on INSERT and UPDATE
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_dish_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- System contexts bypass (service role, dashboard, SECURITY DEFINER triggers)
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Admins logged in via JWT can modify anything
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Everyone else (managers + regular users): freeze protected fields
  IF TG_OP = 'INSERT' THEN
    -- Prevent audit/identity forgery on insert
    NEW.id := uuid_generate_v4();
    NEW.created_at := NOW();
    -- Force computed fields to their initial defaults, regardless of input
    NEW.avg_rating := NULL;
    NEW.total_votes := 0;
    NEW.weighted_vote_count := 0;
    NEW.consensus_rating := NULL;
    NEW.consensus_ready := FALSE;
    NEW.consensus_votes := 0;
    NEW.consensus_calculated_at := NULL;
    NEW.value_score := NULL;
    NEW.value_percentile := NULL;
    NEW.category_median_price := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.restaurant_id := OLD.restaurant_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.avg_rating := OLD.avg_rating;
    NEW.total_votes := OLD.total_votes;
    NEW.weighted_vote_count := OLD.weighted_vote_count;
    NEW.consensus_rating := OLD.consensus_rating;
    NEW.consensus_ready := OLD.consensus_ready;
    NEW.consensus_votes := OLD.consensus_votes;
    NEW.consensus_calculated_at := OLD.consensus_calculated_at;
    NEW.value_score := OLD.value_score;
    NEW.value_percentile := OLD.value_percentile;
    NEW.category_median_price := OLD.category_median_price;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- NOT SECURITY DEFINER: we want current_user to reflect the actual caller.

-- Name starts with 'dishes_' (d) so it alphabetizes before
-- 'trigger_compute_value_score' (t) and fires FIRST. That way when a
-- manager updates price, we freeze any attempted avg_rating/value_score
-- tampering, THEN compute_value_score legitimately recomputes value_score.
DROP TRIGGER IF EXISTS dishes_protect_fields ON dishes;
CREATE TRIGGER dishes_protect_fields
BEFORE INSERT OR UPDATE ON dishes
FOR EACH ROW
EXECUTE FUNCTION protect_dish_fields();

-- Allow managers to delete dishes at their restaurant
DROP POLICY IF EXISTS "Admins can delete dishes" ON dishes;
DROP POLICY IF EXISTS "Admin or manager delete dishes" ON dishes;
CREATE POLICY "Admin or manager delete dishes" ON dishes FOR DELETE
  USING (is_admin() OR is_restaurant_manager(restaurant_id));

-- Add WITH CHECK to the existing UPDATE policy so new row must also
-- be at a restaurant the user manages (prevents moving dishes across
-- restaurants, even though the trigger also freezes restaurant_id).
DROP POLICY IF EXISTS "Admin or manager update dishes" ON dishes;
CREATE POLICY "Admin or manager update dishes" ON dishes FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));

-- -------------------------------------------------------------
-- 2. specials — freeze is_promoted, source, identity fields on INSERT and UPDATE
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_special_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Pin audit/identity fields (specials has no INSERT policy constraining these)
    NEW.id := gen_random_uuid();
    NEW.created_at := NOW();
    NEW.created_by := (SELECT auth.uid());
    -- Can't self-promote or forge provenance at insert time
    NEW.is_promoted := FALSE;
    NEW.source := 'manual';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.restaurant_id := OLD.restaurant_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.is_promoted := OLD.is_promoted;
    NEW.source := OLD.source;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specials_protect_fields ON specials;
CREATE TRIGGER specials_protect_fields
BEFORE INSERT OR UPDATE ON specials
FOR EACH ROW
EXECUTE FUNCTION protect_special_fields();

-- Tighten UPDATE policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Admin or manager update specials" ON specials;
CREATE POLICY "Admin or manager update specials" ON specials FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));

-- -------------------------------------------------------------
-- 3. events — same pattern as specials, both INSERT and UPDATE
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_event_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.id := gen_random_uuid();
    NEW.created_at := NOW();
    NEW.created_by := (SELECT auth.uid());
    NEW.is_promoted := FALSE;
    NEW.source := 'manual';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.restaurant_id := OLD.restaurant_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.is_promoted := OLD.is_promoted;
    NEW.source := OLD.source;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_protect_fields ON events;
CREATE TRIGGER events_protect_fields
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION protect_event_fields();

DROP POLICY IF EXISTS "Admin or manager update events" ON events;
CREATE POLICY "Admin or manager update events" ON events FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));

-- -------------------------------------------------------------
-- 4. restaurants — allow managers to UPDATE, freeze identity/geo fields
-- -------------------------------------------------------------
-- Managers can change: is_open, cuisine, phone, website_url, facebook_url,
--   instagram_url, menu_url, menu_section_order, toast_slug, order_url
-- Managers canNOT change: id, name, address, lat, lng, region, town,
--   google_place_id, created_by, created_at, menu_last_checked,
--   menu_content_hash (last two are menu-refresh bookkeeping — mutating
--   them would let a manager force or skip auto-scrapes).
CREATE OR REPLACE FUNCTION protect_restaurant_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;
  NEW.name := OLD.name;
  NEW.address := OLD.address;
  NEW.lat := OLD.lat;
  NEW.lng := OLD.lng;
  NEW.region := OLD.region;
  NEW.town := OLD.town;
  NEW.google_place_id := OLD.google_place_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.menu_last_checked := OLD.menu_last_checked;
  NEW.menu_content_hash := OLD.menu_content_hash;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restaurants_protect_fields ON restaurants;
CREATE TRIGGER restaurants_protect_fields
BEFORE UPDATE ON restaurants
FOR EACH ROW
EXECUTE FUNCTION protect_restaurant_fields();

-- Replace admin-only UPDATE policy with admin-or-manager
DROP POLICY IF EXISTS "Admins can update restaurants" ON restaurants;
DROP POLICY IF EXISTS "Admin or manager update restaurants" ON restaurants;
CREATE POLICY "Admin or manager update restaurants" ON restaurants FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(id))
  WITH CHECK (is_admin() OR is_restaurant_manager(id));

-- =============================================================
-- Verification queries (run manually after deployment):
-- =============================================================
-- 1. Confirm triggers exist:
--    SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_protect_fields' ORDER BY tgname;
--    Expect 4 rows: dishes/events/restaurants/specials _protect_fields
--
-- 2. Confirm policies updated:
--    SELECT polname, polcmd FROM pg_policy
--    WHERE polname LIKE '%delete dishes%' OR polname LIKE 'Admin or manager%'
--    ORDER BY polname;
--
-- 3. Smoke test as a manager JWT:
--    - UPDATE dishes SET price = 99.99 WHERE id = ...;              -- should succeed
--    - UPDATE dishes SET avg_rating = 10 WHERE id = ...;             -- should no-op silently
--    - UPDATE dishes SET restaurant_id = '<other>' WHERE id = ...;   -- should no-op (frozen)
--    - DELETE FROM dishes WHERE id = ...;                            -- should succeed
--    - UPDATE restaurants SET phone = '555-...' WHERE id = ...;      -- should succeed
--    - UPDATE restaurants SET name = 'hijack' WHERE id = ...;        -- should no-op silently
-- =============================================================
