-- 2026-05-19: Extractor fingerprint for menu-refresh short-circuit gating
--
-- Adds restaurants.extractor_fingerprint (TEXT). The menu-refresh edge function
-- already short-circuits Sonnet when restaurants.menu_content_hash matches the
-- freshly-fetched HTML hash. That's correct when the EXTRACTOR is the same —
-- but when we upgrade the extractor (e.g. PR #229 taught it to pull
-- description + dietary_tags), every previously-extracted restaurant short-
-- circuits and never gets the new fields. The fingerprint closes that gap:
-- skip only when both the content hash AND the extractor fingerprint match
-- what's stored.
--
-- Pure additive — no SQL rollback needed. Drop column to revert:
--   ALTER TABLE restaurants DROP COLUMN extractor_fingerprint;
--   (and revert protect_restaurant_fields below).

-- =============================================================================
-- 1. Column (additive — autocommit)
-- =============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS extractor_fingerprint TEXT;

-- =============================================================================
-- 2. Field-protection trigger update
--
-- Managers' UPDATE statements bypass identity/geo/menu-bookkeeping columns.
-- The new fingerprint joins menu_last_checked + menu_content_hash in the
-- frozen set so a manager can't clear it via the restaurant edit form
-- (which would silently force a re-extract every cron cycle).
-- =============================================================================

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
  NEW.extractor_fingerprint := OLD.extractor_fingerprint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
