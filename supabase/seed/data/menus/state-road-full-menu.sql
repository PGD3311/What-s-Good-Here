-- State Road (West Tisbury) - Full Menu
-- Source: current menu provided by Dan 2026-05-28 (checkle.menu embed was returning HTTP 500,
--   so the automated pipeline couldn't extract it — manual import).
-- 22 dishes across Starters / Mains / Desserts. Descriptions included.
-- Run in Supabase SQL Editor (production).

-- Wipe old dishes (clears the 5 stale generic placeholders)
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'State Road');

-- Insert current menu (22 dishes)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price, description) VALUES
-- Starters
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Herb Milk Bread', 'apps', 'Starters', 12, 'rosemary, thyme, cured olive butter'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Hen of the Woods', 'apps', 'Starters', 17, 'parsley, mint, dill, soubise'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Beets', 'salad', 'Starters', 15, 'endive, pistachios, supremes, nigella, dill, crème fraîche, honey clementine vinaigrette'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Fattoush', 'salad', 'Starters', 20, 'mesclun, red watercress, radish, cucumber, tomato, pita, pickled rhubarb, sumac, lemon pomegranate vinaigrette'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Farmstand Salad', 'salad', 'Starters', 23, 'arugula, english peas, sugar snaps, haricots verts, asparagus, edamame, fried halloumi, muhammara, sourdough croutons, lemon vinaigrette'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Buffalo Burrata', 'apps', 'Starters', 21, 'speck, english peas, sourdough crostini'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Tuna Tartar', 'apps', 'Starters', 24, 'bulgur, haricots verts, baby yukons, radish, niçoise olives, soft boiled egg, aleppo, ginger harissa vinaigrette, nigella crackers'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Shrimp', 'shrimp', 'Starters', 22, 'fried curry polenta, edamame, sweet corn, scallion cashew purée'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Blue Hill Bay Mussels', 'mussels', 'Starters', 24, 'leeks, garlic, tomato, brandy, cream, aleppo, grilled sourdough'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Lamb Kefta', 'lamb', 'Starters', 24, 'cucumber, tomato, red onion, tzatziki, evoo'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Short Rib', 'apps', 'Starters', 24, 'cider tamari braised, eggplant mornay, pita'),

-- Mains
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Spring Vegetables', 'veggies', 'Mains', 37, 'lemon potatoes, carrots, broccoli rabe, pickled red onions, turnip purée'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Sea Scallops', 'scallops', 'Mains', 46, 'red quinoa pilaf, english peas, carrot hazelnut romesco, lemon vinaigrette'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Cod', 'fish', 'Mains', 48, 'littlenecks, andouille sausage, haricots tarbais, tomato, spinach, turmeric ginger broth'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Chicken', 'chicken', 'Mains', 45, 'lemon spice marinade, broccolini, feta, pine nuts, herb wild rice'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Duck Confit', 'duck', 'Mains', 45, 'hummus, charred ramps, carrots, pine nuts, sultanas, capers, lemon'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Lamb', 'lamb', 'Mains', 58, 'dijon pistachio crust, turnip purée, asparagus, radish, carrots, pomegranate tamarind demi'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Hanger Steak', 'steak', 'Mains', 56, 'baby yukons, broccoli rabe, feta, marjoram, sundried tomato vinaigrette, soubise'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Wood Grilled Burger', 'burger', 'Mains', 30, 'wagyu beef, balsamic onions, bacon, cheddar or brie, garlic dill pickles, fries'),

-- Desserts
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Daisy Cake', 'dessert', 'Desserts', 16, 'vanilla cake, orange blossom, lemon zest, rhubarb coulis, blackberries, whipped crème'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Chocolate Terrine', 'dessert', 'Desserts', 16, 'salted almonds, pistachio crumble, port balsamic reduction'),
((SELECT id FROM restaurants WHERE name = 'State Road'), 'Affogato', 'dessert', 'Desserts', 14, 'vanilla gelato, espresso, shortbread cookie');

-- Set menu section order to match the real menu
UPDATE restaurants
SET menu_section_order = ARRAY['Starters', 'Mains', 'Desserts']
WHERE name = 'State Road';

-- Verify import (expect 22)
SELECT COUNT(*) AS dish_count
FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'State Road');
