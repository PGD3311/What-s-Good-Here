-- Storage bucket + RLS policies for user profile avatars.
-- Path convention: avatars/<user_id>/avatar.jpg
-- See src/api/profileApi.js uploadAvatar for the app-side path construction.
--
-- Mirrors the dish-photos bucket setup at 20260414_dish_photos_bucket_rls.sql.
-- Public read so avatars render for logged-out viewers. Path-prefix isolation
-- on INSERT/UPDATE/DELETE so user A can never write into user B's folder
-- (the prior dish-photos exploit — see that file's notes — does not apply here
-- because we never create a permissive owner-only INSERT policy in the first
-- place).

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Public read (anyone can fetch a public avatar URL)
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- 3. Authenticated users can INSERT only into their own folder
DROP POLICY IF EXISTS "avatar_upload_own" ON storage.objects;
CREATE POLICY "avatar_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Authenticated users can UPDATE their own objects (upsert path).
--    WITH CHECK mirrors USING to block renaming `name` into another user's folder.
DROP POLICY IF EXISTS "avatar_update_own" ON storage.objects;
CREATE POLICY "avatar_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Authenticated users can DELETE their own objects
DROP POLICY IF EXISTS "avatar_delete_own" ON storage.objects;
CREATE POLICY "avatar_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ROLLBACK:
-- DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
-- DROP POLICY IF EXISTS "avatar_upload_own"  ON storage.objects;
-- DROP POLICY IF EXISTS "avatar_update_own"  ON storage.objects;
-- DROP POLICY IF EXISTS "avatar_delete_own"  ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'avatars';
