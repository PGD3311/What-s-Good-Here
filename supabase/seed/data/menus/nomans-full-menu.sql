-- Noman's - Full Menu
-- Run this in Supabase SQL Editor
-- Oak Bluffs counter service — rum bar + elevated casual food

-- Ensure restaurant exists
INSERT INTO restaurants (name, address, lat, lng, town, cuisine) VALUES
('Noman''s', '15 Island Inn Rd, Oak Bluffs, MA 02557', 41.4537, -70.5585, 'Oak Bluffs', 'American')
ON CONFLICT (name) DO UPDATE SET
  address = EXCLUDED.address,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  town = EXCLUDED.town,
  cuisine = EXCLUDED.cuisine;

-- Delete old dishes (safe re-run)
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Noman''s');

-- Insert complete menu (35 items)
INSERT INTO dishes (restaurant_id, name, category, price) VALUES
-- Salads & Bowls
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Acai Bowl', 'breakfast', 13.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Kale & Sweet Potato Salad', 'salad', 15.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Quinoa Bowl', 'salad', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Warm Goat Cheese Salad', 'salad', 15.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Elote Chopped Salad', 'salad', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Tuna Tartare', 'seafood', 20.00),

-- Tacos
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Short Rib Tacos', 'taco', 16.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Chicken Tacos', 'taco', 15.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Mushroom Tacos', 'taco', 14.00),

-- Sandwiches & Burgers
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Cheeseburger', 'burger', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Pickle Brined Fried Chicken Sandwich', 'fried chicken', 15.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Codfish Sandwich', 'fish', 16.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Chicken Tenders', 'tendys', 15.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Green Goddess Hummus Wrap', 'sandwich', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Grilled Cheese', 'sandwich', 9.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Hot Dog', 'sandwich', 10.00),

-- Lobster
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Lobster Roll', 'lobster roll', 32.00),

-- Sides & Starters
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Noman''s Queso & Chips', 'apps', 12.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Charcuterie Box', 'apps', 24.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'French Fries', 'fries', 8.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Fingerling Potato Salad', 'sides', 7.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'House-Made Salsa & Chips', 'apps', 7.00),

-- Cocktails (all rum-forward, house Noman's rum)
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Pineapple Mint Daiquiri', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Painkiller', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'The Vibe', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Jungle Bird', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Mai Tai', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'Rum Runner', 'drinks', 14.00),
((SELECT id FROM restaurants WHERE name = 'Noman''s'), 'OB Peach Tea', 'drinks', 14.00);

-- Verify import
SELECT COUNT(*) as dish_count
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Noman''s');

-- Should show 29 dishes
