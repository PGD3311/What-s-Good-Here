-- Storage RLS policies for the dish-photos bucket.
-- Path convention: dish-photos/<user_id>/<dish_id>.<ext>
-- See src/api/dishPhotosApi.js:66 for the app-side path construction.
--
-- Without these, `supabase.storage.from('dish-photos').upload(...)` fails with a
-- "new row violates row-level security policy" error when called from an
-- authenticated user (not service_role). Public reads also need an explicit
-- policy even on a public bucket.
--
-- SECURITY NOTE: A prior `dish_photos_insert_own` policy existed that only
-- checked `owner = auth.uid()`. Supabase Storage sets `owner` to the current
-- user automatically, so that check was equivalent to "any authenticated user
-- can upload anywhere in this bucket" — it let user A write into user B's
-- folder. OR-combined with the path-prefix check below, it nullified isolation.
-- Verified via attacker test (2026-04-14): cross-user upload succeeded with
-- that policy present and failed after dropping it.

-- Drop the too-permissive prior policy so OR-combination can't bypass isolation
DROP POLICY IF EXISTS "dish_photos_insert_own" ON storage.objects;

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
--
--    WITH CHECK mirrors USING as defense-in-depth: USING gates which row can be
--    updated (OLD row path matches), WITH CHECK gates what the new row looks like
--    (NEW row path also matches). Without WITH CHECK, an authenticated user could
--    theoretically UPDATE their own row and rename `name` to land in another
--    user's folder. Supabase SDK's `move`/`copy` actually route through INSERT
--    so are already blocked, but adding WITH CHECK closes the direct-UPDATE
--    vector too.
DROP POLICY IF EXISTS "dish_photos_update_own" ON storage.objects;
CREATE POLICY "dish_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dish-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
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
