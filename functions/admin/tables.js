import { queryAll, queryOne, run, getSetting, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

function randomHex16() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const shop = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const menuBaseUrl = await getSetting(db, 'menu_base_url', 'https://sparks-aurora.pages.dev');
  const menuBase = (menuBaseUrl || 'https://sparks-aurora.pages.dev').replace(/\/$/, '');

  if (url.searchParams.has('takeout_qr')) {
    const takeoutUrl = menuBase + '/client/?mode=takeout';
    return new Response(takeoutQrHtml(shop, takeoutUrl), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  if (url.searchParams.has('print')) {
    const tables = await queryAll(db, 'SELECT * FROM restaurant_tables WHERE is_active = 1');
    tables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
    const base = menuBase + '/client/';
    return new Response(printQrHtml(shop, tables, base), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  let error = '';
  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL('/admin/tables', request.url).href, 302);
    }

    if (formData.has('add_label')) {
      const label = (formData.get('add_label') || '').trim();
      if (label && label.length <= 40) {
        try {
          await run(db, 'INSERT INTO restaurant_tables(label, token) VALUES(?,?)', [label, randomHex16()]);
          return Response.redirect(new URL('/admin/tables', request.url).href, 302);
        } catch (err) {
          const msg = String(err.message || '').toLowerCase();
          if (msg.includes('unique') || msg.includes('constraint')) {
            error = 'A table with that name already exists.';
          } else {
            error = 'Could not save the table. Please try again.';
          }
        }
      }
    } else if (formData.has('rename_id')) {
      const label = (formData.get('label') || '').trim();
      const renameId = parseInt(formData.get('rename_id') || 0);
      if (label && label.length <= 40 && renameId > 0) {
        try {
          await run(db, 'UPDATE restaurant_tables SET label = ? WHERE id = ?', [label, renameId]);
          return Response.redirect(new URL('/admin/tables', request.url).href, 302);
        } catch (err) {
          const msg = String(err.message || '').toLowerCase();
          if (msg.includes('unique') || msg.includes('constraint')) {
            error = 'A table with that name already exists.';
          } else {
            error = 'Could not rename the table. Please try again.';
          }
        }
      }
    } else if (formData.has('toggle_id')) {
      const toggleId = parseInt(formData.get('toggle_id') || 0);
      if (toggleId > 0) await run(db, 'UPDATE restaurant_tables SET is_active = 1 - is_active WHERE id = ?', [toggleId]);
      return Response.redirect(new URL('/admin/tables', request.url).href, 302);
    } else if (formData.has('delete_id')) {
      const deleteId = parseInt(formData.get('delete_id') || 0);
      if (deleteId > 0) await run(db, 'DELETE FROM restaurant_tables WHERE id = ?', [deleteId]);
      return Response.redirect(new URL('/admin/tables', request.url).href, 302);
    }
  }

  const tables = await queryAll(db,
    "SELECT t.*, (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.status IN ('Pending','Preparing','Ready') AND DATE(datetime(o.created_at,'+8 hours')) = date('now','+8 hours')) AS active_orders FROM restaurant_tables t"
  );
  tables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));

  const csrfToken = generateCsrf();

  const tableHtml = !tables.length
    ? `<tr><td colspan="4"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No tables yet. Add one above, then print the QR codes and stick them on the tables.</p></div></td></tr>`
    : tables.map(t => `<tr><td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="rename_id" value="${t.id}"><input name="label" value="${e(t.label)}" maxlength="40" class="rename-input"><button class="small-btn" type="submit">Rename</button></form></td>
<td>${t.active_orders}</td>
<td><span class="status ${t.is_active ? 'st-ready' : 'st-cancelled'}">${t.is_active ? 'Active' : 'Off'}</span></td>
<td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="toggle_id" value="${t.id}"><button class="small-btn" type="submit">${t.is_active ? 'Turn off' : 'Turn on'}</button></form>
 <form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="delete_id" value="${t.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join('');

  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">FLOOR PLAN</p><h1>Tables</h1><p class="muted">Each table gets its own QR code, so orders and updates know where they belong.</p></div><a class="btn" href="/admin/tables?takeout_qr=1" target="_blank">🏷 Takeout QR</a><a class="btn" href="/admin/tables?print=1" target="_blank">🖨 Table QRs</a><a class="btn" href="/admin/standee_print" target="_blank">🗂 Standee sheet</a></div>
<form class="panel inline-form category-form" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input name="add_label" placeholder="e.g. Table 5, Sofa 2, Bar 1" required maxlength="40"><button class="btn" type="submit">+ Add table</button></form>
${error ? `<p class="error">${e(error)}</p>` : ''}
<div class="panel table-wrap"><table><thead><tr><th>Table</th><th>Active orders today</th><th>Status</th><th>Actions</th></tr></thead>
${tableHtml}
</table></div>
<p class="muted small-note">Turning a table off hides it from new QR sheets; scans of its code stop anchoring orders. Deleting it keeps past orders (their table link is simply removed).</p>`;

  const html = adminLayout(session, 'Tables', shop, '/admin/tables', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}

function takeoutQrHtml(shop, takeoutUrl) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Takeout Counter QR · ${e(shop)}</title>
<script src="/assets/vendor/qrcode.min.js"></script>
<style>
  body{margin:0;font:14px Arial,sans-serif;color:#25251f;background:#f7f5ef}
  .bar{padding:14px 20px;background:#fffefa;border-bottom:1px solid #e8e5dc;display:flex;gap:12px;align-items:center}
  .bar button{padding:10px 18px;background:#4a3726;color:#fff;border:0;border-radius:5px;font-weight:700;cursor:pointer}
  .bar a{color:#4a3726;font-weight:600}
  .sheet{display:flex;justify-content:center;padding:40px 20px}
  .card{background:#fff;border:1px solid #d8d4c8;border-radius:10px;padding:28px 32px;text-align:center;max-width:280px}
  .card h2{margin:0 0 12px;font-size:22px;letter-spacing:1px}
  .qr{display:flex;justify-content:center}
  .card p{font-size:10px;color:#77776f;word-break:break-all;margin:10px 0 0}
  .card .hint{font-size:12px;color:#4a3726;font-weight:700;margin-top:8px}
  @media print{.bar{display:none}body{background:#fff}.card{border-color:#bbb}}
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 Print this card</button><a href="/admin/tables">← Back to Tables</a><span>Post this at the counter. Customers scan to order takeout — no table required.</span></div>
<div class="sheet">
  <div class="card">
    <h2>TAKEOUT COUNTER</h2>
    <div class="qr" id="takeout-qr" data-url="${e(takeoutUrl)}"></div>
    <p class="hint">Scan to order takeout — no table required.</p>
    <p>${e(takeoutUrl)}</p>
  </div>
</div>
<script>
(function () {
  var el = document.getElementById('takeout-qr');
  if (window.QRCode) new QRCode(el, { text: el.dataset.url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
  window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
})();
</script></body></html>`;
}

function printQrHtml(shop, tables, base) {
  const cards = tables.map(t => {
    const url = base + '?t=' + encodeURIComponent(t.token);
    return `<div class="card"><h2>${e(t.label)}</h2><div class="qr" data-url="${e(url)}"></div><p class="hint">Scan to view the menu &amp; order</p><p>${e(url)}</p></div>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Table QR codes · ${e(shop)}</title>
<script src="/assets/vendor/qrcode.min.js"></script>
<style>
  body{margin:0;font:14px Arial,sans-serif;color:#25251f;background:#f7f5ef}
  .bar{padding:14px 20px;background:#fffefa;border-bottom:1px solid #e8e5dc;display:flex;gap:12px;align-items:center}
  .bar button{padding:10px 18px;background:#4a3726;color:#fff;border:0;border-radius:5px;font-weight:700;cursor:pointer}
  .bar a{color:#4a3726;font-weight:600}
  .sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;padding:20px}
  .card{background:#fff;border:1px solid #d8d4c8;border-radius:10px;padding:18px;text-align:center;page-break-inside:avoid}
  .card h2{margin:0 0 12px;font-size:21px;letter-spacing:1px}
  .qr{display:flex;justify-content:center}
  .card p{font-size:10px;color:#77776f;word-break:break-all;margin:10px 0 0}
  .card .hint{font-size:11px;color:#4a3726;font-weight:700;margin-top:6px}
  @media print{.bar{display:none}body{background:#fff}.card{border-color:#bbb}}
</style></head><body>
<div class="bar"><button onclick="window.print()">🖨 Print this sheet</button><a href="/admin/tables">← Back to Tables</a><span>Stick each code on its table. Customers scan with any phone camera; the menu needs internet.</span></div>
<div class="sheet">${!tables.length ? '<p>No active tables yet. Create them in Admin → Tables.</p>' : ''}${cards}</div>
<script>
document.querySelectorAll('.qr').forEach(function (el) {
  if (window.QRCode) new QRCode(el, { text: el.dataset.url, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
});
window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
</script></body></html>`;
}
