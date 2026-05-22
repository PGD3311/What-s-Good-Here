-- Nancy's Restaurant multi-menu support
-- Adds menu_group concept (one level above menu_section) so a single restaurant
-- can have multiple physical menus (e.g. Snack Bar vs. Upstairs). Dishes that
-- exist on both menus at different prices live as separate rows.
--
-- Safe to re-run: column adds use IF NOT EXISTS; backfill is idempotent
-- (WHERE menu_group IS NULL); upstairs inserts are guarded by NOT EXISTS
-- subqueries against (restaurant_id, name, menu_group).
--
-- NOTE on convergence: re-running the migration WILL NOT update price /
-- description / category / menu_section on already-inserted Upstairs rows.
-- To correct a row after the fact, write a targeted UPDATE in a follow-up
-- migration. NOT EXISTS protects against duplicates, not drift.
--
-- ROLLBACK:
--   ALTER TABLE dishes DROP COLUMN IF EXISTS menu_group;
--   ALTER TABLE restaurants DROP COLUMN IF EXISTS menu_group_order;
--   -- The 113 inserted Upstairs dishes would need to be deleted manually:
--   -- DELETE FROM dishes WHERE restaurant_id = (SELECT id FROM restaurants
--   --   WHERE name = 'Nancy''s Restaurant') AND menu_group = 'Upstairs';
--   -- (only safe if no votes have landed against them yet)

-- =============================================================
-- 1. Schema additions
-- =============================================================
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS menu_group TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_group_order TEXT[] DEFAULT '{}';

-- =============================================================
-- 2. Replace get_restaurant_dishes RPC to project menu_group
-- =============================================================
-- DROP first: CREATE OR REPLACE FUNCTION cannot change the shape of an
-- existing RETURNS TABLE. We're adding the menu_group column, so the
-- shape changes and Postgres rejects the replace. Dropping is safe here
-- because we recreate immediately after, in the same transaction, with
-- the same name + arg signature; existing callers see no downtime.
DROP FUNCTION IF EXISTS get_restaurant_dishes(UUID);

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
  menu_group TEXT,
  price DECIMAL,
  photo_url TEXT,
  total_votes BIGINT,
  avg_rating DECIMAL,
  has_variants BOOLEAN,
  variant_count INT,
  best_variant_id UUID,
  best_variant_name TEXT,
  best_variant_rating DECIMAL,
  tags TEXT[],
  description TEXT,
  dietary_tags TEXT[]
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
    d.category, d.menu_section, d.menu_group, d.price, d.photo_url,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0)::BIGINT AS total_votes,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) AS avg_rating,
    (vs.child_count IS NOT NULL AND vs.child_count > 0) AS has_variants,
    COALESCE(vs.child_count, 0)::INT AS variant_count,
    bv.best_id AS best_variant_id, bv.best_name AS best_variant_name, bv.best_rating AS best_variant_rating,
    d.tags,
    d.description,
    d.dietary_tags
  FROM dishes d
  INNER JOIN restaurants r ON d.restaurant_id = r.id
  LEFT JOIN variant_stats vs ON vs.parent_dish_id = d.id
  LEFT JOIN best_variants bv ON bv.parent_dish_id = d.id
  LEFT JOIN dish_vote_stats dvs ON dvs.dish_id = d.id
  WHERE d.restaurant_id = p_restaurant_id
    AND r.is_open = true
    AND d.parent_dish_id IS NULL
  GROUP BY d.id, d.name, r.id, r.name, d.category, d.menu_section, d.menu_group, d.price, d.photo_url, d.tags,
           vs.total_child_votes, vs.combined_avg_rating, vs.child_count,
           dvs.direct_votes, dvs.direct_avg,
           bv.best_id, bv.best_name, bv.best_rating,
           d.description, d.dietary_tags
  ORDER BY
    CASE WHEN COALESCE(vs.total_child_votes, dvs.direct_votes, 0) >= 5 THEN 0 ELSE 1 END,
    COALESCE(vs.combined_avg_rating, dvs.direct_avg) DESC NULLS LAST,
    COALESCE(vs.total_child_votes, dvs.direct_votes, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_restaurant_dishes(UUID) TO anon, authenticated;

-- =============================================================
-- 3. Backfill Nancy's existing 49 dishes → menu_group = 'Snack Bar'
-- =============================================================
UPDATE dishes
SET menu_group = 'Snack Bar'
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant' LIMIT 1)
  AND menu_group IS NULL;

-- =============================================================
-- 4. Set Nancy's menu_group_order
-- =============================================================
UPDATE restaurants
SET menu_group_order = ARRAY['Snack Bar', 'Upstairs']
WHERE name = 'Nancy''s Restaurant';

-- =============================================================
-- 5. Insert Upstairs dishes
-- Source: 2026 Open Menu PDF. Food + signature cocktails + frozens only —
-- standard beer/wine list intentionally omitted (low rating signal, list
-- changes seasonally). Each insert is guarded by NOT EXISTS so the
-- migration is safely re-runnable.
-- =============================================================
DO $$
DECLARE
  nancys_id UUID;
BEGIN
  SELECT id INTO nancys_id FROM restaurants WHERE name = 'Nancy''s Restaurant' LIMIT 1;
  IF nancys_id IS NULL THEN
    RAISE EXCEPTION 'Nancy''s Restaurant not found — abort';
  END IF;

  -- Helper pattern: insert only if (name, menu_group) doesn't already exist for this restaurant
  -- Appetizers
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Appetizers', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('New England Clam Chowder', 'chowder', 9.95, NULL),
    ('Shrimp Cocktail (6)', 'shrimp', 22.95, '6 served with cocktail sauce'),
    ('Shrimp Cocktail (12)', 'shrimp', 42.95, '12 served with cocktail sauce'),
    ('Shrimp Nancy''s', 'shrimp', 21.95, 'Shrimp, tomato, garlic, beurre blanc, sourdough'),
    ('Fried Calamari', 'calamari', 21.95, 'Plum-ginger glaze, red bell pepper, scallions, black sesame seeds, herbs'),
    ('Scallops Wrapped in Bacon', 'scallops', 18.95, 'Apricot-Dijon glaze, red bell pepper, scallions'),
    ('Chowder Fries', 'fries', 17.95, 'Fries, Old Bay, malt vinegar, chowder, parmesan, bacon, herbs'),
    ('PEI Mussels', 'mussels', 28.95, 'Shrimp, chorizo, tomato, white wine butter sauce, sourdough, fries'),
    ('Nancy''s Wings', 'wings', 20.95, '10 fried wings served with house bleu cheese. Garlic buffalo sauce or dry lemon pepper.'),
    ('Grilled Halloumi', 'apps', 19.95, 'Cucumber salad, olives, fattoush dressing'),
    ('Hummus', 'apps', 16.95, 'Served with pita bread or vegetables'),
    ('Baba Ganoush', 'apps', 16.95, 'Served with pita bread or vegetables'),
    ('Mediterranean Sampler', 'apps', 25.95, 'Hummus, tabbouleh, grape leaves, falafel, pita'),
    ('Whole Belly Clams', 'clams', 28.95, 'Served with house tartar sauce')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id
      AND d.name = x.name
      AND d.menu_group = 'Upstairs'
  );

  -- Handhelds (served with french fries or mixed greens)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Handhelds', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Smash Burger', 'burger', 19.95, 'Two 4oz patties, American cheese, pickles, house sauce. Served with french fries or mixed greens.'),
    ('Salmon BLT', 'sandwich', 27.95, 'Seared salmon, crispy bacon, lettuce, tomato, garlic aioli. Served with french fries or mixed greens.'),
    ('Fried Fish Sandwich', 'fish-sandwich', 19.95, 'Fried cod, lettuce, tomato, side of tartar sauce & coleslaw. Served with french fries or mixed greens.'),
    ('Joe''s Chicken Sandwich', 'chicken', 22.95, 'Chicken breast, pepper jack cheese, jalapeño, garlic aioli. Served with french fries or mixed greens.'),
    ('Steak Sandwich', 'sandwich', 25.95, 'Shaved steak, poblano pepper, white onion, American cheese, house sauce, lettuce, tomato. Served with french fries or mixed greens.'),
    ('Fish Tacos', 'taco', 21.95, 'Fried or grilled cod, house slaw, cilantro, spicy mayo. Served with french fries or mixed greens.'),
    ('Shrimp Tacos', 'taco', 21.95, 'Fried or grilled shrimp, house slaw, cilantro, spicy mayo. Served with french fries or mixed greens.'),
    ('Buffalo Chicken Wrap', 'wrap', 19.95, 'Grilled chicken, lettuce, tomato, garlic buffalo sauce, ranch, flour tortilla. Served with french fries or mixed greens.'),
    ('Greek Wrap', 'wrap', 18.95, 'Hummus, greens, tomato, cucumber, olive, pickled red onion, banana pepper, feta, flour tortilla. Served with french fries or mixed greens.')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Salads
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Salads', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Fattoush Salad', 'salad', 17.95, 'Mixed greens, tomato, cucumber, pickled red onion, radish, fattoush dressing, toasted pita chips, sumac. Add protein: Falafel 8.95, Chicken 8.95, Shrimp 9.95, Salmon 14.95, Lobster Salad 22.95.'),
    ('Greek Salad', 'salad', 18.95, 'Mixed greens, tomato, cucumber, pickled red onion, olives, feta, pepperoncini, fattoush dressing, oregano'),
    ('Caesar Salad', 'salad', 17.95, 'Anchovies available upon request'),
    ('Citrus Radicchio Salad', 'salad', 19.95, 'Orange, grapefruit, fennel, crispy quinoa, red onion, herbs')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Entrees
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Entrees', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Baked Cod', 'fish', 34.95, 'Buttered cracker crust, lemon butter. Served with seasonal vegetables & daily starch. Add crab + corn crust + $10.'),
    ('Baked Scallops', 'scallops', 37.95, 'Buttered cracker crust, lemon butter. Served with seasonal vegetables & daily starch.'),
    ('Broiled Seafood Plate', 'seafood', 39.95, 'Cod, shrimp, scallops, lemon butter. Served with seasonal vegetables & daily starch.'),
    ('Braised Short Rib', 'entree', 37.95, 'Creamy polenta, broccolini'),
    ('Salmon Bowl', 'fish', 35.95, 'Japanese BBQ, rice, seasonal vegetables, furikake'),
    ('Shrimp Pasta', 'pasta', 32.95, 'Shrimp, tomato, white wine garlic butter sauce'),
    ('Pasta Alla Vodka', 'pasta', 31.95, 'Vodka sauce, burrata, bread crumbs')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Fried Seafood (served with coleslaw & french fries or mixed greens)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Fried Seafood', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Fish & Chips', 'fish-and-chips', 29.95, 'Served with coleslaw & french fries or mixed greens'),
    ('Clam Strips', 'clams', 32.95, 'Served with coleslaw & french fries or mixed greens'),
    ('Jumbo Shrimp', 'shrimp', 30.95, 'Served with coleslaw & french fries or mixed greens'),
    ('Whole Bellies', 'clams', 42.95, 'Served with coleslaw & french fries or mixed greens'),
    ('Sea Scallops', 'scallops', 36.95, 'Served with coleslaw & french fries or mixed greens'),
    ('Seafood Plate', 'seafood', 48.95, 'Fried seafood combo. Served with coleslaw & french fries or mixed greens.')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Lobster
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Lobster', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Lobster Mac & Cheese', 'lobster', 39.95, 'Lobster, bread crumbs, chives'),
    ('Cold Lobster Roll', 'lobster roll', 30.95, 'Lobster salad on a split top roll. Served with coleslaw & french fries or mixed greens.'),
    ('Hot Lobster Roll', 'lobster roll', 32.95, 'Butter poached lobster on a split top roll. Served with coleslaw & french fries or mixed greens.'),
    ('Steamed Lobster', 'lobster', 39.95, '1.5 lb lobster served with potatoes, corn, & coleslaw')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Sushi: Apps & Snacks
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Sushi Apps & Snacks', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Edamame', 'apps', 12, NULL),
    ('Seaweed Salad', 'salad', 12, NULL),
    ('Shumai', 'apps', 12, 'Steamed shrimp dumplings'),
    ('Gyoza', 'apps', 12, 'Steamed pork dumplings'),
    ('Tuna Avo Salad', 'salad', 18, 'Tuna, lettuce, avocado, spicy mayo'),
    ('Seared Peppered Tuna', 'fish', 19, NULL),
    ('Ceviche', 'seafood', 19, 'Tuna, salmon, yellowtail, white tuna, shrimp, crab, ponzu'),
    ('Sushi Sandwich', 'sushi', 18, 'Spicy tuna, avocado, rice, nori')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Sushi: Specialty Rolls
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Specialty Rolls', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Nancy''s Roll', 'sushi', 26, 'Shrimp tempura, spicy crab, topped with salmon, tuna, avocado, soy paper, spicy mayo, & eel sauce'),
    ('Volcano Roll', 'sushi', 26, 'Spicy tuna, crab, cucumber, avocado, tempura crunch, topped with kabayaki sauce, spicy mayo, & tobiko'),
    ('Dragon Roll', 'sushi', 20, 'Shrimp tempura topped with sliced avocado & eel sauce'),
    ('Sneaky Steve Roll', 'sushi', 26, 'Spicy tuna, tempura, topped with pepper tuna, avocado, & special sauce'),
    ('Amazing Roll', 'sushi', 25, 'Shrimp tempura topped with spicy tuna, eel sauce, spicy mayo, & wasabi tobiko'),
    ('Rainbow Roll', 'sushi', 22, 'California roll topped with sashimi & avocado'),
    ('MV Roll', 'sushi', 26, 'Tuna, salmon, yellowtail, & avocado'),
    ('Katama Roll', 'sushi', 26, 'Tuna, salmon, avocado, topped with yellowtail, jalapeño, & sriracha'),
    ('Coconut Shrimp Roll', 'sushi', 23, 'Shrimp tempura, cucumber, avocado, topped with shredded coconut')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Sushi: Plates & Bowls
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, x.category, 'Plates & Bowls', 'Upstairs', x.price, x.description
  FROM (VALUES
    ('Tuna Sashimi Bowl', 'sushi', 29, 'Tuna, avocado, seaweed salad, cucumber, takuan, tobiko, eel sauce, avocado, spicy mayo, rice'),
    ('Chirashi Bowl', 'sushi', 30, '15 pieces of chef''s choice sashimi & sushi rice'),
    ('Sashimi Dinner', 'sushi', 32, '12 pieces chef''s choice'),
    ('Sushi Dinner', 'sushi', 32, '8 pieces of sushi, California roll'),
    ('Sushi & Sashimi Dinner', 'sushi', 36, '5 pieces of sushi, 8 pieces of sashimi'),
    ('Tri-Color Sushi', 'sushi', 35, '3 pieces of each of tuna, yellowtail, & salmon'),
    ('Salmon Lover', 'sushi', 33, '6 pieces of salmon nigiri & salmon roll'),
    ('Love Boat', 'sushi', 120, '15 pieces of sashimi, 10 pieces of nigiri, 2 specialty rolls')
  ) AS x(name, category, price, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Sushi: Nigiri & Sashimi (per-piece pricing)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, 'sushi', 'Nigiri & Sashimi', 'Upstairs', x.price, NULL
  FROM (VALUES
    ('Tuna Nigiri', 10),
    ('Salmon Nigiri', 10),
    ('Yellowtail Nigiri', 10),
    ('Shrimp Nigiri', 8),
    ('Red Snapper Nigiri', 10),
    ('Octopus Nigiri', 9),
    ('Smoked Salmon Nigiri', 10),
    ('White Tuna Nigiri', 10),
    ('Eel Nigiri', 10),
    ('Tamago Nigiri', 8),
    ('Inari Nigiri', 8)
  ) AS x(name, price)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Sushi: Sushi Rolls (basic + maki)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, 'sushi', 'Sushi Rolls', 'Upstairs', x.price, NULL
  FROM (VALUES
    ('Alaska Roll', 13),
    ('Boston Roll', 14),
    ('Philadelphia Roll', 15),
    ('California Roll', 13),
    ('Shrimp Tempura Roll', 16),
    ('Spicy Tuna Roll', 14),
    ('Spicy Salmon Roll', 14),
    ('Eel Avocado Roll', 14),
    ('Tuna or Salmon Roll', 15),
    ('Yellowtail Roll', 14),
    ('Salmon Avocado Roll', 14),
    ('Tuna Avocado Roll', 14),
    ('Sweet Potato Roll', 16),
    ('Vegetable Roll', 13),
    ('Cucumber Roll', 12),
    ('Avocado Roll', 12)
  ) AS x(name, price)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Famous Frozens (all $15)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, 'cocktails', 'Famous Frozens', 'Upstairs', 15, x.description
  FROM (VALUES
    ('Dirty Banana', 'Nancy''s signature mudslide with banana'),
    ('Bahama Mama', 'Cruzan Mango & Coconut Rum, banana, strawberry, mango, pineapple, dark rum sinker'),
    ('Frozen Lemonade', 'Deep Eddy Lemon Vodka, orange liqueur, lemon. Make it Zita''s way! +2'),
    ('Piña Colada', 'Cruzan Coconut Rum, light rum, pineapple, coconut, dark rum sinker'),
    ('Peach, Please', 'Deep Eddy Peach & Sweet Tea Vodka, lemon'),
    ('Coco Loco Margarita', '1800 Coconut Tequila, coconut, lime')
  ) AS x(name, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Cocktails (all $15)
  INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price, description)
  SELECT nancys_id, x.name, 'cocktails', 'Cocktails', 'Upstairs', 15, x.description
  FROM (VALUES
    ('MV Mai Tai', 'Bacardi Aged Spiced Rum, light rum, pineapple, lime, Orgeat, amaretto float'),
    ('Summer Mule', 'Ketel One Botanical Peach & Orange Blossom Vodka, ginger beer, passionfruit, lime'),
    ('Pink Panther', 'Ghost Tequila, Fever-Tree Pink Grapefruit Soda, lime, Tajin rim'),
    ('Donovan''s Rum Punch', 'Light & dark rum, peach, tropical juices'),
    ('Nancy''s Margarita', 'Mi Campo Blanco, orange liqueur, sour mix, lime, Grand Marnier float'),
    ('Goombay Smash', 'Cruzan Coconut Rum, light rum, tropical juices, dark rum float'),
    ('Dad Bod', 'Penelope Bourbon, Orgeat, Angostura Bitters, pineapple'),
    ('Gin Girl Summer', 'St. George Valley Gin, elderflower, lemon, prosecco, mint'),
    ('Smoke On The Water', 'Banhez Mezcal, pineapple juice, lime'),
    ('Lambert''s Limeade', 'Deep Eddy Lime Vodka, strawberry, lemon'),
    ('Noman''s Painkiller', 'Noman''s Dark Rum, coconut, orange, pineapple, nutmeg')
  ) AS x(name, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM dishes d
    WHERE d.restaurant_id = nancys_id AND d.name = x.name AND d.menu_group = 'Upstairs'
  );

  -- Beer + wine intentionally omitted. Considered but dropped after launch
  -- review: rating signal on standard wine/beer pours is low, and the wine
  -- list is too long/seasonal to be worth maintaining as discrete dishes.
  -- Signature cocktails + frozens stay because they're house creations with
  -- real rating value.

END $$;

-- =============================================================
-- Verification queries (run these after the migration to sanity-check)
-- =============================================================
-- 1. Dish counts by group. Expected: Snack Bar: 49, Upstairs: 113
--    (Upstairs breakdown: 14 apps + 9 handhelds + 4 salads + 7 entrees + 6 fried
--     + 4 lobster + 8 sushi apps + 9 specialty rolls + 8 plates + 11 nigiri
--     + 16 sushi rolls + 6 frozens + 11 cocktails = 113)
-- SELECT menu_group, COUNT(*) FROM dishes
--   WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant')
--   GROUP BY menu_group;

-- 2. Any Nancy's dishes still without a menu_group? (should be zero)
-- SELECT COUNT(*) FROM dishes
--   WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant')
--   AND menu_group IS NULL;

-- 3. Section breakdown — useful for spot-checking against the menu
-- SELECT menu_group, menu_section, COUNT(*) FROM dishes
--   WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant')
--   GROUP BY menu_group, menu_section ORDER BY menu_group, menu_section;

-- 4. Confirm menu_group_order on the restaurant row
-- SELECT menu_group_order FROM restaurants WHERE name = 'Nancy''s Restaurant';
-- Expected: {Snack Bar,Upstairs}

-- 5. Detect duplicate (name, menu_group) rows that slipped past the guard
-- SELECT name, menu_group, COUNT(*) FROM dishes
--   WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant')
--   GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- 6. Surface menu_group_order values that have no dishes (typo detector)
-- SELECT unnest(menu_group_order) AS g FROM restaurants WHERE name = 'Nancy''s Restaurant'
-- EXCEPT
-- SELECT DISTINCT menu_group FROM dishes
--   WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant');

-- 7. End-to-end RPC smoke test
-- SELECT menu_group, COUNT(*) FROM get_restaurant_dishes(
--   (SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant')
-- ) GROUP BY menu_group;
