-- =============================================
-- Demo Gamification Data
-- Creates fake users with overlapping votes,
-- badges, and follows to test:
--   1. Similar Taste discovery
--   2. Expert social proof on restaurants
--   3. Friends badge context on dishes
--   4. Badge progress nudges
--
-- Run AFTER all migrations are applied.
-- Safe to re-run (uses ON CONFLICT DO NOTHING).
-- =============================================

-- Step 1: Create 6 fake users in auth.users
-- Using deterministic UUIDs so this is idempotent
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token
) VALUES
  ('aaaaaaaa-0001-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah.demo@example.com', '$2a$10$fakehash1', NOW(), NOW(), NOW(), '', ''),
  ('aaaaaaaa-0002-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mike.demo@example.com', '$2a$10$fakehash2', NOW(), NOW(), NOW(), '', ''),
  ('aaaaaaaa-0003-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lisa.demo@example.com', '$2a$10$fakehash3', NOW(), NOW(), NOW(), '', ''),
  ('aaaaaaaa-0004-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jake.demo@example.com', '$2a$10$fakehash4', NOW(), NOW(), NOW(), '', ''),
  ('aaaaaaaa-0005-4000-a000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'emma.demo@example.com', '$2a$10$fakehash5', NOW(), NOW(), NOW(), '', ''),
  ('aaaaaaaa-0006-4000-a000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chef.demo@example.com', '$2a$10$fakehash6', NOW(), NOW(), NOW(), '', '')
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create profiles
INSERT INTO profiles (id, display_name) VALUES
  ('aaaaaaaa-0001-4000-a000-000000000001', 'Sarah'),
  ('aaaaaaaa-0002-4000-a000-000000000002', 'Mike'),
  ('aaaaaaaa-0003-4000-a000-000000000003', 'Lisa'),
  ('aaaaaaaa-0004-4000-a000-000000000004', 'Jake'),
  ('aaaaaaaa-0005-4000-a000-000000000005', 'Emma'),
  ('aaaaaaaa-0006-4000-a000-000000000006', 'ChefTony')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- Step 3: Insert votes on real dishes
-- Each user votes on 8-12 dishes from the top 20 most-voted dishes
-- Ratings cluster around similar values to create high compatibility

-- First, get dish IDs dynamically and insert votes
DO $$
DECLARE
  v_dish RECORD;
  v_dishes UUID[];
  v_categories TEXT[];
  i INT;
BEGIN
  -- Get top 20 dishes by vote count
  SELECT array_agg(id), array_agg(category)
  INTO v_dishes, v_categories
  FROM (
    SELECT id, category FROM dishes
    WHERE total_votes >= 1
    ORDER BY total_votes DESC
    LIMIT 20
  ) sub;

  -- If no dishes found, try all dishes
  IF v_dishes IS NULL OR array_length(v_dishes, 1) IS NULL THEN
    SELECT array_agg(id), array_agg(category)
    INTO v_dishes, v_categories
    FROM (
      SELECT id, category FROM dishes
      ORDER BY created_at
      LIMIT 20
    ) sub;
  END IF;

  IF v_dishes IS NULL OR array_length(v_dishes, 1) IS NULL THEN
    RAISE NOTICE 'No dishes found in database. Skipping vote seeding.';
    RETURN;
  END IF;

  -- Sarah votes on dishes 1-10 (high ratings, generous)
  FOR i IN 1..LEAST(10, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0001-4000-a000-000000000001', true, 7.5 + (random() * 2.0)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  -- Mike votes on dishes 1-8 (similar to Sarah, slightly lower)
  FOR i IN 1..LEAST(8, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0002-4000-a000-000000000002', i <= 6, 6.5 + (random() * 2.5)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  -- Lisa votes on dishes 3-12 (overlaps with Sarah on 3-10)
  FOR i IN 3..LEAST(12, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0003-4000-a000-000000000003', true, 7.0 + (random() * 2.5)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  -- Jake votes on dishes 1-6, 11-16 (partial overlap)
  FOR i IN 1..LEAST(6, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0004-4000-a000-000000000004', i <= 4, 5.0 + (random() * 3.0)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;
  FOR i IN 11..LEAST(16, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0004-4000-a000-000000000004', true, 6.0 + (random() * 2.0)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  -- Emma votes on dishes 2-9 (high overlap with Sarah, very similar taste)
  FOR i IN 2..LEAST(9, array_length(v_dishes, 1)) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0005-4000-a000-000000000005', true, 7.0 + (random() * 2.0)::numeric(3,1), NOW() - (i || ' days')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  -- ChefTony votes on ALL 20 dishes (the expert — many votes per category)
  FOR i IN 1..array_length(v_dishes, 1) LOOP
    INSERT INTO votes (dish_id, user_id, would_order_again, rating_10, created_at)
    VALUES (v_dishes[i], 'aaaaaaaa-0006-4000-a000-000000000006', true, 7.0 + (random() * 2.5)::numeric(3,1), NOW() - (i || ' hours')::interval)
    ON CONFLICT (dish_id, user_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Inserted votes for 6 demo users across % dishes', array_length(v_dishes, 1);
END $$;

-- Step 4: Award badges to demo users
-- Sarah: Pizza Specialist (she knows her pizza)
-- ChefTony: Pizza Authority + Burger Specialist (the local expert)
-- Lisa: Seafood Specialist

INSERT INTO user_badges (user_id, badge_key, unlocked_at) VALUES
  -- Sarah — Pizza Specialist
  ('aaaaaaaa-0001-4000-a000-000000000001', 'specialist_pizza', NOW() - interval '7 days'),
  -- ChefTony — Pizza Authority + Burger Specialist
  ('aaaaaaaa-0006-4000-a000-000000000006', 'authority_pizza', NOW() - interval '3 days'),
  ('aaaaaaaa-0006-4000-a000-000000000006', 'specialist_pizza', NOW() - interval '14 days'),
  ('aaaaaaaa-0006-4000-a000-000000000006', 'specialist_burger', NOW() - interval '5 days'),
  ('aaaaaaaa-0006-4000-a000-000000000006', 'specialist_seafood', NOW() - interval '2 days'),
  -- Lisa — Seafood Specialist
  ('aaaaaaaa-0003-4000-a000-000000000003', 'specialist_seafood', NOW() - interval '10 days'),
  -- Mike — Discovery badge
  ('aaaaaaaa-0002-4000-a000-000000000002', 'hidden_gem_finder', NOW() - interval '20 days'),
  -- Emma — Steady Hand (consistency)
  ('aaaaaaaa-0005-4000-a000-000000000005', 'steady_hand', NOW() - interval '5 days')
ON CONFLICT (user_id, badge_key) DO NOTHING;

-- Step 5: Create some follows
-- This makes friends' votes visible on dish pages
-- The logged-in user should follow some of these people
-- We'll create inter-demo-user follows so they appear as each other's friends

INSERT INTO follows (follower_id, followed_id) VALUES
  -- Sarah follows Mike and Lisa
  ('aaaaaaaa-0001-4000-a000-000000000001', 'aaaaaaaa-0002-4000-a000-000000000002'),
  ('aaaaaaaa-0001-4000-a000-000000000001', 'aaaaaaaa-0003-4000-a000-000000000003'),
  -- Mike follows Sarah and ChefTony
  ('aaaaaaaa-0002-4000-a000-000000000002', 'aaaaaaaa-0001-4000-a000-000000000001'),
  ('aaaaaaaa-0002-4000-a000-000000000002', 'aaaaaaaa-0006-4000-a000-000000000006'),
  -- Lisa follows Sarah
  ('aaaaaaaa-0003-4000-a000-000000000003', 'aaaaaaaa-0001-4000-a000-000000000001'),
  -- Emma follows everyone
  ('aaaaaaaa-0005-4000-a000-000000000005', 'aaaaaaaa-0001-4000-a000-000000000001'),
  ('aaaaaaaa-0005-4000-a000-000000000005', 'aaaaaaaa-0002-4000-a000-000000000002'),
  ('aaaaaaaa-0005-4000-a000-000000000005', 'aaaaaaaa-0003-4000-a000-000000000003'),
  ('aaaaaaaa-0005-4000-a000-000000000005', 'aaaaaaaa-0006-4000-a000-000000000006')
ON CONFLICT (follower_id, followed_id) DO NOTHING;

-- profiles.follower_count / following_count are maintained by the
-- trigger_update_follow_counts AFTER trigger on follows. The hand-rolled
-- UPDATE that used to live here was both redundant and blocked by
-- protect_profile_fields (no bypass flag set) — pure cruft that masked
-- the underlying trigger bug. The follower-list API also reads counts
-- live from the follows table, so the denorm column isn't a UX concern.

-- =============================================
-- IMPORTANT: After running this, log in as your
-- real account and follow some of these users to
-- see friends' votes + similar taste features.
--
-- Follow these for best demo:
--   Sarah, ChefTony, Lisa
--
-- Then visit:
--   - Any pizza dish → see Sarah (Specialist) + ChefTony (Authority)
--   - Any restaurant with pizza/burgers → see expert-rated indicators
--   - Profile page → see Similar Taste section
--   - Browse Pizza when close to badge → see nudge banner
-- =============================================
