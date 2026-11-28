# Changelog

All notable changes to the Sparks Café digital menu — newest first.
**Rule:** every update or added feature gets an entry here in the same PR (see CONTRIBUTING.md).

## [Unreleased]

### Changed
- **Whole-app re-theme** — charcoal minimal palette (near-white `#fafaf8`, white cards, charcoal `#1f1f1f` surfaces, single burnt-orange `#c2571b` accent) applied to customer menu, tracking page, admin, and login
- Fonts upgraded to **Fraunces** (display) + **Inter** (UI) via Google Fonts on all pages; placeholder artwork redrawn to match

### Added
- `CONTRIBUTING.md` — PR-first workflow (never push straight to `main`)
- This changelog — must be updated with every PR

## [2026-11-27]

### Added
- **Order board** — card-based fulfillment replacing the orders table: Pending / Preparing / Ready columns, one-tap status buttons (Start preparing → Mark ready → Complete), cancel on live orders, oldest-first FIFO, age chips that turn amber after 10 minutes, live 10-second board refresh with new-card flash + beep, collapsed "Today's finished orders" history
- **Admin simplification** — nav shrunk to Orders · Products · Tables · Settings; Orders is home with a slim stats row (sales today / active / sold-out); Categories folded into Products as an inline chip bar; standee print link moved to Tables; Settings consolidated to Café identity / Team / Password; `/admin/dashboard` forwards for old bookmarks
- `npm run d1:dedupe` + `migrations/0003_dedupe_products.sql` — production data cleanup migration (dedupes products, adds a unique-name guard)

### Fixed
- **Duplicate HOT/ICED buttons** on the customer menu — root cause was duplicate product rows in the production database (re-ran import); the menu now dedupes variants per product name, and migration 0003 prevents it at the data level
- Legacy `.php` fetch paths broke the order → tracking redirect in local dev — client/admin JS now calls clean function paths
- Orders-board "new orders" nudge link pointed to a 404 (`orders.php`)
- Missing `₱` sign in the cart total; BEST SELLER badge wrapping mid-word
- `npm run dev` vs `npm run migrate:local` writing to two different local D1 files (dev script now uses the `wrangler.jsonc` binding)

### Changed
- **Customer menu redesigned to the reference layout** (dark coffee era): serif hero, Today's Special card, Best Picks rail, uppercase category tabs, bottom nav with live cart badge, image-led item sheet with HOT/ICED option cards, sweetness/size option rows, sticky add bar, re-themed tracking page and QR/table modals
