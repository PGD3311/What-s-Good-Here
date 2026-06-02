-- 2026-05-31 — needs_manual_menu flag for the menu-refresh confidence gate.
-- Run in Supabase SQL Editor (Denis's project).
--
-- The confidence gate refuses to write thin, price-less, plain-HTML extractions
-- that no sub-page rescued (the signature of Sonnet hallucinating dishes from a
-- JS-shell page — e.g. BentoBox tab menus). Those restaurants get flagged here
-- for a hand-imported menu instead of polluting the dishes table.
--
-- Additive column + one frozen field in the manager-protection trigger. No
-- rollback block needed (DROP COLUMN reverts; trigger reverts by removing the
-- single NEW.needs_manual_menu line).

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS needs_manual_menu BOOLEAN NOT NULL DEFAULT false;

-- Freeze needs_manual_menu against manager edits (menu-refresh bookkeeping,
-- same as menu_content_hash / extractor_fingerprint). Service role + admin
-- still bypass via the early RETURN NEW.
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
  NEW.needs_manual_menu := OLD.needs_manual_menu;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
