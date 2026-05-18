-- =============================================
-- Seed Cocktails & Specialty Drinks — MV & Nantucket
-- =============================================
-- Signature cocktails at well-known island bars.
-- These are real cocktails commonly served at these establishments.
-- Run in Supabase SQL Editor.
-- =============================================

-- Offshore Ale Company (Oak Bluffs) — craft brewery + cocktails
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Dark & Stormy', 'drinks', 'Cocktails', 14.00),
  ('Offshore Mule', 'drinks', 'Cocktails', 15.00),
  ('Espresso Martini', 'drinks', 'Cocktails', 16.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Offshore Ale Company'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Lookout Tavern (Oak Bluffs) — sunset cocktails
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Lookout Margarita', 'drinks', 'Cocktails', 15.00),
  ('Frozen Mudslide', 'drinks', 'Cocktails', 14.00),
  ('Rum Punch', 'drinks', 'Cocktails', 14.00),
  ('Aperol Spritz', 'drinks', 'Cocktails', 15.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Lookout Tavern'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Beach Road (Vineyard Haven) — upscale cocktail program
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Negroni', 'drinks', 'Cocktails', 16.00),
  ('Old Fashioned', 'drinks', 'Cocktails', 17.00),
  ('Paloma', 'drinks', 'Cocktails', 16.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Beach Road'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Rockfish (Oak Bluffs) — seafood bar cocktails
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Dirty Martini', 'drinks', 'Cocktails', 16.00),
  ('Whiskey Sour', 'drinks', 'Cocktails', 15.00),
  ('Island Mojito', 'drinks', 'Cocktails', 16.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Rockfish'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- The Attic (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Spicy Margarita', 'drinks', 'Cocktails', 16.00),
  ('French 75', 'drinks', 'Cocktails', 17.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'The Attic'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Town Bar (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Cucumber Gimlet', 'drinks', 'Cocktails', 16.00),
  ('Espresso Martini', 'drinks', 'Cocktails', 17.00),
  ('Mezcal Mule', 'drinks', 'Cocktails', 16.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Town Bar'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Sharky's Cantina (Oak Bluffs / Edgartown) — Mexican cocktails
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('House Margarita', 'drinks', 'Cocktails', 13.00),
  ('Mango Margarita', 'drinks', 'Cocktails', 15.00),
  ('Paloma', 'drinks', 'Cocktails', 14.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name ILIKE '%sharky%'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Espresso Love (Edgartown / Vineyard Haven) — coffee
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Iced Latte', 'coffee', 'Coffee', 6.50),
  ('Chai Latte', 'coffee', 'Coffee', 6.00),
  ('Cold Brew', 'coffee', 'Coffee', 5.50)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name ILIKE '%espresso love%'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Seed oysters at relevant restaurants
INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Island Creek Oysters', 'oysters', 'Raw Bar', 18.00),
  ('Local Oysters (Half Dozen)', 'oysters', 'Raw Bar', 21.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Rockfish'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

INSERT INTO dishes (restaurant_id, name, category, menu_section, price)
SELECT id, dish.name, dish.category, dish.menu_section, dish.price
FROM restaurants, (VALUES
  ('Oysters on the Half Shell', 'oysters', 'Raw Bar', 21.00)
) AS dish(name, category, menu_section, price)
WHERE restaurants.name = 'Beach Road'
AND NOT EXISTS (
  SELECT 1 FROM dishes d WHERE d.restaurant_id = restaurants.id AND d.name = dish.name
);

-- Verify
SELECT d.name, d.category, r.name as restaurant
FROM dishes d
JOIN restaurants r ON d.restaurant_id = r.id
WHERE d.category IN ('drinks', 'coffee', 'oysters', 'ice cream')
ORDER BY d.category, r.name, d.name;
