import { getSetting, queryAll, queryOne, ORDER_STATUSES, orderStatusCounts, fetchOrdersPage, run, money, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';
import { renderOrderBoard, renderOrderHistory } from './_order_rows.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);

  const q = (url.searchParams.get('q') || '').trim();

  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (verifyCsrf(request, csrfFormToken)) {
      const newStatus = formData.get('status') || '';
      const orderId = parseInt(formData.get('id') || 0);
      if (orderId > 0 && ORDER_STATUSES.includes(newStatus)) {
        await run(db, 'UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
      }
    }
    return Response.redirect(new URL('/admin/orders' + (q ? '?q=' + encodeURIComponent(q) : ''), request.url).href, 302);
  }

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const csrfToken = generateCsrf();

  // The board shows every active order (no pagination — a cafe's live queue
  // is small); search still filters server-side across all columns.
  const [orders, itemsByOrder, total] = await fetchOrdersPage(db, 'all', q, 200, 1);
  const counts = await orderStatusCounts(db, q);
  const activeCount = (counts.Pending || 0) + (counts.Preparing || 0) + (counts.Ready || 0);

  // Slim stats row (absorbed from the old dashboard page).
  const soldRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM products WHERE is_available=0');
  const soldOut = soldRow ? (soldRow.n || 0) : 0;
  const todayRow = await queryOne(db, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'Cancelled' AND DATE(datetime(created_at,'+8 hours')) = date('now','+8 hours')");
  const salesToday = todayRow ? parseFloat(todayRow.s || 0) : 0;
  const statsHtml = `
<section class="statrow">
  <div class="statchip"><span>Sales today</span><strong title="Sum of every order placed today except cancelled ones. This is order value, not verified income.">${money(salesToday)}</strong></div>
  <div class="statchip"><span>Active orders</span><strong>${activeCount}</strong></div>
  <div class="statchip"><span>Sold-out items</span><strong>${soldOut}</strong></div>
</section>`;

  const boardHtml = renderOrderBoard(orders, itemsByOrder, csrfToken, counts);

  // Today's finished orders, collapsed by default — out of the way, one
  // click away when a customer asks about an order from earlier.
  const history = await queryAll(db,
    "SELECT order_number, customer_name, status, total FROM orders WHERE status IN ('Completed','Cancelled') AND DATE(datetime(created_at,'+8 hours')) = date('now','+8 hours') ORDER BY created_at DESC LIMIT 15");
  const historyHtml = `
<details class="panel bhistory">
  <summary>Today's finished orders</summary>
  ${renderOrderHistory(history)}
</details>`;

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">SALES &amp; FULFILLMENT</p><h1>Orders</h1><p class="muted">Live board — tap a card to move it along. This page updates itself.</p></div></div>
${statsHtml}
<div class="orders-toolbar panel">
 <form class="order-search" method="get"><input name="q" value="${e(q)}" placeholder="Search order # or customer" maxlength="60"><button class="small-btn" type="submit">Search</button></form>
 <form class="order-export" method="get" action="/admin/export_orders"><input type="hidden" name="q" value="${e(q)}"><label>From</label><input type="date" name="from" value="${e(url.searchParams.get('from') || new Date().toISOString().slice(0, 10))}"><label>To</label><input type="date" name="to" value="${e(url.searchParams.get('to') || new Date().toISOString().slice(0, 10))}"><button class="small-btn" type="submit">Export CSV</button></form>
</div>
<div class="oboard" id="oboard">
${boardHtml}
</div>
${historyHtml}`;

  const html = adminLayout(session, 'Orders', shopName, '/admin/orders', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
