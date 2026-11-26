import { queryOne, run, tableForToken } from '../_shared/db.js';
import { verifyCsrf } from '../_shared/csrf.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method !== 'POST') {
    return Response.redirect(new URL('/client/', request.url).href, 302);
  }

  const db = env.sparks_cafe_db;
  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';

  if (!verifyCsrf(request, csrfFormToken)) {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Invalid form token. Please try again.'), request.url).href, 302);
  }

  let name = (formData.get('customer_name') || '').trim();
  let type = formData.get('order_type') || 'Dine-in';
  const mode = formData.get('mode') || '';
  const tableToken = formData.get('table_token') || '';
  const cartStr = formData.get('cart') || '[]';

  if (mode === 'takeout') type = 'Takeaway';

  if (name === '') name = 'Customer';
  if (name.length > 120) {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Please use a shorter name (120 characters max).'), request.url).href, 302);
  }
  if (!['Dine-in', 'Takeaway'].includes(type)) {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Invalid order type.'), request.url).href, 302);
  }

  let cart;
  try {
    cart = JSON.parse(cartStr);
  } catch {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Invalid cart data.'), request.url).href, 302);
  }
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 50) {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Please add at least one item to your order.'), request.url).href, 302);
  }

  const dineTable = tableToken ? await tableForToken(db, tableToken) : null;
  const tableId = dineTable ? parseInt(dineTable.id) : null;
  const tableNumber = dineTable ? String(dineTable.label) : '';

  if (type === 'Dine-in' && !tableId) {
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Please choose your table, or switch to Take-out.'), request.url).href, 302);
  }

  const finalTableId = type === 'Takeaway' ? null : tableId;
  const finalTableNumber = type === 'Takeaway' ? '' : tableNumber;

  try {
    const clean = [];
    let total = 0.0;
    const seen = {};

    for (const entry of cart) {
      const id = parseInt(entry.id || 0);
      let qty = Math.max(1, Math.min(30, parseInt(entry.qty || 1)));
      if (id <= 0) continue;

      const sizeKeyRaw = entry.size ? String(entry.size).toLowerCase() : '';
      const dedupKey = id + ':' + sizeKeyRaw;
      if (seen[dedupKey] !== undefined) {
        clean[seen[dedupKey]].qty = Math.min(30, clean[seen[dedupKey]].qty + qty);
        continue;
      }

      const p = await queryOne(db, 'SELECT p.id, p.name, p.price, p.is_available, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?', [id]);
      if (!p || !parseInt(p.is_available)) {
        return Response.redirect(new URL('/client/?error=' + encodeURIComponent('An item in your order just sold out. Please refresh the menu and try again.'), request.url).href, 302);
      }

      const isBeverage = ['Coffee', 'Non-Coffee'].includes(String(p.category));
      const sweetnessAllowed = ['0%', '25%', '50%', '75%', '100%'];
      let sweetness = null;
      if (isBeverage) {
        const sweetnessRaw = entry.sweetness != null ? entry.sweetness : null;
        if (sweetnessRaw !== null) {
          const swStr = !isNaN(sweetnessRaw) ? (parseInt(sweetnessRaw) + '%') : String(sweetnessRaw);
          sweetness = sweetnessAllowed.includes(swStr) ? swStr : '100%';
        } else {
          sweetness = '100%';
        }
      }

      const sizeAllowed = ['Small', 'Medium', 'Large'];
      let size = null;
      if (isBeverage) {
        const sizeRaw = entry.size != null ? entry.size : null;
        if (sizeRaw !== null) {
          size = sizeAllowed.includes(String(sizeRaw)) ? String(sizeRaw) : 'Medium';
        } else {
          size = 'Medium';
        }
      }

      let delta = 0.0;
      if (isBeverage) {
        if (size === 'Small') delta = -15.0;
        else if (size === 'Large') delta = 20.0;
      }

      const finalPrice = parseFloat(p.price) + delta;
      seen[dedupKey] = clean.length;
      clean.push({ id: parseInt(p.id), name: String(p.name), price: finalPrice, qty, sweetness, size, size_price_delta: delta });
      total += finalPrice * qty;
    }

    if (!clean.length) {
      return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Please add at least one item to your order.'), request.url).href, 302);
    }

    // Generate order number with retry
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const datePart = String(now.getUTCFullYear()).slice(2) + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());

    let orderNumber = '';
    let orderId = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      const candidate = 'DC' + datePart + rnd;
      try {
        const stmts = [
          db.prepare('INSERT INTO orders(order_number, customer_name, table_number, table_id, order_type, total) VALUES(?,?,?,?,?,?)')
            .bind(candidate, name, finalTableNumber ? finalTableNumber.substring(0, 30) : null, finalTableId, type, total),
        ];
        const results = await db.batch(stmts);
        if (results[0].success) {
          orderNumber = candidate;
          // Get the inserted order id
          const orderRow = await queryOne(db, 'SELECT id FROM orders WHERE order_number = ?', [candidate]);
          orderId = orderRow ? parseInt(orderRow.id) : null;
          break;
        }
      } catch (err) {
        if (attempt === 4) throw err;
        // Retry on UNIQUE constraint violation
      }
    }

    if (!orderNumber || !orderId) {
      return Response.redirect(new URL('/client/?error=' + encodeURIComponent('Could not create your order number. Please try again.'), request.url).href, 302);
    }

    // Insert order items
    const itemStmts = clean.map(item =>
      db.prepare('INSERT INTO order_items(order_id, product_id, product_name, price, quantity, sweetness, size, size_price_delta) VALUES(?,?,?,?,?,?,?,?)')
        .bind(orderId, item.id, item.name, item.price, item.qty, item.sweetness, item.size, item.size_price_delta)
    );
    await db.batch(itemStmts);

    const suffix = finalTableId ? '&t=' + encodeURIComponent(tableToken) : '';
    return Response.redirect(new URL('/client/?order=' + encodeURIComponent(orderNumber) + suffix, request.url).href, 302);

  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'We could not save your order. Please ask staff for help.';
    return Response.redirect(new URL('/client/?error=' + encodeURIComponent(message), request.url).href, 302);
  }
}
