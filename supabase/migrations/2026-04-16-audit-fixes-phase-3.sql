-- Audit 2026-04-16 — Phase 3 (FK ON DELETE strategies for Delete Account flow)
-- Source: AUDIT-SUPABASE-2026-04-16.md §20
--
-- Bug context: public.delete_auth_user (schema.sql:3345) does a raw
-- DELETE FROM auth.users WHERE id = X. Any user who created a restaurant,
-- dish, event, special, invite, or admin record could not delete their
-- account — the DELETE would raise a FK violation because several
-- `created_by` / `used_by` columns had no explicit ON DELETE clause and
-- defaulted to NO ACTION / RESTRICT.
--
-- Strategy choices:
--   - `created_by` on CONTENT tables (restaurant/dish/event/special) →
--     SET NULL. Preserves the content, forgets the author.
--   - `created_by` on AUXILIARY records (admins, restaurant_managers) →
--     SET NULL. Preserves the record, forgets who granted access.
--   - `restaurant_invites.created_by` is NOT NULL → CASCADE. Pending invites
--     die with the user who issued them.
--   - `used_by` on invites → SET NULL. Preserves the audit trail, anonymizes.
--
-- User-owned data (votes, favorites, photos, follows, playlists, ...)
-- already CASCADEs correctly and is not touched by this migration.
--
-- Safe to run more than once — each constraint is dropped by generated name
-- and re-added with the desired clause.

BEGIN;

-- ============================================================================
-- restaurants.created_by → SET NULL
-- ============================================================================

ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_created_by_fkey,
  ADD CONSTRAINT restaurants_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- dishes.created_by → SET NULL
-- ============================================================================

ALTER TABLE dishes
  DROP CONSTRAINT IF EXISTS dishes_created_by_fkey,
  ADD CONSTRAINT dishes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- admins.created_by → SET NULL
-- ============================================================================

ALTER TABLE admins
  DROP CONSTRAINT IF EXISTS admins_created_by_fkey,
  ADD CONSTRAINT admins_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- specials.created_by → SET NULL
-- ============================================================================

ALTER TABLE specials
  DROP CONSTRAINT IF EXISTS specials_created_by_fkey,
  ADD CONSTRAINT specials_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- restaurant_managers.created_by → SET NULL
-- ============================================================================

ALTER TABLE restaurant_managers
  DROP CONSTRAINT IF EXISTS restaurant_managers_created_by_fkey,
  ADD CONSTRAINT restaurant_managers_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- restaurant_invites.created_by → CASCADE (NOT NULL, no SET NULL option)
-- restaurant_invites.used_by    → SET NULL
-- ============================================================================

ALTER TABLE restaurant_invites
  DROP CONSTRAINT IF EXISTS restaurant_invites_created_by_fkey,
  ADD CONSTRAINT restaurant_invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE restaurant_invites
  DROP CONSTRAINT IF EXISTS restaurant_invites_used_by_fkey,
  ADD CONSTRAINT restaurant_invites_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- curator_invites.created_by → SET NULL
-- curator_invites.used_by    → SET NULL
-- ============================================================================

ALTER TABLE curator_invites
  DROP CONSTRAINT IF EXISTS curator_invites_created_by_fkey,
  ADD CONSTRAINT curator_invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE curator_invites
  DROP CONSTRAINT IF EXISTS curator_invites_used_by_fkey,
  ADD CONSTRAINT curator_invites_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ============================================================================
-- events.created_by → SET NULL
-- ============================================================================

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_created_by_fkey,
  ADD CONSTRAINT events_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


COMMIT;


-- ============================================================================
-- Post-deploy verification
-- ============================================================================
--
-- 1. Confirm all 10 FK constraints now have the intended ON DELETE action:
--
--   SELECT
--     c.conrelid::regclass AS table_name,
--     a.attname            AS column_name,
--     c.confdeltype        AS on_delete
--   FROM pg_constraint c
--   JOIN pg_attribute a
--     ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
--   WHERE c.contype = 'f'
--     AND c.confrelid = 'auth.users'::regclass
--     AND a.attname IN ('created_by', 'used_by')
--     AND c.conrelid::regclass::text IN (
--       'restaurants', 'dishes', 'admins', 'specials',
--       'restaurant_managers', 'restaurant_invites',
--       'curator_invites', 'events'
--     )
--   ORDER BY table_name, column_name;
--
-- confdeltype key:
--   'a' = NO ACTION (this is the bug, should not appear for any of these rows)
--   'r' = RESTRICT
--   'c' = CASCADE
--   'n' = SET NULL
--   'd' = SET DEFAULT
--
-- Expect 'n' everywhere EXCEPT restaurant_invites.created_by which is 'c'.
--
-- 2. Smoke test (optional, destructive): create a throwaway user, have them
--    insert a restaurant row, then call delete_auth_user(<throwaway-uuid>).
--    Should succeed; the restaurant row should remain with created_by = NULL.
