-- =============================================
-- 8. RLS POLICIES (DROP IF EXISTS + CREATE)
-- =============================================

-- ---- restaurants ----
DROP POLICY IF EXISTS "Public read access" ON restaurants;
CREATE POLICY "Public read access" ON restaurants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert restaurants" ON restaurants;
CREATE POLICY "Authenticated users can insert restaurants" ON restaurants FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND (is_admin()
    OR (SELECT count(*) FROM restaurants WHERE created_by = auth.uid() AND created_at > now() - interval '1 hour') < 5)
);

DROP POLICY IF EXISTS "Admins can update restaurants" ON restaurants;
CREATE POLICY "Admins can update restaurants" ON restaurants FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete restaurants" ON restaurants;
CREATE POLICY "Admins can delete restaurants" ON restaurants FOR DELETE USING (is_admin());

-- ---- dishes ----
DROP POLICY IF EXISTS "Public read access" ON dishes;
CREATE POLICY "Public read access" ON dishes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert dishes" ON dishes;
CREATE POLICY "Authenticated users can insert dishes" ON dishes FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND (is_admin() OR auth.role() = 'service_role'
    OR (SELECT count(*) FROM dishes WHERE created_by = auth.uid() AND created_at > now() - interval '1 hour') < 20)
);

DROP POLICY IF EXISTS "Admin or manager update dishes" ON dishes;
CREATE POLICY "Admin or manager update dishes" ON dishes FOR UPDATE USING (is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admins can delete dishes" ON dishes;
CREATE POLICY "Admins can delete dishes" ON dishes FOR DELETE USING (is_admin());

-- ---- votes ----
DROP POLICY IF EXISTS "Public read access" ON votes;
CREATE POLICY "Public read access" ON votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own votes" ON votes;
CREATE POLICY "Users can insert own votes" ON votes FOR INSERT WITH CHECK ((select auth.uid()) = user_id AND source = 'user');

DROP POLICY IF EXISTS "Users can update own votes" ON votes;
CREATE POLICY "Users can update own votes" ON votes FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own votes" ON votes;
CREATE POLICY "Users can delete own votes" ON votes FOR DELETE USING ((select auth.uid()) = user_id);

-- ---- profiles ----
DROP POLICY IF EXISTS "profiles_select_public_or_own" ON profiles;
CREATE POLICY "profiles_select_public_or_own" ON profiles FOR SELECT USING ((select auth.uid()) = id OR display_name IS NOT NULL);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK (
  (select auth.uid()) = id
  AND is_local_curator = (SELECT is_local_curator FROM profiles WHERE id = (select auth.uid()))
  AND follower_count = (SELECT follower_count FROM profiles WHERE id = (select auth.uid()))
  AND following_count = (SELECT following_count FROM profiles WHERE id = (select auth.uid()))
);

-- ---- favorites ----
DROP POLICY IF EXISTS "Users can read own favorites" ON favorites;
CREATE POLICY "Users can read own favorites" ON favorites FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own favorites" ON favorites;
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING ((select auth.uid()) = user_id);

-- ---- admins ----
-- Each user can read their own admin row (avoids RLS recursion).
DROP POLICY IF EXISTS "Admins can read admins" ON admins;
DROP POLICY IF EXISTS "Users can read own admin row" ON admins;
CREATE POLICY "Users can read own admin row" ON admins FOR SELECT USING ((select auth.uid()) = user_id);

-- ---- dish_photos ----
DROP POLICY IF EXISTS "Public read access" ON dish_photos;
CREATE POLICY "Public read access" ON dish_photos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own photos" ON dish_photos;
CREATE POLICY "Users can insert own photos" ON dish_photos FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own photos" ON dish_photos;
CREATE POLICY "Users can update own photos" ON dish_photos FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own photos" ON dish_photos;
CREATE POLICY "Users can delete own photos" ON dish_photos FOR DELETE USING ((select auth.uid()) = user_id);

-- ---- follows ----
DROP POLICY IF EXISTS "follows_select_public" ON follows;
CREATE POLICY "follows_select_public" ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own" ON follows FOR INSERT WITH CHECK ((select auth.uid()) = follower_id);

DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own" ON follows FOR DELETE USING ((select auth.uid()) = follower_id);

-- ---- notifications ----
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "notifications_insert_system" ON notifications;
CREATE POLICY "notifications_insert_system" ON notifications FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING ((select auth.uid()) = user_id);

-- ---- user_rating_stats ----
DROP POLICY IF EXISTS "Public can read stats" ON user_rating_stats;
CREATE POLICY "Public can read stats" ON user_rating_stats FOR SELECT USING (TRUE);

-- ---- bias_events ----
DROP POLICY IF EXISTS "Users can read own events" ON bias_events;
CREATE POLICY "Users can read own events" ON bias_events FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can mark events as seen" ON bias_events;
CREATE POLICY "Users can mark events as seen" ON bias_events FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ---- badges ----
DROP POLICY IF EXISTS "Public read badges" ON badges;
CREATE POLICY "Public read badges" ON badges FOR SELECT USING (true);

-- ---- user_badges ----
DROP POLICY IF EXISTS "Users can read own badges" ON user_badges;
CREATE POLICY "Users can read own badges" ON user_badges FOR SELECT USING (
  (select auth.uid()) = user_id
  OR EXISTS (SELECT 1 FROM badges b WHERE b.key = badge_key AND b.is_public_eligible = true)
);

DROP POLICY IF EXISTS "System can insert badges" ON user_badges;
CREATE POLICY "System can insert badges" ON user_badges FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ---- specials ----
DROP POLICY IF EXISTS "Read specials" ON specials;
CREATE POLICY "Read specials" ON specials FOR SELECT USING (is_active = true OR is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager insert specials" ON specials;
CREATE POLICY "Admin or manager insert specials" ON specials FOR INSERT WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager update specials" ON specials;
CREATE POLICY "Admin or manager update specials" ON specials FOR UPDATE USING (is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager delete specials" ON specials;
CREATE POLICY "Admin or manager delete specials" ON specials FOR DELETE USING (is_admin() OR is_restaurant_manager(restaurant_id));

-- ---- restaurant_managers ----
DROP POLICY IF EXISTS "Admins read all managers" ON restaurant_managers;
CREATE POLICY "Admins read all managers" ON restaurant_managers FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Managers read own rows" ON restaurant_managers;
CREATE POLICY "Managers read own rows" ON restaurant_managers FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins manage all managers" ON restaurant_managers;
CREATE POLICY "Admins manage all managers" ON restaurant_managers FOR ALL USING (is_admin());

-- ---- restaurant_invites ----
DROP POLICY IF EXISTS "Admins manage invites" ON restaurant_invites;
CREATE POLICY "Admins manage invites" ON restaurant_invites FOR ALL USING (is_admin());

-- ---- curator_invites ----
DROP POLICY IF EXISTS "Admins manage curator invites" ON curator_invites;
CREATE POLICY "Admins manage curator invites" ON curator_invites FOR ALL USING (is_admin());

-- ---- rate_limits ----
DROP POLICY IF EXISTS "Users can view own rate limits" ON rate_limits;
CREATE POLICY "Users can view own rate limits" ON rate_limits FOR SELECT USING ((select auth.uid()) = user_id);

-- ---- events ----
DROP POLICY IF EXISTS "Read active events" ON events;
CREATE POLICY "Read active events" ON events FOR SELECT USING (is_active = true OR is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager insert events" ON events;
CREATE POLICY "Admin or manager insert events" ON events FOR INSERT WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager update events" ON events;
CREATE POLICY "Admin or manager update events" ON events FOR UPDATE USING (is_admin() OR is_restaurant_manager(restaurant_id));

DROP POLICY IF EXISTS "Admin or manager delete events" ON events;
CREATE POLICY "Admin or manager delete events" ON events FOR DELETE USING (is_admin() OR is_restaurant_manager(restaurant_id));

-- ---- jitter_profiles ----
DROP POLICY IF EXISTS "Users can read own jitter profile" ON jitter_profiles;
CREATE POLICY "Users can read own jitter profile" ON jitter_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages jitter" ON jitter_profiles;
CREATE POLICY "Service role manages jitter" ON jitter_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- ---- jitter_samples ----
DROP POLICY IF EXISTS "Users can insert own jitter samples" ON jitter_samples;
CREATE POLICY "Users can insert own jitter samples" ON jitter_samples
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages jitter samples" ON jitter_samples;
CREATE POLICY "Service role manages jitter samples" ON jitter_samples
  FOR ALL USING (auth.role() = 'service_role');

-- ---- local_lists ----
DROP POLICY IF EXISTS "local_lists_public_read" ON local_lists;
CREATE POLICY "local_lists_public_read"
  ON local_lists FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "local_lists_admin_insert" ON local_lists;
CREATE POLICY "local_lists_admin_insert"
  ON local_lists FOR INSERT
  WITH CHECK (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

DROP POLICY IF EXISTS "local_lists_admin_update" ON local_lists;
CREATE POLICY "local_lists_admin_update"
  ON local_lists FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

DROP POLICY IF EXISTS "local_lists_admin_delete" ON local_lists;
CREATE POLICY "local_lists_admin_delete"
  ON local_lists FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

-- ---- local_list_items ----
DROP POLICY IF EXISTS "local_list_items_public_read" ON local_list_items;
CREATE POLICY "local_list_items_public_read"
  ON local_list_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM local_lists ll WHERE ll.id = list_id AND ll.is_active = true));

DROP POLICY IF EXISTS "local_list_items_admin_insert" ON local_list_items;
CREATE POLICY "local_list_items_admin_insert"
  ON local_list_items FOR INSERT
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "local_list_items_admin_update" ON local_list_items;
CREATE POLICY "local_list_items_admin_update"
  ON local_list_items FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "local_list_items_admin_delete" ON local_list_items;
CREATE POLICY "local_list_items_admin_delete"
  ON local_list_items FOR DELETE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );


