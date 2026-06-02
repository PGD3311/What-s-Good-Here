-- Martha's Vineyard Restaurant Data
-- Replace SF data with Martha's Vineyard restaurants
-- Run this in Supabase SQL Editor

-- Clear existing data
TRUNCATE restaurants CASCADE; -- This will also delete all dishes and votes

-- ============================================
-- MARTHA'S VINEYARD RESTAURANTS
-- ============================================

-- VINEYARD HAVEN (5 restaurants)
INSERT INTO restaurants (name, address, lat, lng) VALUES
('Black Sheep', '23 Main St, Vineyard Haven, MA 02568', 41.4545, -70.6036),
('Net Result', '79 Beach Rd, Vineyard Haven, MA 02568', 41.4555, -70.6025),
('Art Cliff Diner', '39 Beach Rd, Vineyard Haven, MA 02568', 41.4540, -70.6020),
('Waterside Market', '76 Main St, Vineyard Haven, MA 02568', 41.4550, -70.6040),
('Le Grenier French Restaurant', '96 Main St, Vineyard Haven, MA 02568', 41.4560, -70.6045);

-- OAK BLUFFS (5 restaurants)
INSERT INTO restaurants (name, address, lat, lng) VALUES
('Back Door Donuts', '5 Post Office Square, Oak Bluffs, MA 02557', 41.4545, -70.5615),
('Nancy''s Restaurant', '29 Lake Ave, Oak Bluffs, MA 02557', 41.4560, -70.5630),
('Offshore Ale Company', '30 Kennebec Ave, Oak Bluffs, MA 02557', 41.4550, -70.5620),
('Red Cat Kitchen', '14 Kennebec Ave, Oak Bluffs, MA 02557', 41.4548, -70.5618),
('Linda Jean''s Restaurant', '34 Circuit Ave, Oak Bluffs, MA 02557', 41.4552, -70.5625);

-- EDGARTOWN (5 restaurants)
INSERT INTO restaurants (name, address, lat, lng) VALUES
('Atria', '137 Main St, Edgartown, MA 02539', 41.3890, -70.5133),
('Alchemy Bistro & Bar', '71 Main St, Edgartown, MA 02539', 41.3895, -70.5130),
('Among The Flowers Cafe', '17 Mayhew Ln, Edgartown, MA 02539', 41.3885, -70.5125),
('The Seafood Shanty', '31 Dock St, Edgartown, MA 02539', 41.3880, -70.5120),
('L''etoile Restaurant', '22 N Water St, Edgartown, MA 02539', 41.3892, -70.5128);

-- ============================================
-- DISHES
-- ============================================

-- Black Sheep (Vineyard Haven)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Black Sheep'), 'Grass-Fed Burger', 'burger', 18.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
((SELECT id FROM restaurants WHERE name = 'Black Sheep'), 'Lobster Roll', 'sandwich', 32.00, 'https://images.unsplash.com/photo-1546960572-c8732e3df3c5?w=800'),
((SELECT id FROM restaurants WHERE name = 'Black Sheep'), 'Fish Tacos', 'taco', 24.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800'),
((SELECT id FROM restaurants WHERE name = 'Black Sheep'), 'Caesar Salad', 'salad', 16.00, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800');

-- Net Result (Vineyard Haven)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Net Result'), 'Lobster Roll', 'sandwich', 28.00, 'https://images.unsplash.com/photo-1546960572-c8732e3df3c5?w=800'),
((SELECT id FROM restaurants WHERE name = 'Net Result'), 'Fried Clam Roll', 'sandwich', 22.00, 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800'),
((SELECT id FROM restaurants WHERE name = 'Net Result'), 'Fish & Chips', 'sandwich', 20.00, 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?w=800'),
((SELECT id FROM restaurants WHERE name = 'Net Result'), 'Tuna Poke Bowl', 'salad', 24.00, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800');

-- Art Cliff Diner (Vineyard Haven)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Art Cliff Diner'), 'Blueberry Pancakes', 'sandwich', 14.00, 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800'),
((SELECT id FROM restaurants WHERE name = 'Art Cliff Diner'), 'Lobster Benedict', 'sandwich', 26.00, 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=800'),
((SELECT id FROM restaurants WHERE name = 'Art Cliff Diner'), 'Classic Burger', 'burger', 16.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
((SELECT id FROM restaurants WHERE name = 'Art Cliff Diner'), 'Greek Salad', 'salad', 13.00, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800');

-- Waterside Market (Vineyard Haven)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Waterside Market'), 'Lobster Mac & Cheese', 'pasta', 28.00, 'https://images.unsplash.com/photo-1623341214825-9f4f963727da?w=800'),
((SELECT id FROM restaurants WHERE name = 'Waterside Market'), 'Chicken Caesar Wrap', 'sandwich', 14.00, 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800'),
((SELECT id FROM restaurants WHERE name = 'Waterside Market'), 'Fresh Mozzarella Pizza', 'pizza', 18.00, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800'),
((SELECT id FROM restaurants WHERE name = 'Waterside Market'), 'Quinoa Power Bowl', 'salad', 16.00, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800');

-- Le Grenier (Vineyard Haven)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Le Grenier French Restaurant'), 'Coq au Vin', 'pasta', 34.00, 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800'),
((SELECT id FROM restaurants WHERE name = 'Le Grenier French Restaurant'), 'French Onion Soup', 'salad', 12.00, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800'),
((SELECT id FROM restaurants WHERE name = 'Le Grenier French Restaurant'), 'Croque Monsieur', 'sandwich', 18.00, 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800'),
((SELECT id FROM restaurants WHERE name = 'Le Grenier French Restaurant'), 'Nicoise Salad', 'salad', 22.00, 'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=800');

-- Back Door Donuts (Oak Bluffs)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Back Door Donuts'), 'Apple Fritter', 'sandwich', 5.00, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800'),
((SELECT id FROM restaurants WHERE name = 'Back Door Donuts'), 'Chocolate Glazed Donut', 'sandwich', 4.00, 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800'),
((SELECT id FROM restaurants WHERE name = 'Back Door Donuts'), 'Boston Cream Donut', 'sandwich', 4.50, 'https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=800');

-- Nancy's Restaurant (Oak Bluffs)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant'), 'Fried Clams', 'sandwich', 24.00, 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?w=800'),
((SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant'), 'Lobster Roll', 'sandwich', 30.00, 'https://images.unsplash.com/photo-1546960572-c8732e3df3c5?w=800'),
((SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant'), 'Fish Tacos', 'taco', 22.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800'),
((SELECT id FROM restaurants WHERE name = 'Nancy''s Restaurant'), 'Clam Chowder', 'salad', 12.00, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800');

-- Offshore Ale Company (Oak Bluffs)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Offshore Ale Company'), 'Pub Burger', 'burger', 16.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
((SELECT id FROM restaurants WHERE name = 'Offshore Ale Company'), 'Margherita Pizza', 'pizza', 18.00, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800'),
((SELECT id FROM restaurants WHERE name = 'Offshore Ale Company'), 'Fish & Chips', 'sandwich', 20.00, 'https://images.unsplash.com/photo-1579208575657-c595a05383b7?w=800'),
((SELECT id FROM restaurants WHERE name = 'Offshore Ale Company'), 'Buffalo Wings', 'sandwich', 14.00, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800');

-- Red Cat Kitchen (Oak Bluffs)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Red Cat Kitchen'), 'Lobster Pasta', 'pasta', 38.00, 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800'),
((SELECT id FROM restaurants WHERE name = 'Red Cat Kitchen'), 'Pan-Seared Scallops', 'salad', 36.00, 'https://images.unsplash.com/photo-1580217593608-61931cefc821?w=800'),
((SELECT id FROM restaurants WHERE name = 'Red Cat Kitchen'), 'Short Rib Tacos', 'taco', 24.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800'),
((SELECT id FROM restaurants WHERE name = 'Red Cat Kitchen'), 'Crispy Brussels Sprouts', 'salad', 12.00, 'https://images.unsplash.com/photo-1551462147-37fed0eb86ca?w=800');

-- Linda Jean's Restaurant (Oak Bluffs)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Linda Jean''s Restaurant'), 'Blueberry Muffin', 'sandwich', 6.00, 'https://images.unsplash.com/photo-1607920591413-4ec007e70023?w=800'),
((SELECT id FROM restaurants WHERE name = 'Linda Jean''s Restaurant'), 'Breakfast Burrito', 'burrito', 14.00, 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=800'),
((SELECT id FROM restaurants WHERE name = 'Linda Jean''s Restaurant'), 'Classic Burger', 'burger', 15.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800'),
((SELECT id FROM restaurants WHERE name = 'Linda Jean''s Restaurant'), 'BLT Sandwich', 'sandwich', 12.00, 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=800');

-- Atria (Edgartown) — full menu, Dining Room + Cellar pills. Canonical source: menus/atria-full-menu.sql
INSERT INTO dishes (restaurant_id, name, category, menu_section, menu_group, price) VALUES
-- Dining Room: Starters
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Island Greens with Blueberries & Gorgonzola', 'salad', 'Starters', 'Dining Room', 19.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Bonni''s Chilled Hearts of Romaine Caesar', 'salad', 'Starters', 'Dining Room', 21.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pan Seared Lump Crab Cakes with Corn Butter', 'crab', 'Starters', 'Dining Room', 26.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Heirloom Tomato Carpaccio with Fresh Burrata & Basil Pesto', 'apps', 'Starters', 'Dining Room', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Crispy Duck Confit & Shiitake Spring Rolls', 'duck', 'Starters', 'Dining Room', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Crispy Wok Fired Calamari', 'calamari', 'Starters', 'Dining Room', 25.00),
-- Dining Room: Entrees
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Bobo''s Two Pound Wok Fired Island Lobster', 'lobster', 'Entrees', 'Dining Room', 78.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Winner Winner Chicken Dinner with Crispy Potato Skins', 'chicken', 'Entrees', 'Dining Room', 45.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Pork & Beans', 'pork', 'Entrees', 'Dining Room', 48.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Grilled Thick Cut Swordfish with Dill Whipped Potatoes', 'fish', 'Entrees', 'Dining Room', 54.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Surf & Turf', 'steak', 'Entrees', 'Dining Room', 62.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'A Very Serious Steak', 'steak', 'Entrees', 'Dining Room', 78.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pan Roasted Duck Breast with Homemade Ginger Hoisin', 'duck', 'Entrees', 'Dining Room', 62.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Crispy Local Black Sea Bass with Curried Carrot Puree', 'fish', 'Entrees', 'Dining Room', 62.00),
-- Dining Room: Sides
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Atria''s Truffle Fries', 'fries', 'Sides', 'Dining Room', 17.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Plancha Charred Broccolini', 'veggies', 'Sides', 'Dining Room', 17.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Haricots Verts', 'veggies', 'Sides', 'Dining Room', 17.00),
-- Cellar: Burgers
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
-- Cellar: Cocktails
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Eve Sterling', 'cocktails', 'Cocktails', 'Cellar', 25.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Pink Pony Club', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Mile High Club', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Chef''s Summer Spritz', 'cocktails', 'Cocktails', 'Cellar', 18.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Sin Padres', 'cocktails', 'Cocktails', 'Cellar', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Cat''s Meow', 'cocktails', 'Cocktails', 'Cellar', 24.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Come to Brazil', 'cocktails', 'Cocktails', 'Cellar', 23.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Summer''s Bounty G&T', 'cocktails', 'Cocktails', 'Cellar', 28.00),
((SELECT id FROM restaurants WHERE name = 'Atria'), 'Teaberry Shot', 'cocktails', 'Cocktails', 'Cellar', 10.00);

UPDATE restaurants
SET menu_group_order = ARRAY['Dining Room', 'Cellar'],
    menu_section_order = ARRAY['Starters', 'Entrees', 'Sides', 'Burgers', 'Cocktails']
WHERE name = 'Atria';

-- Alchemy Bistro & Bar (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Alchemy Bistro & Bar'), 'Duck Confit', 'pasta', 36.00, 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800'),
((SELECT id FROM restaurants WHERE name = 'Alchemy Bistro & Bar'), 'Truffle Fries', 'sandwich', 12.00, 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800'),
((SELECT id FROM restaurants WHERE name = 'Alchemy Bistro & Bar'), 'Lobster Tacos', 'taco', 28.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800'),
((SELECT id FROM restaurants WHERE name = 'Alchemy Bistro & Bar'), 'Steak Frites', 'burger', 42.00, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800');

-- Among The Flowers Cafe (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'Among The Flowers Cafe'), 'Avocado Toast', 'sandwich', 14.00, 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=800'),
((SELECT id FROM restaurants WHERE name = 'Among The Flowers Cafe'), 'Eggs Benedict', 'sandwich', 18.00, 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=800'),
((SELECT id FROM restaurants WHERE name = 'Among The Flowers Cafe'), 'Lobster Omelet', 'sandwich', 24.00, 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800'),
((SELECT id FROM restaurants WHERE name = 'Among The Flowers Cafe'), 'Fresh Fruit Salad', 'salad', 12.00, 'https://images.unsplash.com/photo-1564093497595-593b96d80180?w=800');

-- The Seafood Shanty (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'The Seafood Shanty'), 'Lobster Roll', 'sandwich', 30.00, 'https://images.unsplash.com/photo-1546960572-c8732e3df3c5?w=800'),
((SELECT id FROM restaurants WHERE name = 'The Seafood Shanty'), 'Fried Oysters', 'sandwich', 22.00, 'https://images.unsplash.com/photo-1567608285099-bd5c800e8633?w=800'),
((SELECT id FROM restaurants WHERE name = 'The Seafood Shanty'), 'Clam Chowder', 'salad', 10.00, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800'),
((SELECT id FROM restaurants WHERE name = 'The Seafood Shanty'), 'Fish Tacos', 'taco', 20.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800');

-- L'etoile Restaurant (Edgartown)
INSERT INTO dishes (restaurant_id, name, category, price, photo_url) VALUES
((SELECT id FROM restaurants WHERE name = 'L''etoile Restaurant'), 'Seared Scallops', 'salad', 44.00, 'https://images.unsplash.com/photo-1580217593608-61931cefc821?w=800'),
((SELECT id FROM restaurants WHERE name = 'L''etoile Restaurant'), 'Beef Bourguignon', 'pasta', 48.00, 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800'),
((SELECT id FROM restaurants WHERE name = 'L''etoile Restaurant'), 'Lobster Bisque', 'salad', 18.00, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800'),
((SELECT id FROM restaurants WHERE name = 'L''etoile Restaurant'), 'Duck Breast', 'pasta', 46.00, 'https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=800');

-- Verify results
SELECT
  COUNT(*) as total_restaurants,
  (SELECT COUNT(*) FROM dishes) as total_dishes
FROM restaurants;
