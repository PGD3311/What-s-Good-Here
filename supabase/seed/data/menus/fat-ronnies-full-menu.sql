-- Fat Ronnie's Burger Bar - Full Menu
-- Source: https://fatronniesburgerbar.com/index.php/menu/
-- Address: 7 Circuit Ave, Oak Bluffs, MA 02557
-- Run this in Supabase SQL Editor (project vpioftosgdkyiwvhxewy)

-- 1. Open the restaurant + update menu_url to the real menu page
UPDATE restaurants
SET is_open = true,
    menu_url = 'https://fatronniesburgerbar.com/index.php/menu/'
WHERE name = 'Fat Ronnie''s Burger Bar';

-- 2. Wipe any existing dishes
DELETE FROM dishes
WHERE restaurant_id = (SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar');

-- 3. Insert full menu (45 items)
INSERT INTO dishes (restaurant_id, name, category, menu_section, price) VALUES
-- Beef Burgers
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fat Ronnie', 'burger', 'Beef Burgers', 13.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Bacon', 'burger', 'Beef Burgers', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Mushroom', 'burger', 'Beef Burgers', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Caramelized Onion', 'burger', 'Beef Burgers', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Peppers Onions', 'burger', 'Beef Burgers', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fat Pepper Jack Burger', 'burger', 'Beef Burgers', 13.95),
-- Non Beef Burgers
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Turkey Burger', 'burger', 'Non Beef Burgers', 12.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Veggie Burger', 'burger', 'Non Beef Burgers', 12.95),
-- Chicken
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Chicken Sandwich', 'sandwich', 'Chicken', 12.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Chicken Sub', 'sandwich', 'Chicken', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Chicken Wrap', 'wrap', 'Chicken', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Chicken & Chips', 'fried chicken', 'Chicken', 19.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'HBC', 'fried chicken', 'Chicken', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Tenders', 'tendys', 'Chicken', 12.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Wings', 'wings', 'Chicken', 14.95),
-- Seafood
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Cod Sandwich', 'fish-sandwich', 'Seafood', 13.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Cod Sub', 'fish-sandwich', 'Seafood', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Cod Wrap', 'wrap', 'Seafood', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fish & Chips', 'fish-and-chips', 'Seafood', 21.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Lobster Roll', 'lobster roll', 'Seafood', 31.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fat Cod Sandwich', 'fish-sandwich', 'Seafood', 15.95),
-- Weenies
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Big Dog', 'sandwich', 'Weenies', 8.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fat Dog', 'sandwich', 'Weenies', 10.95),
-- Subs & Wraps
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'CGB Sub', 'sandwich', 'Subs & Wraps', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Burger Sub', 'burger', 'Subs & Wraps', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Burger Wrap', 'wrap', 'Subs & Wraps', 15.95),
-- Salads
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Grilled Chicken Caesar Salad', 'salad', 'Salads', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Cobb Salad', 'salad', 'Salads', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Greek Salad', 'salad', 'Salads', 14.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Thai Salad', 'salad', 'Salads', 15.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Caesar Salad', 'salad', 'Salads', 15.95),
-- Mac-N-Cheese
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Mac-N-Cheese', 'pasta', 'Mac-N-Cheese', 8.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Beef Mac', 'pasta', 'Mac-N-Cheese', 9.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Bacon Mac', 'pasta', 'Mac-N-Cheese', 9.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Buffalo Chicken Mac', 'pasta', 'Mac-N-Cheese', 10.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'BBQ Chicken Mac', 'pasta', 'Mac-N-Cheese', 10.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Lobster Mac', 'pasta', 'Mac-N-Cheese', 15.95),
-- Sides
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fries', 'fries', 'Sides', 4.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Cheese Fries', 'fries', 'Sides', 5.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Sweet Potato Fries', 'fries', 'Sides', 5.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Onion Rings', 'onion rings', 'Sides', 5.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Fat Fries', 'fries', 'Sides', 9.95),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Potato Salad', 'sides', 'Sides', 5.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Coleslaw', 'sides', 'Sides', 5.65),
((SELECT id FROM restaurants WHERE name = 'Fat Ronnie''s Burger Bar'), 'Corn on the Cob', 'sides', 'Sides', 4.65);

-- 4. Set menu_section_order to match actual menu layout
UPDATE restaurants
SET menu_section_order = ARRAY['Beef Burgers', 'Non Beef Burgers', 'Chicken', 'Seafood', 'Weenies', 'Subs & Wraps', 'Salads', 'Mac-N-Cheese', 'Sides']
WHERE name = 'Fat Ronnie''s Burger Bar';

-- 5. Verify
SELECT r.name, r.town, r.is_open, r.menu_section_order,
       (SELECT COUNT(*) FROM dishes WHERE restaurant_id = r.id) AS dish_count
FROM restaurants r
WHERE r.name = 'Fat Ronnie''s Burger Bar';
