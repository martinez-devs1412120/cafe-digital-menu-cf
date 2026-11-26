import { ORDER_STATUSES, orderStatusCounts, fetchOrdersPage, ordersQs, run } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { generateCsrf, getCsrfFromCookie, verifyCsrf } from '../_shared/csrf.js';
import { renderOrderRows } from './_order_rows.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) {
    return new Response('login required', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }

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
    return Response.redirect(new URL(ordersQs(status, q, page, '/admin/orders'), request.url).href, 302);
  }

  // GET — return fragment HTML
  const [orders, itemsByOrder, total, pages] = await fetchOrdersPage(db, status, q, 20, page);
  const counts = await orderStatusCounts(db, q);

  // Re-use the existing CSRF cookie value for status forms in the fragment
  const csrfToken = getCsrfFromCookie(request) || generateCsrf();
  const rowsHtml = renderOrderRows(orders, itemsByOrder, csrfToken);

  return new Response(rowsHtml, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Order-Counts': JSON.stringify(counts),
    }
  });
}
