-- Larsen's Fish Market - Full Menu (kitchen / prepared items only)
-- Source: larsensfishmarket.com/our-menu
-- Note: Larsen's is a market — all items are market price (price = NULL).
-- Skips raw fish/shellfish counter (whole striped bass, scallops by the pound, etc.) —
-- those aren't "dishes" people rate on WGH.
-- Run this in Supabase SQL Editor

-- Delete old dishes
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market');

-- Insert prepared menu (21 items)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price) VALUES
-- Cooked to Order
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Whole Lobster', 'lobster', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Clam Chowder', 'chowder', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Lobster Bisque', 'soup', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Stuffed Quahogs', 'apps', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Stuffed Scallops', 'scallops', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Crab Cakes', 'crab', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Steamers', 'clams', 'Cooked to Order', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Mussels', 'mussels', 'Cooked to Order', NULL),

-- Raw Bar
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Oysters on the Half Shell', 'apps', 'Raw Bar', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Littlenecks on the Half Shell', 'apps', 'Raw Bar', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Cherrystones on the Half Shell', 'apps', 'Raw Bar', NULL),

-- In the Cooler
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Warm Lobster Roll', 'lobster roll', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Cold Lobster Salad Roll', 'lobster roll', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Shrimp Cocktail', 'shrimp', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Seafood Spread', 'apps', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Smoked Bluefish Spread', 'apps', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Smoked Tuna Spread', 'apps', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Seaweed Salad', 'salad', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Pesto Tortellini Salad', 'salad', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Asian Noodle Salad', 'salad', 'In the Cooler', NULL),
((SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market'), 'Smoked Whitefish Salad', 'salad', 'In the Cooler', NULL);

-- Update menu_section_order to match Larsen's actual menu layout
UPDATE restaurants
SET menu_section_order = ARRAY['Cooked to Order', 'Raw Bar', 'In the Cooler']
WHERE name = 'Larsen''s Fish Market';

-- Verify import
SELECT COUNT(*) as dish_count
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Larsen''s Fish Market');
