import { queryAll, run, getSetting, money, productImage, e } from '../_shared/db.js';
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

  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL('/admin/products', request.url).href, 302);
    }
    if (formData.has('available')) {
      const id = parseInt(formData.get('id') || 0);
      const available = parseInt(formData.get('available') || 0) ? 1 : 0;
      if (id > 0) {
        await run(db, 'UPDATE products SET is_available = ? WHERE id = ?', [available, id]);
      }
    }
    return Response.redirect(new URL('/admin/products', request.url).href, 302);
  }

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const csrfToken = generateCsrf();
  const rows = await queryAll(db, 'SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC, p.id DESC');

  const tableHtml = !rows.length
    ? `<tr><td colspan="5"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No products yet. Add your first menu item to get started.</p><a class="btn" href="/admin/product_form">+ Add product</a></div></td></tr>`
    : rows.map(p => `<tr><td><div class="product-cell"><img src="${e(productImage(p.image, p.category))}" alt=""><strong>${e(p.name)}</strong>${p.is_featured ? ' <span class="pill">Best seller</span>' : ''}</div></td><td>${e(p.category || 'Uncategorized')}</td><td>${money(p.price)}</td><td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="available" value="${p.is_available ? 0 : 1}"><button class="toggle ${p.is_available ? 'on' : 'off'}" type="submit">${p.is_available ? '● Available' : '● Sold Out'}</button></form></td><td><a class="text-link" href="/admin/product_form?id=${p.id}">Edit</a> · <form method="post" action="/admin/delete_product" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${p.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join('');

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">MENU MANAGEMENT</p><h1>Products</h1><p class="muted">Update prices, photos and availability.</p></div><a class="btn" href="/admin/product_form">+ Add product</a></div>
<div class="panel table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Actions</th></tr></thead>
${tableHtml}
</table></div>`;

  const html = adminLayout(session, 'Products', shopName, '/admin/products', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
