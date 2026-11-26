import { queryAll, tableForToken } from '../_shared/db.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;

  const table = await tableForToken(db, url.searchParams.get('t') || '');
  const numbers = [];
  for (const n of (url.searchParams.get('n') || '').split(',')) {
    const trimmed = n.trim().toUpperCase();
    if (/^DC[0-9A-Z]{2,28}$/.test(trimmed)) numbers.push(trimmed);
  }
  const mineSet = Object.fromEntries(numbers.map(n => [n, true]));

  const out = {
    table: table ? { id: parseInt(table.id), label: table.label } : null,
    orders: [],
  };

  if (!numbers.length && !table) {
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  const where = ["DATE(datetime(o.created_at,'+8 hours')) = date('now','+8 hours')"];
  const params = [];
  const clauses = [];

  if (numbers.length) {
    const inPlaceholders = numbers.map(() => '?').join(',');
    clauses.push(`o.order_number IN (${inPlaceholders})`);
    params.push(...numbers);
  }
  if (table) {
    clauses.push("(o.table_id = ? AND o.status IN ('Pending','Preparing','Ready'))");
    params.push(parseInt(table.id));
  }
  where.push('(' + clauses.join(' OR ') + ')');

  const orders = await queryAll(db,
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.customer_name FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 20`,
    params
  );

  if (orders.length) {
    const ids = orders.map(o => parseInt(o.id));
    const inPlaceholders = ids.map(() => '?').join(',');
    const items = await queryAll(db,
      `SELECT order_id, product_name, quantity FROM order_items WHERE order_id IN (${inPlaceholders}) ORDER BY id`,
      ids
    );
    const itemsBy = {};
    for (const r of items) {
      const oid = r.order_id;
      if (!itemsBy[oid]) itemsBy[oid] = [];
      itemsBy[oid].push(r.quantity + 'x ' + r.product_name);
    }
    for (const o of orders) {
      out.orders.push({
        number: o.order_number,
        status: o.status,
        total: parseFloat(o.total),
        placed: o.created_at,
        items: (itemsBy[o.id] || []).join('; '),
        mine: !!mineSet[o.order_number],
      });
    }
  }

  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
