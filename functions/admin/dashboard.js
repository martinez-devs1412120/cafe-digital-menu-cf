import { queryOne, queryAll, getSetting, money, statusClass, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie } from '../_shared/csrf.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const csrfToken = generateCsrf();

  const productsRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM products');
  const products = productsRow ? (productsRow.n || 0) : 0;
  const soldRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM products WHERE is_available=0');
  const sold = soldRow ? (soldRow.n || 0) : 0;
  const pendingRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing','Ready')");
  const pending = pendingRow ? (pendingRow.n || 0) : 0;
  const todayRow = await queryOne(db, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'Cancelled' AND DATE(datetime(created_at,'+8 hours')) = date('now','+8 hours')");
  const today = todayRow ? parseFloat(todayRow.s || 0) : 0;
  const recent = await queryAll(db, 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 6');

  const recentHtml = recent.length
    ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>${recent.map(o => `<tr><td>${e(o.order_number)}</td><td>${e(o.customer_name)}</td><td>${money(o.total)}</td><td><span class="status ${statusClass(o.status)}">${e(o.status)}</span></td><td>${e(o.created_at)}</td></tr>`).join('')}</table></div>`
    : `<div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No orders yet. They will appear here the moment a customer checks out.</p></div>`;

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">OVERVIEW</p><h1>Good day, ${e(session.username)}.</h1><p class="muted">Here is what is happening at your cafe.</p></div><a class="btn" href="/admin/products">Manage menu</a></div>
<section class="stats"><article class="stat"><span>Menu products</span><strong>${products}</strong></article><article class="stat"><span>Sold out</span><strong>${sold}</strong></article><article class="stat"><span>Active orders</span><strong>${pending}</strong></article><article class="stat"><span title="Sum of every order placed today except cancelled ones. This is order value, not verified income.">Sales today ⓘ</span><strong>${money(today)}</strong></article></section>
<section class="panel"><div class="section-head"><h2>Recent orders</h2><a class="text-link" href="/admin/orders">View all</a></div>
${recentHtml}</section>`;

  const html = adminLayout(session, 'Dashboard', shopName, '/admin/dashboard', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
