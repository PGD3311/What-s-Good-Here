-- Storage RLS policies for the dish-photos bucket.
-- Path convention: dish-photos/<user_id>/<dish_id>.<ext>
-- See src/api/dishPhotosApi.js:66 for the app-side path construction.
--
-- Without these, `supabase.storage.from('dish-photos').upload(...)` fails with a
-- "new row violates row-level security policy" error when called from an
-- authenticated user (not service_role). Public reads also need an explicit
-- policy even on a public bucket.

-- 1. Anyone can READ (public bucket — photos are displayed to logged-out users)
DROP POLICY IF EXISTS "dish_photos_public_read" ON storage.objects;
CREATE POLICY "dish_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dish-photos');

-- 2. Authenticated users can INSERT only into their own folder
--    (path prefix must match their auth.uid())
DROP POLICY IF EXISTS "dish_photos_upload_own" ON storage.objects;
CREATE POLICY "dish_photos_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dish-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Authenticated users can UPDATE their own objects
--    (required because uploadPhoto uses upsert: true)
DROP POLICY IF EXISTS "dish_photos_update_own" ON storage.objects;
CREATE POLICY "dish_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dish-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Authenticated users can DELETE their own objects
DROP POLICY IF EXISTS "dish_photos_delete_own" ON storage.objects;
CREATE POLICY "dish_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dish-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
