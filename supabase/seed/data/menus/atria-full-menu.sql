-- Atria - Full Menu (Dining Room + Cellar pills)
-- Source: menu provided by Dan, 2026-06-02
-- 3 pills on the restaurant page: Top Rated (auto-pooled) · Dining Room · Cellar
--   Dining Room  = Starters, Entrees, Sides   (upstairs / main dining room)
--   Cellar       = Burgers, Cocktails         (Brick Cellar, downstairs)
-- "The Atria Classic Burger" appears on both the Entrees and burger menus;
-- listed once under Cellar > Burgers to avoid a duplicate row.
-- Run this in Supabase SQL Editor

-- Delete old dishes
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Atria');

-- Insert complete menu (37 items)
INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price) VALUES
-- === Dining Room ===
-- Starters
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Island Greens with Blueberries & Gorgonzola', 'salad', 'Starters', 'Dining Room', 19.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Bonni''s Chilled Hearts of Romaine Caesar', 'salad', 'Starters', 'Dining Room', 21.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pan Seared Lump Crab Cakes with Corn Butter', 'crab', 'Starters', 'Dining Room', 26.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Heirloom Tomato Carpaccio with Fresh Burrata & Basil Pesto', 'apps', 'Starters', 'Dining Room', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Crispy Duck Confit & Shiitake Spring Rolls', 'duck', 'Starters', 'Dining Room', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Crispy Wok Fired Calamari', 'calamari', 'Starters', 'Dining Room', 25.00),
-- Entrees
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Bobo''s Two Pound Wok Fired Island Lobster', 'lobster', 'Entrees', 'Dining Room', 78.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Winner Winner Chicken Dinner with Crispy Potato Skins', 'chicken', 'Entrees', 'Dining Room', 45.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Pork & Beans', 'pork', 'Entrees', 'Dining Room', 48.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Grilled Thick Cut Swordfish with Dill Whipped Potatoes', 'fish', 'Entrees', 'Dining Room', 54.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Surf & Turf', 'steak', 'Entrees', 'Dining Room', 62.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'A Very Serious Steak', 'steak', 'Entrees', 'Dining Room', 78.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pan Roasted Duck Breast with Homemade Ginger Hoisin', 'duck', 'Entrees', 'Dining Room', 62.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Crispy Local Black Sea Bass with Curried Carrot Puree', 'fish', 'Entrees', 'Dining Room', 62.00),
-- Sides
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Truffle Fries', 'fries', 'Sides', 'Dining Room', 17.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Plancha Charred Broccolini', 'veggies', 'Sides', 'Dining Room', 17.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Haricots Verts', 'veggies', 'Sides', 'Dining Room', 17.00),
-- === Cellar (Brick Cellar) ===
-- Burgers (all $32)
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The Atria Classic Burger', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The Fast Eddie', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The Frenchy', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The McRip Off', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Dante''s Inferno', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Southern Mother Clucker', 'fried chicken', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The Veggie PETA', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Moroccan Lamb Burger', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'The Bombay Bird', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Smash or Pass', 'burger', 'Burgers', 'Cellar', 32.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'A Bigger Boat', 'fish-sandwich', 'Burgers', 'Cellar', 32.00),
-- Cocktails
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Eve Sterling', 'cocktails', 'Cocktails', 'Cellar', 25.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pink Pony Club', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Mile High Club', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Chef''s Summer Spritz', 'cocktails', 'Cocktails', 'Cellar', 18.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Sin Padres', 'cocktails', 'Cocktails', 'Cellar', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Cat''s Meow', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Come to Brazil', 'cocktails', 'Cocktails', 'Cellar', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Summer''s Bounty G&T', 'cocktails', 'Cocktails', 'Cellar', 28.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Teaberry Shot', 'cocktails', 'Cocktails', 'Cellar', 10.00);

-- Pill order (Top Rated is auto-prepended by the app)
UPDATE restaurants
SET menu_group_order = ARRAY['Dining Room', 'Cellar'],
    menu_section_order = ARRAY['Starters', 'Entrees', 'Sides', 'Burgers', 'Cocktails']
WHERE name = 'Atria';

-- Verify import
SELECT menu_group, menu_section, COUNT(*) AS n
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Atria')
GROUP BY menu_group, menu_section
ORDER BY menu_group, menu_section;
