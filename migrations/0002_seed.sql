-- Sparks Café — real menu seed (SQLite / D1 compatible)
-- Safe to re-run: INSERT OR IGNORE skips existing rows.

-- 1. Seed base categories
INSERT OR IGNORE INTO categories (name) VALUES ('Coffee');
INSERT OR IGNORE INTO categories (name) VALUES ('Non-Coffee');
INSERT OR IGNORE INTO categories (name) VALUES ('Food');
INSERT OR IGNORE INTO categories (name) VALUES ('Add-ons');

-- 2. Remove sample placeholder products that conflict with real menu
DELETE FROM products WHERE name IN ('Americano','Spanish Latte','Matcha Latte','Butter Croissant');

-- 3. Products (25 items from the physical menu board)
--    Category is looked up inline via subquery instead of MySQL @variables.

-- Coffee
INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Cortado (Hot)', 'Espresso, Milk', 120, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Flat White (Hot)', 'Espresso, Milk', 120, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Latte (Hot)', 'Espresso, Milk', 120, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Latte (Iced)', 'Espresso, Milk', 135, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Vanilla Latte (Hot)', 'Espresso, Milk, Vanilla', 120, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Vanilla Latte (Iced)', 'Espresso, Milk, Vanilla', 135, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Spanish Latte (Hot)', 'Espresso, Milk, Condensed', 120, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Spanish Latte (Iced)', 'Espresso, Milk, Condensed', 135, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Americano (Hot)', 'Espresso, Water', 100, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Americano (Iced)', 'Espresso, Water', 115, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Coffee Mocha (Hot)', 'Espresso, Milk, Dark Chocolate', 155, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Coffee Mocha (Iced)', 'Espresso, Milk, Dark Chocolate', 170, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Brown Sugar Latte (Hot)', 'Brown Sugar, Espresso, Milk', 155, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Coffee'), 'Brown Sugar Latte (Iced)', 'Brown Sugar, Espresso, Milk', 170, 1, 1);

-- Non-Coffee
INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Choco (Hot)', 'Chocolate, Milk', 115, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Choco (Iced)', 'Chocolate, Milk', 130, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Cocoa (Hot)', 'Cocoa, Milk', 135, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Cocoa (Iced)', 'Cocoa, Milk', 150, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Lemonade', 'Lemon, Water', 100, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Non-Coffee'), 'Commercial Matcha', 'Sweetened Matcha, Milk', 135, 1, 0);

-- Food
INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Food'), 'Creamy Carbonara', 'Cream-based pasta', 265, 1, 1);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Food'), 'Barn Spaghetti', 'House spaghetti', 275, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Food'), 'French Fries', 'Golden fried potatoes', 150, 1, 0);

INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Food'), 'Cheesy Bacon Overload', 'Fries loaded with cheese and bacon', 220, 1, 1);

-- Add-ons
INSERT OR IGNORE INTO products (category_id, name, description, price, is_available, is_featured)
VALUES ((SELECT id FROM categories WHERE name='Add-ons'), 'Add-on: Oat Milk', 'Upgrade any drink to oat milk', 45, 1, 0);
