-- ============================================================
-- Pitch Restaurant Seeder — Bad Martha's, Noman's, Nancy's
-- ============================================================
-- Seeds ALL dishes at these 3 restaurants with 10 AI votes each.
-- These are pitch/demo restaurants that need to look fully alive.
--
-- Strategy:
--   1. For each restaurant, seed EVERY dish (not just top 5)
--   2. Category-aware rating ranges with MV premium
--   3. Beer gets its own range (breweries are specialty)
--   4. Skips dishes that already have 10+ AI votes
--
-- Cost: $0 (pure DB inserts, no external API calls)
-- Safe to re-run: idempotent (skips already-seeded dishes)
-- ============================================================

DO $$
DECLARE
  v_restaurant RECORD;
  v_dish RECORD;
  v_existing_count INT;
  v_votes_needed INT;
  v_base_rating DECIMAL;
  v_rating DECIMAL;
  v_i INT;
  v_total_inserted INT := 0;
  v_total_dishes INT := 0;
  v_pitch_restaurants TEXT[] := ARRAY[
    'Bad Martha Farmer''s Brewery',
    'Noman''s',
    'Nancy''s Restaurant'
  ];
BEGIN
  RAISE NOTICE '=== Pitch Restaurant Seeder ===';
  RAISE NOTICE 'Starting at %', NOW();

  FOR v_restaurant IN
    SELECT r.id AS restaurant_id, r.name AS restaurant_name, r.town
    FROM restaurants r
    WHERE r.name = ANY(v_pitch_restaurants)
    ORDER BY r.name
  LOOP
    RAISE NOTICE 'Processing: % (%)', v_restaurant.restaurant_name, v_restaurant.town;

    -- Seed EVERY dish at this restaurant
    FOR v_dish IN
      SELECT d.id AS dish_id, d.name AS dish_name, d.category, d.price
      FROM dishes d
      WHERE d.restaurant_id = v_restaurant.restaurant_id
        AND d.parent_dish_id IS NULL
      ORDER BY d.name
    LOOP
      -- Count existing AI votes for this dish
      SELECT COUNT(*) INTO v_existing_count
      FROM votes
      WHERE dish_id = v_dish.dish_id
        AND source = 'ai_estimated';

      v_votes_needed := 10 - v_existing_count;
      IF v_votes_needed <= 0 THEN
        RAISE NOTICE '  [skip] % already has 10+ votes', v_dish.dish_name;
        CONTINUE;
      END IF;

      v_total_dishes := v_total_dishes + 1;

      -- Category-aware base rating with MV premium
      -- These are pitch restaurants — skew slightly higher than generic seeder
      IF LOWER(v_dish.category) IN ('lobster roll', 'lobster') THEN
        v_base_rating := 7.5 + random() * 1.5;      -- 7.5-9.0 (MV lobster premium)
      ELSIF LOWER(v_dish.category) IN ('seafood', 'fish', 'clams') THEN
        v_base_rating := 7.0 + random() * 1.5;      -- 7.0-8.5
      ELSIF LOWER(v_dish.category) IN ('sushi') THEN
        v_base_rating := 7.0 + random() * 1.5;      -- 7.0-8.5
      ELSIF LOWER(v_dish.category) IN ('chowder') THEN
        v_base_rating := 7.0 + random() * 1.5;      -- 7.0-8.5
      ELSIF LOWER(v_dish.category) IN ('pizza', 'burger') THEN
        v_base_rating := 6.5 + random() * 2.0;      -- 6.5-8.5
      ELSIF LOWER(v_dish.category) IN ('taco') THEN
        v_base_rating := 6.5 + random() * 2.0;      -- 6.5-8.5
      ELSIF LOWER(v_dish.category) IN ('sandwich', 'fried chicken', 'tendys', 'wings') THEN
        v_base_rating := 6.5 + random() * 1.5;      -- 6.5-8.0
      ELSIF LOWER(v_dish.category) IN ('beer') THEN
        v_base_rating := 7.0 + random() * 2.0;      -- 7.0-9.0 (brewery specialty)
      ELSIF LOWER(v_dish.category) IN ('drinks') THEN
        v_base_rating := 7.0 + random() * 1.5;      -- 7.0-8.5
      ELSIF LOWER(v_dish.category) IN ('salad', 'breakfast') THEN
        v_base_rating := 6.5 + random() * 1.5;      -- 6.5-8.0
      ELSIF LOWER(v_dish.category) IN ('apps', 'sides', 'fries') THEN
        v_base_rating := 6.0 + random() * 1.5;      -- 6.0-7.5
      ELSE
        v_base_rating := 6.5 + random() * 1.5;      -- 6.5-8.0
      END IF;

      -- If dish has existing AI votes, anchor to their average
      IF v_existing_count > 0 THEN
        SELECT AVG(rating_10) INTO v_base_rating
        FROM votes
        WHERE dish_id = v_dish.dish_id
          AND source = 'ai_estimated'
          AND rating_10 IS NOT NULL;
      END IF;

      -- Insert votes with realistic variance
      FOR v_i IN 1..v_votes_needed LOOP
        v_rating := ROUND(
          GREATEST(1.0, LEAST(10.0,
            v_base_rating + (random() - 0.5) * 2.0
          ))::NUMERIC, 1
        );

        INSERT INTO votes (
          dish_id, user_id, would_order_again,
          rating_10, source, source_metadata
        ) VALUES (
          v_dish.dish_id,
          '00000000-0000-0000-0000-000000000000',
          v_rating >= 5.0,
          v_rating,
          'ai_estimated',
          jsonb_build_object(
            'method', 'pitch_restaurant_seeder',
            'generated_at', NOW()::TEXT,
            'base_rating', ROUND(v_base_rating::NUMERIC, 1),
            'category', v_dish.category,
            'restaurant', v_restaurant.restaurant_name
          )
        );

        v_total_inserted := v_total_inserted + 1;
      END LOOP;

      RAISE NOTICE '  [%] %: +% votes (base %.1)',
        v_dish.category, v_dish.dish_name,
        v_votes_needed, v_base_rating;
    END LOOP;
  END LOOP;

  RAISE NOTICE '================================';
  RAISE NOTICE 'Dishes seeded: %', v_total_dishes;
  RAISE NOTICE 'Votes inserted: %', v_total_inserted;
  RAISE NOTICE 'Completed at %', NOW();
END $$;
