import { queryAll, getSetting, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';

function tableDisplay(label) {
  label = (label || '').trim();
  if (!label) return 'TABLE';
  if (/^(table|tbl)\b/i.test(label)) return label.toUpperCase();
  return 'TABLE ' + label.toUpperCase();
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const tables = await queryAll(db, 'SELECT id, label, token FROM restaurant_tables WHERE is_active = 1');
  tables.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  const shop = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const menuBaseUrl = await getSetting(db, 'menu_base_url', 'https://sparks-aurora.pages.dev');
  const menuBase = (menuBaseUrl || 'https://sparks-aurora.pages.dev').replace(/\/$/, '');
  const menuUrl = menuBase + '/client/';

  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  const standeesHtml = tables.map(t => {
    const tableMenuUrl = menuUrl + '?t=' + encodeURIComponent(t.token);
    return `<div class="standee">
  <div class="shop">${e(shop)}</div>
  <div class="sub">FRESH COFFEE · ORDER FROM YOUR TABLE</div>
  <div class="tlabel">${e(tableDisplay(t.label))}</div>
  <div class="qr" data-qr="${e(tableMenuUrl)}"></div>
  <div class="scan">Scan to order</div>
  <div class="qsub">${e(tableMenuUrl)}</div>
  <div class="foot">Works on any phone with internet · pay at the counter · ${e(monthYear)}</div>
</div>`;
  }).join('\n');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table standees · ${e(shop)}</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/vendor/qrcode.min.js"></script>
<style>
  body{background:#e7e7e7;font-family:'Segoe UI',system-ui,sans-serif;color:#1c1a16;margin:0;padding:24px}
  .toolbar{max-width:1100px;margin:0 auto 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .toolbar button{padding:10px 22px;border:none;border-radius:8px;background:#1c6b3f;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  .toolbar .note{font-size:13px;color:#555}
  .standee{background:#fff;border-radius:14px;padding:30px 26px;width:440px;margin:0 auto 26px;page-break-after:always;
           border:2px solid #1c1a16;text-align:center}
  .shop{font-size:23px;font-weight:800;letter-spacing:1px;margin-bottom:4px}
  .sub{font-size:12px;color:#777;margin-bottom:18px;letter-spacing:1px}
  .tlabel{font-size:22px;font-weight:800;margin:6px 0 16px}
  .qr{display:flex;justify-content:center;margin-bottom:12px}
  .qr img,.qr canvas{width:260px!important;height:260px!important}
  .scan{font-size:18px;font-weight:800;letter-spacing:.5px;color:#1c6b3f;margin-top:4px}
  .qsub{font-size:11px;color:#666;word-break:break-all;margin-top:8px}
  .foot{font-size:11px;color:#888;margin-top:16px}
  @media print{ body{background:#fff;padding:0} .toolbar{display:none} .standee{border-width:1px;margin-bottom:30px} }
</style>
</head><body>
<div class="toolbar">
  <button onclick="window.print()">Print standees</button>
  <span class="note">Print, cut along the cards, place one per table. Customers scan with any phone camera; the menu needs internet.</span>
  <a class="note" href="/admin/tables">← Back to tables</a>
</div>

${!tables.length ? '<p>No active tables yet. Create them in Admin → Tables first.</p>' : ''}

${standeesHtml}

<script>
document.querySelectorAll('[data-qr]').forEach(function (el) {
  if (window.QRCode) new QRCode(el, { text: el.dataset.qr, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
});
</script>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
