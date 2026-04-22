-- =============================================
-- FULL SCHEMA SYNC: Dan's schema → Denis's Supabase
-- =============================================
-- Generated: 2026-04-02
-- Purpose: Single-run migration to bring Denis's DB up to parity with Dan's schema.sql
-- Safe to run multiple times (idempotent).
--
-- Dependency order:
--   0. Extensions
--   1. Tables (CREATE TABLE IF NOT EXISTS)
--   2. Columns (ALTER TABLE ADD COLUMN IF NOT EXISTS)
--   3. Constraints (idempotent DO blocks)
--   4. Indexes
--   5. Enable RLS on all tables
--   6. Helper functions (needed by RLS policies and RPCs)
--   7. Views
--   8. RLS policies (DROP IF EXISTS + CREATE)
--   9. Core RPCs (CREATE OR REPLACE)
--  10. Triggers (DROP IF EXISTS + CREATE)
--  11. Rate-limit convenience functions
--  12. Badge seed data (UPSERT)
--  13. Auth trigger
--  14. Grants
--  15. Storage policies
--  16. pg_cron jobs (wrapped in DO blocks for safety)
-- =============================================


-- =============================================
-- 0. EXTENSIONS
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================
-- 1. TABLES (in dependency order)
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
  created_by UUID REFERENCES auth.users(id),
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
  created_by UUID REFERENCES auth.users(id),
  tags TEXT[] DEFAULT '{}',
  cuisine TEXT,
  avg_rating DECIMAL(3, 1),
  total_votes INT DEFAULT 0,
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
  would_order_again BOOLEAN NOT NULL,
  rating_10 DECIMAL(3, 1),
  review_text TEXT,
  review_created_at TIMESTAMP WITH TIME ZONE,
  vote_position INT,
  scored_at TIMESTAMPTZ,
  category_snapshot TEXT,
  purity_score DECIMAL(5, 2),
  war_score DECIMAL(4, 3),
  badge_hash TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  source_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1d. profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  has_onboarded BOOLEAN DEFAULT false,
  preferred_categories TEXT[] DEFAULT '{}',
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  is_local_curator BOOLEAN DEFAULT false,
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
  created_by UUID REFERENCES auth.users(id)
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
  UNIQUE(dish_id, user_id)
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
  source TEXT DEFAULT 'manual',
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

-- 1p. restaurant_managers
CREATE TABLE IF NOT EXISTS restaurant_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, restaurant_id)
);

-- 1q. restaurant_invites
CREATE TABLE IF NOT EXISTS restaurant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ
);

-- 1r. curator_invites
CREATE TABLE IF NOT EXISTS curator_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_by UUID REFERENCES auth.users(id),
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

-- 1t. jitter_profiles
CREATE TABLE IF NOT EXISTS jitter_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}',
  review_count INTEGER NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  consistency_score DECIMAL(4, 3) DEFAULT 0,
  flagged BOOLEAN DEFAULT false,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1u. jitter_samples
CREATE TABLE IF NOT EXISTS jitter_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_data JSONB NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1v. events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  event_type TEXT NOT NULL,
  recurring_pattern TEXT,
  recurring_day_of_week INT,
  is_active BOOLEAN DEFAULT true,
  is_promoted BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 1w. local_lists
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

-- 1x. local_list_items
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


-- =============================================
-- 2. ADD MISSING COLUMNS (idempotent)
-- =============================================
-- Uses ADD COLUMN IF NOT EXISTS for columns that may have been added later.

-- restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'mv';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS town TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_last_checked TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_content_hash TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_section_order TEXT[] DEFAULT '{}';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS toast_slug TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS order_url TEXT;

-- dishes
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS menu_section TEXT;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS parent_dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS cuisine TEXT;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3, 1);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS total_votes INT DEFAULT 0;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS consensus_rating NUMERIC(3, 1);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS consensus_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS consensus_votes INT DEFAULT 0;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS consensus_calculated_at TIMESTAMPTZ;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS value_score DECIMAL(6, 2);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS value_percentile DECIMAL(5, 2);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS category_median_price DECIMAL(6, 2);

-- votes
ALTER TABLE votes ADD COLUMN IF NOT EXISTS rating_10 DECIMAL(3, 1);
ALTER TABLE votes ADD COLUMN IF NOT EXISTS review_text TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS review_created_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS vote_position INT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS category_snapshot TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS purity_score DECIMAL(5, 2);
ALTER TABLE votes ADD COLUMN IF NOT EXISTS war_score DECIMAL(4, 3);
ALTER TABLE votes ADD COLUMN IF NOT EXISTS badge_hash TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE votes ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_onboarded BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_categories TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_local_curator BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- dish_photos
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS height INT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS avg_brightness REAL;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS bright_pixel_pct REAL;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS dark_pixel_pct REAL;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS quality_score INT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'community';
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE dish_photos ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'user';

-- specials
ALTER TABLE specials ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false;
ALTER TABLE specials ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE specials ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE specials ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- jitter_profiles
ALTER TABLE jitter_profiles ADD COLUMN IF NOT EXISTS consistency_score DECIMAL(4, 3) DEFAULT 0;
ALTER TABLE jitter_profiles ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false;
ALTER TABLE jitter_profiles ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- events
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring_day_of_week INT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);


-- =============================================
-- 3. CONSTRAINTS (idempotent, wrapped in DO blocks)
-- =============================================

-- votes: source CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'votes_source_check'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_source_check CHECK (source IN ('user', 'ai_estimated'));
  END IF;
END $$;

-- votes: review_text_max_length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'review_text_max_length'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT review_text_max_length CHECK (review_text IS NULL OR length(review_text) <= 200);
  END IF;
END $$;

-- dish_photos: status CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'dish_photos_status_check'
  ) THEN
    ALTER TABLE dish_photos ADD CONSTRAINT dish_photos_status_check CHECK (status IN ('featured', 'community', 'hidden', 'rejected'));
  END IF;
END $$;

-- dish_photos: source_type CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'dish_photos_source_type_check'
  ) THEN
    ALTER TABLE dish_photos ADD CONSTRAINT dish_photos_source_type_check CHECK (source_type IN ('user', 'restaurant'));
  END IF;
END $$;

-- specials: source CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'specials_source_check'
  ) THEN
    ALTER TABLE specials ADD CONSTRAINT specials_source_check CHECK (source IN ('manual', 'auto_scrape'));
  END IF;
END $$;

-- jitter_profiles: confidence_level CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'jitter_profiles_confidence_level_check'
  ) THEN
    ALTER TABLE jitter_profiles ADD CONSTRAINT jitter_profiles_confidence_level_check CHECK (confidence_level IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- events: event_type CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'events_event_type_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (event_type IN ('live_music', 'trivia', 'comedy', 'karaoke', 'open_mic', 'other'));
  END IF;
END $$;

-- events: recurring_pattern CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'events_recurring_pattern_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_recurring_pattern_check CHECK (recurring_pattern IN ('weekly', 'monthly') OR recurring_pattern IS NULL);
  END IF;
END $$;

-- events: recurring_day_of_week CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'events_recurring_day_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_recurring_day_check CHECK (recurring_day_of_week BETWEEN 0 AND 6 OR recurring_day_of_week IS NULL);
  END IF;
END $$;

-- events: source CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'events_source_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_source_check CHECK (source IN ('manual', 'auto_scrape'));
  END IF;
END $$;

-- Partial unique index on votes: only user votes are unique per dish/user
CREATE UNIQUE INDEX IF NOT EXISTS votes_user_unique ON votes (dish_id, user_id) WHERE source = 'user';


-- =============================================
-- 4. INDEXES
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

-- profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_unique ON profiles(LOWER(display_name)) WHERE display_name IS NOT NULL;

-- dish_photos
CREATE INDEX IF NOT EXISTS idx_dish_photos_dish ON dish_photos(dish_id);
CREATE INDEX IF NOT EXISTS idx_dish_photos_user ON dish_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_dish_photos_status ON dish_photos(dish_id, status, quality_score DESC);

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

-- jitter_samples
CREATE INDEX IF NOT EXISTS idx_jitter_samples_user ON jitter_samples (user_id, collected_at DESC);

-- local_lists
CREATE INDEX IF NOT EXISTS idx_local_lists_user_id ON local_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_local_lists_is_active ON local_lists(is_active);
CREATE INDEX IF NOT EXISTS idx_local_list_items_list_position ON local_list_items(list_id, position);
CREATE INDEX IF NOT EXISTS idx_local_list_items_dish_id ON local_list_items(dish_id);

-- favorites (additional)
CREATE INDEX IF NOT EXISTS idx_favorites_dish_id ON favorites(dish_id);


-- =============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =============================================

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
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jitter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jitter_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_list_items ENABLE ROW LEVEL SECURITY;


-- =============================================
-- 6. HELPER FUNCTIONS (must come before RLS policies that reference them)
-- =============================================

-- is_admin()
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE user_id = (select auth.uid())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- is_local_curator()
CREATE OR REPLACE FUNCTION is_local_curator()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT is_local_curator FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- is_restaurant_manager()
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

-- get_bias_label()
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


-- =============================================
-- 7. VIEWS
-- =============================================

-- category_median_prices
CREATE OR REPLACE VIEW category_median_prices
WITH (security_invoker = true) AS
SELECT category,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
  COUNT(*) AS dish_count
FROM dishes
WHERE price IS NOT NULL AND price > 0 AND total_votes >= 8
GROUP BY category;

-- public_votes
CREATE OR REPLACE VIEW public_votes
WITH (security_invoker = true) AS
SELECT
  id,
  dish_id,
  would_order_again,
  rating_10,
  review_text,
  review_created_at,
  user_id,
  source
FROM votes;


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


-- =============================================
-- 9. CORE RPC FUNCTIONS (CREATE OR REPLACE)
-- =============================================

-- ---- dish_search_score (Bayesian ranking) ----
CREATE OR REPLACE FUNCTION dish_search_score(
  p_avg_rating DECIMAL,
  p_total_votes BIGINT,
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


-- ---- get_ranked_dishes ----
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
  yes_votes BIGINT,
  percent_worth_it INT,
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
      SUM(COALESCE(ds.vote_count, 0))::BIGINT AS total_child_votes,
      SUM(COALESCE(ds.yes_count, 0))::BIGINT AS total_child_yes
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::BIGINT AS vote_count,
        SUM(CASE WHEN v.would_order_again THEN (CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) ELSE 0 END)::BIGINT AS yes_count
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
    SELECT DISTINCT ON (dp.dish_id)
      dp.dish_id,
      dp.photo_url
    FROM dish_photos dp
    INNER JOIN dishes d2 ON dp.dish_id = d2.id
    INNER JOIN filtered_restaurants fr2 ON d2.restaurant_id = fr2.id
    WHERE dp.status IN ('featured', 'community')
      AND d2.parent_dish_id IS NULL
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
    COALESCE(vs.total_child_yes,
      SUM(CASE WHEN v.would_order_again AND v.source = 'user' THEN 1.0
               WHEN v.would_order_again AND v.source = 'ai_estimated' THEN 0.5
               ELSE 0 END)
    )::BIGINT AS yes_votes,
    CASE
      WHEN COALESCE(vs.total_child_votes,
        SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)) > 0
      THEN ROUND(100.0 *
        COALESCE(vs.total_child_yes,
          SUM(CASE WHEN v.would_order_again AND v.source = 'user' THEN 1.0
                   WHEN v.would_order_again AND v.source = 'ai_estimated' THEN 0.5
                   ELSE 0 END)) /
        COALESCE(vs.total_child_votes,
          SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))
      )::INT
      ELSE 0
    END AS percent_worth_it,
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
        SUM(CASE WHEN v.source = 'user' THEN 1.0 WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END))::BIGINT,
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
           vs.total_child_votes, vs.total_child_yes, vs.child_count,
           bv.best_name, bv.best_rating,
           d.value_score, d.value_percentile,
           rvc.recent_votes,
           bp.photo_url
  ORDER BY search_score DESC NULLS LAST, total_votes DESC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;


-- ---- get_restaurant_dishes ----
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
  yes_votes BIGINT,
  percent_worth_it INT,
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
      SUM(COALESCE(ds.vote_count, 0))::BIGINT AS total_child_votes,
      SUM(COALESCE(ds.yes_count, 0))::BIGINT AS total_child_yes,
      CASE
        WHEN SUM(COALESCE(ds.vote_count, 0)) > 0
        THEN ROUND((SUM(COALESCE(ds.rating_sum, 0)) / NULLIF(SUM(COALESCE(ds.vote_count, 0)), 0))::NUMERIC, 1)
        ELSE NULL
      END AS combined_avg_rating
    FROM dishes d
    LEFT JOIN (
      SELECT v.dish_id,
        SUM(CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::BIGINT AS vote_count,
        SUM(CASE WHEN v.would_order_again THEN (CASE WHEN v.source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) ELSE 0 END)::BIGINT AS yes_count,
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
      SUM(CASE WHEN v.would_order_again THEN 1 ELSE 0 END)::BIGINT AS direct_yes,
      ROUND(AVG(v.rating_10)::NUMERIC, 1) AS direct_avg
    FROM dishes d LEFT JOIN votes v ON v.dish_id = d.id
    WHERE d.parent_dish_id IS NULL
    GROUP BY d.id
  )
  SELECT
    d.id AS dish_id, d.name AS dish_name, r.id AS restaurant_id, r.name AS restaurant_name,
    d.category, d.menu_section, d.price, d.photo_url,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0)::BIGINT AS total_votes,
    COALESCE(vs.total_child_yes, dvs.direct_yes, 0)::BIGINT AS yes_votes,
    CASE
      WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) > 0
      THEN ROUND(100.0 * COALESCE(vs.total_child_yes, dvs.direct_yes, 0) / COALESCE(vs.total_child_votes, dvs.direct_votes, 1))::INT
      ELSE 0
    END AS percent_worth_it,
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
           vs.total_child_votes, vs.total_child_yes, vs.combined_avg_rating, vs.child_count,
           dvs.direct_votes, dvs.direct_yes, dvs.direct_avg,
           bv.best_id, bv.best_name, bv.best_rating
  ORDER BY
    CASE WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) >= 5 THEN 0 ELSE 1 END,
    CASE
      WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) > 0
      THEN ROUND(100.0 * COALESCE(vs.total_child_yes, dvs.direct_yes, 0) / COALESCE(vs.total_child_votes, dvs.direct_votes, 1))
      ELSE 0
    END DESC,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0) DESC;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ---- get_dish_variants ----
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
  yes_votes BIGINT,
  percent_worth_it INT,
  avg_rating DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS dish_id, d.name AS dish_name, d.price, d.photo_url, d.display_order,
    COUNT(v.id)::BIGINT AS total_votes,
    SUM(CASE WHEN v.would_order_again THEN 1 ELSE 0 END)::BIGINT AS yes_votes,
    CASE
      WHEN COUNT(v.id) > 0
      THEN ROUND(100.0 * SUM(CASE WHEN v.would_order_again THEN 1 ELSE 0 END) / COUNT(v.id))::INT
      ELSE 0
    END AS percent_worth_it,
    ROUND(AVG(v.rating_10)::NUMERIC, 1) AS avg_rating
  FROM dishes d
  LEFT JOIN votes v ON d.id = v.dish_id
  WHERE d.parent_dish_id = p_parent_dish_id
  GROUP BY d.id, d.name, d.price, d.photo_url, d.display_order
  ORDER BY d.display_order, d.name;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ---- get_smart_snippet ----
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
$$ LANGUAGE plpgsql SET search_path = public;


-- ---- Social functions ----

CREATE OR REPLACE FUNCTION get_follower_count(user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER FROM follows WHERE followed_id = user_id;
$$;

CREATE OR REPLACE FUNCTION get_following_count(user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT COUNT(*)::INTEGER FROM follows WHERE follower_id = user_id;
$$;

CREATE OR REPLACE FUNCTION is_following(follower UUID, followed UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = follower AND followed_id = followed);
$$;

CREATE OR REPLACE FUNCTION get_friends_votes_for_dish(
  p_user_id UUID,
  p_dish_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  rating_10 DECIMAL(3, 1),
  would_order_again BOOLEAN,
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT
    p.id AS user_id, p.display_name, v.rating_10, v.would_order_again,
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
  would_order_again BOOLEAN,
  voted_at TIMESTAMPTZ,
  category_expertise TEXT
)
LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT
    p.id AS user_id, p.display_name, d.id AS dish_id, d.name AS dish_name,
    v.rating_10, v.would_order_again, v.created_at AS voted_at,
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
    ROUND(AVG(ABS(rating_a - rating_b)), 1) AS avg_difference,
    CASE
      WHEN COUNT(*) >= 3 THEN ROUND(100 - (AVG(ABS(rating_a - rating_b)) / 9.0 * 100))::INT
      ELSE NULL
    END AS compatibility_pct
  FROM shared;
$$;

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
      ROUND(100 - (AVG(ABS(a.rating_10 - b.rating_10)) / 9.0 * 100))::INT AS compat
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


-- ---- Rating identity functions ----

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
  SELECT ROUND(AVG(ABS(v.rating_10 - d.avg_rating)), 1), COUNT(*)::INT
  INTO calculated_bias, calculated_votes_with_consensus
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.rating_10 IS NOT NULL
    AND d.avg_rating IS NOT NULL AND d.total_votes >= 5;

  SELECT COUNT(*)::INT INTO calculated_votes_pending
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.rating_10 IS NOT NULL
    AND (d.total_votes < 5 OR d.avg_rating IS NULL);

  SELECT COUNT(*)::INT INTO calculated_dishes_helped
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = target_user_id AND v.vote_position <= 3
    AND v.rating_10 IS NOT NULL AND d.total_votes >= 5;

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

CREATE OR REPLACE FUNCTION mark_reveals_seen(event_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE bias_events SET seen = TRUE
  WHERE id = ANY(event_ids) AND user_id = (select auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ---- Badge functions ----

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
  SELECT COUNT(DISTINCT v.dish_id), COUNT(DISTINCT d.restaurant_id)
  INTO v_total_dishes, v_total_restaurants
  FROM votes v JOIN dishes d ON v.dish_id = d.id WHERE v.user_id = p_user_id;

  SELECT COALESCE(urs.rating_bias, 0.0), COALESCE(urs.votes_with_consensus, 0), COALESCE(urs.dishes_helped_establish, 0)
  INTO v_global_bias, v_votes_with_consensus, v_dishes_helped_establish
  FROM user_rating_stats urs WHERE urs.user_id = p_user_id;

  IF v_global_bias IS NULL THEN v_global_bias := 0.0; END IF;
  IF v_votes_with_consensus IS NULL THEN v_votes_with_consensus := 0; END IF;
  IF v_dishes_helped_establish IS NULL THEN v_dishes_helped_establish := 0; END IF;

  SELECT COUNT(*) INTO v_follower_count FROM follows WHERE followed_id = p_user_id;

  SELECT COALESCE(json_agg(cat_row), '[]'::json) INTO v_category_stats
  FROM (
    SELECT v.category_snapshot AS category, COUNT(*) AS total_ratings,
      COUNT(*) FILTER (WHERE d.consensus_ready = TRUE) AS consensus_ratings,
      ROUND(AVG(v.rating_10 - d.avg_rating) FILTER (WHERE d.consensus_ready = TRUE AND v.rating_10 IS NOT NULL), 1) AS bias
    FROM votes v JOIN dishes d ON v.dish_id = d.id
    WHERE v.user_id = p_user_id AND v.category_snapshot IS NOT NULL
    GROUP BY v.category_snapshot
  ) cat_row;

  SELECT COUNT(DISTINCT v.dish_id) INTO v_hidden_gems
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND v.vote_position <= 3 AND d.avg_rating >= 8.0 AND d.total_votes >= 10;
  IF v_hidden_gems IS NULL THEN v_hidden_gems := 0; END IF;

  SELECT COUNT(DISTINCT v.dish_id) INTO v_called_it
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND v.vote_position <= 5 AND v.rating_10 >= 8
    AND d.consensus_ready = TRUE AND d.avg_rating >= 8.0;
  IF v_called_it IS NULL THEN v_called_it := 0; END IF;

  SELECT COUNT(DISTINCT v.dish_id) INTO v_top_dish_votes
  FROM votes v JOIN dishes d ON v.dish_id = d.id
  WHERE v.user_id = p_user_id AND d.total_votes >= 5
    AND d.avg_rating = (SELECT MAX(d2.avg_rating) FROM dishes d2 WHERE d2.restaurant_id = d.restaurant_id AND d2.total_votes >= 5);
  IF v_top_dish_votes IS NULL THEN v_top_dish_votes := 0; END IF;

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


-- ---- Notification functions ----

CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' OR (select auth.uid()) = p_user_id THEN
      (SELECT COUNT(*)::INTEGER FROM notifications WHERE user_id = p_user_id AND read = FALSE)
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications SET read = TRUE
  WHERE user_id = p_user_id AND read = FALSE
    AND (auth.role() = 'service_role' OR (select auth.uid()) = p_user_id);
$$;


-- ---- Rate limiting functions ----

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
  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION check_vote_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('vote', 10, 60);
$$;

CREATE OR REPLACE FUNCTION check_photo_upload_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('photo_upload', 5, 60);
$$;

CREATE OR REPLACE FUNCTION check_restaurant_create_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('restaurant_create', 5, 3600);
$$;

CREATE OR REPLACE FUNCTION check_dish_create_rate_limit()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT check_and_record_rate_limit('dish_create', 20, 3600);
$$;


-- ---- Restaurant manager functions ----

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


-- ---- Geo functions ----

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
    r.id, r.name, r.address, r.lat, r.lng, r.google_place_id,
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
  dish_count BIGINT
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
    COUNT(d.id)::BIGINT AS dish_count
  FROM nearby n
  LEFT JOIN dishes d ON d.restaurant_id = n.id AND d.parent_dish_id IS NULL
  WHERE n.distance_miles <= p_radius_miles
  GROUP BY n.id, n.name, n.address, n.lat, n.lng, n.is_open, n.cuisine, n.town,
           n.google_place_id, n.website_url, n.phone, n.distance_miles
  ORDER BY n.distance_miles ASC;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;


-- ---- Jitter Protocol functions ----

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


-- ---- Local Lists functions ----

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
          WHEN COUNT(*) >= 3 THEN ROUND(100 - (AVG(ABS(a.rating_10 - b.rating_10)) / 9.0 * 100))::INT
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
  total_votes INT,
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

CREATE OR REPLACE FUNCTION create_curator_invite()
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
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

  UPDATE profiles SET is_local_curator = true WHERE id = v_user_id;

  SELECT display_name INTO v_display_name FROM profiles WHERE id = v_user_id;

  INSERT INTO local_lists (user_id, title, is_active)
  VALUES (v_user_id, COALESCE(v_display_name, 'My') || '''s Top 10', false)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN
    SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;
  END IF;

  UPDATE curator_invites SET used_by = v_user_id, used_at = NOW() WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'list_id', v_list_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  total_votes INT,
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

  IF NOT is_local_curator() THEN
    RETURN json_build_object('success', false, 'error', 'Not a local curator');
  END IF;

  IF jsonb_array_length(p_items) > 10 THEN
    RETURN json_build_object('success', false, 'error', 'Maximum 10 dishes allowed');
  END IF;

  SELECT id INTO v_list_id FROM local_lists WHERE user_id = v_user_id;

  IF v_list_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No list found — accept an invite first');
  END IF;

  UPDATE local_lists
  SET curator_tagline = p_tagline,
      is_active = jsonb_array_length(p_items) > 0
  WHERE id = v_list_id;

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


-- ---- Locals aggregate (chalkboard cards) ----

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


-- =============================================
-- 10. TRIGGERS
-- =============================================

-- 10a. Update follow counts
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

-- 10b. Notify on follow
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

-- 10c. Vote insert: set vote_position, category_snapshot, update user_rating_stats
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

-- 10d. Consensus check after vote (MAD-based)
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
      SELECT name INTO dish_name_snapshot FROM dishes WHERE id = NEW.dish_id;

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

-- 10e. Update dish avg_rating on vote changes (source-weighted)
CREATE OR REPLACE FUNCTION update_dish_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE dishes SET avg_rating = sub.avg_r, total_votes = sub.cnt
  FROM (
    SELECT
      ROUND(
        (SUM(rating_10 * CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END) /
         NULLIF(SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END), 0)
        )::NUMERIC, 1
      ) AS avg_r,
      SUM(CASE WHEN source = 'ai_estimated' THEN 0.5 ELSE 1.0 END)::BIGINT AS cnt
    FROM votes WHERE dish_id = COALESCE(NEW.dish_id, OLD.dish_id) AND rating_10 IS NOT NULL
  ) sub
  WHERE dishes.id = COALESCE(NEW.dish_id, OLD.dish_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_dish_rating_on_vote ON votes;
CREATE TRIGGER update_dish_rating_on_vote
  AFTER INSERT OR UPDATE OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION update_dish_avg_rating();

-- 10f. Compute value_score on dish insert/update
CREATE OR REPLACE FUNCTION compute_value_score()
RETURNS TRIGGER AS $$
DECLARE
  v_median DECIMAL;
BEGIN
  IF NEW.price IS NULL OR NEW.price <= 0 OR NEW.total_votes < 8 OR NEW.avg_rating IS NULL THEN
    NEW.value_score := NULL;
    NEW.category_median_price := NULL;
    RETURN NEW;
  END IF;

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

-- 10g. Batch recalculate value percentiles
CREATE OR REPLACE FUNCTION recalculate_value_percentiles()
RETURNS VOID AS $$
BEGIN
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

  UPDATE dishes SET value_score = NULL, value_percentile = NULL, category_median_price = NULL
  WHERE price IS NULL OR price <= 0 OR total_votes < 8 OR avg_rating IS NULL;

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

  UPDATE dishes SET value_percentile = NULL
  WHERE value_score IS NOT NULL
    AND category NOT IN (
      SELECT category FROM dishes WHERE value_score IS NOT NULL GROUP BY category HAVING COUNT(*) >= 8
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10h. Jitter sample merge trigger
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

  SELECT profile_data, review_count INTO existing_profile, sample_count
  FROM jitter_profiles WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
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

    IF sample_count >= 15 THEN
      new_confidence := 'high';
    ELSIF sample_count >= 5 THEN
      new_confidence := 'medium';
    ELSE
      new_confidence := 'low';
    END IF;

    new_consistency := 0;
    IF existing_profile ? 'mean_inter_key' AND new_sample ? 'mean_inter_key'
       AND (existing_profile->>'mean_inter_key')::DECIMAL > 0 THEN
      new_consistency := GREATEST(0, LEAST(1,
        1.0 - ABS(
          (new_sample->>'mean_inter_key')::DECIMAL - (existing_profile->>'mean_inter_key')::DECIMAL
        ) / (existing_profile->>'mean_inter_key')::DECIMAL
      ));
      IF (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) > 0 THEN
        new_consistency := (
          (SELECT consistency_score FROM jitter_profiles WHERE user_id = NEW.user_id) *
          (sample_count - 1) + new_consistency
        ) / sample_count;
      END IF;
    END IF;

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


-- =============================================
-- 11. AUTH TRIGGER: Auto-create profile on signup
-- =============================================

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


-- =============================================
-- 12. BADGE SEED DATA (41 badges, UPSERT)
-- =============================================

INSERT INTO badges (key, name, subtitle, description, icon, is_public_eligible, sort_order, rarity, family, category) VALUES
  ('hidden_gem_finder', 'Hidden Gem Finder', 'Spotted potential', 'Voted early on a dish that became a hidden gem', '💎', false, 84, 'common', 'discovery', NULL),
  ('gem_hunter', 'Gem Hunter', 'Sharp eye for quality', 'Found 5 hidden gems before the crowd', '🔍', false, 82, 'uncommon', 'discovery', NULL),
  ('gem_collector', 'Gem Collector', 'Treasure hunter', 'Discovered 10 hidden gems early', '🏆', true, 80, 'rare', 'discovery', NULL),
  ('good_call', 'Good Call', 'Nailed it', 'Predicted a dish would be great and the crowd agreed', '📞', false, 102, 'common', 'discovery', NULL),
  ('taste_prophet', 'Taste Prophet', 'Ahead of the curve', 'Called it right on 3 dishes before consensus', '🔮', false, 100, 'uncommon', 'discovery', NULL),
  ('oracle', 'Oracle', 'The taste whisperer', 'Predicted 5 crowd favorites before anyone else', '🌟', true, 98, 'rare', 'discovery', NULL),
  ('steady_hand', 'Steady Hand', 'Right on target', 'Global bias within 0.5 of consensus with 20+ rated', '🎯', true, 60, 'uncommon', 'consistency', NULL),
  ('tough_critic', 'Tough Critic', 'Holding the line', 'Consistently rates below consensus (bias <= -1.5)', '🧐', false, 58, 'uncommon', 'consistency', NULL),
  ('generous_spirit', 'Generous Spirit', 'Spreading the love', 'Consistently rates above consensus (bias >= 1.5)', '💛', false, 56, 'uncommon', 'consistency', NULL),
  ('taste_maker', 'Taste Maker', 'Building a following', '10+ followers trust your taste', '📣', false, 48, 'uncommon', 'influence', NULL),
  ('trusted_voice', 'Trusted Voice', 'People listen', '25+ followers trust your taste', '🎙️', true, 46, 'rare', 'influence', NULL),
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
-- 13. GRANTS
-- =============================================

GRANT EXECUTE ON FUNCTION get_smart_snippet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_smart_snippet(UUID) TO anon;
GRANT EXECUTE ON FUNCTION check_and_record_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_vote_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_photo_upload_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_restaurant_create_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_dish_create_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearby_restaurants TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearby_restaurants TO anon;
GRANT EXECUTE ON FUNCTION get_restaurants_within_radius(DECIMAL, DECIMAL, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_restaurants_within_radius(DECIMAL, DECIMAL, INT) TO anon;


-- =============================================
-- 14. STORAGE POLICIES
-- =============================================

-- dish-photos bucket (ensure bucket exists first via Supabase dashboard)
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
-- 15. PG_CRON JOBS (safe — wrapped in DO blocks)
-- =============================================
-- These will only work if pg_cron extension is enabled.
-- If it fails, these jobs can be set up manually via Supabase dashboard.

DO $$
BEGIN
  -- Try to schedule value percentile recalculation
  PERFORM cron.schedule('recalculate-value-percentiles', '0 */2 * * *', 'SELECT recalculate_value_percentiles()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or job already exists: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- Try to schedule rate limit cleanup
  PERFORM cron.schedule('cleanup-old-rate-limits', '15 * * * *', 'DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL ''1 hour''');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or job already exists: %', SQLERRM;
END $$;


-- =============================================
-- DONE. Migration complete.
-- =============================================
