-- Saltie Girl (Boston) - Full Menu
-- Source: Hand-imported from saltiegirl.com Boston menu (JS tab menu defeats auto-extraction).
--   The site serves ALL DAY / BRUNCH / CAVIAR / TIN LIST / COCKTAILS / DESSERT as client-side
--   tabs on a single URL, so menu-refresh (incl. thin-fallback-v1 sub-page crawl) cannot read it.
-- Replaces 6 stale/incorrect auto-extracted dishes with the real menu.
-- Run this in Supabase SQL Editor (postgres role) — DELETE needs RLS bypass.

-- Delete old (incorrect) dishes
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Saltie Girl');

-- Insert complete menu (32 items)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price) VALUES
-- Starters
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Saltie Girl Clam Chowder', 'chowder', 'Starters', 14),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Caviar Dip', 'apps', 'Starters', 32),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Latke & Caviar', 'apps', 'Starters', 32),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Crispy Ipswich Clams', 'clams', 'Starters', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Pt. Judith Calamari', 'calamari', 'Starters', 21),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Warm Spicy Blue Crab Roll', 'crab', 'Starters', 29),
-- Toasts
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Lump Crab', 'crab', 'Toasts', 28),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Hand-Chopped Dry Aged Steak Tartare', 'apps', 'Toasts', 24),
-- Crudo
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Tuna Carpaccio', 'fish', 'Crudo', 24),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Hamachi Tiradito', 'fish', 'Crudo', 19),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Salmon Crudo', 'fish', 'Crudo', 19),
-- Salads
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Boston Lettuce', 'salad', 'Salads', 17),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Gem Lettuce', 'salad', 'Salads', 18),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Spicy Caesar', 'salad', 'Salads', 16),
-- Seafood Towers
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Petite Seafood Tower', 'seafood', 'Seafood Towers', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Grande Seafood Tower', 'seafood', 'Seafood Towers', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Royale Seafood Tower', 'seafood', 'Seafood Towers', NULL),
-- New York Style Smoked Fish
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Smoked Atlantic Salmon', 'fish', 'New York Style Smoked Fish', 26),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Pastrami Smoked Salmon', 'fish', 'New York Style Smoked Fish', 26),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Smoked Whitefish Salad', 'fish', 'New York Style Smoked Fish', 26),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Smoked Trout', 'fish', 'New York Style Smoked Fish', 26),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Smoked Fish Platter', 'fish', 'New York Style Smoked Fish', 75),
-- Cocktails
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Pineapple', 'cocktails', 'Cocktails', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Grapefruit', 'cocktails', 'Cocktails', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Mango', 'cocktails', 'Cocktails', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Passionfruit', 'cocktails', 'Cocktails', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Shiso', 'cocktails', 'Cocktails', NULL),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Saltie', 'cocktails', 'Cocktails', NULL),
-- Desserts
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'SweetBoy Chocolate Chip Cookie', 'dessert', 'Desserts', 8),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Pistachio Tiramisu', 'dessert', 'Desserts', 16),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Sticky Toffee Madeleines', 'dessert', 'Desserts', 15),
((SELECT id FROM restaurants WHERE name = 'Saltie Girl'), 'Ice Cream', 'ice cream', 'Desserts', 9);

-- Update menu_section_order to mirror the real menu layout
UPDATE restaurants
SET menu_section_order = ARRAY['Starters', 'Toasts', 'Crudo', 'Salads', 'Seafood Towers', 'New York Style Smoked Fish', 'Cocktails', 'Desserts']
WHERE name = 'Saltie Girl';

-- NOTE: Do NOT touch extractor_fingerprint. It's already 'sonnet-4-6|...|thin-fallback-v1'
-- (= CURRENT_EXTRACTOR_FINGERPRINT), which makes menu-refresh's hash short-circuit SKIP this
-- restaurant on the next cron as long as the page's raw HTML is unchanged. Overwriting it
-- would FORCE a re-extraction and re-pollute this manual menu with bad auto-extracted dishes.

-- Verify import
SELECT COUNT(*) AS dish_count
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Saltie Girl');
