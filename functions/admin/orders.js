import { getSetting, queryOne, ORDER_STATUSES, orderStatusCounts, fetchOrdersPage, ordersQs, run, money, statusClass, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';
import { renderOrderRows } from './_order_rows.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);

  let status = url.searchParams.get('status') || 'all';
  if (!ORDER_STATUSES.includes(status) && status !== 'all') status = 'all';
  const q = (url.searchParams.get('q') || '').trim();
  let page = Math.max(1, parseInt(url.searchParams.get('page') || 1));

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
    return Response.redirect(new URL(ordersQs(status, q, page), request.url).href, 302);
  }

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const csrfToken = generateCsrf();

  const [orders, itemsByOrder, total, pages] = await fetchOrdersPage(db, status, q, 20, page);
  page = Math.min(Math.max(1, page), pages);
  const statusCounts = await orderStatusCounts(db, q);

  // Slim stats row (absorbed from the old dashboard page) — daily numbers
  // stay one glance away on the home screen.
  const soldRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM products WHERE is_available=0');
  const soldOut = soldRow ? (soldRow.n || 0) : 0;
  const todayRow = await queryOne(db, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'Cancelled' AND DATE(datetime(created_at,'+8 hours')) = date('now','+8 hours')");
  const salesToday = todayRow ? parseFloat(todayRow.s || 0) : 0;
  const activeOrders = (statusCounts.Pending || 0) + (statusCounts.Preparing || 0) + (statusCounts.Ready || 0);
  const statsHtml = `
<section class="statrow">
  <div class="statchip"><span>Sales today</span><strong title="Sum of every order placed today except cancelled ones. This is order value, not verified income.">${money(salesToday)}</strong></div>
  <div class="statchip"><span>Active orders</span><strong>${activeOrders}</strong></div>
  <div class="statchip"><span>Sold-out items</span><strong>${soldOut}</strong></div>
</section>`;

  const statusTabsHtml = [
    `<a class="pill ${status === 'all' ? 'active' : ''}" href="${e(ordersQs('all', q, 1))}">All <b data-count="all">${statusCounts.all}</b></a>`,
    ...ORDER_STATUSES.map(st => `<a class="pill ${status === st ? 'active' : ''}" href="${e(ordersQs(st, q, 1))}">${st} <b data-count="${st}">${statusCounts[st] || 0}</b></a>`),
  ].join('');

  const today = new Date().toISOString().slice(0, 10);
  const fromVal = url.searchParams.get('from') || today;
  const toVal = url.searchParams.get('to') || today;

  const rowsHtml = renderOrderRows(orders, itemsByOrder, csrfToken);

  let pagerHtml = '';
  if (pages > 1) {
    const prevLink = page > 1 ? `<a class="small-btn" href="${e(ordersQs(status, q, page - 1))}">← Prev</a>` : '';
    const nextLink = page < pages ? `<a class="small-btn" href="${e(ordersQs(status, q, page + 1))}">Next →</a>` : '';
    const pageLinks = Array.from({ length: Math.min(pages, 5) }, (_, i) => {
      const p = Math.max(1, Math.min(pages, page - 2 + i));
      return `<a class="pill ${p === page ? 'active' : ''}" href="${e(ordersQs(status, q, p))}">${p}</a>`;
    }).join('');
    pagerHtml = `<div class="pager">${prevLink}${pageLinks}${nextLink}</div>`;
  }

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">SALES &amp; FULFILLMENT</p><h1>Orders</h1><p class="muted">Review customer orders and update their progress.</p></div></div>
${statsHtml}
<div class="orders-toolbar panel">
 <div class="status-tabs">${statusTabsHtml}</div>
 <form class="order-search" method="get"><input type="hidden" name="status" value="${e(status)}"><input name="q" value="${e(q)}" placeholder="Search order # or customer" maxlength="60"><button class="small-btn" type="submit">Search</button></form>
 <form class="order-export" method="get" action="/admin/export_orders"><input type="hidden" name="status" value="${e(status)}"><input type="hidden" name="q" value="${e(q)}"><label>From</label><input type="date" name="from" value="${e(fromVal)}"><label>To</label><input type="date" name="to" value="${e(toVal)}"><button class="small-btn" type="submit">Export CSV</button></form>
</div>
<div class="panel table-wrap">
<table><thead><tr><th>Order</th><th>Customer</th><th>Type / Table</th><th>Total</th><th>Placed</th><th>Status</th><th>Items</th></tr></thead>
<tbody id="orders-tbody">
${rowsHtml}
</tbody></table>
<div class="table-meta"><span id="orders-updated" class="muted"></span><span class="muted">${total} order${total === 1 ? '' : 's'}${pages > 1 ? ` · page ${page}/${pages}` : ''}</span></div>
${pagerHtml}
</div>`;

  const html = adminLayout(session, 'Orders', shopName, '/admin/orders', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
