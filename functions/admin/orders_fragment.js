import { ORDER_STATUSES, orderStatusCounts, fetchOrdersPage, run } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { generateCsrf, getCsrfFromCookie, verifyCsrf } from '../_shared/csrf.js';
import { renderOrderBoard } from './_order_rows.js';

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

  // GET — the board fragment: all three columns, re-rendered fresh. The live
  // poller swaps this straight into #oboard every 10 seconds.
  const [orders, itemsByOrder] = await fetchOrdersPage(db, 'all', q, 200, 1);
  const counts = await orderStatusCounts(db, q);

  // Re-use the existing CSRF cookie value for the action forms in the fragment
  const csrfToken = getCsrfFromCookie(request) || generateCsrf();
  const boardHtml = renderOrderBoard(orders, itemsByOrder, csrfToken, counts);

  return new Response(boardHtml, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Order-Counts': JSON.stringify(counts),
    }
  });
}
