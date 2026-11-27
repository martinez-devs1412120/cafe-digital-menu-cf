import { queryAll, queryOne, run, getSetting, productImage, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

const ALLERGEN_WHITELIST = ['dairy', 'nuts', 'gluten', 'soy', 'eggs', 'vegan', 'vegetarian', 'caffeine', 'decaf'];

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const id = parseInt(url.searchParams.get('id') || 0);

  let product = { name: '', description: '', price: '', category_id: '', image: null, is_available: 1, is_featured: 0, allergen_tags: '' };

  if (id) {
    const row = await queryOne(db, 'SELECT * FROM products WHERE id = ?', [id]);
    if (!row) return Response.redirect(new URL('/admin/products', request.url).href, 302);
    product = row;
  }

  const cats = await queryAll(db, 'SELECT * FROM categories ORDER BY name');

  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL('/admin/product_form' + (id ? '?id=' + id : ''), request.url).href, 302);
    }

    const name = (formData.get('name') || '').trim();
    const desc = (formData.get('description') || '').trim();
    const price = parseFloat(formData.get('price') || 0);
    const catId = parseInt(formData.get('category_id') || 0) || null;
    const available = formData.has('is_available') ? 1 : 0;
    const featured = formData.has('is_featured') ? 1 : 0;
    const existingImage = formData.get('existing_image') || product.image || null;

    const rawTags = formData.getAll('allergen_tags');
    const filteredTags = [...new Set(rawTags.filter(t => ALLERGEN_WHITELIST.includes(t)))];
    const allergens = filteredTags.join(',');

    // Image uploads disabled in CF mode
    const imageFile = formData.get('image');
    let imageUploadNotice = '';
    if (imageFile && imageFile.size > 0) {
      imageUploadNotice = 'Image upload is temporarily disabled. Existing images are still displayed.';
    }

    product = { ...product, name, description: desc, price, category_id: catId, is_available: available, is_featured: featured, allergen_tags: allergens, image: existingImage };

    if (!name || price < 0) {
      const csrfToken = generateCsrf();
      const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
      setCsrfCookie(headers, csrfToken);
      const html = adminLayout(session, id ? 'Edit product' : 'Add product', shopName, '/admin/product_form', renderForm(id, product, cats, csrfToken, 'Enter a product name and a valid price.', imageUploadNotice), csrfToken);
      return new Response(html, { headers });
    }

    try {
      if (id) {
        await run(db, 'UPDATE products SET category_id=?, name=?, description=?, price=?, image=?, is_available=?, is_featured=?, allergen_tags=? WHERE id=?',
          [catId, name, desc, price, existingImage, available, featured, allergens, id]);
      } else {
        await run(db, 'INSERT INTO products(category_id, name, description, price, image, is_available, is_featured, allergen_tags) VALUES(?,?,?,?,?,?,?,?)',
          [catId, name, desc, price, existingImage, available, featured, allergens]);
      }
    } catch (err) {
      const csrfToken = generateCsrf();
      const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
      setCsrfCookie(headers, csrfToken);
      const html = adminLayout(session, id ? 'Edit product' : 'Add product', shopName, '/admin/product_form', renderForm(id, product, cats, csrfToken, 'Could not save the product. If a category was just deleted elsewhere, pick it again and retry.', imageUploadNotice), csrfToken);
      return new Response(html, { headers });
    }

    return Response.redirect(new URL('/admin/products', request.url).href, 302);
  }

  const csrfToken = generateCsrf();
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  const html = adminLayout(session, id ? 'Edit product' : 'Add product', shopName, '/admin/product_form', renderForm(id, product, cats, csrfToken, '', ''), csrfToken);
  return new Response(html, { headers });
}

function renderForm(id, product, cats, csrfToken, error, imageUploadNotice) {
  const currentTags = (product.allergen_tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const allergenCheckboxes = [
    ['dairy', 'Contains dairy'], ['nuts', 'Contains nuts'], ['gluten', 'Contains gluten'],
    ['soy', 'Contains soy'], ['eggs', 'Contains eggs'], ['vegan', 'Vegan'],
    ['vegetarian', 'Vegetarian'], ['caffeine', 'Caffeine'], ['decaf', 'Decaf'],
  ].map(([val, label]) => `<label class="check"><input type="checkbox" name="allergen_tags" value="${val}"${currentTags.includes(val) ? ' checked' : ''}> ${label}</label>`).join('');

  const catOptions = cats.map(c => `<option value="${c.id}"${product.category_id == c.id ? ' selected' : ''}>${e(c.name)}</option>`).join('');

  const currentImageHtml = product.image ? `<div class="full current-image"><img src="${e(productImage(product.image, null))}" alt="Current product photo"><span>Current photo — uploading a new one replaces it.</span></div>` : '';

  return `
<div class="page-heading"><div><p class="eyebrow">MENU MANAGEMENT</p><h1>${id ? 'Edit product' : 'Add a product'}</h1></div><a class="text-link" href="/admin/products">← Back to products</a></div>
<form class="panel form-grid" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="existing_image" value="${e(product.image || '')}">
${error ? `<div class="error full">${e(error)}</div>` : ''}
${imageUploadNotice ? `<div class="notice full">${e(imageUploadNotice)}</div>` : ''}
<div><label>Product name</label><input name="name" value="${e(product.name)}" required maxlength="120"></div>
<div><label>Price (₱)</label><input type="number" name="price" min="0" step="0.01" value="${e(String(product.price))}" required></div>
<div><label>Category</label><select name="category_id"><option value="">Uncategorized</option>${catOptions}</select></div>
<div><label>Product image (JPG/PNG/WEBP, max 4 MB)</label><p class="muted small-note">Image upload is temporarily disabled. Existing images are still displayed.</p></div>
${currentImageHtml}
<div class="full"><label>Description</label><textarea name="description" rows="3" maxlength="1000">${e(product.description || '')}</textarea></div>
<label class="check full"><input type="checkbox" name="is_available"${product.is_available ? ' checked' : ''}> Available on customer menu</label>
<label class="check full"><input type="checkbox" name="is_featured"${product.is_featured ? ' checked' : ''}> Show in Best Sellers</label>
<fieldset class="full allergen-fieldset"><legend>Allergen &amp; dietary tags</legend>
${allergenCheckboxes}
</fieldset>
<div class="full"><button class="btn" type="submit">Save product</button></div></form>`;
}
