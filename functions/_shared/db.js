export const ORDER_STATUSES = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

export async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const r = await (params.length ? stmt.bind(...params) : stmt).all();
  return r.results || [];
}

export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return await (params.length ? stmt.bind(...params) : stmt).first();
}

export async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return await (params.length ? stmt.bind(...params) : stmt).run();
}

export async function settingsAll(db) {
  const rows = await queryAll(db, 'SELECT skey, svalue FROM settings');
  const o = {};
  for (const r of rows) o[r.skey] = r.svalue || '';
  return o;
}

export async function getSetting(db, key, def = '') {
  const all = await settingsAll(db);
  return all[key] || def;
}

export async function settingSet(db, key, value) {
  await run(db, 'INSERT OR REPLACE INTO settings(skey,svalue) VALUES(?,?)', [key, value]);
}

export function money(n) {
  return '₱' + Number(n).toFixed(2);
}

export function statusClass(s) {
  return { Pending: 'st-pending', Preparing: 'st-preparing', Ready: 'st-ready', Completed: 'st-completed', Cancelled: 'st-cancelled' }[s] || '';
}

export function productImage(image, category) {
  if (image) return 'https://sparks.page.gd/uploads/' + encodeURIComponent(image);
  return {
    Coffee: '/assets/placeholders/coffee.svg',
    'Non-Coffee': '/assets/placeholders/noncoffee.svg',
    Food: '/assets/placeholders/food.svg',
    'Add-ons': '/assets/placeholders/addon.svg',
  }[category] || '/assets/coffee-placeholder.svg';
}

export function e(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function tableForToken(db, token) {
  if (!token || !/^[a-f0-9]{16}$/.test(token)) return null;
  return await queryOne(db, 'SELECT id, label, token FROM restaurant_tables WHERE token = ? AND is_active = 1', [token]);
}

export function tableDisplay(label) {
  label = (label || '').trim();
  if (!label) return 'TABLE';
  if (/^(table|tbl)\b/i.test(label)) return label.toUpperCase();
  return 'TABLE ' + label.toUpperCase();
}

export function tableShortLabel(label) {
  label = (label || '').trim();
  const m = label.match(/^table\s+(.+)$/i);
  if (m) return m[1];
  return label;
}

export async function fetchOrdersPage(db, status = 'all', q = '', perPage = 20, page = 1) {
  const where = [];
  const params = [];
  if (status !== 'all') { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.order_number LIKE ? OR o.customer_name LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = await queryOne(db, `SELECT COUNT(*) AS n FROM orders o ${whereSql}`, params);
  const total = countRow ? (countRow.n || 0) : 0;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  page = Math.min(Math.max(1, page), pages);

  const orders = await queryAll(db,
    `SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params
  );

  const itemsByOrder = {};
  if (orders.length) {
    const ids = orders.map(o => o.id);
    const inPlaceholders = ids.map(() => '?').join(',');
    const items = await queryAll(db,
      `SELECT oi.order_id, oi.product_name, oi.quantity, oi.price, oi.sweetness, oi.size, oi.size_price_delta, p.allergen_tags FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (${inPlaceholders}) ORDER BY oi.id`,
      ids
    );
    for (const it of items) {
      const oid = it.order_id;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }
  }
  return [orders, itemsByOrder, total, pages];
}

export async function orderStatusCounts(db, q = '') {
  const counts = { all: 0 };
  for (const st of ORDER_STATUSES) counts[st] = 0;
  let sql = 'SELECT status, COUNT(*) AS n FROM orders';
  const params = [];
  if (q) { sql += ' WHERE (order_number LIKE ? OR customer_name LIKE ?)'; params.push('%' + q + '%', '%' + q + '%'); }
  sql += ' GROUP BY status';
  const rows = await queryAll(db, sql, params);
  for (const r of rows) {
    counts[r.status] = r.n || 0;
    counts.all += r.n || 0;
  }
  return counts;
}

export function ordersQs(status, q, page, base = '/admin/orders') {
  const p = new URLSearchParams();
  if (status !== 'all') p.set('status', status);
  if (q) p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return base + (qs ? '?' + qs : '');
}
