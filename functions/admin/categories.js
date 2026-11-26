import { queryAll, run, getSetting, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  let error = '';

  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL('/admin/categories', request.url).href, 302);
    }

    if (formData.has('delete_id')) {
      const deleteId = parseInt(formData.get('delete_id') || 0);
      if (deleteId > 0) await run(db, 'DELETE FROM categories WHERE id = ?', [deleteId]);
      return Response.redirect(new URL('/admin/categories', request.url).href, 302);
    }

    const name = (formData.get('name') || '').trim();
    if (name) {
      try {
        await run(db, 'INSERT INTO categories(name) VALUES(?)', [name]);
        return Response.redirect(new URL('/admin/categories', request.url).href, 302);
      } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('unique') || msg.includes('constraint')) {
          error = 'That category already exists.';
        } else {
          error = 'Could not save the category. Please try again.';
        }
      }
    }
  }

  const cats = await queryAll(db, 'SELECT c.*, COUNT(p.id) AS product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name');
  const csrfToken = generateCsrf();

  const tableHtml = !cats.length
    ? `<tr><td colspan="3"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No categories yet. Add one above.</p></div></td></tr>`
    : cats.map(c => `<tr><td>${e(c.name)}</td><td>${c.product_count}</td><td><form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="delete_id" value="${c.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join('');

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">ORGANIZE YOUR MENU</p><h1>Categories</h1></div></div>
<form class="panel inline-form category-form" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input name="name" placeholder="e.g. Signature Coffee" required maxlength="80"><button class="btn" type="submit">Add category</button></form>
${error ? `<p class="error">${e(error)}</p>` : ''}
<div class="panel table-wrap"><table><thead><tr><th>Category</th><th>Products</th><th>Action</th></tr></thead>
${tableHtml}
</table></div>`;

  const html = adminLayout(session, 'Categories', shopName, '/admin/categories', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
