-- Menu-Photo Fallback ("snap the menu") — storage + staging + provenance
-- Spec: docs/superpowers/specs/2026-06-09-menu-photo-fallback-design.md
-- Run in Supabase SQL Editor.
--
-- Path convention: menu-photos/<user_id>/<restaurant_id>/<ts>-<n>.jpg  (OWNER-FIRST,
-- so photo-moderate's "<owner> == auth.uid()" check passes and getPublicUrl works,
-- exactly mirroring dish-photos.)

-- ── 1. Public bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Storage RLS (mirror of dish-photos: read public; write/update/delete own)──
DROP POLICY IF EXISTS "menu_photos_public_read" ON storage.objects;
CREATE POLICY "menu_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-photos');

DROP POLICY IF EXISTS "menu_photos_upload_own" ON storage.objects;
CREATE POLICY "menu_photos_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "menu_photos_update_own" ON storage.objects;
CREATE POLICY "menu_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE needed: the client removes a rejected upload after moderation fails
-- (same as dishPhotosApi).
DROP POLICY IF EXISTS "menu_photos_delete_own" ON storage.objects;
CREATE POLICY "menu_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. Ephemeral extraction staging (trusted server copy of a vision extraction)─
-- The extract-menu-from-photo edge fn writes a row here; commit-menu-dishes reads
-- it by id, takes the TRUSTED dish fields from `dishes`, and never trusts client
-- dish fields. Short-lived; cleaned up after consume / 1 day.
CREATE TABLE IF NOT EXISTS menu_photo_extractions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dishes        JSONB NOT NULL,
  menu_section_order JSONB,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_photo_extractions_user_created_idx
  ON menu_photo_extractions (user_id, created_at DESC);

ALTER TABLE menu_photo_extractions ENABLE ROW LEVEL SECURITY;

-- Owner may read their own staged extractions (the edge fns use service role,
-- which bypasses RLS, for inserts/updates). No client INSERT/UPDATE/DELETE policy:
-- only the privileged edge functions write here.
DROP POLICY IF EXISTS "menu_photo_extractions_select_own" ON menu_photo_extractions;
CREATE POLICY "menu_photo_extractions_select_own" ON menu_photo_extractions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 4. Dish provenance (additive, passive — NO row-wide CHECK; see
--      reference_check_constraint_blocks_updates: a CHECK on mutable dishes rows
--      would block the vote trigger's UPDATEs). Analytics only. ────────────────
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS created_via TEXT;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "menu_photos_public_read"  ON storage.objects;
-- DROP POLICY IF EXISTS "menu_photos_upload_own"   ON storage.objects;
-- DROP POLICY IF EXISTS "menu_photos_update_own"   ON storage.objects;
-- DROP POLICY IF EXISTS "menu_photos_delete_own"   ON storage.objects;
-- DROP POLICY IF EXISTS "menu_photo_extractions_select_own" ON menu_photo_extractions;
-- DROP TABLE IF EXISTS menu_photo_extractions;
-- ALTER TABLE dishes DROP COLUMN IF EXISTS created_via;
-- DELETE FROM storage.buckets WHERE id = 'menu-photos';  -- only if no objects uploaded yet
