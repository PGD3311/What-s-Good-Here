-- =============================================
-- What's Good Here - Consolidated Database Schema
-- =============================================
-- Single source of truth for the complete database.
-- Organized by section; tables in dependency order.
--
-- To rebuild from scratch, run this file in Supabase SQL Editor.
-- For the existing production database, this serves as documentation
-- of the current state.
-- =============================================


-- =============================================
-- 0. EXTENSIONS
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================
-- 1. TABLES (20 tables in dependency order)
-- =============================================

-- 1a. restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  is_open BOOLEAN DEFAULT true,
  cuisine TEXT,
  town TEXT,
  region TEXT NOT NULL DEFAULT 'mv',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  google_place_id TEXT,
  website_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  phone TEXT,
  menu_url TEXT,
  menu_last_checked TIMESTAMPTZ,
  menu_content_hash TEXT,
  menu_section_order TEXT[] DEFAULT '{}',
  toast_slug TEXT,
  order_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1b. dishes
CREATE TABLE IF NOT EXISTS dishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  menu_section TEXT,
  price DECIMAL(6, 2),
  photo_url TEXT,
  parent_dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL,
  display_order INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  cuisine TEXT,
  avg_rating DECIMAL(3, 1),
  total_votes BIGINT DEFAULT 0,
  weighted_vote_count NUMERIC DEFAULT 0,
  consensus_rating NUMERIC(3, 1),
  consensus_ready BOOLEAN DEFAULT FALSE,
  consensus_votes INT DEFAULT 0,
  consensus_calculated_at TIMESTAMPTZ,
  value_score DECIMAL(6, 2),
  value_percentile DECIMAL(5, 2),
  category_median_price DECIMAL(6, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1c. votes
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  would_order_again BOOLEAN,
  rating_10 DECIMAL(3, 1),
  review_text TEXT,
  review_created_at TIMESTAMP WITH TIME ZONE,
  vote_position INT,
  scored_at TIMESTAMPTZ,
  category_snapshot TEXT,
  purity_score DECIMAL(5, 2),
  war_score DECIMAL(4, 3),
  badge_hash TEXT,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'ai_estimated')),
  source_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT review_text_max_length CHECK (review_text IS NULL OR length(review_text) <= 200)
);

-- Partial unique index: only user votes are unique per dish/user (ai_estimated can have multiples)
CREATE UNIQUE INDEX IF NOT EXISTS votes_user_unique ON votes (dish_id, user_id) WHERE source = 'user';

-- 1d. profiles (auto-created by handle_new_user trigger on auth.users INSERT)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  has_onboarded BOOLEAN DEFAULT false,
  preferred_categories TEXT[] DEFAULT '{}',
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  is_local_curator BOOLEAN DEFAULT false,
  can_invite_curators BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1e. favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, dish_id)
);

-- 1f. admins
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1g. dish_photos
CREATE TABLE IF NOT EXISTS dish_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  width INT,
  height INT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  avg_brightness REAL,
  bright_pixel_pct REAL,
  dark_pixel_pct REAL,
  quality_score INT,
  status TEXT DEFAULT 'community',
  reject_reason TEXT,
  source_type TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dish_id, user_id),
  CONSTRAINT dish_photos_status_check CHECK (status IN ('featured', 'community', 'hidden', 'rejected')),
  CONSTRAINT dish_photos_source_type_check CHECK (source_type IN ('user', 'restaurant'))
);

-- 1h. follows
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, followed_id),
  CHECK (follower_id != followed_id)
);

-- 1i. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1j. user_rating_stats
CREATE TABLE IF NOT EXISTS user_rating_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rating_bias NUMERIC(3, 1) DEFAULT 0.0,
  bias_label TEXT DEFAULT 'New Voter',
  votes_with_consensus INT DEFAULT 0,
  votes_pending INT DEFAULT 0,
  dishes_helped_establish INT DEFAULT 0,
  category_biases JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1k. bias_events
CREATE TABLE IF NOT EXISTS bias_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  user_rating NUMERIC(3, 1) NOT NULL,
  consensus_rating NUMERIC(3, 1) NOT NULL,
  deviation NUMERIC(3, 1) NOT NULL,
  was_early_voter BOOLEAN DEFAULT FALSE,
  bias_before NUMERIC(3, 1),
  bias_after NUMERIC(3, 1),
  seen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1l. badges
CREATE TABLE IF NOT EXISTS badges (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_public_eligible BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  rarity TEXT NOT NULL DEFAULT 'common',
  family TEXT NOT NULL DEFAULT 'discovery',
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1n. user_badges
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL REFERENCES badges(key) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata_json JSONB DEFAULT '{}',
  UNIQUE(user_id, badge_key)
);

-- 1o. specials
CREATE TABLE IF NOT EXISTS specials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  deal_name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_promoted BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto_scrape')),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1p. restaurant_managers
CREATE TABLE IF NOT EXISTS restaurant_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(user_id, restaurant_id)
);

-- 1q. restaurant_invites
CREATE TABLE IF NOT EXISTS restaurant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ
);

-- 1r. curator_invites
CREATE TABLE IF NOT EXISTS curator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1s. rate_limits
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 1s. jitter_profiles (Jitter Protocol: behavioral biometrics for human verification)
CREATE TABLE IF NOT EXISTS jitter_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}',
  review_count INTEGER NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
  consistency_score DECIMAL(4, 3) DEFAULT 0,
  flagged BOOLEAN DEFAULT false,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1t. jitter_samples
CREATE TABLE IF NOT EXISTS jitter_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_data JSONB NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1u. events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  event_type TEXT NOT NULL CHECK (event_type IN ('live_music', 'trivia', 'comedy', 'karaoke', 'open_mic', 'other')),
  recurring_pattern TEXT CHECK (recurring_pattern IN ('weekly', 'monthly') OR recurring_pattern IS NULL),
  recurring_day_of_week INT CHECK (recurring_day_of_week BETWEEN 0 AND 6 OR recurring_day_of_week IS NULL),
  is_active BOOLEAN DEFAULT true,
  is_promoted BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'auto_scrape')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1w. user_apple_tokens
-- Per-user Apple refresh-token storage for App Store compliance with
-- guideline 5.1.1(v) — account deletion must revoke Apple consent.
--
-- encrypted_refresh_token is self-contained ciphertext (not a Vault reference)
-- so rows can be copied byte-for-byte into pending_apple_revocations during
-- account deletion without needing Vault access at copy time.
CREATE TABLE IF NOT EXISTS user_apple_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  apple_sub TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  key_version TEXT NOT NULL,
  -- client_id_type determines which Apple client_id was used when the token
  -- was issued. Revocation MUST use the same client_id — 'native' = bundle id
  -- (com.whatsgoodhere.app), 'web' = services id (com.whatsgoodhere.service).
  -- Mixing these causes Apple to reject the revoke with invalid_client.
  client_id_type TEXT NOT NULL CHECK (client_id_type IN ('native', 'web')),
  -- Idempotency: code_hash + code_hash_seen_at together identify the most
  -- recent authorization_code. Duplicate submission within 60s returns 409
  -- without re-calling Apple. code_hash_seen_at is NOT the same as updated_at
  -- (which is bumped by non-exchange writes like web token re-captures).
  code_hash TEXT,
  code_hash_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_exchange_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- 1v. category_median_prices (view)
-- SECURITY INVOKER ensures this runs with the querying user's permissions, not the creator's
CREATE OR REPLACE VIEW category_median_prices
WITH (security_invoker = true) AS
SELECT category,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
  COUNT(*) AS dish_count
FROM dishes
WHERE price IS NOT NULL AND price > 0 AND total_votes >= 8
GROUP BY category;


-- 1v-b. public_votes (view)
-- Exposes only the fields the app needs for display. Excludes anti-abuse internals:
-- purity_score, war_score, badge_hash, source_metadata.
-- This view intentionally runs with owner privileges so public callers can read only
-- this safe projection after votes table SELECT is restricted by RLS.
CREATE OR REPLACE VIEW public_votes AS
SELECT
  id,
  dish_id,
  rating_10,
  review_text,
  review_created_at,
  user_id,
  source
FROM votes;


-- =============================================
-- 2. INDEXES
-- =============================================

-- restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(lat, lng);
CREATE INDEX IF NOT EXISTS idx_restaurants_open_lat_lng ON restaurants(is_open, lat, lng) WHERE is_open = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants(cuisine);
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_google_place_id ON restaurants(google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_created_by ON restaurants(created_by);
CREATE INDEX IF NOT EXISTS idx_restaurants_town ON restaurants(town);

-- dishes
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes(category);
CREATE INDEX IF NOT EXISTS idx_dishes_parent ON dishes(parent_dish_id);
CREATE INDEX IF NOT EXISTS idx_dishes_tags ON dishes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_dishes_consensus ON dishes(consensus_ready) WHERE consensus_ready = TRUE;
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_category ON dishes(restaurant_id, category);
CREATE INDEX IF NOT EXISTS idx_dishes_created_by ON dishes(created_by);
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_toplevel ON dishes(restaurant_id) WHERE parent_dish_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_dishes_consensus_eligible ON dishes(id) WHERE total_votes >= 5 AND avg_rating IS NOT NULL;

-- votes
CREATE INDEX IF NOT EXISTS idx_votes_dish ON votes(dish_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_votes_review_text ON votes(dish_id) WHERE review_text IS NOT NULL AND review_text != '';
CREATE INDEX IF NOT EXISTS idx_votes_unscored ON votes(dish_id) WHERE scored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_votes_user_dish ON votes(user_id, dish_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_position ON votes(user_id, vote_position);
-- Audit 2026-04-16: covers get_ranked_dishes weighted aggregations (dish + source + rating).
CREATE INDEX IF NOT EXISTS idx_votes_dish_source_rating ON votes(dish_id, source, rating_10) WHERE rating_10 IS NOT NULL;
-- Audit 2026-04-16: covers get_friends_votes_for_dish / _for_restaurant hot path.
CREATE INDEX IF NOT EXISTS idx_votes_user_dish_created ON votes(user_id, dish_id, created_at DESC);
-- Audit 2026-04-16: filters weighted votes by source with recency.
CREATE INDEX IF NOT EXISTS idx_votes_source_created ON votes(source, created_at DESC);

-- profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_unique ON profiles(LOWER(display_name)) WHERE display_name IS NOT NULL;

-- dish_photos
CREATE INDEX IF NOT EXISTS idx_dish_photos_dish ON dish_photos(dish_id);
CREATE INDEX IF NOT EXISTS idx_dish_photos_user ON dish_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_dish_photos_status ON dish_photos(dish_id, status, quality_score DESC);
-- Audit 2026-04-16: partial index for the hot path (best_photos CTE); excludes
-- hidden/rejected so the index is roughly half the size of the one above.
CREATE INDEX IF NOT EXISTS idx_dish_photos_featured_community
  ON dish_photos(dish_id, quality_score DESC)
  WHERE status IN ('featured', 'community');

-- follows
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON follows(created_at DESC);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- user_rating_stats
CREATE INDEX IF NOT EXISTS idx_user_rating_stats_bias ON user_rating_stats(rating_bias);

-- bias_events
CREATE INDEX IF NOT EXISTS idx_bias_events_user ON bias_events(user_id);
CREATE INDEX IF NOT EXISTS idx_bias_events_dish ON bias_events(dish_id);
CREATE INDEX IF NOT EXISTS idx_bias_events_unseen ON bias_events(user_id, seen) WHERE seen = FALSE;

-- user_badges
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_key);
CREATE INDEX IF NOT EXISTS idx_user_badges_unlocked ON user_badges(unlocked_at DESC);

-- specials
CREATE INDEX IF NOT EXISTS idx_specials_active ON specials(is_active, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_specials_created_by ON specials(created_by);

-- restaurant_managers
CREATE INDEX IF NOT EXISTS idx_restaurant_managers_user ON restaurant_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_managers_restaurant ON restaurant_managers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_managers_created_by ON restaurant_managers(created_by);

-- restaurant_invites
CREATE INDEX IF NOT EXISTS idx_restaurant_invites_restaurant ON restaurant_invites(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_invites_created_by ON restaurant_invites(created_by);
CREATE INDEX IF NOT EXISTS idx_restaurant_invites_used_by ON restaurant_invites(used_by);

-- curator_invites
CREATE INDEX IF NOT EXISTS idx_curator_invites_token ON curator_invites(token);
CREATE INDEX IF NOT EXISTS idx_curator_invites_created_by ON curator_invites(created_by);

-- rate_limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(created_at);

-- events
CREATE INDEX IF NOT EXISTS idx_events_restaurant ON events(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_events_active_upcoming ON events(event_date, is_promoted DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type) WHERE is_active = true;
-- Audit 2026-04-16: FK index on events.created_by.
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

-- user_apple_tokens
CREATE INDEX IF NOT EXISTS user_apple_tokens_apple_sub_idx ON user_apple_tokens (apple_sub);

-- jitter_samples (keep only last 30 samples per user, rolling window)
CREATE INDEX IF NOT EXISTS idx_jitter_samples_user ON jitter_samples (user_id, collected_at DESC);


-- =============================================
-- 3. ROW LEVEL SECURITY
-- =============================================
-- Uses optimized (select auth.uid()) pattern for per-row caching.

-- Enable RLS on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE dish_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rating_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE bias_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE specials ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- restaurants: public read, admin + manager write (column-level protection via trigger)
CREATE POLICY "Public read access" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert restaurants" ON restaurants FOR INSERT WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND created_by = (SELECT auth.uid())
  AND (is_admin()
    OR (SELECT count(*) FROM restaurants WHERE created_by = (SELECT auth.uid()) AND created_at > now() - interval '1 hour') < 5)
);
CREATE POLICY "Admin or manager update restaurants" ON restaurants FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(id))
  WITH CHECK (is_admin() OR is_restaurant_manager(id));
CREATE POLICY "Admins can delete restaurants" ON restaurants FOR DELETE USING (is_admin());

-- dishes: public read, admin + manager write (column-level protection via trigger)
CREATE POLICY "Public read access" ON dishes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert dishes" ON dishes FOR INSERT WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL
  AND created_by = (SELECT auth.uid())
  AND (is_admin() OR auth.role() = 'service_role'
    OR (SELECT count(*) FROM dishes WHERE created_by = (SELECT auth.uid()) AND created_at > now() - interval '1 hour') < 20)
);
CREATE POLICY "Admin or manager update dishes" ON dishes FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));
-- Managers can only delete dishes that have never been voted on (scraper
-- errors, ghost items). Once a dish has any user votes, the rating record
-- belongs to the crowd. Admins can always delete (legal takedowns, duplicates).
CREATE POLICY "Admin or manager delete dishes" ON dishes FOR DELETE
  USING (
    is_admin()
    OR (is_restaurant_manager(restaurant_id) AND total_votes = 0)
  );

-- votes: restricted read, users manage own (optimized auth.uid())
CREATE POLICY "Own users, admins, and service role can read votes" ON votes FOR SELECT USING (
  auth.role() = 'service_role'
  OR (select auth.uid()) = user_id
  OR is_admin()
);
CREATE POLICY "Users can insert own votes" ON votes FOR INSERT WITH CHECK ((select auth.uid()) = user_id AND source = 'user');
CREATE POLICY "Users can update own votes" ON votes FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own votes" ON votes FOR DELETE USING ((select auth.uid()) = user_id);

-- profiles: public read (if display_name set), users manage own
CREATE POLICY "profiles_select_public_or_own" ON profiles FOR SELECT USING ((select auth.uid()) = id OR display_name IS NOT NULL);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
-- Protected fields (is_local_curator, can_invite_curators, follower_count, following_count) are
-- meant to be guarded by protect_profile_fields_trigger (BEFORE UPDATE) — not RLS — to avoid
-- infinite recursion. NOTE: trigger function is referenced here but is not in schema.sql; verify
-- it exists in the live DB and includes all protected columns.
-- No DELETE policy on profiles — users must not delete their own profile row (orphans FKs)

-- favorites: users manage own only
CREATE POLICY "Users can read own favorites" ON favorites FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING ((select auth.uid()) = user_id);

-- admins: each user can read their own admin row.
-- Never query `FROM admins` inside this policy — doing so triggers infinite
-- policy recursion and returns 500. No caller needs the full admin list;
-- clients check their own admin status via adminApi.isAdmin().
CREATE POLICY "Users can read own admin row" ON admins FOR SELECT USING ((select auth.uid()) = user_id);

-- dish_photos: public read, users manage own
CREATE POLICY "Public read access" ON dish_photos FOR SELECT USING (true);
CREATE POLICY "Users can insert own photos" ON dish_photos FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own photos" ON dish_photos FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own photos" ON dish_photos FOR DELETE USING ((select auth.uid()) = user_id);

-- follows: public read, users manage own
CREATE POLICY "follows_select_public" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows FOR INSERT WITH CHECK ((select auth.uid()) = follower_id);
CREATE POLICY "follows_delete_own" ON follows FOR DELETE USING ((select auth.uid()) = follower_id);

-- notifications: users see own, system inserts, users delete own
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "notifications_insert_system" ON notifications FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING ((select auth.uid()) = user_id);

-- user_rating_stats: public read
CREATE POLICY "Public can read stats" ON user_rating_stats FOR SELECT USING (TRUE);

-- bias_events: users read + update own
CREATE POLICY "Users can read own events" ON bias_events FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can mark events as seen" ON bias_events FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- badges: public read
CREATE POLICY "Public read badges" ON badges FOR SELECT USING (true);

-- user_badges: users read own + public-eligible badges
CREATE POLICY "Users can read own badges" ON user_badges FOR SELECT USING (
  (select auth.uid()) = user_id
  OR EXISTS (SELECT 1 FROM badges b WHERE b.key = badge_key AND b.is_public_eligible = true)
);
CREATE POLICY "System can insert badges" ON user_badges FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- specials: conditional read, admin + manager write
CREATE POLICY "Read specials" ON specials FOR SELECT USING (is_active = true OR is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager insert specials" ON specials FOR INSERT WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager update specials" ON specials FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager delete specials" ON specials FOR DELETE USING (is_admin() OR is_restaurant_manager(restaurant_id));

-- restaurant_managers: admins + own rows
CREATE POLICY "Admins read all managers" ON restaurant_managers FOR SELECT USING (is_admin());
CREATE POLICY "Managers read own rows" ON restaurant_managers FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Admins manage all managers" ON restaurant_managers FOR ALL USING (is_admin());

-- restaurant_invites: admins only (public preview via SECURITY DEFINER function)
CREATE POLICY "Admins manage invites" ON restaurant_invites FOR ALL USING (is_admin());

-- curator_invites: admins only (public preview via SECURITY DEFINER function)
ALTER TABLE curator_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage curator invites" ON curator_invites FOR ALL USING (is_admin());

-- rate_limits: users see own
CREATE POLICY "Users can view own rate limits" ON rate_limits FOR SELECT USING ((select auth.uid()) = user_id);

-- events: conditional read, admin + manager write
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read active events" ON events FOR SELECT USING (is_active = true OR is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager insert events" ON events FOR INSERT WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager update events" ON events FOR UPDATE
  USING (is_admin() OR is_restaurant_manager(restaurant_id))
  WITH CHECK (is_admin() OR is_restaurant_manager(restaurant_id));
CREATE POLICY "Admin or manager delete events" ON events FOR DELETE USING (is_admin() OR is_restaurant_manager(restaurant_id));

-- user_apple_tokens: service-role only. No policies for authenticated role = deny all.
ALTER TABLE user_apple_tokens ENABLE ROW LEVEL SECURITY;

-- jitter_profiles + jitter_samples: users can read own profile, insert own samples, service role manages all
ALTER TABLE jitter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jitter_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own jitter profile" ON jitter_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Get the current user's own jitter profile (used on Profile page)
CREATE OR REPLACE FUNCTION get_my_jitter_profile()
RETURNS TABLE (
  confidence_level TEXT,
  consistency_score NUMERIC,
  review_count INTEGER,
  profile_data JSONB,
  created_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jp.confidence_level, jp.consistency_score, jp.review_count,
         jp.profile_data, jp.created_at, jp.last_updated
  FROM jitter_profiles jp
  WHERE jp.user_id = auth.uid();
$$;

-- Public access to jitter badge data only (not profile_data biometrics)
-- Use get_jitter_badges() RPC instead of direct table reads for other users' data
CREATE OR REPLACE FUNCTION get_jitter_badges(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  confidence_level TEXT,
  consistency_score DECIMAL,
  review_count INT,
  flagged BOOLEAN
) AS $$
  SELECT jp.user_id, jp.confidence_level, jp.consistency_score, jp.review_count, jp.flagged
  FROM jitter_profiles jp
  WHERE jp.user_id = ANY(p_user_ids);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE POLICY "Users can insert own jitter samples" ON jitter_samples
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages jitter" ON jitter_profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages jitter samples" ON jitter_samples
  FOR ALL USING (auth.role() = 'service_role');


-- =============================================
-- 4. HELPER FUNCTIONS
-- =============================================

-- Check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE user_id = (select auth.uid())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Check if current user is a local curator
CREATE OR REPLACE FUNCTION is_local_curator()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_local_curator FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Check if current user is an accepted manager for a restaurant
CREATE OR REPLACE FUNCTION is_restaurant_manager(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM restaurant_managers
    WHERE user_id = (select auth.uid())
      AND restaurant_id = p_restaurant_id
      AND accepted_at IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Get bias label from MAD (always-positive scale)
CREATE OR REPLACE FUNCTION get_bias_label(bias NUMERIC)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN bias IS NULL THEN 'New Voter'
    WHEN bias < 0.5 THEN 'Consensus Voter'
    WHEN bias < 1.0 THEN 'Has Opinions'
    WHEN bias < 2.0 THEN 'Strong Opinions'
    ELSE 'Wild Card'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Server-side UGC content filter. Mirrors src/lib/reviewBlocklist.js exactly:
-- blocklist entries with length <= 3 use boundary matching; longer entries use
-- plain case-insensitive substring matching. Asterisks are literal.
CREATE OR REPLACE FUNCTION public.is_offensive(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(coalesce(p_text, '')) AS value
  )
  SELECT CASE
    WHEN btrim(coalesce(p_text, '')) = '' THEN FALSE
    ELSE
      EXISTS (
        SELECT 1
        FROM normalized
        CROSS JOIN (
          VALUES
            ('fck'),
            ('ass'),
            ('fag'),
            ('f\*g'),
            ('kkk'),
            ('nft'),
            ('sex'),
            ('s\*x'),
            ('xxx')
        ) AS short_terms(pattern)
        WHERE normalized.value ~ ('(^|[^a-z0-9_])' || short_terms.pattern || '($|[^a-z0-9_])')
      )
      OR EXISTS (
        SELECT 1
        FROM normalized
        CROSS JOIN (
          VALUES
            ('fuck'),
            ('fucking'),
            ('fucked'),
            ('fucker'),
            ('f*ck'),
            ('shit'),
            ('shitty'),
            ('bullshit'),
            ('sh*t'),
            ('asshole'),
            ('a**hole'),
            ('bitch'),
            ('b*tch'),
            ('damn'),
            ('dammit'),
            ('crap'),
            ('bastard'),
            ('dick'),
            ('d*ck'),
            ('piss'),
            ('pissed'),
            ('cunt'),
            ('c*nt'),
            ('nigger'),
            ('nigga'),
            ('n*gger'),
            ('n*gga'),
            ('faggot'),
            ('f*ggot'),
            ('retard'),
            ('retarded'),
            ('r*tard'),
            ('spic'),
            ('sp*c'),
            ('chink'),
            ('ch*nk'),
            ('kike'),
            ('k*ke'),
            ('wetback'),
            ('beaner'),
            ('cracker'),
            ('honky'),
            ('dyke'),
            ('d*ke'),
            ('tranny'),
            ('tr*nny'),
            ('nazi'),
            ('hitler'),
            ('buy now'),
            ('click here'),
            ('free money'),
            ('make money fast'),
            ('work from home'),
            ('bitcoin'),
            ('crypto'),
            ('www.'),
            ('http://'),
            ('https://'),
            ('.com'),
            ('.net'),
            ('.org'),
            ('porn'),
            ('p*rn'),
            ('nude'),
            ('naked')
        ) AS long_terms(term)
        WHERE position(long_terms.term IN normalized.value) > 0
      )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_offensive(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.is_offensive(TEXT) TO authenticated, service_role;

-- Content-filter constraints live here because they depend on is_offensive().
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_review_text_content_filter_check;
ALTER TABLE public.votes
  ADD CONSTRAINT votes_review_text_content_filter_check
  CHECK (NOT public.is_offensive(review_text)) NOT VALID;

ALTER TABLE public.dishes DROP CONSTRAINT IF EXISTS dishes_name_content_filter_check;
ALTER TABLE public.dishes
  ADD CONSTRAINT dishes_name_content_filter_check
  CHECK (NOT public.is_offensive(name)) NOT VALID;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_content_filter_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_name_content_filter_check
  CHECK (NOT public.is_offensive(name)) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_content_filter_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_content_filter_check
  CHECK (NOT public.is_offensive(display_name)) NOT VALID;

-- Validate only when existing rows are already clean, so deploys still add a
-- server-side write floor even if legacy data needs cleanup first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.votes
    WHERE public.is_offensive(public.votes.review_text) IS TRUE
  ) THEN
    ALTER TABLE public.votes VALIDATE CONSTRAINT votes_review_text_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dishes
    WHERE public.is_offensive(public.dishes.name) IS TRUE
  ) THEN
    ALTER TABLE public.dishes VALIDATE CONSTRAINT dishes_name_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants
    WHERE public.is_offensive(public.restaurants.name) IS TRUE
  ) THEN
    ALTER TABLE public.restaurants VALIDATE CONSTRAINT restaurants_name_content_filter_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE public.is_offensive(public.profiles.display_name) IS TRUE
  ) THEN
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_display_name_content_filter_check;
  END IF;
END;
$$;


-- =============================================
-- 5. CORE FUNCTIONS
-- =============================================

-- Bayesian confidence-adjusted ranking score
-- Used by get_ranked_dishes and search results. One brain everywhere.
-- Prior strength (m): start at 3 for early data. See NOTES.md for schedule.
CREATE OR REPLACE FUNCTION dish_search_score(
  p_avg_rating DECIMAL,
  p_total_votes NUMERIC,
  p_distance_miles DECIMAL DEFAULT NULL,
  p_recent_votes_14d INT DEFAULT 0,
  p_global_mean DECIMAL DEFAULT 7.0
)
RETURNS DECIMAL AS $$
DECLARE
  v_prior_strength DECIMAL := 3;
  v_base_score DECIMAL;
  v_distance_bonus DECIMAL := 0;
  v_trend_bonus DECIMAL := 0;
  v_votes DECIMAL;
BEGIN
  v_votes := COALESCE(p_total_votes, 0);

  IF v_votes = 0 OR p_avg_rating IS NULL THEN
    v_base_score := p_global_mean;
  ELSE
    v_base_score := (v_votes / (v_votes + v_prior_strength)) * p_avg_rating
                  + (v_prior_strength / (v_votes + v_prior_strength)) * p_global_mean;
  END IF;

  IF p_distance_miles IS NOT NULL THEN
    IF p_distance_miles < 1 THEN
      v_distance_bonus := 0.3;
    ELSIF p_distance_miles < 3 THEN
      v_distance_bonus := 0.15;
    END IF;
  END IF;

  IF COALESCE(p_recent_votes_14d, 0) > 0 THEN
    v_trend_bonus := LEAST(0.05 * LN(1 + p_recent_votes_14d), 0.25);
  END IF;

  RETURN ROUND((v_base_score + v_distance_bonus + v_trend_bonus)::NUMERIC, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Get ranked dishes with bounding box optimization, town filter, variant aggregation.
-- SECURITY DEFINER is required because votes RLS restricts direct table reads;
-- this function returns only public aggregate fields.
CREATE OR REPLACE FUNCTION get_ranked_dishes(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_miles INT DEFAULT 50,
  filter_category TEXT DEFAULT NULL,
  filter_town TEXT DEFAULT NULL
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_town TEXT,
  category TEXT,
  tags TEXT[],
  cuisine TEXT,
  price DECIMAL,
  photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  distance_miles DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  value_score DECIMAL,
  value_percentile DECIMAL,
  search_score DECIMAL,
  featured_photo_url TEXT,
  restaurant_lat DECIMAL,
  restaurant_lng DECIMAL,
  restaurant_address TEXT,
  restaurant_phone TEXT,
  restaurant_website_url TEXT,
  toast_slug TEXT,
  order_url TEXT
) AS $$
DECLARE
  lat_delta DECIMAL := radius_miles / 69.0;
  lng_delta DECIMAL := radius_miles / (69.0 * COS(RADIANS(user_lat)));
BEGIN
  RETURN QUERY
  WITH global_stats AS (
    SELECT COALESCE(AVG(dishes.avg_rating), 7.0) AS global_mean
    FROM dishes
    WHERE dishes.total_votes > 0 AND dishes.avg_rating IS NOT NULL
  ),
  nearby_restaurants AS (
    SELECT r.id, r.name, r.town, r.lat, r.lng, r.cuisine,
           r.address, r.phone, r.website_url, r.toast_slug, r.order_url
    FROM restaurants r
    WHERE r.is_open = true
      AND r.lat BETWEEN (user_lat - lat_delta) AND (user_lat + lat_delta)
      AND r.lng BETWEEN (user_lng - lng_delta) AND (user_lng + lng_delta)
      AND (filter_town IS NULL OR r.town = filter_town)
  ),
  restaurants_with_distance AS (
    SELECT
      nr.id, nr.name, nr.town, nr.lat, nr.lng, nr.cuisine,
      nr.address, nr.phone, nr.website_url, nr.toast_slug, nr.order_url,
      ROUND((
        3959 * ACOS(
          LEAST(1.0, GREATEST(-1.0,
            COS(RADIANS(user_lat)) * COS(RADIANS(nr.lat)) *
            COS(RADIANS(nr.lng) - RADIANS(user_lng)) +
            SIN(RADIANS(user_lat)) * SIN(RADIANS(nr.lat))
          ))
        )
      )::NUMERIC, 2) AS distance
    FROM nearby_restaurants nr
  ),
  filtered_restaurants AS (
    SELECT * FROM restaurants_with_distance WHERE distance <= radius_miles
  ),
  variant_stats AS (
    SELECT
      d.parent_dish_id,
      COUNT(DISTINCT d.id)::INT AS child_count,
      SUM(COALESCE(ds.vote_count, 0))::NUMERIC AS total_child_votes
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS vote_count
      FROM votes v GROUP BY v.dish_id
    ) ds ON ds.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id
  ),
  best_variants AS (
    SELECT DISTINCT ON (d.parent_dish_id)
      d.parent_dish_id,
      d.name AS best_name,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS best_rating
    FROM dishes d
    LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id, d.id, d.name
    HAVING COUNT(v.id) >= 1
    ORDER BY d.parent_dish_id, AVG(v.rating_10) DESC NULLS LAST, COUNT(v.id) DESC
  ),
  recent_vote_counts AS (
    SELECT votes.dish_id, COUNT(*)::INT AS recent_votes
    FROM votes
    WHERE votes.created_at > NOW() - INTERVAL '14 days'
    GROUP BY votes.dish_id
  ),
  best_photos AS (
    -- H3: exclude photos authored by users the viewer has blocked.
    -- Inline NOT EXISTS so Postgres hash-joins user_blocks once instead of
    -- invoking is_blocked_pair() per dish_photo row.
    SELECT DISTINCT ON (dp.dish_id)
      dp.dish_id,
      dp.photo_url
    FROM dish_photos dp
    INNER JOIN dishes d2 ON dp.dish_id = d2.id
    INNER JOIN filtered_restaurants fr2 ON d2.restaurant_id = fr2.id
    WHERE dp.status IN ('featured', 'community')
      AND d2.parent_dish_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks ub
        WHERE (ub.blocker_id = (select auth.uid()) AND ub.blocked_id = dp.user_id)
           OR (ub.blocker_id = dp.user_id AND ub.blocked_id = (select auth.uid()))
      )
    ORDER BY dp.dish_id,
      CASE dp.source_type WHEN 'restaurant' THEN 0 ELSE 1 END,
      CASE dp.status WHEN 'featured' THEN 0 ELSE 1 END,
      dp.quality_score DESC NULLS LAST,
      dp.created_at DESC
  )
  SELECT
    d.id AS dish_id,
    d.name AS dish_name,
    fr.id AS restaurant_id,
    fr.name AS restaurant_name,
    fr.town AS restaurant_town,
    d.category,
    d.tags,
    fr.cuisine,
    d.price,
    d.photo_url,
    COALESCE(vs.total_child_votes,
      SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)
    )::BIGINT AS total_votes,
    COALESCE(ROUND(
      (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                ELSE 0 END) /
       NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                       WHEN v.source = 'ai_estimated' THEN 0.5
                       ELSE 0 END), 0)
      )::NUMERIC, 1), 0) AS avg_rating,
    fr.distance AS distance_miles,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_name AS best_variant_name,
    bv.best_rating AS best_variant_rating,
    d.value_score,
    d.value_percentile,
    dish_search_score(
      COALESCE(ROUND(
        (SUM(CASE WHEN v.source = 'user' THEN v.rating_10
                  WHEN v.source = 'ai_estimated' THEN v.rating_10 * 0.5
                  ELSE 0 END) /
         NULLIF(SUM(CASE WHEN v.source = 'user' THEN 1.0
                         WHEN v.source = 'ai_estimated' THEN 0.5
                         ELSE 0 END), 0)
        )::NUMERIC, 1), 0),
      COALESCE(vs.total_child_votes,
        SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::NUMERIC,
      fr.distance,
      COALESCE(rvc.recent_votes, 0),
      (SELECT global_mean FROM global_stats)
    ) AS search_score,
    bp.photo_url AS featured_photo_url,
    fr.lat AS restaurant_lat,
    fr.lng AS restaurant_lng,
    fr.address AS restaurant_address,
    fr.phone AS restaurant_phone,
    fr.website_url AS restaurant_website_url,
    fr.toast_slug,
    fr.order_url
  FROM dishes d
  INNER JOIN filtered_restaurants fr ON d.restaurant_id = fr.id
  LEFT JOIN votes v ON d.id = v.dish_id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN recent_vote_counts rvc ON rvc.dish_id = d.id
  LEFT JOIN best_photos bp ON bp.dish_id = d.id
  WHERE (filter_category IS NULL OR d.category = filter_category)
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, fr.id, fr.name, fr.town, d.category, d.tags, fr.cuisine,
           d.price, d.photo_url, fr.distance, fr.lat, fr.lng,
           fr.address, fr.phone, fr.website_url, fr.toast_slug, fr.order_url,
           vs.total_child_votes, vs.child_count,
           bv.best_name, bv.best_rating,
           d.value_score, d.value_percentile,
           rvc.recent_votes,
           bp.photo_url
  ORDER BY search_score DESC NULLS LAST, total_votes DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Get dishes for a specific restaurant with variant aggregation
CREATE OR REPLACE FUNCTION get_restaurant_dishes(
  p_restaurant_id UUID
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  restaurant_id UUID,
  restaurant_name TEXT,
  category TEXT,
  menu_section TEXT,
  price DECIMAL,
  photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_id UUID,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH variant_stats AS (
    SELECT
      d.parent_dish_id,
      COUNT(DISTINCT d.id)::INT AS child_count,
      SUM(COALESCE(ds.vote_count, 0))::NUMERIC AS total_child_votes,
      CASE
        WHEN SUM(COALESCE(ds.vote_count, 0)) > 0
        THEN ROUND((SUM(COALESCE(ds.rating_sum, 0)) / NULLIF(SUM(COALESCE(ds.vote_count, 0)), 0))::NUMERIC, 1)
        ELSE NULL
      END AS combined_avg_rating
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::NUMERIC AS vote_count,
        SUM(COALESCE(v.rating_10, 0) * (CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::DECIMAL AS rating_sum
      FROM votes v GROUP BY v.dish_id
    ) ds ON ds.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id
  ),
  best_variants AS (
    SELECT DISTINCT ON (d.parent_dish_id)
      d.parent_dish_id, d.id AS best_id, d.name AS best_name,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS best_rating
    FROM dishes d
    LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NOT NULL
    GROUP BY d.parent_dish_id, d.id, d.name
    HAVING COUNT(v.id) >= 1
    ORDER BY d.parent_dish_id, AVG(v.rating_10) DESC NULLS LAST, COUNT(v.id) DESC
  ),
  dish_vote_stats AS (
    SELECT d.id AS dish_id, COUNT(v.id)::BIGINT AS direct_votes,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS direct_avg
    FROM dishes d LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NULL
    GROUP BY d.id
  )
  SELECT
    d.id AS dish_id, d.name AS dish_name, r.id AS restaurant_id, r.name AS restaurant_name,
    d.category, d.menu_section, d.price, d.photo_url,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0)::BIGINT AS total_votes,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) AS avg_rating,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_id AS best_variant_id, bv.best_name AS best_variant_name, bv.best_rating AS best_variant_rating,
    d.tags
  FROM dishes d
  INNER JOIN restaurants r ON d.restaurant_id = r.id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN dish_vote_stats dvs ON dvs.dish_id = d.id
  WHERE d.restaurant_id = p_restaurant_id
    AND r.is_open = true
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, r.id, r.name, d.category, d.menu_section, d.price, d.photo_url, d.tags,
           vs.total_child_votes, vs.combined_avg_rating, vs.child_count,
           dvs.direct_votes, dvs.direct_avg,
           bv.best_id, bv.best_name, bv.best_rating
  ORDER BY
    CASE WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) >= 5 THEN 0 ELSE 1 END,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) DESC NULLS LAST,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get variants for a parent dish
CREATE OR REPLACE FUNCTION get_dish_variants(
  p_parent_dish_id UUID
)
RETURNS TABLE (
  dish_id UUID,
  dish_name TEXT,
  price DECIMAL,
  photo_url TEXT,
  display_order INT,
  total_votes BIGINT,
  avg_rating DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS dish_id, d.name AS dish_name, d.price, d.photo_url, d.display_order,
    COUNT(v.id)::BIGINT AS total_votes,
    ROUND(AVG(v.rating_10)::NUMERIC, 1) AS avg_rating
  FROM dishes d
  LEFT JOIN votes v ON d.id = v.dish_id
  WHERE d.parent_dish_id = p_parent_dish_id
  GROUP BY d.id, d.name, d.price, d.photo_url, d.display_order
  ORDER BY d.display_order, d.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get best review snippet for a dish
CREATE OR REPLACE FUNCTION get_smart_snippet(p_dish_id UUID)
RETURNS TABLE (
  review_text TEXT,
  rating_10 DECIMAL,
  display_name TEXT,
  user_id UUID,
  review_created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT v.review_text, v.rating_10, p.display_name, v.user_id, v.review_created_at
  FROM votes v
  INNER JOIN profiles p ON v.user_id = p.id
  WHERE v.dish_id = p_dish_id
    AND v.review_text IS NOT NULL AND v.review_text != ''
  ORDER BY
    CASE WHEN v.rating_10 >= 9 THEN 0 ELSE 1 END,
    v.rating_10 DESC NULLS LAST,
    v.review_created_at DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================
-- 6. SOCIAL FUNCTIONS
-- =============================================

-- Get follower count for a user
CREATE OR REPLACE FUNCTION get_follower_count(user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER FROM follows WHERE followed_id = user_id;
$$;

-- Get following count for a user
CREATE OR REPLACE FUNCTION get_following_count(user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER FROM follows WHERE follower_id = user_id;
$$;

-- Check if user A follows user B
CREATE OR REPLACE FUNCTION is_following(follower UUID, followed UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = follower AND followed_id = followed);
$$;

-- Get friends' votes for a dish (with category expertise)
CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT
    p.id AS user_id, p.display_name, v.rating_10,
    v.created_at AS voted_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END AS category_expertise
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id AND v.dish_id = p_dish_id
  JOIN dishes d ON d.id = p_dish_id
  WHERE f.follower_id = p_user_id
  ORDER BY v.created_at DESC;
$$;

-- Get friends' votes for a restaurant (with category expertise)
CREATE OR REPLACE FUNCTION get_friends_votes_for_restaurant(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  dish_id UUID,
  dish_name TEXT,
  rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT
    p.id AS user_id, p.display_name, d.id AS dish_id, d.name AS dish_name,
    v.rating_10, v.created_at AS voted_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END AS category_expertise
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  WHERE f.follower_id = p_user_id
  ORDER BY d.name, v.created_at DESC;
$$;

-- Taste compatibility between two users
CREATE OR REPLACE FUNCTION get_taste_compatibility(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS TABLE (
  shared_dishes INT,
  avg_difference DECIMAL(3, 1),
  compatibility_pct INT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  WITH shared AS (
    SELECT a.rating_10 AS rating_a, b.rating_10 AS rating_b
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
    WHERE a.user_id = p_user_id AND b.user_id = p_other_user_id
      AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
  )
  SELECT
    COUNT(*)::INT AS shared_dishes,
    ROUND(AVG(ABS(rating_a - rating_b))::NUMERIC, 1) AS avg_difference,
    CASE
      WHEN COUNT(*) >= 3 THEN ROUND((100 - (AVG(ABS(rating_a - rating_b))::NUMERIC / 9.0 * 100)))::INT
      ELSE NULL
    END AS compatibility_pct
  FROM shared;
$$;

-- Find users with similar taste who caller doesn't follow
CREATE OR REPLACE FUNCTION get_similar_taste_users(
  p_user_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  shared_dishes INT,
  compatibility_pct INT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  WITH candidates AS (
    SELECT b.user_id AS other_id, COUNT(*)::INT AS shared,
      ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT AS compat
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id AND b.user_id != p_user_id AND b.rating_10 IS NOT NULL
    WHERE a.user_id = p_user_id AND a.rating_10 IS NOT NULL
    GROUP BY b.user_id HAVING COUNT(*) >= 3
  )
  SELECT c.other_id AS user_id, p.display_name, c.shared AS shared_dishes, c.compat AS compatibility_pct
  FROM candidates c
  JOIN profiles p ON p.id = c.other_id
  WHERE NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_user_id AND f.followed_id = c.other_id)
  ORDER BY c.compat DESC, c.shared DESC
  LIMIT p_limit;
$$;


-- =============================================
-- 7. RATING IDENTITY FUNCTIONS (MAD-based)
-- =============================================

-- Get user's rating identity (MAD: Mean Absolute Deviation)
CREATE OR REPLACE FUNCTION get_user_rating_identity(target_user_id UUID)
RETURNS TABLE (
  rating_bias NUMERIC(3, 1),
  bias_label TEXT,
  votes_with_consensus INT,
  votes_pending INT,
  dishes_helped_establish INT,
  category_biases JSONB
) AS $$
DECLARE
  calculated_bias NUMERIC(3, 1);
  calculated_votes_with_consensus INT;
  calculated_votes_pending INT;
  calculated_dishes_helped INT;
  calculated_category_biases JSONB;
BEGIN
  -- Calculate MAD (mean absolute deviation) dynamically
  SELECT ROUND(AVG(ABS(v.rating_10 - d.avg_rating)), 1), COUNT(*)::INT
  INTO calculated_bias, calculated_votes_with_consensus
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.rating_10 IS NOT NULL
    AND d.avg_rating IS NOT NULL AND d.total_votes >= 5;

  -- Count pending votes
  SELECT COUNT(*)::INT INTO calculated_votes_pending
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.rating_10 IS NOT NULL
    AND (d.total_votes < 5 OR d.avg_rating IS NULL);

  -- Count dishes helped establish
  SELECT COUNT(*)::INT INTO calculated_dishes_helped
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.vote_position <= 3
    AND v.rating_10 IS NOT NULL AND d.total_votes >= 5;

  -- Per-category biases stay SIGNED (directional for taste phrases)
  SELECT COALESCE(jsonb_object_agg(category, bias), '{}'::jsonb)
  INTO calculated_category_biases
  FROM (
    SELECT COALESCE(v.category_snapshot, d.category) AS category,
      ROUND(AVG(v.rating_10 - d.avg_rating), 1) AS bias
    FROM votes v JOIN dishes d ON v.dish_id = d.id
    WHERE v.user_id = target_user_id AND v.rating_10 IS NOT NULL
      AND d.avg_rating IS NOT NULL AND d.total_votes >= 5
      AND COALESCE(v.category_snapshot, d.category) IS NOT NULL
    GROUP BY COALESCE(v.category_snapshot, d.category)
  ) cat_biases
  WHERE category IS NOT NULL;

  RETURN QUERY SELECT
    COALESCE(calculated_bias, 0.0)::NUMERIC(3, 1),
    get_bias_label(COALESCE(calculated_bias, 0.0)),
    COALESCE(calculated_votes_with_consensus, 0),
    COALESCE(calculated_votes_pending, 0),
    COALESCE(calculated_dishes_helped, 0),
    COALESCE(calculated_category_biases, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Get unseen reveal notifications
CREATE OR REPLACE FUNCTION get_unseen_reveals(target_user_id UUID)
RETURNS TABLE (
  id UUID, dish_id UUID, dish_name TEXT,
  user_rating NUMERIC(3, 1), consensus_rating NUMERIC(3, 1), deviation NUMERIC(3, 1),
  was_early_voter BOOLEAN, bias_before NUMERIC(3, 1), bias_after NUMERIC(3, 1),
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF (select auth.uid()) != target_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT be.id, be.dish_id, be.dish_name, be.user_rating, be.consensus_rating, be.deviation,
    be.was_early_voter, be.bias_before, be.bias_after, be.created_at
  FROM bias_events be
  WHERE be.user_id = target_user_id AND be.seen = FALSE
  ORDER BY be.created_at DESC LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Mark reveals as seen
CREATE OR REPLACE FUNCTION mark_reveals_seen(event_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE bias_events SET seen = TRUE
  WHERE id = ANY(event_ids) AND user_id = (select auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================
-- 8. BADGE FUNCTIONS
-- =============================================

-- Get all data needed for badge evaluation in one round-trip
CREATE OR REPLACE FUNCTION get_badge_evaluation_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_total_dishes BIGINT;
  v_total_restaurants BIGINT;
  v_global_bias NUMERIC(3, 1);
  v_votes_with_consensus INT;
  v_follower_count BIGINT;
  v_dishes_helped_establish INT;
  v_category_stats JSON;
  v_hidden_gems INT;
  v_called_it INT;
  v_top_dish_votes INT;
  v_first_voter_count INT;
BEGIN
  -- Basic volume stats
  SELECT COUNT(DISTINCT v.dish_id), COUNT(DISTINCT d.restaurant_id)
  INTO v_total_dishes, v_total_restaurants
  FROM votes v JOIN dishes d ON v.dish_id = d.id WHERE v.user_id = p_user_id;

  -- Global bias and consensus stats
  SELECT COALESCE(urs.rating_bias, 0.0), COALESCE(urs.votes_with_consensus, 0), COALESCE(urs.dishes_helped_establish, 0)
  INTO v_global_bias, v_votes_with_consensus, v_dishes_helped_establish
  FROM user_rating_stats urs WHERE urs.user_id = p_user_id;

  IF v_global_bias IS NULL THEN v_global_bias := 0.0; END IF;
  IF v_votes_with_consensus IS NULL THEN v_votes_with_consensus := 0; END IF;
  IF v_dishes_helped_establish IS NULL THEN v_dishes_helped_establish := 0; END IF;

  -- Follower count
  SELECT COUNT(*) INTO v_follower_count FROM follows WHERE followed_id = p_user_id;

  -- Per-category stats
  SELECT COALESCE(json_agg(cat_row), '[]'::json) INTO v_category_stats
  FROM (
    SELECT v.category_snapshot AS category, COUNT(*) AS total_ratings,
      COUNT(*) FILTER (WHERE d.consensus_ready = TRUE) AS consensus_ratings,
      ROUND(AVG(v.rating_10 - d.avg_rating) FILTER (WHERE d.consensus_ready = TRUE AND v.rating_10 IS NOT NULL), 1) AS bias
    FROM votes v JOIN dishes d ON v.dish_id = d.id
    WHERE v.user_id = p_user_id AND v.category_snapshot IS NOT NULL
    GROUP BY v.category_snapshot
  ) cat_row;

  -- Hidden gems found
  SELECT COUNT(DISTINCT v.dish_id) INTO v_hidden_gems
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND v.vote_position <= 3 AND d.avg_rating >= 8.0 AND d.total_votes >= 10;
  IF v_hidden_gems IS NULL THEN v_hidden_gems := 0; END IF;

  -- Called it count
  SELECT COUNT(DISTINCT v.dish_id) INTO v_called_it
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND v.vote_position <= 5 AND v.rating_10 >= 8
    AND d.consensus_ready = TRUE AND d.avg_rating >= 8.0;
  IF v_called_it IS NULL THEN v_called_it := 0; END IF;

  -- Top dish votes
  SELECT COUNT(DISTINCT v.dish_id) INTO v_top_dish_votes
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND d.total_votes >= 5
    AND d.avg_rating = (SELECT MAX(d2.avg_rating) FROM dishes d2 WHERE d2.restaurant_id = d.restaurant_id AND d2.total_votes >= 5);
  IF v_top_dish_votes IS NULL THEN v_top_dish_votes := 0; END IF;

  -- First voter count
  SELECT COUNT(*) INTO v_first_voter_count
  FROM votes v WHERE v.user_id = p_user_id AND v.vote_position = 1;
  IF v_first_voter_count IS NULL THEN v_first_voter_count := 0; END IF;

  RETURN json_build_object(
    'totalDishes', v_total_dishes, 'totalRestaurants', v_total_restaurants,
    'globalBias', v_global_bias, 'votesWithConsensus', v_votes_with_consensus,
    'followerCount', v_follower_count, 'dishesHelpedEstablish', v_dishes_helped_establish,
    'categoryStats', v_category_stats,
    'hiddenGemsFound', v_hidden_gems, 'calledItCount', v_called_it,
    'topDishVotes', v_top_dish_votes, 'firstVoterCount', v_first_voter_count
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Evaluate and award badges (cleanup version: category 10/20, no volume badges)
CREATE OR REPLACE FUNCTION evaluate_user_badges(p_user_id UUID)
RETURNS TABLE (
  badge_key TEXT,
  newly_unlocked BOOLEAN
) AS $$
DECLARE
  v_stats JSON;
  v_global_bias NUMERIC;
  v_votes_with_consensus INT;
  v_follower_count BIGINT;
  v_hidden_gems INT;
  v_called_it INT;
  v_badge RECORD;
  v_already_has BOOLEAN;
  v_threshold INT;
  v_cat_stat RECORD;
  v_cat_consensus INT;
  v_cat_bias NUMERIC;
  v_parsed_tier TEXT;
BEGIN
  v_stats := get_badge_evaluation_stats(p_user_id);

  v_global_bias := (v_stats->>'globalBias')::NUMERIC;
  v_votes_with_consensus := (v_stats->>'votesWithConsensus')::INT;
  v_follower_count := (v_stats->>'followerCount')::BIGINT;
  v_hidden_gems := (v_stats->>'hiddenGemsFound')::INT;
  v_called_it := (v_stats->>'calledItCount')::INT;

  FOR v_badge IN SELECT b.key, b.family, b.category FROM badges b ORDER BY b.sort_order DESC
  LOOP
    SELECT EXISTS(SELECT 1 FROM user_badges ub WHERE ub.user_id = p_user_id AND ub.badge_key = v_badge.key)
    INTO v_already_has;
    IF v_already_has THEN CONTINUE; END IF;

    CASE v_badge.family

      -- Category mastery badges (thresholds: 10/20)
      WHEN 'category' THEN
        IF v_badge.category IS NULL THEN CONTINUE; END IF;
        IF v_badge.key LIKE 'specialist_%' THEN v_parsed_tier := 'specialist';
        ELSIF v_badge.key LIKE 'authority_%' THEN v_parsed_tier := 'authority';
        ELSE CONTINUE; END IF;

        v_cat_consensus := 0; v_cat_bias := NULL;
        FOR v_cat_stat IN SELECT * FROM json_to_recordset(v_stats->'categoryStats') AS x(category TEXT, total_ratings INT, consensus_ratings INT, bias NUMERIC)
        LOOP
          IF v_cat_stat.category = v_badge.category THEN
            v_cat_consensus := COALESCE(v_cat_stat.consensus_ratings, 0);
            v_cat_bias := v_cat_stat.bias; EXIT;
          END IF;
        END LOOP;

        IF v_parsed_tier = 'specialist' THEN
          IF v_cat_consensus >= 10 AND v_cat_bias IS NOT NULL AND ABS(v_cat_bias) <= 1.5 THEN
            INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
            badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
          END IF;
        ELSIF v_parsed_tier = 'authority' THEN
          IF v_cat_consensus >= 20 AND v_cat_bias IS NOT NULL AND ABS(v_cat_bias) <= 1.0 THEN
            INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
            badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
          END IF;
        END IF;

      -- Discovery badges: hidden gems + called-it
      WHEN 'discovery' THEN
        IF v_badge.key IN ('hidden_gem_finder', 'gem_hunter', 'gem_collector') THEN
          CASE v_badge.key
            WHEN 'hidden_gem_finder' THEN v_threshold := 1;
            WHEN 'gem_hunter' THEN v_threshold := 5;
            WHEN 'gem_collector' THEN v_threshold := 10;
            ELSE NULL;
          END CASE;
          IF v_hidden_gems >= v_threshold THEN
            INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
            badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
          END IF;
          CONTINUE;
        END IF;

        IF v_badge.key IN ('good_call', 'taste_prophet', 'oracle') THEN
          CASE v_badge.key
            WHEN 'good_call' THEN v_threshold := 1;
            WHEN 'taste_prophet' THEN v_threshold := 3;
            WHEN 'oracle' THEN v_threshold := 5;
            ELSE NULL;
          END CASE;
          IF v_called_it >= v_threshold THEN
            INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
            badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
          END IF;
        END IF;

      -- Consistency badges: rating style (require 20 consensus votes)
      WHEN 'consistency' THEN
        IF v_votes_with_consensus < 20 THEN CONTINUE; END IF;
        CASE v_badge.key
          WHEN 'steady_hand' THEN
            IF ABS(v_global_bias) <= 0.5 THEN
              INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
              badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
            END IF;
          WHEN 'tough_critic' THEN
            IF v_global_bias <= -1.5 THEN
              INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
              badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
            END IF;
          WHEN 'generous_spirit' THEN
            IF v_global_bias >= 1.5 THEN
              INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
              badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
            END IF;
          ELSE NULL;
        END CASE;

      -- Influence badges: follower milestones (10/25)
      WHEN 'influence' THEN
        CASE v_badge.key
          WHEN 'taste_maker' THEN v_threshold := 10;
          WHEN 'trusted_voice' THEN v_threshold := 25;
          ELSE CONTINUE;
        END CASE;
        IF v_follower_count >= v_threshold THEN
          INSERT INTO user_badges (user_id, badge_key) VALUES (p_user_id, v_badge.key);
          badge_key := v_badge.key; newly_unlocked := true; RETURN NEXT;
        END IF;

      ELSE NULL;
    END CASE;
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Get user's unlocked badges
CREATE OR REPLACE FUNCTION get_user_badges(p_user_id UUID, p_public_only BOOLEAN DEFAULT false)
RETURNS TABLE (
  badge_key TEXT, name TEXT, subtitle TEXT, description TEXT, icon TEXT,
  is_public_eligible BOOLEAN, sort_order INTEGER, unlocked_at TIMESTAMP WITH TIME ZONE,
  rarity TEXT, family TEXT, category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT b.key AS badge_key, b.name, b.subtitle, b.description, b.icon,
    b.is_public_eligible, b.sort_order, ub.unlocked_at, b.rarity, b.family, b.category
  FROM user_badges ub JOIN badges b ON ub.badge_key = b.key
  WHERE ub.user_id = p_user_id AND (NOT p_public_only OR b.is_public_eligible = true)
  ORDER BY b.sort_order ASC, ub.unlocked_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Get public badges for display (max 6)
CREATE OR REPLACE FUNCTION get_public_badges(p_user_id UUID)
RETURNS TABLE (
  badge_key TEXT, name TEXT, subtitle TEXT, description TEXT, icon TEXT,
  unlocked_at TIMESTAMP WITH TIME ZONE, rarity TEXT, family TEXT, category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT b.key AS badge_key, b.name, b.subtitle, b.description, b.icon,
    ub.unlocked_at, b.rarity, b.family, b.category
  FROM user_badges ub JOIN badges b ON ub.badge_key = b.key
  WHERE ub.user_id = p_user_id AND b.is_public_eligible = true
  ORDER BY b.sort_order ASC, ub.unlocked_at DESC LIMIT 6;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Get category experts (deduped: one row per user, highest tier)
CREATE OR REPLACE FUNCTION get_category_experts(
  p_category TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  badge_tier TEXT,
  follower_count BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (ub.user_id)
    ub.user_id, p.display_name,
    CASE WHEN b.key LIKE 'authority_%' THEN 'authority' ELSE 'specialist' END AS badge_tier,
    COALESCE(fc.cnt, 0) AS follower_count
  FROM user_badges ub
  JOIN badges b ON ub.badge_key = b.key
  JOIN profiles p ON ub.user_id = p.id
  LEFT JOIN (SELECT followed_id, COUNT(*) AS cnt FROM follows GROUP BY followed_id) fc ON fc.followed_id = ub.user_id
  WHERE b.category = p_category AND b.family = 'category'
  ORDER BY ub.user_id,
    CASE WHEN b.key LIKE 'authority_%' THEN 0 ELSE 1 END,
    COALESCE(fc.cnt, 0) DESC
  LIMIT p_limit;
$$;

-- Get expert vote counts per dish at a restaurant
CREATE OR REPLACE FUNCTION get_expert_votes_for_restaurant(p_restaurant_id UUID)
RETURNS TABLE (dish_id UUID, specialist_count INT, authority_count INT)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT v.dish_id,
    COUNT(*) FILTER (WHERE ub.badge_key LIKE 'specialist_%')::INT AS specialist_count,
    COUNT(*) FILTER (WHERE ub.badge_key LIKE 'authority_%')::INT AS authority_count
  FROM votes v
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  JOIN user_badges ub ON ub.user_id = v.user_id
    AND ub.badge_key IN ('specialist_' || REPLACE(d.category, ' ', '_'), 'authority_' || REPLACE(d.category, ' ', '_'))
  GROUP BY v.dish_id;
$$;


-- =============================================
-- 9. NOTIFICATION FUNCTIONS
-- =============================================

-- Get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' OR (select auth.uid()) = p_user_id THEN
      (SELECT COUNT(*)::INTEGER FROM notifications WHERE user_id = p_user_id AND read = FALSE)
    ELSE 0
  END;
$$;

-- Mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications SET read = TRUE
  WHERE user_id = p_user_id AND read = FALSE
    AND (auth.role() = 'service_role' OR (select auth.uid()) = p_user_id);
$$;


-- =============================================
-- 11. RATE LIMITING FUNCTIONS
-- =============================================

-- Check and record rate limit
CREATE OR REPLACE FUNCTION check_and_record_rate_limit(
  p_action TEXT, p_max_attempts INT DEFAULT 10, p_window_seconds INT DEFAULT 60
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_count INT; v_oldest TIMESTAMPTZ; v_cutoff TIMESTAMPTZ; v_retry_after INT;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Not authenticated');
  END IF;

  v_cutoff := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  SELECT COUNT(*), MIN(created_at) INTO v_count, v_oldest
  FROM rate_limits WHERE user_id = v_user_id AND action = p_action AND created_at > v_cutoff;

  IF v_count >= p_max_attempts THEN
    v_retry_after := EXTRACT(EPOCH FROM (v_oldest + (p_window_seconds || ' seconds')::INTERVAL - NOW()))::INT;
    IF v_retry_after < 0 THEN v_retry_after := 0; END IF;
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after,
      'message', 'Too many attempts. Please wait ' || v_retry_after || ' seconds.');
  END IF;

  INSERT INTO rate_limits (user_id, action) VALUES (v_user_id, p_action);

  -- Cleanup handled by pg_cron job 'cleanup-old-rate-limits' (hourly)

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Convenience: vote rate limiting (10 per minute)
CREATE OR REPLACE FUNCTION check_vote_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('vote', 10, 60);
$$;

-- Atomic user vote upsert. Targets the partial unique index:
-- votes_user_unique ON votes (dish_id, user_id) WHERE source = 'user'.
-- DROP guarantees replay against an existing DB with the pre-Phase-2 signature
-- cleanly swaps in the new 7-arg form.
DROP FUNCTION IF EXISTS submit_vote_atomic(
  UUID, UUID, BOOLEAN, DECIMAL, TEXT, DECIMAL, DECIMAL, TEXT
);

CREATE OR REPLACE FUNCTION submit_vote_atomic(
  p_dish_id UUID,
  p_user_id UUID,
  p_rating_10 DECIMAL DEFAULT NULL,
  p_review_text TEXT DEFAULT NULL,
  p_purity_score DECIMAL DEFAULT NULL,
  p_war_score DECIMAL DEFAULT NULL,
  p_badge_hash TEXT DEFAULT NULL
)
RETURNS votes AS $$
DECLARE
  submitted_vote votes;
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_rating_10 IS NULL THEN
    RAISE EXCEPTION 'rating_10 is required';
  END IF;

  INSERT INTO votes (
    dish_id,
    user_id,
    rating_10,
    review_text,
    review_created_at,
    purity_score,
    war_score,
    badge_hash,
    source
  )
  VALUES (
    p_dish_id,
    p_user_id,
    p_rating_10,
    p_review_text,
    CASE WHEN p_review_text IS NOT NULL THEN NOW() ELSE NULL END,
    p_purity_score,
    p_war_score,
    p_badge_hash,
    'user'
  )
  ON CONFLICT (dish_id, user_id) WHERE source = 'user'
  DO UPDATE SET
    rating_10 = EXCLUDED.rating_10,
    review_text = EXCLUDED.review_text,
    review_created_at = CASE
      WHEN EXCLUDED.review_text IS DISTINCT FROM votes.review_text
        THEN (CASE WHEN EXCLUDED.review_text IS NOT NULL THEN NOW() ELSE NULL END)
      ELSE votes.review_created_at
    END,
    purity_score = COALESCE(EXCLUDED.purity_score, votes.purity_score),
    war_score = COALESCE(EXCLUDED.war_score, votes.war_score),
    badge_hash = COALESCE(EXCLUDED.badge_hash, votes.badge_hash)
  RETURNING * INTO submitted_vote;

  RETURN submitted_vote;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Convenience: photo upload rate limiting (5 per minute)
CREATE OR REPLACE FUNCTION check_photo_upload_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('photo_upload', 5, 60);
$$;


-- =============================================
-- 12. RESTAURANT MANAGER FUNCTIONS
-- =============================================

-- Get invite details (public preview, no auth required)
CREATE OR REPLACE FUNCTION get_invite_details(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT ri.*, r.name AS restaurant_name INTO v_invite
  FROM restaurant_invites ri JOIN restaurants r ON r.id = ri.restaurant_id
  WHERE ri.token = p_token;

  IF NOT FOUND THEN RETURN json_build_object('valid', false, 'error', 'Invite not found'); END IF;
  IF v_invite.used_by IS NOT NULL THEN RETURN json_build_object('valid', false, 'error', 'Invite already used'); END IF;
  IF v_invite.expires_at < NOW() THEN RETURN json_build_object('valid', false, 'error', 'Invite has expired'); END IF;

  RETURN json_build_object('valid', true, 'restaurant_name', v_invite.restaurant_name,
    'restaurant_id', v_invite.restaurant_id, 'expires_at', v_invite.expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Accept a restaurant invite (atomic)
CREATE OR REPLACE FUNCTION accept_restaurant_invite(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD; v_user_id UUID;
BEGIN
  v_user_id := (select auth.uid());
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Not authenticated'); END IF;

  SELECT ri.*, r.name AS restaurant_name INTO v_invite
  FROM restaurant_invites ri JOIN restaurants r ON r.id = ri.restaurant_id
  WHERE ri.token = p_token FOR UPDATE OF ri;

  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Invite not found'); END IF;
  IF v_invite.used_by IS NOT NULL THEN RETURN json_build_object('success', false, 'error', 'Invite already used'); END IF;
  IF v_invite.expires_at < NOW() THEN RETURN json_build_object('success', false, 'error', 'Invite has expired'); END IF;

  INSERT INTO restaurant_managers (user_id, restaurant_id, role, accepted_at, created_by)
  VALUES (v_user_id, v_invite.restaurant_id, 'manager', NOW(), v_invite.created_by)
  ON CONFLICT (user_id, restaurant_id) DO UPDATE SET accepted_at = NOW();

  UPDATE restaurant_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'restaurant_id', v_invite.restaurant_id,
    'restaurant_name', v_invite.restaurant_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================
-- 13. TRIGGERS
-- =============================================

-- 13a. Update follow counts on follow/unfollow
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.followed_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE id = OLD.followed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_follow_counts ON follows;
CREATE TRIGGER trigger_update_follow_counts
  AFTER INSERT OR DELETE ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- 13b. Create notification on new follow
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT display_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  INSERT INTO notifications (user_id, type, data)
  VALUES (NEW.followed_id, 'follow', jsonb_build_object('follower_id', NEW.follower_id, 'follower_name', COALESCE(follower_name, 'Someone')));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_on_follow ON follows;
CREATE TRIGGER trigger_notify_on_follow
  AFTER INSERT ON follows FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- 13c. Set vote_position and category_snapshot on vote insert
CREATE OR REPLACE FUNCTION on_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  current_vote_count INT;
  dish_category TEXT;
BEGIN
  SELECT COUNT(*) INTO current_vote_count FROM votes WHERE dish_id = NEW.dish_id AND id != NEW.id;
  NEW.vote_position := current_vote_count + 1;

  SELECT category INTO dish_category FROM dishes WHERE id = NEW.dish_id;
  NEW.category_snapshot := dish_category;

  IF NEW.rating_10 IS NOT NULL THEN
    INSERT INTO user_rating_stats (user_id, votes_pending) VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE SET votes_pending = user_rating_stats.votes_pending + 1, updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS vote_insert_trigger ON votes;
CREATE TRIGGER vote_insert_trigger BEFORE INSERT ON votes FOR EACH ROW EXECUTE FUNCTION on_vote_insert();

-- 13d. Check consensus after vote (MAD version)
CREATE OR REPLACE FUNCTION check_consensus_after_vote()
RETURNS TRIGGER AS $$
DECLARE
  total_votes_count INT;
  consensus_avg NUMERIC(3, 1);
  v RECORD;
  user_bias_before NUMERIC(3, 1);
  user_bias_after NUMERIC(3, 1);
  user_deviation NUMERIC(3, 1);
  is_early BOOLEAN;
  dish_name_snapshot TEXT;
  consensus_threshold INT := 5;
BEGIN
  IF NEW.rating_10 IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*), ROUND(AVG(rating_10), 1) INTO total_votes_count, consensus_avg
  FROM votes WHERE dish_id = NEW.dish_id AND rating_10 IS NOT NULL;

  IF total_votes_count >= consensus_threshold THEN
    IF NOT EXISTS (SELECT 1 FROM dishes WHERE id = NEW.dish_id AND consensus_ready = TRUE) THEN
      SELECT name INTO dish_name_snapshot FROM dishes WHERE id = NEW.dish_id;

      UPDATE dishes SET consensus_rating = consensus_avg, consensus_ready = TRUE,
        consensus_votes = total_votes_count, consensus_calculated_at = NOW()
      WHERE id = NEW.dish_id;

      FOR v IN SELECT * FROM votes WHERE dish_id = NEW.dish_id AND scored_at IS NULL AND rating_10 IS NOT NULL
      LOOP
        user_deviation := ROUND(v.rating_10 - consensus_avg, 1);
        is_early := v.vote_position <= 3;

        SELECT rating_bias INTO user_bias_before FROM user_rating_stats WHERE user_id = v.user_id;
        IF user_bias_before IS NULL THEN user_bias_before := 0.0; END IF;

        UPDATE votes SET scored_at = NOW() WHERE id = v.id;

        -- Use ABS for overall bias (MAD)
        SELECT ROUND(AVG(ABS(votes.rating_10 - d.consensus_rating)), 1) INTO user_bias_after
        FROM votes JOIN dishes d ON votes.dish_id = d.id
        WHERE votes.user_id = v.user_id AND d.consensus_ready = TRUE
          AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL;

        IF user_bias_after IS NULL THEN user_bias_after := ABS(user_deviation); END IF;

        INSERT INTO bias_events (user_id, dish_id, dish_name, user_rating, consensus_rating, deviation, was_early_voter, bias_before, bias_after)
        VALUES (v.user_id, v.dish_id, dish_name_snapshot, v.rating_10, consensus_avg, user_deviation, is_early, user_bias_before, user_bias_after);

        INSERT INTO user_rating_stats (user_id, rating_bias, votes_with_consensus, votes_pending, dishes_helped_establish, bias_label)
        VALUES (v.user_id, user_bias_after, 1, -1, CASE WHEN is_early THEN 1 ELSE 0 END, get_bias_label(user_bias_after))
        ON CONFLICT (user_id) DO UPDATE SET
          rating_bias = user_bias_after,
          votes_with_consensus = user_rating_stats.votes_with_consensus + 1,
          votes_pending = GREATEST(0, user_rating_stats.votes_pending - 1),
          dishes_helped_establish = user_rating_stats.dishes_helped_establish + CASE WHEN is_early THEN 1 ELSE 0 END,
          bias_label = get_bias_label(user_bias_after),
          updated_at = NOW();

        -- Category biases stay SIGNED
        UPDATE user_rating_stats SET category_biases = jsonb_set(
          COALESCE(category_biases, '{}'::jsonb), ARRAY[v.category_snapshot],
          (SELECT to_jsonb(ROUND(AVG(votes.rating_10 - d.consensus_rating), 1))
           FROM votes JOIN dishes d ON votes.dish_id = d.id
           WHERE votes.user_id = v.user_id AND d.consensus_ready = TRUE
             AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL
             AND votes.category_snapshot = v.category_snapshot), TRUE)
        WHERE user_id = v.user_id;
      END LOOP;
    ELSE
      -- Consensus already exists: score just this vote against updated consensus
      SELECT name INTO dish_name_snapshot FROM dishes WHERE id = NEW.dish_id;

      -- Refresh consensus to reflect the new vote
      UPDATE dishes SET consensus_rating = consensus_avg,
        consensus_votes = total_votes_count, consensus_calculated_at = NOW()
      WHERE id = NEW.dish_id;

      user_deviation := ROUND(NEW.rating_10 - consensus_avg, 1);
      is_early := FALSE;

      SELECT rating_bias INTO user_bias_before FROM user_rating_stats WHERE user_id = NEW.user_id;
      IF user_bias_before IS NULL THEN user_bias_before := 0.0; END IF;

      UPDATE votes SET scored_at = NOW() WHERE id = NEW.id;

      SELECT ROUND(AVG(ABS(votes.rating_10 - d.consensus_rating)), 1) INTO user_bias_after
      FROM votes JOIN dishes d ON votes.dish_id = d.id
      WHERE votes.user_id = NEW.user_id AND d.consensus_ready = TRUE
        AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL;

      IF user_bias_after IS NULL THEN user_bias_after := ABS(user_deviation); END IF;

      INSERT INTO bias_events (user_id, dish_id, dish_name, user_rating, consensus_rating, deviation, was_early_voter, bias_before, bias_after)
      VALUES (NEW.user_id, NEW.dish_id, dish_name_snapshot, NEW.rating_10, consensus_avg, user_deviation, is_early, user_bias_before, user_bias_after);

      INSERT INTO user_rating_stats (user_id, rating_bias, votes_with_consensus, votes_pending, dishes_helped_establish, bias_label)
      VALUES (NEW.user_id, user_bias_after, 1, -1, 0, get_bias_label(user_bias_after))
      ON CONFLICT (user_id) DO UPDATE SET
        rating_bias = user_bias_after,
        votes_with_consensus = user_rating_stats.votes_with_consensus + 1,
        votes_pending = GREATEST(0, user_rating_stats.votes_pending - 1),
        bias_label = get_bias_label(user_bias_after),
        updated_at = NOW();

      -- Category biases stay SIGNED
      UPDATE user_rating_stats SET category_biases = jsonb_set(
        COALESCE(category_biases, '{}'::jsonb), ARRAY[NEW.category_snapshot],
        (SELECT to_jsonb(ROUND(AVG(votes.rating_10 - d.consensus_rating), 1))
         FROM votes JOIN dishes d ON votes.dish_id = d.id
         WHERE votes.user_id = NEW.user_id AND d.consensus_ready = TRUE
           AND votes.rating_10 IS NOT NULL AND votes.scored_at IS NOT NULL
           AND votes.category_snapshot = NEW.category_snapshot), TRUE)
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS consensus_check_trigger ON votes;
CREATE TRIGGER consensus_check_trigger AFTER INSERT ON votes FOR EACH ROW EXECUTE FUNCTION check_consensus_after_vote();

-- 13e. Update dish avg_rating on vote changes
-- Source weighting: ai_estimated votes count 0.5x (matches get_ranked_dishes RPC)
CREATE OR REPLACE FUNCTION update_dish_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dishes
  SET avg_rating = sub.avg_r,
      total_votes = sub.raw_count,
      weighted_vote_count = sub.weighted_count
  FROM (
    SELECT
      ROUND(
        (SUM(rating_10 * CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
         NULLIF(SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)
        )::NUMERIC, 1
      ) AS avg_r,
      COUNT(*)::INT AS raw_count,
      COALESCE(SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)::NUMERIC AS weighted_count
    FROM votes WHERE dish_id = COALESCE(NEW.dish_id, OLD.dish_id) AND rating_10 IS NOT NULL
  ) sub
  WHERE dishes.id = COALESCE(NEW.dish_id, OLD.dish_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_dish_rating_on_vote ON votes;
CREATE TRIGGER update_dish_rating_on_vote
  AFTER INSERT OR UPDATE OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION update_dish_avg_rating();

-- 13f. Compute value_score on dish insert/update
CREATE OR REPLACE FUNCTION compute_value_score()
RETURNS TRIGGER AS $$
DECLARE
  v_median DECIMAL;
BEGIN
  -- Null out if dish doesn't qualify
  IF NEW.price IS NULL OR NEW.price <= 0 OR NEW.total_votes < 8 OR NEW.avg_rating IS NULL THEN
    NEW.value_score := NULL;
    NEW.category_median_price := NULL;
    RETURN NEW;
  END IF;

  -- Look up category median price
  SELECT median_price INTO v_median
  FROM category_median_prices
  WHERE category = NEW.category;

  IF v_median IS NULL THEN
    NEW.value_score := NULL;
    NEW.category_median_price := NULL;
    RETURN NEW;
  END IF;

  NEW.category_median_price := v_median;
  NEW.value_score := ROUND(
    ((0.50 * NEW.avg_rating + 0.50 * (NEW.avg_rating / LOG(GREATEST(NEW.price / v_median, 0.1) + 2))) * 10)::NUMERIC,
    2
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_compute_value_score ON dishes;
CREATE TRIGGER trigger_compute_value_score
  BEFORE INSERT OR UPDATE OF avg_rating, total_votes, price, category ON dishes
  FOR EACH ROW EXECUTE FUNCTION compute_value_score();

-- 13g. Column-level field protection on tables managers can write to.
-- Non-admin writes (managers + regular users) cannot modify computed/identity
-- fields. System contexts (service_role, postgres, supabase_admin) and
-- SECURITY DEFINER triggers bypass via current_user check. Trigger names
-- sort before 'trigger_compute_value_score' so they fire first.

CREATE OR REPLACE FUNCTION protect_dish_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.id := uuid_generate_v4();
    NEW.created_at := NOW();
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

DROP TRIGGER IF EXISTS dishes_protect_fields ON dishes;
CREATE TRIGGER dishes_protect_fields
BEFORE INSERT OR UPDATE ON dishes
FOR EACH ROW EXECUTE FUNCTION protect_dish_fields();

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

DROP TRIGGER IF EXISTS specials_protect_fields ON specials;
CREATE TRIGGER specials_protect_fields
BEFORE INSERT OR UPDATE ON specials
FOR EACH ROW EXECUTE FUNCTION protect_special_fields();

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
FOR EACH ROW EXECUTE FUNCTION protect_event_fields();

CREATE OR REPLACE FUNCTION protect_restaurant_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  -- Managers can only change contact/social/menu/order fields. Identity + geo frozen.
  -- menu_last_checked + menu_content_hash are menu-refresh bookkeeping — frozen
  -- so managers can't force or skip auto-scrapes.
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
FOR EACH ROW EXECUTE FUNCTION protect_restaurant_fields();

-- 13h. Batch recalculate value percentiles (called by pg_cron every 2 hours)
CREATE OR REPLACE FUNCTION recalculate_value_percentiles()
RETURNS VOID AS $$
BEGIN
  -- Refresh category_median_price and value_score on all qualifying rows
  UPDATE dishes d SET
    category_median_price = cmp.median_price,
    value_score = ROUND(
      ((0.50 * d.avg_rating + 0.50 * (d.avg_rating / LOG(GREATEST(d.price / cmp.median_price, 0.1) + 2))) * 10)::NUMERIC,
      2
    )
  FROM category_median_prices cmp
  WHERE cmp.category = d.category
    AND d.price IS NOT NULL AND d.price > 0
    AND d.total_votes >= 8
    AND d.avg_rating IS NOT NULL;

  -- Zero out non-qualifying dishes
  UPDATE dishes SET value_score = NULL, value_percentile = NULL, category_median_price = NULL
  WHERE price IS NULL OR price <= 0 OR total_votes < 8 OR avg_rating IS NULL;

  -- Assign percentiles only to categories with >= 8 qualifying dishes
  UPDATE dishes d SET value_percentile = ranked.pct
  FROM (
    SELECT id,
      ROUND((PERCENT_RANK() OVER (PARTITION BY category ORDER BY value_score ASC) * 100)::NUMERIC, 2) AS pct
    FROM dishes
    WHERE value_score IS NOT NULL
      AND category IN (
        SELECT category FROM dishes WHERE value_score IS NOT NULL GROUP BY category HAVING COUNT(*) >= 8
      )
  ) ranked
  WHERE d.id = ranked.id;

  -- Zero out percentile for categories with fewer than 8 qualifying dishes
  UPDATE dishes SET value_percentile = NULL
  WHERE value_score IS NOT NULL
    AND category NOT IN (
      SELECT category FROM dishes WHERE value_score IS NOT NULL GROUP BY category HAVING COUNT(*) >= 8
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- pg_cron: recalculate value percentiles every 2 hours (enabled in production)
SELECT cron.schedule('recalculate-value-percentiles', '0 */2 * * *', $$SELECT recalculate_value_percentiles()$$);

-- pg_cron: clean up expired rate limit entries hourly (enabled in production)
SELECT cron.schedule('cleanup-old-rate-limits', '15 * * * *', $$DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour'$$);


-- =============================================
-- 13x. Merge a new jitter sample into the user's running profile
-- Called by trigger after jitter_samples INSERT
CREATE OR REPLACE FUNCTION merge_jitter_sample()
RETURNS TRIGGER AS $$
DECLARE
  existing_profile JSONB;
  new_sample JSONB;
  sample_count INTEGER;
  new_confidence TEXT;
  new_consistency DECIMAL(4, 3);
BEGIN
  new_sample := NEW.sample_data;

  -- Get or initialize profile
  SELECT profile_data, review_count INTO existing_profile, sample_count
  FROM jitter_profiles WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    -- First sample: create profile directly from sample
    INSERT INTO jitter_profiles (user_id, profile_data, review_count, confidence_level, consistency_score, last_updated)
    VALUES (
      NEW.user_id,
      new_sample,
      1,
      'low',
      0,
      NOW()
    );
  ELSE
    sample_count := sample_count + 1;

    -- Determine confidence level
    IF sample_count >= 15 THEN
      new_confidence := 'high';
    ELSIF sample_count >= 5 THEN
      new_confidence := 'medium';
    ELSE
      new_confidence := 'low';
    END IF;

    -- Calculate consistency: compare new sample's mean_inter_key to running profile's
    -- Consistency = 1 - normalized_deviation (higher = more consistent)
    new_consistency := 0;
    IF existing_profile ? 'mean_inter_key' AND new_sample ? 'mean_inter_key'
       AND (existing_profile->>'mean_inter_key')::DECIMAL > 0 THEN
      new_consistency := GREATEST(0, LEAST(1,
        1.0 - ABS(
          (new_sample->>'mean_inter_key')::DECIMAL - (existing_profile->>'mean_inter_key')::DECIMAL
        ) / (existing_profile->>'mean_inter_key')::DECIMAL
      ));
      -- Weighted running average with existing consistency
      IF (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) > 0 THEN
        new_consistency := (
          (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) *
          (sample_count - 1) + new_consistency
        ) / sample_count;
      END IF;
    END IF;

    -- Merge: running weighted average of key metrics
    UPDATE jitter_profiles SET
      profile_data = jsonb_build_object(
        'mean_inter_key', ROUND((
          COALESCE((existing_profile->>'mean_inter_key')::DECIMAL, 0) * (sample_count - 1) +
          COALESCE((new_sample->>'mean_inter_key')::DECIMAL, 0)
        ) / sample_count, 2),
        'std_inter_key', ROUND((
          COALESCE((existing_profile->>'std_inter_key')::DECIMAL, 0) * (sample_count - 1) +
          COALESCE((new_sample->>'std_inter_key')::DECIMAL, 0)
        ) / sample_count, 2),
        'mean_dwell', CASE
          WHEN new_sample ? 'mean_dwell' AND new_sample->>'mean_dwell' IS NOT NULL
          THEN ROUND((
            COALESCE((existing_profile->>'mean_dwell')::DECIMAL, (new_sample->>'mean_dwell')::DECIMAL) * (sample_count - 1) +
            (new_sample->>'mean_dwell')::DECIMAL
          ) / sample_count, 2)
          ELSE existing_profile->'mean_dwell'
        END,
        'std_dwell', CASE
          WHEN new_sample ? 'std_dwell' AND new_sample->>'std_dwell' IS NOT NULL
          THEN ROUND((
            COALESCE((existing_profile->>'std_dwell')::DECIMAL, (new_sample->>'std_dwell')::DECIMAL) * (sample_count - 1) +
            (new_sample->>'std_dwell')::DECIMAL
          ) / sample_count, 2)
          ELSE existing_profile->'std_dwell'
        END,
        'bigram_signatures', COALESCE(existing_profile->'bigram_signatures', '{}'::JSONB) ||
                             COALESCE(new_sample->'bigram_signatures', '{}'::JSONB),
        'fatigue_drift', new_sample->'fatigue_drift',
        'total_keystrokes', COALESCE((existing_profile->>'total_keystrokes')::INTEGER, 0) +
          COALESCE((new_sample->>'total_keystrokes')::INTEGER, 0)
      ),
      review_count = sample_count,
      confidence_level = new_confidence,
      consistency_score = ROUND(new_consistency::NUMERIC, 3),
      last_updated = NOW()
    WHERE user_id = NEW.user_id;
  END IF;

  -- Prune old samples (keep last 30)
  DELETE FROM jitter_samples
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM jitter_samples
      WHERE user_id = NEW.user_id
      ORDER BY collected_at DESC
      LIMIT 30
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS jitter_sample_merge ON jitter_samples;
CREATE TRIGGER jitter_sample_merge
  AFTER INSERT ON jitter_samples
  FOR EACH ROW
  EXECUTE FUNCTION merge_jitter_sample();

-- Convenience: restaurant creation rate limiting (5 per hour)
CREATE OR REPLACE FUNCTION check_restaurant_create_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('restaurant_create', 5, 3600);
$$;

-- Convenience: dish creation rate limiting (20 per hour)
CREATE OR REPLACE FUNCTION check_dish_create_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('dish_create', 20, 3600);
$$;

-- Find nearby restaurants (for duplicate detection and "you're here" suggestions)
CREATE OR REPLACE FUNCTION find_nearby_restaurants(
  p_name TEXT DEFAULT NULL,
  p_lat DECIMAL DEFAULT NULL,
  p_lng DECIMAL DEFAULT NULL,
  p_radius_meters INT DEFAULT 150
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat DECIMAL,
  lng DECIMAL,
  google_place_id TEXT,
  distance_meters DECIMAL
) AS $$
DECLARE
  lat_delta DECIMAL := p_radius_meters / 111320.0;
  lng_delta DECIMAL := p_radius_meters / (111320.0 * COS(RADIANS(COALESCE(p_lat, 0))));
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    r.address,
    r.lat,
    r.lng,
    r.google_place_id,
    ROUND((
      6371000 * ACOS(
        LEAST(1.0, GREATEST(-1.0,
          COS(RADIANS(p_lat)) * COS(RADIANS(r.lat)) *
          COS(RADIANS(r.lng) - RADIANS(p_lng)) +
          SIN(RADIANS(p_lat)) * SIN(RADIANS(r.lat))
        ))
      )
    )::NUMERIC, 1) AS distance_meters
  FROM restaurants r
  WHERE
    (p_lat IS NULL OR (
      r.lat BETWEEN (p_lat - lat_delta) AND (p_lat + lat_delta)
      AND r.lng BETWEEN (p_lng - lng_delta) AND (p_lng + lng_delta)
    ))
    AND (p_name IS NULL OR r.name ILIKE '%' || p_name || '%')
  ORDER BY
    CASE WHEN p_lat IS NOT NULL THEN
      6371000 * ACOS(
        LEAST(1.0, GREATEST(-1.0,
          COS(RADIANS(p_lat)) * COS(RADIANS(r.lat)) *
          COS(RADIANS(r.lng) - RADIANS(p_lng)) +
          SIN(RADIANS(p_lat)) * SIN(RADIANS(r.lat))
        ))
      )
    ELSE 0 END ASC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Get restaurants within radius (distance-filtered restaurant list)
CREATE OR REPLACE FUNCTION get_restaurants_within_radius(
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_radius_miles INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  lat DECIMAL,
  lng DECIMAL,
  is_open BOOLEAN,
  cuisine TEXT,
  town TEXT,
  google_place_id TEXT,
  website_url TEXT,
  phone TEXT,
  distance_miles DECIMAL,
  dish_count BIGINT,
  avg_rating DECIMAL,
  total_votes BIGINT
) AS $$
DECLARE
  lat_delta DECIMAL := p_radius_miles / 69.0;
  lng_delta DECIMAL := p_radius_miles / (69.0 * COS(RADIANS(p_lat)));
BEGIN
  RETURN QUERY
  WITH nearby AS (
    SELECT r.id, r.name, r.address, r.lat, r.lng, r.is_open, r.cuisine, r.town,
           r.google_place_id, r.website_url, r.phone,
           ROUND((
             3959 * ACOS(
               LEAST(1.0, GREATEST(-1.0,
                 COS(RADIANS(p_lat)) * COS(RADIANS(r.lat)) *
                 COS(RADIANS(r.lng) - RADIANS(p_lng)) +
                 SIN(RADIANS(p_lat)) * SIN(RADIANS(r.lat))
               ))
             )
           )::NUMERIC, 2) AS distance_miles
    FROM restaurants r
    WHERE r.lat BETWEEN (p_lat - lat_delta) AND (p_lat + lat_delta)
      AND r.lng BETWEEN (p_lng - lng_delta) AND (p_lng + lng_delta)
  )
  SELECT
    n.id, n.name, n.address, n.lat, n.lng, n.is_open, n.cuisine, n.town,
    n.google_place_id, n.website_url, n.phone,
    n.distance_miles,
    COUNT(d.id)::BIGINT AS dish_count,
    ROUND(AVG(d.avg_rating) FILTER (WHERE d.avg_rating IS NOT NULL AND d.total_votes > 0)::NUMERIC, 1) AS avg_rating,
    COALESCE(SUM(d.total_votes), 0)::BIGINT AS total_votes
  FROM nearby n
  LEFT JOIN dishes d ON d.restaurant_id = n.id AND d.parent_dish_id IS NULL
  WHERE n.distance_miles <= p_radius_miles
  GROUP BY n.id, n.name, n.address, n.lat, n.lng, n.is_open, n.cuisine, n.town,
           n.google_place_id, n.website_url, n.phone, n.distance_miles
  ORDER BY n.distance_miles ASC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;


-- =============================================
-- 13z. LOCAL LISTS (curated dish lists by MV locals)
-- =============================================

-- 13z-a. local_lists
CREATE TABLE IF NOT EXISTS local_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  curator_tagline TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT local_lists_one_per_user UNIQUE (user_id)
);

-- 13z-b. local_list_items
CREATE TABLE IF NOT EXISTS local_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES local_lists(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  position INT NOT NULL,
  note TEXT,
  CONSTRAINT local_list_items_unique_dish UNIQUE (list_id, dish_id),
  CONSTRAINT local_list_items_unique_position UNIQUE (list_id, position),
  CONSTRAINT local_list_items_position_range CHECK (position >= 1 AND position <= 10)
);

-- Indexes for local lists
CREATE INDEX IF NOT EXISTS idx_local_lists_user_id ON local_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_local_lists_is_active ON local_lists(is_active);
CREATE INDEX IF NOT EXISTS idx_local_list_items_list_position ON local_list_items(list_id, position);
CREATE INDEX IF NOT EXISTS idx_local_list_items_dish_id ON local_list_items(dish_id);
CREATE INDEX IF NOT EXISTS idx_favorites_dish_id ON favorites(dish_id);

-- RLS for local_lists
ALTER TABLE local_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "local_lists_public_read"
  ON local_lists FOR SELECT
  USING (is_active = true);

CREATE POLICY "local_lists_admin_insert"
  ON local_lists FOR INSERT
  WITH CHECK (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_update"
  ON local_lists FOR UPDATE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

CREATE POLICY "local_lists_admin_delete"
  ON local_lists FOR DELETE
  USING (is_admin() OR (auth.uid() = user_id AND is_local_curator()));

-- RLS for local_list_items
ALTER TABLE local_list_items ENABLE ROW LEVEL SECURITY;

-- Only expose items whose parent list is active. Prevents leaking unpublished curator drafts.
CREATE POLICY "local_list_items_public_read"
  ON local_list_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM local_lists ll WHERE ll.id = list_id AND ll.is_active = true));

CREATE POLICY "local_list_items_admin_insert"
  ON local_list_items FOR INSERT
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_update"
  ON local_list_items FOR UPDATE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

CREATE POLICY "local_list_items_admin_delete"
  ON local_list_items FOR DELETE
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM local_lists ll
      WHERE ll.id = list_id AND ll.user_id = auth.uid()
    )
  );

-- RPC: Homepage preview (active lists with dish previews + taste compatibility)
DROP FUNCTION IF EXISTS get_local_lists_for_homepage();
DROP FUNCTION IF EXISTS get_local_lists_for_homepage(UUID);

CREATE OR REPLACE FUNCTION get_local_lists_for_homepage(p_viewer_id UUID DEFAULT NULL)
RETURNS TABLE (
  list_id UUID,
  user_id UUID,
  title TEXT,
  description TEXT,
  display_name TEXT,
  avatar_url TEXT,
  curator_tagline TEXT,
  item_count INT,
  preview_dishes TEXT[],
  compatibility_pct INT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.id AS list_id,
    ll.user_id,
    ll.title,
    ll.description,
    p.display_name,
    p.avatar_url,
    ll.curator_tagline,
    (SELECT COUNT(*)::INT FROM local_list_items WHERE list_id = ll.id) AS item_count,
    (SELECT ARRAY_AGG(d.name ORDER BY li."position")
     FROM local_list_items li
     JOIN dishes d ON d.id = li.dish_id
     WHERE li.list_id = ll.id AND li."position" <= 4) AS preview_dishes,
    CASE
      WHEN p_viewer_id IS NOT NULL AND p_viewer_id != ll.user_id THEN (
        SELECT CASE
          WHEN COUNT(*) >= 3 THEN ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT
          ELSE NULL
        END
        FROM votes a
        JOIN votes b ON a.dish_id = b.dish_id
        WHERE a.user_id = p_viewer_id AND b.user_id = ll.user_id
          AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
      )
      ELSE NULL
    END AS compatibility_pct
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  WHERE ll.is_active = true
  ORDER BY RANDOM()
  LIMIT 8;
$$;

-- RPC: Aggregate locals picks for homepage chalkboard cards
DROP FUNCTION IF EXISTS get_locals_aggregate();

CREATE OR REPLACE FUNCTION get_locals_aggregate()
RETURNS TABLE (
  top_dish_id UUID,
  top_dish_name TEXT,
  top_dish_restaurant_name TEXT,
  top_dish_restaurant_id UUID,
  top_dish_list_count INT,
  top_restaurant_id UUID,
  top_restaurant_name TEXT,
  top_restaurant_town TEXT,
  top_restaurant_list_count INT,
  total_lists INT
)
LANGUAGE SQL STABLE
AS $$
  WITH list_count AS (
    SELECT COUNT(DISTINCT ll.id)::INT AS total
    FROM local_lists ll
    JOIN local_list_items li ON li.list_id = ll.id
  ),
  dish_counts AS (
    SELECT
      li.dish_id,
      d.name AS dish_name,
      r.name AS restaurant_name,
      d.restaurant_id,
      COUNT(DISTINCT ll.id)::INT AS list_count,
      MAX(d.avg_rating) AS avg_rating
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    JOIN dishes d ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    GROUP BY li.dish_id, d.name, r.name, d.restaurant_id
    ORDER BY list_count DESC, avg_rating DESC NULLS LAST
    LIMIT 1
  ),
  restaurant_counts AS (
    SELECT
      d.restaurant_id,
      r.name AS restaurant_name,
      r.town,
      COUNT(DISTINCT ll.id)::INT AS list_count
    FROM local_list_items li
    JOIN local_lists ll ON ll.id = li.list_id
    JOIN dishes d ON d.id = li.dish_id
    JOIN restaurants r ON r.id = d.restaurant_id
    GROUP BY d.restaurant_id, r.name, r.town
    ORDER BY list_count DESC
    LIMIT 1
  )
  SELECT
    dc.dish_id AS top_dish_id,
    dc.dish_name AS top_dish_name,
    dc.restaurant_name AS top_dish_restaurant_name,
    dc.restaurant_id AS top_dish_restaurant_id,
    dc.list_count AS top_dish_list_count,
    rc.restaurant_id AS top_restaurant_id,
    rc.restaurant_name AS top_restaurant_name,
    rc.town AS top_restaurant_town,
    rc.list_count AS top_restaurant_list_count,
    lc.total AS total_lists
  FROM dish_counts dc, restaurant_counts rc, list_count lc;
$$;

-- RPC: Full list detail by user ID (for profile pages)
CREATE OR REPLACE FUNCTION get_local_list_by_user(target_user_id UUID)
RETURNS TABLE (
  list_id UUID,
  title TEXT,
  description TEXT,
  user_id UUID,
  display_name TEXT,
  "position" INT,
  dish_id UUID,
  dish_name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  avg_rating NUMERIC,
  total_votes BIGINT,
  category TEXT,
  note TEXT,
  restaurant_lat FLOAT,
  restaurant_lng FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    ll.id AS list_id,
    ll.title,
    ll.description,
    ll.user_id,
    p.display_name,
    li."position",
    d.id AS dish_id,
    d.name AS dish_name,
    r.name AS restaurant_name,
    r.id AS restaurant_id,
    d.avg_rating,
    d.total_votes,
    d.category,
    li.note,
    r.lat AS restaurant_lat,
    r.lng AS restaurant_lng
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  JOIN local_list_items li ON li.list_id = ll.id
  JOIN dishes d ON d.id = li.dish_id
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = target_user_id
    AND ll.is_active = true
  ORDER BY li."position";
$$;

-- RPC: Admin (or user with profiles.can_invite_curators = true) creates a curator invite link
CREATE OR REPLACE FUNCTION create_curator_invite()
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND can_invite_curators = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO curator_invites (created_by)
  VALUES (auth.uid())
  RETURNING * INTO v_invite;

  RETURN json_build_object(
    'success', true,
    'token', v_invite.token,
    'expires_at', v_invite.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Validate a curator invite token (public via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_curator_invite_details(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invite already used');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('valid', false, 'error', 'Invite has expired');
  END IF;

  RETURN json_build_object('valid', true, 'expires_at', v_invite.expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Accept curator invite — sets flag, creates empty list
CREATE OR REPLACE FUNCTION accept_curator_invite(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_display_name TEXT;
  v_list_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_invite FROM curator_invites WHERE token = p_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;
  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invite already used');
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Invite has expired');
  END IF;

  -- Set curator flag
  UPDATE profiles SET is_local_curator = true WHERE id = v_user_id;

  -- Get display name for default title
  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_user_id;

  -- Create empty list (is_active = false until they add dishes)
  INSERT INTO local_lists (user_id, title, is_active)
  VALUES (v_user_id, COALESCE(v_display_name, 'My') || '''s Top 10', false)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_list_id;

  -- If list already existed, just get its ID
  IF v_list_id IS NULL THEN
    SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;
  END IF;

  -- Mark invite as used
  UPDATE curator_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'list_id', v_list_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Get authenticated user's own local list (regardless of is_active)
CREATE OR REPLACE FUNCTION get_my_local_list()
RETURNS TABLE (
  list_id UUID,
  title TEXT,
  description TEXT,
  curator_tagline TEXT,
  is_active BOOLEAN,
  "position" INT,
  dish_id UUID,
  dish_name TEXT,
  restaurant_name TEXT,
  restaurant_id UUID,
  avg_rating NUMERIC,
  total_votes BIGINT,
  category TEXT,
  note TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ll.id AS list_id,
    ll.title,
    ll.description,
    ll.curator_tagline,
    ll.is_active,
    li."position",
    d.id AS dish_id,
    d.name AS dish_name,
    r.name AS restaurant_name,
    r.id AS restaurant_id,
    d.avg_rating,
    d.total_votes,
    d.category,
    li.note
  FROM local_lists ll
  LEFT JOIN local_list_items li ON li.list_id = ll.id
  LEFT JOIN dishes d ON d.id = li.dish_id
  LEFT JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = auth.uid()
  ORDER BY li."position";
$$;

-- RPC: Atomic save of curator's own list (replaces all items)
CREATE OR REPLACE FUNCTION save_my_local_list(
  p_tagline TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_list_id UUID;
  v_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check curator status
  IF NOT is_local_curator() THEN
    RETURN json_build_object('success', false, 'error', 'Not a local curator');
  END IF;

  -- Validate item count
  IF jsonb_array_length(p_items) > 10 THEN
    RETURN json_build_object('success', false, 'error', 'Maximum 10 dishes allowed');
  END IF;

  -- Get existing list
  SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;

  IF v_list_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No list found — accept an invite first');
  END IF;

  -- Update list metadata
  UPDATE local_lists
  SET curator_tagline = p_tagline,
      is_active = jsonb_array_length(p_items) > 0
  WHERE id = v_list_id;

  -- Replace all items
  DELETE FROM local_list_items WHERE list_id = v_list_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO local_list_items (list_id, dish_id, "position", note)
    VALUES (
      v_list_id,
      (v_item->>'dish_id')::UUID,
      (v_item->>'position')::INT,
      v_item->>'note'
    );
  END LOOP;

  RETURN json_build_object('success', true, 'list_id', v_list_id, 'item_count', jsonb_array_length(p_items));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =============================================
-- 14. GRANTS
-- =============================================

GRANT SELECT ON public_votes TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_smart_snippet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_smart_snippet(UUID) TO anon;
GRANT EXECUTE ON FUNCTION check_and_record_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_vote_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION submit_vote_atomic(UUID, UUID, DECIMAL, TEXT, DECIMAL, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_photo_upload_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_restaurant_create_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_dish_create_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearby_restaurants TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearby_restaurants TO anon;
GRANT EXECUTE ON FUNCTION get_restaurants_within_radius(DECIMAL, DECIMAL, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_restaurants_within_radius(DECIMAL, DECIMAL, INT) TO anon;


-- =============================================
-- 15. STORAGE POLICIES
-- =============================================

-- dish-photos bucket
DROP POLICY IF EXISTS "dish_photos_public_read" ON storage.objects;
CREATE POLICY "dish_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dish-photos');

DROP POLICY IF EXISTS "dish_photos_insert_own" ON storage.objects;
CREATE POLICY "dish_photos_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dish-photos'
    AND (select auth.uid()) = owner
    AND (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'))
  );

DROP POLICY IF EXISTS "dish_photos_update_own" ON storage.objects;
CREATE POLICY "dish_photos_update_own" ON storage.objects
  FOR UPDATE USING (bucket_id = 'dish-photos' AND (select auth.uid()) = owner);

DROP POLICY IF EXISTS "dish_photos_delete_own" ON storage.objects;
CREATE POLICY "dish_photos_delete_own" ON storage.objects
  FOR DELETE USING (bucket_id = 'dish-photos' AND (select auth.uid()) = owner);


-- =============================================
-- 16. BADGE SEED DATA (41 badges after cleanup)
-- =============================================
-- Families: category, discovery, consistency, influence
-- Deleted: volume (10), community (3), old discovery (3), order-this (3),
--          first-reviewer (3), taste_authority (1), soup/pokebowl/fried_chicken/entree (8)

INSERT INTO badges (key, name, subtitle, description, icon, is_public_eligible, sort_order, rarity, family, category) VALUES
  -- Hidden Gem badges (discovery)
  ('hidden_gem_finder', 'Hidden Gem Finder', 'Spotted potential', 'Voted early on a dish that became a hidden gem', '💎', false, 84, 'common', 'discovery', NULL),
  ('gem_hunter', 'Gem Hunter', 'Sharp eye for quality', 'Found 5 hidden gems before the crowd', '🔍', false, 82, 'uncommon', 'discovery', NULL),
  ('gem_collector', 'Gem Collector', 'Treasure hunter', 'Discovered 10 hidden gems early', '🏆', true, 80, 'rare', 'discovery', NULL),

  -- Called It badges (discovery)
  ('good_call', 'Good Call', 'Nailed it', 'Predicted a dish would be great and the crowd agreed', '📞', false, 102, 'common', 'discovery', NULL),
  ('taste_prophet', 'Taste Prophet', 'Ahead of the curve', 'Called it right on 3 dishes before consensus', '🔮', false, 100, 'uncommon', 'discovery', NULL),
  ('oracle', 'Oracle', 'The taste whisperer', 'Predicted 5 crowd favorites before anyone else', '🌟', true, 98, 'rare', 'discovery', NULL),

  -- Consistency badges
  ('steady_hand', 'Steady Hand', 'Right on target', 'Global bias within 0.5 of consensus with 20+ rated', '🎯', true, 60, 'uncommon', 'consistency', NULL),
  ('tough_critic', 'Tough Critic', 'Holding the line', 'Consistently rates below consensus (bias <= -1.5)', '🧐', false, 58, 'uncommon', 'consistency', NULL),
  ('generous_spirit', 'Generous Spirit', 'Spreading the love', 'Consistently rates above consensus (bias >= 1.5)', '💛', false, 56, 'uncommon', 'consistency', NULL),

  -- Influence badges (10/25 thresholds)
  ('taste_maker', 'Taste Maker', 'Building a following', '10+ followers trust your taste', '📣', false, 48, 'uncommon', 'influence', NULL),
  ('trusted_voice', 'Trusted Voice', 'People listen', '25+ followers trust your taste', '🎙️', true, 46, 'rare', 'influence', NULL),

  -- Category Mastery badges (13 categories x 2 tiers = 26)
  ('specialist_pizza', 'Pizza Specialist', 'Pizza expert', '10+ consensus-rated pizza dishes with accurate taste', '🍕', true, 40, 'rare', 'category', 'pizza'),
  ('authority_pizza', 'Pizza Authority', 'Pizza master', '20+ consensus-rated pizza dishes with elite accuracy', '🍕', true, 39, 'epic', 'category', 'pizza'),
  ('specialist_burger', 'Burger Specialist', 'Burger expert', '10+ consensus-rated burger dishes with accurate taste', '🍔', true, 40, 'rare', 'category', 'burger'),
  ('authority_burger', 'Burger Authority', 'Burger master', '20+ consensus-rated burger dishes with elite accuracy', '🍔', true, 39, 'epic', 'category', 'burger'),
  ('specialist_taco', 'Taco Specialist', 'Taco expert', '10+ consensus-rated taco dishes with accurate taste', '🌮', true, 40, 'rare', 'category', 'taco'),
  ('authority_taco', 'Taco Authority', 'Taco master', '20+ consensus-rated taco dishes with elite accuracy', '🌮', true, 39, 'epic', 'category', 'taco'),
  ('specialist_wings', 'Wings Specialist', 'Wings expert', '10+ consensus-rated wing dishes with accurate taste', '🍗', true, 40, 'rare', 'category', 'wings'),
  ('authority_wings', 'Wings Authority', 'Wings master', '20+ consensus-rated wing dishes with elite accuracy', '🍗', true, 39, 'epic', 'category', 'wings'),
  ('specialist_sushi', 'Sushi Specialist', 'Sushi expert', '10+ consensus-rated sushi dishes with accurate taste', '🍣', true, 40, 'rare', 'category', 'sushi'),
  ('authority_sushi', 'Sushi Authority', 'Sushi master', '20+ consensus-rated sushi dishes with elite accuracy', '🍣', true, 39, 'epic', 'category', 'sushi'),
  ('specialist_sandwich', 'Sandwich Specialist', 'Sandwich expert', '10+ consensus-rated sandwich dishes with accurate taste', '🥪', true, 40, 'rare', 'category', 'sandwich'),
  ('authority_sandwich', 'Sandwich Authority', 'Sandwich master', '20+ consensus-rated sandwich dishes with elite accuracy', '🥪', true, 39, 'epic', 'category', 'sandwich'),
  ('specialist_pasta', 'Pasta Specialist', 'Pasta expert', '10+ consensus-rated pasta dishes with accurate taste', '🍝', true, 40, 'rare', 'category', 'pasta'),
  ('authority_pasta', 'Pasta Authority', 'Pasta master', '20+ consensus-rated pasta dishes with elite accuracy', '🍝', true, 39, 'epic', 'category', 'pasta'),
  ('specialist_lobster_roll', 'Lobster Roll Specialist', 'Lobster roll expert', '10+ consensus-rated lobster roll dishes with accurate taste', '🦞', true, 40, 'rare', 'category', 'lobster roll'),
  ('authority_lobster_roll', 'Lobster Roll Authority', 'Lobster roll master', '20+ consensus-rated lobster roll dishes with elite accuracy', '🦞', true, 39, 'epic', 'category', 'lobster roll'),
  ('specialist_seafood', 'Seafood Specialist', 'Seafood expert', '10+ consensus-rated seafood dishes with accurate taste', '🦐', true, 40, 'rare', 'category', 'seafood'),
  ('authority_seafood', 'Seafood Authority', 'Seafood master', '20+ consensus-rated seafood dishes with elite accuracy', '🦐', true, 39, 'epic', 'category', 'seafood'),
  ('specialist_chowder', 'Chowder Specialist', 'Chowder expert', '10+ consensus-rated chowder dishes with accurate taste', '🍲', true, 40, 'rare', 'category', 'chowder'),
  ('authority_chowder', 'Chowder Authority', 'Chowder master', '20+ consensus-rated chowder dishes with elite accuracy', '🍲', true, 39, 'epic', 'category', 'chowder'),
  ('specialist_breakfast', 'Breakfast Specialist', 'Breakfast expert', '10+ consensus-rated breakfast dishes with accurate taste', '🍳', true, 40, 'rare', 'category', 'breakfast'),
  ('authority_breakfast', 'Breakfast Authority', 'Breakfast master', '20+ consensus-rated breakfast dishes with elite accuracy', '🍳', true, 39, 'epic', 'category', 'breakfast'),
  ('specialist_salad', 'Salad Specialist', 'Salad expert', '10+ consensus-rated salad dishes with accurate taste', '🥗', true, 40, 'rare', 'category', 'salad'),
  ('authority_salad', 'Salad Authority', 'Salad master', '20+ consensus-rated salad dishes with elite accuracy', '🥗', true, 39, 'epic', 'category', 'salad'),
  ('specialist_dessert', 'Dessert Specialist', 'Dessert expert', '10+ consensus-rated dessert dishes with accurate taste', '🍰', true, 40, 'rare', 'category', 'dessert'),
  ('authority_dessert', 'Dessert Authority', 'Dessert master', '20+ consensus-rated dessert dishes with elite accuracy', '🍰', true, 39, 'epic', 'category', 'dessert'),
  ('specialist_steak', 'Steak Specialist', 'Steak connoisseur', 'Rated 10+ consensus-rated steak dishes with low bias', '🥩', true, 29, 'rare', 'category', 'steak'),
  ('authority_steak', 'Steak Authority', 'Steak master', 'Rated 20+ consensus-rated steak dishes with very low bias', '🥩', true, 28, 'epic', 'category', 'steak'),
  ('specialist_tendys', 'Tenders Specialist', 'Tender expert', 'Rated 10+ consensus-rated tenders dishes with low bias', '🍗', true, 31, 'rare', 'category', 'tendys'),
  ('authority_tendys', 'Tenders Authority', 'Tender master', 'Rated 20+ consensus-rated tenders dishes with very low bias', '🍗', true, 30, 'epic', 'category', 'tendys')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, subtitle = EXCLUDED.subtitle, description = EXCLUDED.description,
  icon = EXCLUDED.icon, is_public_eligible = EXCLUDED.is_public_eligible,
  sort_order = EXCLUDED.sort_order, rarity = EXCLUDED.rarity, family = EXCLUDED.family,
  category = EXCLUDED.category;


-- =============================================
-- 17. AUTH TRIGGER: Auto-create profile on signup
-- =============================================
-- Ensures every auth.users entry gets a profiles row.
-- For OAuth users (Google), pulls display_name from metadata.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, has_onboarded)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NULL
    ),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 18. CLEANUP: Duplicate production-only policies have been dropped.
-- See supabase/migrations/cleanup_rls_policies.sql for the migration that was run.

-- =============================================
-- 19. MENU IMPORT QUEUE
-- Persistent job queue for menu-refresh pipeline.
-- Workers call claim_menu_import_jobs() to atomically dequeue batches.
-- pg_cron fires menu-refresh Edge Function every minute to drain the queue.
-- =============================================

-- Table
CREATE TABLE IF NOT EXISTS menu_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'initial',
  status TEXT NOT NULL DEFAULT 'pending',
  priority INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  lock_expires_at TIMESTAMPTZ,
  dishes_found INT,
  dishes_inserted INT,
  dishes_updated INT,
  dishes_unchanged INT,
  error_message TEXT,
  error_code TEXT,
  error_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT menu_import_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
  CONSTRAINT menu_import_jobs_job_type_check
    CHECK (job_type IN ('initial', 'refresh', 'manual'))
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS menu_import_jobs_one_active_per_restaurant
  ON menu_import_jobs (restaurant_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS menu_import_jobs_dequeue_idx
  ON menu_import_jobs (priority DESC, run_after, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS menu_import_jobs_stalled_idx
  ON menu_import_jobs (lock_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS menu_import_jobs_restaurant_history_idx
  ON menu_import_jobs (restaurant_id, created_at DESC);

-- RLS: service-role only
ALTER TABLE menu_import_jobs ENABLE ROW LEVEL SECURITY;

-- RPC: enqueue_menu_import (truly idempotent under concurrency)
CREATE OR REPLACE FUNCTION enqueue_menu_import(
  p_restaurant_id UUID,
  p_job_type TEXT DEFAULT 'initial',
  p_priority INT DEFAULT 10
)
RETURNS TABLE (
  job_id UUID,
  job_status TEXT,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
  VALUES (p_restaurant_id, p_job_type, p_priority)
  ON CONFLICT ON CONSTRAINT menu_import_jobs_one_active_per_restaurant DO NOTHING
  RETURNING menu_import_jobs.id INTO v_new_id;

  IF v_new_id IS NOT NULL THEN
    RETURN QUERY SELECT v_new_id, 'pending'::TEXT, true;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT mij.id, mij.status, false
  FROM menu_import_jobs mij
  WHERE mij.restaurant_id = p_restaurant_id
    AND mij.status IN ('pending', 'processing')
  LIMIT 1;
END;
$$;

-- RPC: get_menu_import_status
CREATE OR REPLACE FUNCTION get_menu_import_status(
  p_restaurant_id UUID
)
RETURNS TABLE (
  job_status TEXT,
  job_dishes_found INT,
  job_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT mij.status, mij.dishes_found, mij.created_at
  FROM menu_import_jobs mij
  WHERE mij.restaurant_id = p_restaurant_id
  ORDER BY
    CASE WHEN mij.status IN ('pending', 'processing') THEN 0 ELSE 1 END,
    mij.created_at DESC
  LIMIT 1;
END;
$$;

-- RPC: atomic dequeue with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_menu_import_jobs(p_limit INT DEFAULT 3)
RETURNS SETOF menu_import_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE menu_import_jobs
  SET
    status = 'processing',
    started_at = now(),
    lock_expires_at = now() + interval '10 minutes',
    updated_at = now()
  WHERE id IN (
    SELECT mij.id FROM menu_import_jobs mij
    WHERE mij.status = 'pending' AND mij.run_after <= now()
    ORDER BY mij.priority DESC, mij.run_after, mij.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- RPC permissions: queue operations are not for public/anon clients.
-- claim_menu_import_jobs: service_role only (menu-refresh Edge Function).
REVOKE EXECUTE ON FUNCTION claim_menu_import_jobs(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_menu_import_jobs(INT) TO service_role;

-- enqueue_menu_import: signed-in users + service_role. AddRestaurantModal
-- already requires useAuth; this enforces it at the DB layer too.
REVOKE EXECUTE ON FUNCTION enqueue_menu_import(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enqueue_menu_import(UUID, TEXT, INT) TO authenticated, service_role;

-- Enable pg_net for HTTP calls from cron
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron: process queue every 60 seconds
-- Auth: passes vault secret 'cron_secret' which menu-refresh's serve() handler
-- compares against the CRON_SECRET edge-function env var. The Functions gateway
-- has verify_jwt = false on this function so pg_cron can reach it (the legacy
-- service_role JWT stopped being accepted ~2026-04-12), so the in-function
-- shared-secret check is the only auth on this privileged endpoint.
SELECT cron.schedule(
  'process-menu-import-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/menu-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"mode": "queue"}'::jsonb
  );
  $$
);

-- Remove old biweekly menu refresh cron (replaced by job queue)
SELECT cron.unschedule('biweekly-menu-refresh');

-- pg_cron: create refresh jobs for stale menus (daily at 3 AM)
SELECT cron.schedule(
  'create-menu-refresh-jobs',
  '0 3 * * *',
  $$
  INSERT INTO menu_import_jobs (restaurant_id, job_type, priority)
  SELECT r.id, 'refresh', 0
  FROM restaurants r
  WHERE r.is_open = true
    AND r.menu_url IS NOT NULL
    AND (r.menu_last_checked IS NULL OR r.menu_last_checked < NOW() - INTERVAL '14 days')
    AND NOT EXISTS (
      SELECT 1 FROM menu_import_jobs mij
      WHERE mij.restaurant_id = r.id
        AND mij.status IN ('pending', 'processing')
    )
    AND NOT EXISTS (
      SELECT 1 FROM menu_import_jobs mij
      WHERE mij.restaurant_id = r.id
        AND mij.status = 'dead'
        AND mij.created_at > NOW() - INTERVAL '30 days'
    )
  $$
);

-- =============================================
-- Section 22: Account Deletion (Apple Guideline 5.1.1(v))
-- =============================================
-- Used by the delete-account Edge Function. See supabase/migrations/20260413_delete_auth_user.sql
-- for the full rationale — this is a workaround for auth.admin.deleteUser returning 500
-- on users with certain FK dependencies (notably rows in the `follows` table) while
-- raw DELETE FROM auth.users cascades cleanly.

CREATE OR REPLACE FUNCTION public.delete_auth_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_auth_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_auth_user(uuid) IS
'Account deletion helper: deletes the auth.users row. Only callable by service_role from the delete-account Edge Function, which authenticates the caller''s JWT first.';


-- =============================================
-- USER PLAYLISTS (Spotify-style user-generated food playlists)
-- Synced from migration 2026-04-12-user-playlists.sql
-- =============================================
-- Migration: User playlists (Spotify-style user-generated food playlists)
-- Date: 2026-04-12
-- Spec: docs/superpowers/specs/2026-04-12-food-playlists-design.md
--
-- Tables are client-read-only. All writes through SECURITY DEFINER RPCs.
-- Read RPCs are SECURITY INVOKER so RLS applies naturally.

-- Safety: allow re-running by dropping existing objects in dev. For prod,
-- remove the DROP block before applying.


-- ============================================================================
-- Tables + constraints
-- ============================================================================

CREATE TABLE user_playlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 60),
  description     TEXT CHECK (description IS NULL OR char_length(description) <= 200),
  is_public       BOOLEAN NOT NULL DEFAULT true,
  slug            TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 80),
  cover_mode      TEXT NOT NULL DEFAULT 'auto' CHECK (cover_mode IN ('auto')),
  follower_count  INT NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
  item_count      INT NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

CREATE TABLE user_playlist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id  UUID NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
  dish_id      UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  position     INT NOT NULL CHECK (position BETWEEN 1 AND 100),
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 140),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (playlist_id, dish_id),
  CONSTRAINT user_playlist_items_unique_position UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE user_playlist_follows (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id  UUID NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, playlist_id)
);

-- ============================================================================
-- Indexes (hot paths)
-- ============================================================================

CREATE INDEX idx_user_playlists_user_id ON user_playlists (user_id, created_at DESC);
CREATE INDEX idx_user_playlists_user_public ON user_playlists (user_id, created_at DESC) WHERE is_public;
CREATE INDEX idx_user_playlist_items_playlist_position ON user_playlist_items (playlist_id, position);
CREATE INDEX idx_user_playlist_items_dish_id ON user_playlist_items (dish_id);
CREATE INDEX idx_user_playlist_follows_user_id ON user_playlist_follows (user_id, followed_at DESC);
CREATE INDEX idx_user_playlist_follows_playlist_id ON user_playlist_follows (playlist_id);

-- ============================================================================
-- Triggers: counters, updated_at, position compaction
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_user_playlist_items_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_playlists
       SET item_count = user_playlists.item_count + 1, updated_at = NOW()
     WHERE user_playlists.id = NEW.playlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_playlists
       SET item_count = GREATEST(user_playlists.item_count - 1, 0), updated_at = NOW()
     WHERE user_playlists.id = OLD.playlist_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_user_playlist_follows_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_playlists
       SET follower_count = user_playlists.follower_count + 1
     WHERE user_playlists.id = NEW.playlist_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_playlists
       SET follower_count = GREATEST(user_playlists.follower_count - 1, 0)
     WHERE user_playlists.id = OLD.playlist_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fn_user_playlists_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_user_playlist_items_compact_positions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- FOR EACH ROW so we can access OLD. Constraint is DEFERRABLE INITIALLY
  -- DEFERRED, so temporary duplicate positions during the rewrite are OK.
  -- Advisory xact lock serializes compaction per playlist; prevents
  -- deadlocks when concurrent deletes (or parent cascade) touch the same
  -- playlist. Released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.playlist_id::TEXT, 0));
  UPDATE user_playlist_items x SET position = r.new_pos
    FROM (
      SELECT i.id, ROW_NUMBER() OVER (ORDER BY i.position) AS new_pos
      FROM user_playlist_items i
      WHERE i.playlist_id = OLD.playlist_id
    ) r
    WHERE x.id = r.id AND x.position IS DISTINCT FROM r.new_pos;
  RETURN NULL;
END;
$$;

CREATE TRIGGER tr_user_playlist_items_count
  AFTER INSERT OR DELETE ON user_playlist_items
  FOR EACH ROW EXECUTE FUNCTION fn_user_playlist_items_count();

CREATE TRIGGER tr_user_playlist_follows_count
  AFTER INSERT OR DELETE ON user_playlist_follows
  FOR EACH ROW EXECUTE FUNCTION fn_user_playlist_follows_count();

CREATE TRIGGER tr_user_playlists_updated_at
  BEFORE UPDATE ON user_playlists
  FOR EACH ROW EXECUTE FUNCTION fn_user_playlists_touch_updated_at();

CREATE TRIGGER tr_user_playlist_items_compact_positions
  AFTER DELETE ON user_playlist_items
  FOR EACH ROW EXECUTE FUNCTION fn_user_playlist_items_compact_positions();

-- ============================================================================
-- RLS + direct-write revocations
-- ============================================================================

ALTER TABLE user_playlists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playlist_follows ENABLE ROW LEVEL SECURITY;

-- Lock down direct writes; all mutations go through SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE, DELETE ON user_playlists        FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON user_playlist_items   FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON user_playlist_follows FROM PUBLIC, anon, authenticated;

-- SELECT policies
CREATE POLICY user_playlists_select ON user_playlists FOR SELECT
  USING (is_public OR user_id = auth.uid());

CREATE POLICY user_playlist_items_select ON user_playlist_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_playlists p
    WHERE p.id = user_playlist_items.playlist_id
      AND (p.is_public OR p.user_id = auth.uid())
  ));

CREATE POLICY user_playlist_follows_select ON user_playlist_follows FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- Hard-cap triggers (BEFORE INSERT with parent-row FOR UPDATE locks)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_playlist_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cnt INT;
BEGIN
  -- Lock the owner's profile row to serialize concurrent creates.
  -- `profiles.id` is the auth.users id (see schema.sql:103).
  PERFORM 1 FROM profiles WHERE id = NEW.user_id FOR UPDATE;
  SELECT COUNT(*) INTO cnt FROM user_playlists WHERE user_id = NEW.user_id;
  IF cnt >= 50 THEN
    RAISE EXCEPTION 'You can have up to 50 playlists' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enforce_item_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cnt INT;
BEGIN
  PERFORM 1 FROM user_playlists WHERE id = NEW.playlist_id FOR UPDATE;
  SELECT COUNT(*) INTO cnt FROM user_playlist_items WHERE playlist_id = NEW.playlist_id;
  IF cnt >= 100 THEN
    RAISE EXCEPTION 'A playlist can hold up to 100 dishes' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_enforce_playlist_cap
  BEFORE INSERT ON user_playlists
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_playlist_cap();

CREATE TRIGGER tr_enforce_item_cap
  BEFORE INSERT ON user_playlist_items
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_item_cap();

-- ============================================================================
-- Content blocklist (DB-side floor; client-side blocklist is richer)
-- Mirrors the most egregious categories from src/lib/reviewBlocklist.js.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_content_blocklist(p_text TEXT, p_field TEXT)
RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN RETURN; END IF;
  v_normalized := lower(regexp_replace(p_text, '\s+', ' ', 'g'));
  IF v_normalized ~ '\y(nigger|nigga|n\*gger|faggot|f\*ggot|retard(ed)?|spic|chink|kike|wetback|beaner|dyke|tranny|nazi|hitler|kkk)\y' THEN
    RAISE EXCEPTION '% contains blocked content', p_field USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_check_content_blocklist(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_check_content_blocklist(TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- Slug helper + create/update/delete RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_playlist_slug_from_title(
  p_title TEXT, p_user_id UUID, p_exclude_playlist_id UUID DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT := 2;
BEGIN
  base_slug := regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  IF base_slug = '' THEN base_slug := 'playlist'; END IF;
  base_slug := LEFT(base_slug, 70);
  candidate := base_slug;
  -- p_exclude_playlist_id lets update_user_playlist skip its own row so a
  -- title-case or punctuation-only rename doesn't falsely collide with self.
  WHILE EXISTS (
    SELECT 1 FROM user_playlists
    WHERE user_id = p_user_id AND slug = candidate
      AND (p_exclude_playlist_id IS NULL OR id <> p_exclude_playlist_id)
  ) LOOP
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
    IF suffix > 999 THEN EXIT; END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Note: no server-side rate limit in this RPC. Hard cap is enforced by
-- fn_enforce_playlist_cap (50/user). Client-side throttling lives in
-- src/lib/rateLimiter.js. Adding a server-side rate_limits insert here
-- would be a defense-in-depth layer, deferred to 1.1 if abuse shows up.
CREATE OR REPLACE FUNCTION create_user_playlist(
  p_title TEXT, p_description TEXT, p_is_public BOOLEAN
) RETURNS user_playlists
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row user_playlists;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM fn_check_content_blocklist(p_title, 'Playlist title');
  PERFORM fn_check_content_blocklist(p_description, 'Description');
  INSERT INTO user_playlists (user_id, title, description, is_public, slug)
  VALUES (v_user, p_title, NULLIF(p_description, ''), p_is_public,
          fn_playlist_slug_from_title(p_title, v_user))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION update_user_playlist(
  p_id UUID, p_title TEXT, p_description TEXT, p_is_public BOOLEAN
) RETURNS user_playlists
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row user_playlists;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_title IS NOT NULL THEN PERFORM fn_check_content_blocklist(p_title, 'Playlist title'); END IF;
  IF p_description IS NOT NULL THEN PERFORM fn_check_content_blocklist(p_description, 'Description'); END IF;
  -- NULL params mean "unchanged"; pass empty string to explicitly clear description.
  UPDATE user_playlists
     SET title = COALESCE(p_title, user_playlists.title),
         description = CASE WHEN p_description IS NULL THEN user_playlists.description
                            ELSE NULLIF(p_description, '') END,
         is_public = COALESCE(p_is_public, user_playlists.is_public),
         slug = CASE WHEN p_title IS NOT NULL AND p_title <> user_playlists.title
                     THEN fn_playlist_slug_from_title(p_title, user_playlists.user_id, user_playlists.id)
                     ELSE user_playlists.slug END
   WHERE user_playlists.id = p_id AND user_playlists.user_id = v_user
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION delete_user_playlist(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_deleted INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM user_playlists WHERE id = p_id AND user_id = v_user;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ============================================================================
-- Item mutation RPCs: add, remove, reorder, update-note
-- ============================================================================

CREATE OR REPLACE FUNCTION add_dish_to_playlist(
  p_playlist_id UUID, p_dish_id UUID, p_note TEXT
) RETURNS user_playlist_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
  v_next_pos INT;
  v_row user_playlist_items;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT user_id INTO v_owner FROM user_playlists WHERE id = p_playlist_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_note IS NOT NULL THEN PERFORM fn_check_content_blocklist(p_note, 'Note'); END IF;
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
    FROM user_playlist_items WHERE playlist_id = p_playlist_id;
  INSERT INTO user_playlist_items (playlist_id, dish_id, position, note)
  VALUES (p_playlist_id, p_dish_id, v_next_pos, NULLIF(p_note, ''))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION remove_dish_from_playlist(
  p_playlist_id UUID, p_dish_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
  v_deleted INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT user_id INTO v_owner FROM user_playlists WHERE id = p_playlist_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM user_playlist_items
    WHERE playlist_id = p_playlist_id AND dish_id = p_dish_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Dish not in playlist' USING ERRCODE = 'P0002';
  END IF;
  -- Compaction trigger fires automatically on DELETE.
END;
$$;

CREATE OR REPLACE FUNCTION reorder_playlist_items(
  p_playlist_id UUID, p_ordered_dish_ids UUID[]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
  v_current_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT user_id INTO v_owner FROM user_playlists WHERE id = p_playlist_id FOR UPDATE;
  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;

  -- Exact-permutation validation
  SELECT COUNT(*) INTO v_current_count
    FROM user_playlist_items WHERE playlist_id = p_playlist_id;
  IF v_current_count <> COALESCE(array_length(p_ordered_dish_ids, 1), 0) THEN
    RAISE EXCEPTION 'Reorder must include every dish exactly once' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT dish_id FROM user_playlist_items WHERE playlist_id = p_playlist_id
      EXCEPT
      SELECT unnest(p_ordered_dish_ids)
    ) diff
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT unnest(p_ordered_dish_ids) AS dish_id
    ) d
    GROUP BY dish_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Reorder must be an exact permutation' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic rewrite under the deferred unique (playlist_id, position)
  UPDATE user_playlist_items upi
     SET position = o.pos
    FROM (
      SELECT dish_id, ordinality AS pos
      FROM unnest(p_ordered_dish_ids) WITH ORDINALITY
    ) o
   WHERE upi.playlist_id = p_playlist_id AND upi.dish_id = o.dish_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_playlist_item_note(
  p_playlist_id UUID, p_dish_id UUID, p_note TEXT
) RETURNS user_playlist_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
  v_row user_playlist_items;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT user_id INTO v_owner FROM user_playlists WHERE id = p_playlist_id;
  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_note IS NOT NULL THEN PERFORM fn_check_content_blocklist(p_note, 'Note'); END IF;
  UPDATE user_playlist_items
     SET note = NULLIF(p_note, '')
   WHERE playlist_id = p_playlist_id AND dish_id = p_dish_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Dish not in playlist' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

-- ============================================================================
-- Follow / unfollow RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION follow_playlist(p_playlist_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_is_public BOOLEAN;
  v_owner UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  -- FOR SHARE locks the playlist row so a concurrent public→private flip
  -- (update_user_playlist takes FOR UPDATE implicitly via the UPDATE) can't
  -- interleave between the visibility check and the INSERT below.
  SELECT is_public, user_id INTO v_is_public, v_owner
    FROM user_playlists WHERE id = p_playlist_id FOR SHARE;
  IF v_owner IS NULL
     OR v_owner = v_user
     OR (NOT v_is_public AND v_owner <> v_user) THEN
    -- Identical error for: nonexistent, private-not-yours, self-follow.
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO user_playlist_follows (user_id, playlist_id)
  VALUES (v_user, p_playlist_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION unfollow_playlist(p_playlist_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM user_playlist_follows
    WHERE user_id = v_user AND playlist_id = p_playlist_id;
  -- Idempotent: no row is not an error.
END;
$$;

-- ============================================================================
-- Read RPCs (SECURITY INVOKER — RLS filters naturally)
-- ============================================================================

-- Helper: first-4 dish categories for cover rendering.
CREATE OR REPLACE FUNCTION fn_first_four_categories(p_playlist_id UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(array_agg(d.category ORDER BY upi.position), ARRAY[]::TEXT[])
  FROM (
    SELECT dish_id, position FROM user_playlist_items
    WHERE playlist_id = p_playlist_id
    ORDER BY position LIMIT 4
  ) upi
  JOIN dishes d ON d.id = upi.dish_id;
$$;

CREATE OR REPLACE FUNCTION get_playlist_detail(p_playlist_id UUID)
RETURNS TABLE (
  playlist_id UUID, title TEXT, description TEXT, is_public BOOLEAN,
  slug TEXT, item_count INT, follower_count INT, created_at TIMESTAMPTZ,
  owner_id UUID, owner_display_name TEXT,
  is_owner BOOLEAN, is_followed BOOLEAN,
  cover_categories TEXT[],
  items JSONB
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.title, p.description, p.is_public, p.slug,
    p.item_count, p.follower_count, p.created_at,
    p.user_id, pr.display_name,
    (p.user_id = auth.uid()) AS is_owner,
    EXISTS (SELECT 1 FROM user_playlist_follows f
            WHERE f.playlist_id = p.id AND f.user_id = auth.uid()) AS is_followed,
    fn_first_four_categories(p.id) AS cover_categories,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'dish_id', d.id, 'dish_name', d.name, 'position', upi.position,
        'note', upi.note,
        'restaurant_id', r.id, 'restaurant_name', r.name,
        'category', d.category, 'avg_rating', d.avg_rating, 'total_votes', d.total_votes,
        'photo_url', d.photo_url
      ) ORDER BY upi.position)
      FROM user_playlist_items upi
      JOIN dishes d ON d.id = upi.dish_id
      JOIN restaurants r ON r.id = d.restaurant_id
      WHERE upi.playlist_id = p.id
    ), '[]'::jsonb) AS items
  FROM user_playlists p
  LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE p.id = p_playlist_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_playlists(p_user_id UUID)
RETURNS TABLE (
  id UUID, user_id UUID, title TEXT, description TEXT, is_public BOOLEAN,
  slug TEXT, cover_mode TEXT, follower_count INT, item_count INT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  cover_categories TEXT[]
)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT p.id, p.user_id, p.title, p.description, p.is_public, p.slug,
         p.cover_mode, p.follower_count, p.item_count, p.created_at, p.updated_at,
         fn_first_four_categories(p.id) AS cover_categories
  FROM user_playlists p
  WHERE p.user_id = p_user_id
  ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_followed_playlists()
RETURNS TABLE (
  playlist_id UUID, title TEXT, is_public BOOLEAN, slug TEXT,
  item_count INT, follower_count INT, owner_display_name TEXT,
  followed_at TIMESTAMPTZ, visibility TEXT, cover_categories TEXT[]
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.playlist_id, p.title, p.is_public, p.slug,
    p.item_count, p.follower_count, pr.display_name,
    f.followed_at,
    CASE WHEN p.id IS NULL OR (NOT p.is_public AND p.user_id <> auth.uid())
         THEN 'unavailable' ELSE 'visible' END AS visibility,
    CASE WHEN p.id IS NULL THEN ARRAY[]::TEXT[]
         ELSE fn_first_four_categories(p.id) END AS cover_categories
  FROM user_playlist_follows f
  LEFT JOIN user_playlists p ON p.id = f.playlist_id
  LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE f.user_id = auth.uid()
  ORDER BY f.followed_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_dish_playlist_membership(p_dish_id UUID)
RETURNS TABLE (
  playlist_id UUID, title TEXT, slug TEXT,
  item_count INT, cover_mode TEXT, contains_dish BOOLEAN,
  cover_categories TEXT[]
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.title, p.slug, p.item_count, p.cover_mode,
    EXISTS (SELECT 1 FROM user_playlist_items upi
            WHERE upi.playlist_id = p.id AND upi.dish_id = p_dish_id) AS contains_dish,
    fn_first_four_categories(p.id) AS cover_categories
  FROM user_playlists p
  WHERE p.user_id = auth.uid()
  ORDER BY p.created_at DESC;
END;
$$;

-- ============================================================================
-- Grants (per-function, matching lock-menu-queue-rpcs.sql pattern)
-- ============================================================================

-- Write RPCs: authenticated users + service_role only. Anon is locked out.
REVOKE EXECUTE ON FUNCTION create_user_playlist(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION create_user_playlist(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_user_playlist(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION update_user_playlist(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION delete_user_playlist(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION delete_user_playlist(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION add_dish_to_playlist(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION add_dish_to_playlist(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION remove_dish_from_playlist(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION remove_dish_from_playlist(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION reorder_playlist_items(UUID, UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION reorder_playlist_items(UUID, UUID[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_playlist_item_note(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION update_playlist_item_note(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION follow_playlist(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION follow_playlist(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION unfollow_playlist(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION unfollow_playlist(UUID) TO authenticated, service_role;

-- Read RPCs: SECURITY INVOKER, RLS filters private rows. Explicit
-- REVOKE + GRANT makes the grants table the source of truth (instead of
-- relying on Postgres default PUBLIC execute).
REVOKE EXECUTE ON FUNCTION get_playlist_detail(UUID)          FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_playlist_detail(UUID)          TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_user_playlists(UUID)           FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_user_playlists(UUID)           TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_followed_playlists()           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_followed_playlists()           TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_dish_playlist_membership(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_dish_playlist_membership(UUID) TO authenticated, service_role;

-- =============================================
-- 14. H3 — UGC REPORTING + BLOCKING (Apple 1.2)
-- =============================================
-- Spec: docs/superpowers/specs/2026-04-15-h3-ugc-reporting-blocking.md (v3.2)
-- Migration file: supabase/migrations/20260415_h3_ugc_reporting_blocking.sql
-- Adds reports + user_blocks tables, is_blocked_pair helper, updates
-- dish_photos/follows RLS + public_votes view + several ranking/discovery
-- RPCs to filter content to/from blocked users.
-- =============================================

-- 14a. Tables
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_type TEXT NOT NULL
    CHECK (reported_type IN ('dish', 'review', 'photo', 'user')),
  reported_id UUID NOT NULL,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'spam', 'hate_speech', 'harassment', 'misinformation',
      'inappropriate_content', 'impersonation', 'other'
    )),
  details TEXT CHECK (details IS NULL OR length(details) <= 500),
  target_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS reports_active_unique_idx
  ON reports (reporter_id, reported_type, reported_id)
  WHERE status IN ('open', 'reviewed', 'actioned');

CREATE INDEX IF NOT EXISTS reports_queue_idx
  ON reports (created_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS reports_by_target_user_idx
  ON reports (reported_user_id, created_at DESC)
  WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_by_reporter_idx
  ON reports (reporter_id, created_at DESC);

-- Audit 2026-04-16: covers admin filtering by (user, status) without scanning
-- reports_by_target_user_idx and discarding non-matching statuses.
CREATE INDEX IF NOT EXISTS reports_target_status_idx
  ON reports (reported_user_id, status, created_at DESC)
  WHERE reported_user_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);


-- 14b. Helper — is_blocked_pair (self-restricting: returns TRUE only when
-- caller IS p_viewer or is service_role). Safe to GRANT to anon + authenticated.
CREATE OR REPLACE FUNCTION is_blocked_pair(p_viewer UUID, p_subject UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_viewer IS NOT NULL
    AND p_subject IS NOT NULL
    AND (
      p_viewer = (select auth.uid())
      OR auth.role() = 'service_role'
    )
    AND EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = p_viewer AND blocked_id = p_subject)
         OR (blocker_id = p_subject AND blocked_id = p_viewer)
    );
$$;

REVOKE EXECUTE ON FUNCTION is_blocked_pair(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION is_blocked_pair(UUID, UUID) TO anon, authenticated;


-- 14c. RLS on new tables
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_admin" ON reports;
CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "user_blocks_select_own" ON user_blocks;
CREATE POLICY "user_blocks_select_own" ON user_blocks
  FOR SELECT USING ((select auth.uid()) = blocker_id);


-- 14d. Existing-table RLS tightening (replaces earlier definitions).
-- Drop both the old name AND the new name to stay rerunnable after a
-- partial deploy.
DROP POLICY IF EXISTS "follows_select_public" ON follows;
DROP POLICY IF EXISTS "follows_select_not_blocked" ON follows;
CREATE POLICY "follows_select_not_blocked" ON follows
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = (select auth.uid())
             AND (ub.blocked_id = follower_id OR ub.blocked_id = followed_id))
         OR (ub.blocked_id = (select auth.uid())
             AND (ub.blocker_id = follower_id OR ub.blocker_id = followed_id))
    )
  );

DROP POLICY IF EXISTS "follows_insert_own" ON follows;
DROP POLICY IF EXISTS "follows_insert_own_not_blocked" ON follows;
CREATE POLICY "follows_insert_own_not_blocked" ON follows
  FOR INSERT WITH CHECK (
    (select auth.uid()) = follower_id
    AND NOT is_blocked_pair((select auth.uid()), followed_id)
  );

DROP POLICY IF EXISTS "Public read access" ON dish_photos;
DROP POLICY IF EXISTS "dish_photos_select_not_blocked" ON dish_photos;
CREATE POLICY "dish_photos_select_not_blocked" ON dish_photos
  FOR SELECT USING (
    (select auth.uid()) IS NULL
    OR NOT is_blocked_pair((select auth.uid()), user_id)
  );


-- 14e. public_votes view — embed block filter
CREATE OR REPLACE VIEW public_votes AS
SELECT
  id, dish_id, rating_10, review_text, review_created_at, user_id, source
FROM votes
WHERE auth.uid() IS NULL
   OR NOT is_blocked_pair(auth.uid(), user_id);


-- 14f. Write RPCs — see migration file for full bodies; these are final
-- authoritative definitions.

CREATE OR REPLACE FUNCTION submit_report(
  p_reported_type TEXT,
  p_reported_id UUID,
  p_reason TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reporter_id UUID;
  v_reported_user_id UUID;
  v_target_exists BOOLEAN;
  v_snapshot JSONB;
  v_rate_limit JSONB;
  v_report_id UUID;
BEGIN
  v_reporter_id := (select auth.uid());
  IF v_reporter_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_reported_type NOT IN ('dish', 'review', 'photo', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reported_type');
  END IF;

  IF p_reason NOT IN ('spam','hate_speech','harassment','misinformation',
                      'inappropriate_content','impersonation','other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid reason');
  END IF;

  IF p_details IS NOT NULL AND length(p_details) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Details too long (max 500 chars)');
  END IF;

  CASE p_reported_type
    WHEN 'dish' THEN
      SELECT d.created_by,
        jsonb_build_object('dish_name', d.name, 'restaurant_name', r.name, 'category', d.category),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dishes d LEFT JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = p_reported_id;
    WHEN 'review' THEN
      SELECT v.user_id,
        jsonb_build_object('review_text', v.review_text, 'rating_10', v.rating_10,
          'dish_id', v.dish_id, 'dish_name', d.name, 'author_name', p.display_name),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM votes v
      LEFT JOIN dishes d ON d.id = v.dish_id
      LEFT JOIN profiles p ON p.id = v.user_id
      WHERE v.id = p_reported_id;
    WHEN 'photo' THEN
      SELECT dp.user_id,
        jsonb_build_object('photo_url', dp.photo_url, 'dish_id', dp.dish_id,
          'dish_name', d.name, 'author_name', p.display_name),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM dish_photos dp
      LEFT JOIN dishes d ON d.id = dp.dish_id
      LEFT JOIN profiles p ON p.id = dp.user_id
      WHERE dp.id = p_reported_id;
    WHEN 'user' THEN
      SELECT p.id,
        jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url),
        TRUE
      INTO v_reported_user_id, v_snapshot, v_target_exists
      FROM profiles p WHERE p.id = p_reported_id;
  END CASE;

  IF v_target_exists IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reported content not found');
  END IF;

  IF v_reported_user_id IS NOT NULL AND v_reported_user_id = v_reporter_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot report your own content');
  END IF;

  v_rate_limit := check_and_record_rate_limit('report', 10, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO reports (reporter_id, reported_type, reported_id, reported_user_id,
    reason, details, target_snapshot)
  VALUES (v_reporter_id, p_reported_type, p_reported_id, v_reported_user_id,
    p_reason, NULLIF(TRIM(p_details), ''), v_snapshot)
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', v_report_id);

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false,
    'error', 'You already reported this. Our team is reviewing it.');
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION block_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocker_id UUID;
  v_rate_limit JSONB;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF v_blocker_id = p_blocked_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot block yourself');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_blocked_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_rate_limit := check_and_record_rate_limit('block', 30, 3600);
  IF NOT (v_rate_limit->>'allowed')::BOOLEAN THEN
    RETURN v_rate_limit;
  END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id)
  VALUES (v_blocker_id, p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  DELETE FROM follows
  WHERE (follower_id = v_blocker_id AND followed_id = p_blocked_id)
     OR (follower_id = p_blocked_id AND followed_id = v_blocker_id);

  DELETE FROM notifications
  WHERE (user_id = v_blocker_id AND (data->>'follower_id') = p_blocked_id::text)
     OR (user_id = p_blocked_id AND (data->>'follower_id') = v_blocker_id::text);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION block_user(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_blocker_id UUID;
BEGIN
  v_blocker_id := (select auth.uid());
  IF v_blocker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM user_blocks
  WHERE blocker_id = v_blocker_id AND blocked_id = p_blocked_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION unblock_user(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION review_report(
  p_report_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin UUID;
BEGIN
  v_admin := (select auth.uid());
  IF NOT is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
  END IF;

  IF p_action NOT IN ('reviewed', 'dismissed', 'actioned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE reports
  SET status = p_action, reviewed_by = v_admin, reviewed_at = NOW(),
      reviewer_notes = NULLIF(TRIM(p_notes), '')
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION review_report(UUID, TEXT, TEXT) TO authenticated;


-- 14g. Read RPCs
CREATE OR REPLACE FUNCTION get_my_blocks()
RETURNS TABLE (
  blocked_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  blocked_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ub.blocked_id, p.display_name, p.avatar_url, ub.created_at
  FROM user_blocks ub
  LEFT JOIN profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = (select auth.uid())
  ORDER BY ub.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_blocks() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_blocks() TO authenticated;


CREATE OR REPLACE FUNCTION get_my_reports()
RETURNS TABLE (
  report_id UUID, reported_type TEXT, reported_id UUID, reason TEXT,
  details TEXT, target_snapshot JSONB, status TEXT,
  created_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.reported_type, r.reported_id, r.reason, r.details,
         r.target_snapshot, r.status, r.created_at, r.reviewed_at
  FROM reports r
  WHERE r.reporter_id = (select auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION get_my_reports() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_reports() TO authenticated;


-- Audit 2026-04-16 phase 2: keyset pagination. Caller passes back the last row's
-- (target_user_open_report_count, created_at, report_id) to get the next page.
-- First page: omit all cursor args. No client callers existed when this ran.
DROP FUNCTION IF EXISTS get_open_reports(INT, INT);
CREATE OR REPLACE FUNCTION get_open_reports(
  p_limit INT DEFAULT 50,
  p_cursor_open_count BIGINT DEFAULT NULL,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  report_id UUID, reporter_id UUID, reporter_name TEXT,
  reported_type TEXT, reported_id UUID, reported_user_id UUID, reported_user_name TEXT,
  reason TEXT, details TEXT, target_snapshot JSONB, created_at TIMESTAMPTZ,
  target_user_open_report_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;

  p_limit := LEAST(GREATEST(p_limit, 1), 200);

  -- Cursor guard: require all three parts OR none. Partial cursors would make
  -- the tuple comparison return NULL and silently produce empty pages.
  IF NOT (
    (p_cursor_open_count IS NULL AND p_cursor_created_at IS NULL AND p_cursor_id IS NULL)
    OR
    (p_cursor_open_count IS NOT NULL AND p_cursor_created_at IS NOT NULL AND p_cursor_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Partial cursor: pass all three of p_cursor_open_count, p_cursor_created_at, p_cursor_id (or none).';
  END IF;

  RETURN QUERY
  WITH open_counts AS (
    SELECT reported_user_id, COUNT(*)::BIGINT AS open_count
    FROM reports
    WHERE status = 'open' AND reported_user_id IS NOT NULL
    GROUP BY reported_user_id
  )
  SELECT r.id, r.reporter_id, rp.display_name,
    r.reported_type, r.reported_id, r.reported_user_id, up.display_name,
    r.reason, r.details, r.target_snapshot, r.created_at,
    COALESCE(oc.open_count, 0)
  FROM reports r
  LEFT JOIN profiles rp ON rp.id = r.reporter_id
  LEFT JOIN profiles up ON up.id = r.reported_user_id
  LEFT JOIN open_counts oc ON oc.reported_user_id = r.reported_user_id
  WHERE r.status = 'open'
    AND (
      p_cursor_open_count IS NULL
      OR (COALESCE(oc.open_count, 0), r.created_at, r.id)
         < (p_cursor_open_count, p_cursor_created_at, p_cursor_id)
    )
  ORDER BY COALESCE(oc.open_count, 0) DESC, r.created_at DESC, r.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_open_reports(INT, BIGINT, TIMESTAMPTZ, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_open_reports(INT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated;


-- 14h. Modified existing RPCs — full final definitions in the migration file.
-- The CREATE OR REPLACE calls below override the earlier definitions in this
-- file (get_ranked_dishes §5, get_smart_snippet §5, get_friends_votes_* §6,
-- get_taste_compatibility §6, get_similar_taste_users §6, get_category_experts
-- §8, get_local_lists_for_homepage §11, get_local_list_by_user §11).
-- See migrations/20260415_h3_ugc_reporting_blocking.sql for the bodies.


-- get_smart_snippet — exclude reviews by blocked users
CREATE OR REPLACE FUNCTION get_smart_snippet(p_dish_id UUID)
RETURNS TABLE (
  review_text TEXT, rating_10 DECIMAL, display_name TEXT,
  user_id UUID, review_created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE v_viewer_id UUID := (select auth.uid());
BEGIN
  RETURN QUERY
  SELECT v.review_text, v.rating_10, p.display_name, v.user_id, v.review_created_at
  FROM votes v
  INNER JOIN profiles p ON v.user_id = p.id
  WHERE v.dish_id = p_dish_id
    AND v.review_text IS NOT NULL AND v.review_text != ''
    AND (v_viewer_id IS NULL OR NOT is_blocked_pair(v_viewer_id, v.user_id))
  ORDER BY
    CASE WHEN v.rating_10 >= 9 THEN 0 ELSE 1 END,
    v.rating_10 DESC NULLS LAST,
    v.review_created_at DESC NULLS LAST
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- get_friends_votes_for_dish — caller guard + block filter
CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, rating_10 DECIMAL(3, 1),
  voted_at TIMESTAMPTZ, category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id AND v.dish_id = p_dish_id
  JOIN dishes d ON d.id = p_dish_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY v.created_at DESC;
END;
$$;


-- get_friends_votes_for_restaurant — caller guard + block filter
CREATE OR REPLACE FUNCTION get_friends_votes_for_restaurant(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, dish_id UUID, dish_name TEXT,
  rating_10 DECIMAL(3, 1), voted_at TIMESTAMPTZ, category_expertise TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, d.id, d.name, v.rating_10, v.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'authority_' || REPLACE(d.category, ' ', '_')) THEN 'authority'
      WHEN EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.id
                   AND ub.badge_key = 'specialist_' || REPLACE(d.category, ' ', '_')) THEN 'specialist'
      ELSE NULL
    END
  FROM follows f
  JOIN profiles p ON p.id = f.followed_id
  JOIN votes v ON v.user_id = f.followed_id
  JOIN dishes d ON d.id = v.dish_id AND d.restaurant_id = p_restaurant_id
  WHERE f.follower_id = p_user_id
    AND NOT is_blocked_pair(p_user_id, f.followed_id)
  ORDER BY d.name, v.created_at DESC;
END;
$$;


-- get_taste_compatibility — caller guard + block short-circuit
CREATE OR REPLACE FUNCTION get_taste_compatibility(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS TABLE (
  shared_dishes INT, avg_difference DECIMAL(3, 1), compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF is_blocked_pair(p_user_id, p_other_user_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH shared AS (
    SELECT a.rating_10 AS rating_a, b.rating_10 AS rating_b
    FROM votes a JOIN votes b ON a.dish_id = b.dish_id
    WHERE a.user_id = p_user_id AND b.user_id = p_other_user_id
      AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
  )
  SELECT COUNT(*)::INT,
    ROUND(AVG(ABS(rating_a - rating_b))::NUMERIC, 1),
    CASE WHEN COUNT(*) >= 3
      THEN ROUND((100 - (AVG(ABS(rating_a - rating_b))::NUMERIC / 9.0 * 100)))::INT
      ELSE NULL END
  FROM shared;
END;
$$;


-- get_similar_taste_users — caller guard + block filter (plpgsql rewrite)
CREATE OR REPLACE FUNCTION get_similar_taste_users(
  p_user_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, shared_dishes INT, compatibility_pct INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (select auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT b.user_id AS other_id,
           COUNT(*)::INT AS shared,
           ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT AS compat
    FROM votes a
    JOIN votes b ON a.dish_id = b.dish_id
      AND b.user_id != p_user_id AND b.rating_10 IS NOT NULL
    WHERE a.user_id = p_user_id AND a.rating_10 IS NOT NULL
    GROUP BY b.user_id HAVING COUNT(*) >= 3
  )
  SELECT c.other_id, p.display_name, c.shared, c.compat
  FROM candidates c
  JOIN profiles p ON p.id = c.other_id
  WHERE NOT EXISTS (SELECT 1 FROM follows f
                    WHERE f.follower_id = p_user_id AND f.followed_id = c.other_id)
    AND NOT is_blocked_pair(p_user_id, c.other_id)
  ORDER BY c.compat DESC, c.shared DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_similar_taste_users(UUID, INT) TO authenticated;


-- get_category_experts — block filter inline
CREATE OR REPLACE FUNCTION get_category_experts(
  p_category TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID, display_name TEXT, badge_tier TEXT, follower_count BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (ub.user_id)
    ub.user_id, p.display_name,
    CASE WHEN b.key LIKE 'authority_%' THEN 'authority' ELSE 'specialist' END,
    COALESCE(fc.cnt, 0)
  FROM user_badges ub
  JOIN badges b ON ub.badge_key = b.key
  JOIN profiles p ON ub.user_id = p.id
  LEFT JOIN (SELECT followed_id, COUNT(*) AS cnt FROM follows GROUP BY followed_id) fc
    ON fc.followed_id = ub.user_id
  WHERE b.category = p_category AND b.family = 'category'
    AND ((select auth.uid()) IS NULL
         OR NOT is_blocked_pair((select auth.uid()), ub.user_id))
  ORDER BY ub.user_id,
    CASE WHEN b.key LIKE 'authority_%' THEN 0 ELSE 1 END,
    COALESCE(fc.cnt, 0) DESC
  LIMIT p_limit;
$$;


-- get_local_lists_for_homepage — filter uses auth.uid(), NOT p_viewer_id
CREATE OR REPLACE FUNCTION get_local_lists_for_homepage(p_viewer_id UUID DEFAULT NULL)
RETURNS TABLE (
  list_id UUID, user_id UUID, title TEXT, description TEXT,
  display_name TEXT, avatar_url TEXT, curator_tagline TEXT,
  item_count INT, preview_dishes TEXT[], compatibility_pct INT
)
LANGUAGE SQL STABLE AS $$
  SELECT ll.id, ll.user_id, ll.title, ll.description,
    p.display_name, p.avatar_url, ll.curator_tagline,
    (SELECT COUNT(*)::INT FROM local_list_items WHERE list_id = ll.id),
    (SELECT ARRAY_AGG(d.name ORDER BY li."position")
     FROM local_list_items li JOIN dishes d ON d.id = li.dish_id
     WHERE li.list_id = ll.id AND li."position" <= 4),
    CASE
      WHEN p_viewer_id IS NOT NULL AND p_viewer_id != ll.user_id THEN (
        SELECT CASE WHEN COUNT(*) >= 3
          THEN ROUND((100 - (AVG(ABS(a.rating_10 - b.rating_10))::NUMERIC / 9.0 * 100)))::INT
          ELSE NULL END
        FROM votes a JOIN votes b ON a.dish_id = b.dish_id
        WHERE a.user_id = p_viewer_id AND b.user_id = ll.user_id
          AND a.rating_10 IS NOT NULL AND b.rating_10 IS NOT NULL
      )
      ELSE NULL
    END
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  WHERE ll.is_active = true
    AND ((select auth.uid()) IS NULL
         OR NOT is_blocked_pair((select auth.uid()), ll.user_id))
  ORDER BY RANDOM()
  LIMIT 8;
$$;


-- get_local_list_by_user — empty result when viewer blocked curator
CREATE OR REPLACE FUNCTION get_local_list_by_user(target_user_id UUID)
RETURNS TABLE (
  list_id UUID, title TEXT, description TEXT, user_id UUID,
  display_name TEXT, "position" INT, dish_id UUID, dish_name TEXT,
  restaurant_name TEXT, restaurant_id UUID, avg_rating NUMERIC,
  total_votes BIGINT, category TEXT, note TEXT,
  restaurant_lat FLOAT, restaurant_lng FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT ll.id, ll.title, ll.description, ll.user_id, p.display_name,
    li."position", d.id, d.name, r.name, r.id, d.avg_rating, d.total_votes,
    d.category, li.note, r.lat, r.lng
  FROM local_lists ll
  JOIN profiles p ON p.id = ll.user_id
  JOIN local_list_items li ON li.list_id = ll.id
  JOIN dishes d ON d.id = li.dish_id
  JOIN restaurants r ON r.id = d.restaurant_id
  WHERE ll.user_id = target_user_id
    AND ll.is_active = true
    AND ((select auth.uid()) IS NULL
         OR NOT is_blocked_pair((select auth.uid()), target_user_id))
  ORDER BY li."position";
$$;


-- get_ranked_dishes — only best_photos CTE changes. Full final body lives in
-- supabase/migrations/20260415_h3_ugc_reporting_blocking.sql since the
-- function is too large to duplicate here. The migration runs the updated
-- CREATE OR REPLACE that adds `AND NOT is_blocked_pair((select auth.uid()),
-- dp.user_id)` to the best_photos CTE WHERE clause.
