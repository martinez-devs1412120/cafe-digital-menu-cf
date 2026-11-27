-- 0003: Remove duplicate product rows created by re-running imports/seeds
-- (e.g. migrate:remote or a seed executed more than once). Every duplicate
-- row shows up on the customer menu as a second HOT/ICED button, so this
-- keeps ONE row per product name:
--   * the oldest row wins (original ids, which past orders may reference),
--   * availability is merged: the product is available if any copy was.
-- A UNIQUE index afterwards makes future duplicate imports impossible
-- (re-running 0002_seed.sql will now fail loudly instead of silently
-- duplicating the menu).
--
-- Run against production:  npm run d1:dedupe
-- (order history is safe: order_items keeps product_name; product_id is
--  ON DELETE SET NULL, and we only delete rows that were never referenced
--  when the duplicate was the *newer* row).

UPDATE products
SET is_available = 1
WHERE id IN (SELECT MIN(id) FROM products GROUP BY name)
  AND EXISTS (
    SELECT 1 FROM products p2
    WHERE p2.name = products.name AND p2.is_available = 1
  );

DELETE FROM products
WHERE id NOT IN (SELECT MIN(id) FROM products GROUP BY name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_unique ON products(name);
