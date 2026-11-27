import { run } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { verifyCsrf } from '../_shared/csrf.js';

// Categories now live on the Products page (add/delete inline). This route
// keeps working as the POST endpoint those inline forms submit to; every GET
// simply lands on /admin/products.
export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const backToProducts = (msg) => Response.redirect(
    new URL('/admin/products' + (msg ? '?caterror=' + encodeURIComponent(msg) : ''), request.url).href, 302);

  if (request.method !== 'POST') return backToProducts('');

  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';
  if (!verifyCsrf(request, csrfFormToken)) return backToProducts('');

  if (formData.has('delete_id')) {
    const deleteId = parseInt(formData.get('delete_id') || 0);
    if (deleteId > 0) await run(db, 'DELETE FROM categories WHERE id = ?', [deleteId]);
    return backToProducts('');
  }

  const name = (formData.get('name') || '').trim();
  if (!name) return backToProducts('');
  try {
    await run(db, 'INSERT INTO categories(name) VALUES(?)', [name]);
    return backToProducts('');
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    return backToProducts(
      msg.includes('unique') || msg.includes('constraint')
        ? 'That category already exists.'
        : 'Could not save the category. Please try again.');
  }
}
