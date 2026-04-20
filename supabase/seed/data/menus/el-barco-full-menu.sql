-- El Barco - Food Menu Refresh
-- Source: https://elbarcomv.com/view-menu/ (Food & Drinks PDF, Apr 2026)
-- Run this in Supabase SQL Editor (project vpioftosgdkyiwvhxewy)
--
-- Fixes:
--   1. is_open was false → true (restaurant is open)
--   2. town was "West Tisbury" → "Vineyard Haven" (actual: 16 Union St)
--   3. Section "Street Tacos" → "Tacos" (match actual PDF menu)
--   4. Burritos were miscategorized as 'taco' → 'burrito'
--   5. Quesabirria was miscategorized as 'quesadilla' → 'taco'
--   6. Adds Tres Leches, renames "Chips & Guac" → "Chips & Guacamole", "Pork Carnitas" → "Carnitas"
--   7. Corrects prices: Taco Salad $12 → $17, Elote $10 → $9, Churros $11 → $12, tacos repriced
--
-- Drinks (Margaritas, Cocktails, Frozen Drinks) are LEFT UNTOUCHED.

-- 1. Flip restaurant to open + fix town
UPDATE restaurants
SET is_open = true,
    town = 'Vineyard Haven'
WHERE name = 'El Barco';

-- 2. Delete only food dishes (keep drinks)
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'El Barco')
  AND menu_section IN ('Appetizers', 'Street Tacos', 'Tacos', 'Burritos', 'Dessert');

-- 3. Insert complete food menu (20 items)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price) VALUES
-- Appetizers
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Chips & Salsa', 'apps', 'Appetizers', 10.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Chips & Queso', 'apps', 'Appetizers', 11.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Chips & Guacamole', 'apps', 'Appetizers', 12.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Chicken Flautas', 'apps', 'Appetizers', 16.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Fried Calamari', 'calamari', 'Appetizers', 16.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Elote', 'apps', 'Appetizers', 9.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'El Barco Taco Salad', 'salad', 'Appetizers', 17.00),
-- Tacos (two 5-inch tacos per order)
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Quesabirria', 'taco', 'Tacos', 17.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Carnitas', 'taco', 'Tacos', 12.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Pollo Asado', 'taco', 'Tacos', 12.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'El Fish', 'taco', 'Tacos', 16.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Smashburger Taco', 'taco', 'Tacos', 14.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Blackened Shrimp', 'taco', 'Tacos', 16.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Mushroom Al Pastor', 'taco', 'Tacos', 12.00),
-- Burritos (12" flour tortilla, jack cheese, rice, pinto beans, lettuce, pico)
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Birria Steak Burrito', 'burrito', 'Burritos', 17.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Mushroom Al Pastor Burrito', 'burrito', 'Burritos', 15.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Carnitas Burrito', 'burrito', 'Burritos', 14.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Pollo Asado Burrito', 'burrito', 'Burritos', 14.00),
-- Dessert
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Churros', 'dessert', 'Dessert', 12.00),
((SELECT id FROM restaurants WHERE name = 'El Barco'), 'Tres Leches', 'dessert', 'Dessert', 14.00);

-- 4. Update menu_section_order to match actual menu (food sections first, drinks after)
UPDATE restaurants
SET menu_section_order = ARRAY['Appetizers', 'Tacos', 'Burritos', 'Dessert', 'Margaritas', 'Cocktails', 'Frozen Drinks']
WHERE name = 'El Barco';

-- 5. Verify
SELECT r.name, r.town, r.is_open, r.menu_section_order,
       (SELECT COUNT(*) FROM dishes WHERE restaurant_id = r.id) AS total_dishes,
       (SELECT COUNT(*) FROM dishes WHERE restaurant_id = r.id AND menu_section IN ('Appetizers','Tacos','Burritos','Dessert')) AS food_dishes
FROM restaurants r
WHERE r.name = 'El Barco';
