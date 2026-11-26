-- Sparks Café — D1 SQLite schema
-- MySQL → SQLite translation:
--   INT AUTO_INCREMENT PRIMARY KEY       → INTEGER PRIMARY KEY
--   ENUM('x','y')                        → TEXT CHECK(col IN ('x','y'))
--   TINYINT(1)                           → INTEGER
--   DECIMAL(10,2)                        → REAL
--   VARCHAR(n)                           → TEXT
--   TIMESTAMP DEFAULT CURRENT_TIMESTAMP  → TEXT DEFAULT (datetime('now'))
--   ON UPDATE CURRENT_TIMESTAMP          → removed
--   charset / collation clauses          → removed
--   INDEX outside CREATE TABLE           → CREATE INDEX after the table

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','staff')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  price REAL NOT NULL DEFAULT 0,
  image TEXT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  allergen_tags TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_available ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category_id);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  table_number TEXT NULL,
  table_id INTEGER NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL DEFAULT 'Dine-in' CHECK(order_type IN ('Dine-in','Takeaway')),
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Preparing','Ready','Completed','Cancelled')),
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_table   ON orders(table_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NULL REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  sweetness TEXT NULL,
  size TEXT NULL,
  size_price_delta REAL NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

-- login_throttle: locked_until and last_attempt stored as ISO-8601 text.
CREATE TABLE IF NOT EXISTS login_throttle (
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT NULL,
  last_attempt TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ip, username)
);

CREATE TABLE IF NOT EXISTS settings (
  skey TEXT NOT NULL PRIMARY KEY,
  svalue TEXT NULL
);

INSERT OR IGNORE INTO settings(skey, svalue) VALUES ('shop_name', 'SPARKS CAFE');
INSERT OR IGNORE INTO settings(skey, svalue) VALUES ('menu_base_url', '');
