import { queryAll, ORDER_STATUSES } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';

function validDate(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return v;
}

function csvSafe(v) {
  v = String(v == null ? '' : v);
  if (v && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function escCsv(v) {
  v = String(v == null ? '' : v);
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function csvRow(fields) {
  return fields.map(escCsv).join(',') + '\r\n';
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  let from = validDate(url.searchParams.get('from')) || today;
  let to = validDate(url.searchParams.get('to')) || from;
  if (to < from) { [from, to] = [to, from]; }

  let status = url.searchParams.get('status') || 'all';
  if (!ORDER_STATUSES.includes(status) && status !== 'all') status = 'all';
  const q = (url.searchParams.get('q') || '').trim();

  const where = ["DATE(datetime(o.created_at,'+8 hours')) BETWEEN ? AND ?"];
  const params = [from, to];
  if (status !== 'all') { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.order_number LIKE ? OR o.customer_name LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }

  const orders = await queryAll(db,
    `SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE ${where.join(' AND ')} ORDER BY o.created_at`,
    params
  );

  const itemsByOrder = {};
  if (orders.length) {
    const ids = orders.map(o => parseInt(o.id));
    const inPlaceholders = ids.map(() => '?').join(',');
    const items = await queryAll(db,
      `SELECT order_id, product_name, quantity, sweetness, size FROM order_items WHERE order_id IN (${inPlaceholders}) ORDER BY id`,
      ids
    );
    for (const it of items) {
      const oid = it.order_id;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }
  }

  let csv = '\uFEFF'; // BOM
  csv += csvRow(['Order #', 'Placed at', 'Customer', 'Type', 'Table', 'Status', 'Total', 'Items']);
  for (const o of orders) {
    const oItems = (itemsByOrder[o.id] || []).map(it =>
      csvSafe(it.quantity + 'x ' + it.product_name + (it.size ? ' (' + it.size + ')' : '') + (it.sweetness && it.sweetness !== '100%' ? ' (' + it.sweetness + ' sweet)' : ''))
    );
    const table = o.table_label || (o.table_number ? 'Table ' + o.table_number : '');
    csv += csvRow([
      csvSafe(o.order_number),
      o.created_at,
      csvSafe(o.customer_name),
      o.order_type,
      csvSafe(table),
      o.status,
      Number(o.total).toFixed(2),
      oItems.join('; '),
    ]);
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders_${from}_to_${to}.csv"`,
    }
  });
}
