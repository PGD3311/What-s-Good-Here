-- Bad Martha Farmer's Brewery - Full Menu + Flagship Beers
-- Run this in Supabase SQL Editor
-- Edgartown brewery taproom — beer-forward with artisan pizza + snacks

-- Ensure restaurant exists
INSERT INTO restaurants (name, address, lat, lng, town, cuisine) VALUES
('Bad Martha Farmer''s Brewery', '270 Upper Main St, Edgartown, MA 02539', 41.3897, -70.5197, 'Edgartown', 'Brewery')
ON CONFLICT (name) DO UPDATE SET
  address = EXCLUDED.address,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  town = EXCLUDED.town,
  cuisine = EXCLUDED.cuisine;

-- Delete old dishes (safe re-run)
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery');

-- Insert complete menu (23 items: 5 pizzas, 4 snacks, 8 flagship beers, 4 flights/growlers, 2 cocktails)
INSERT INTO dishes (restaurant_id, name, category, price) VALUES
-- Artisan Pizzas (thin crispy crust)
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Margherita Pizza', 'pizza', 16.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Bacon & Red Onion Pizza', 'pizza', 18.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Cremini Mushroom Pizza', 'pizza', 17.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Veggie Pizza', 'pizza', 18.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Taco Pizza', 'pizza', 18.00),

-- Snacks & Starters
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Giant Soft Pretzel', 'apps', 12.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Pretzel Bites', 'apps', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Charcuterie Platter', 'apps', 24.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Local Cheese Plate', 'apps', 18.00),

-- Flagship Beers (pint prices estimated from reviews)
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Martha''s Vineyard Ale', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Island IPA', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Vineyard Summer Ale', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Blueberry Abbey', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Last Ferry Home Stout', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Edgartown Espresso Stout', 'beer', 10.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Big Bad Belgian Quad', 'beer', 12.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Humpback Hefeweizen', 'beer', 10.00),

-- Flights & Growlers
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Beer Flight (4 Tasters)', 'beer', 15.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Growler (64oz)', 'beer', 22.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Crowler (32oz)', 'beer', 14.00),
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Bog Head Cranberry Seltzer', 'beer', 9.00),

-- Cocktails (rum-based taproom specials)
((SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery'), 'Bad Martha Rum Punch', 'drinks', 14.00);

-- Verify import
SELECT COUNT(*) as dish_count
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Bad Martha Farmer''s Brewery');

-- Should show 22 dishes
