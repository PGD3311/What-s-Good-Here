-- Pre-launch waitlist
--
-- Captures email addresses from /waitlist landing page during the App Store
-- review wait. Used to send launch announcement when v1.0 ships. Anonymous
-- inserts allowed; reads are admin-only (service role) to prevent enumeration
-- of subscribers.
--
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS waitlist_normalize_email ON waitlist;
-- DROP FUNCTION IF EXISTS waitlist_normalize_email();
-- DROP POLICY IF EXISTS "waitlist anon insert" ON waitlist;
-- DROP TABLE IF EXISTS waitlist;

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (LENGTH(email) <= 320 AND email LIKE '%_@_%.__%'),
  source TEXT CHECK (source IS NULL OR LENGTH(source) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalize email at the DB layer so direct SQL callers can't bypass the API
-- and store junk like ' Dan@Example.COM '. Trigger lowercases + trims; the
-- unique index then dedupes correctly without a generated column.
CREATE OR REPLACE FUNCTION waitlist_normalize_email()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.email = LOWER(BTRIM(NEW.email));
  IF NEW.source IS NOT NULL THEN
    NEW.source = BTRIM(NEW.source);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_normalize_email ON waitlist;
CREATE TRIGGER waitlist_normalize_email
  BEFORE INSERT OR UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION waitlist_normalize_email();

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique
  ON waitlist (email);

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON waitlist (created_at DESC);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anon-only insert. Logged-in users who somehow hit /waitlist are unusual;
-- the actual signup flow for them is the regular auth modal. Keeping this
-- anon-only matches the design intent and prevents authenticated callers
-- from spoofing source / abusing the table.
CREATE POLICY "waitlist anon insert" ON waitlist
  FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- No SELECT policy. Reads are limited to service_role (admin export).
