import { queryOne, run } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { verifyCsrf } from '../_shared/csrf.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  if (request.method !== 'POST') {
    return Response.redirect(new URL('/admin/products', request.url).href, 302);
  }

  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';
  if (!verifyCsrf(request, csrfFormToken)) {
    return Response.redirect(new URL('/admin/products', request.url).href, 302);
  }

  const id = parseInt(formData.get('id') || 0);
  if (id > 0) {
    await run(db, 'DELETE FROM products WHERE id = ?', [id]);
  }

  return Response.redirect(new URL('/admin/products', request.url).href, 302);
}
