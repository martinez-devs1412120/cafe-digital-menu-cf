import { queryOne, queryAll, getSetting, money, statusClass, e } from '../_shared/db.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;
  const number = (url.searchParams.get('number') || '').trim();
  const isJson = url.searchParams.has('json');

  if (isJson) {
    // JSON polling endpoint
    const row = await queryOne(db, 'SELECT id, status, created_at FROM orders WHERE order_number = ?', [number]);
    if (!row) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    const items = await queryAll(db, 'SELECT product_name, quantity, price, sweetness, size FROM order_items WHERE order_id = ? ORDER BY id', [parseInt(row.id)]);
    const itemsOut = items.map(it => ({
      name: String(it.product_name),
      qty: parseInt(it.quantity),
      price: parseFloat(it.price),
      sweetness: it.sweetness || null,
      size: it.size || null,
    }));
    let etaLabel = '';
    if (['Pending', 'Preparing'].includes(row.status)) {
      const aheadRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing') AND created_at < (SELECT created_at FROM orders WHERE order_number = ?)", [number]);
      const ahead = aheadRow ? (aheadRow.n || 0) : 0;
      const etaMin = Math.max(2, ahead * 4);
      etaLabel = etaMin > 30 ? 'Ask staff for timing' : 'Estimated ready in ~' + etaMin + ' min';
    }
    return new Response(JSON.stringify({ status: row.status, items: itemsOut, eta_label: etaLabel }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  // Full HTML page
  const shop = await getSetting(db, 'shop_name', 'SPARKS CAFE');

  let order = null;
  let items = [];
  if (number) {
    order = await queryOne(db, 'SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.order_number = ?', [number]);
    if (order) {
      items = await queryAll(db, 'SELECT product_name, quantity, price, sweetness, size FROM order_items WHERE order_id = ? ORDER BY id', [parseInt(order.id)]);
    }
  }

  const steps = ['Pending', 'Preparing', 'Ready', 'Completed'];
  const currentIdx = order ? steps.indexOf(order.status) : -1;
  const orderTable = order ? ((order.table_label || '') !== '' ? order.table_label : ((order.table_number || '') !== '' ? 'Table ' + order.table_number : '')) : '';

  let initEtaLabel = '';
  if (order && ['Pending', 'Preparing'].includes(order.status)) {
    const aheadRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing') AND created_at < ?", [order.created_at]);
    const initAhead = aheadRow ? (aheadRow.n || 0) : 0;
    const initEtaMin = Math.max(2, initAhead * 4);
    initEtaLabel = initEtaMin > 30 ? 'Ask staff for timing' : 'Estimated ready in ~' + initEtaMin + ' min';
  }

  const timelineHtml = order && order.status !== 'Cancelled' ? `<ol class="timeline">${steps.map((st, i) => `<li class="${currentIdx !== -1 && i < currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}"><span class="dot"></span>${st}</li>`).join('')}</ol>` : '';

  const itemsHtml = order ? items.map(it => {
    const display = it.product_name + (it.size ? ' · ' + it.size : '') + (it.sweetness && it.sweetness !== '100%' ? ' · ' + it.sweetness + ' sweet' : '');
    return `<tr><td>${e(String(it.quantity))} × ${e(display)}</td><td>${money(parseFloat(it.price) * parseInt(it.quantity))}</td></tr>`;
  }).join('') : '';

  const hintMsg = !order ? '' : (
    order.status === 'Completed' ? `Enjoy! Thanks for visiting ${e(shop)}.` :
    order.status === 'Cancelled' ? 'Please ask staff if you need help with this order.' :
    'This page updates itself — no need to refresh.'
  );

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fbfaf6"><title>Track order · ${e(shop.toUpperCase())}</title><link rel="stylesheet" href="/assets/style.css"></head><body class="client-body">
<header class="client-header"><a class="brand" href="/client/">${e(shop.toUpperCase())}<span>COFFEE · COMMUNITY · COMFORT</span></a><div class="header-actions"><a class="outline-btn small-action" href="/client/">← Back to menu</a></div></header>
<main class="track-main">
<h1>Track your order</h1>
<form class="track-form" method="get"><input name="number" value="${e(number)}" placeholder="Order number, e.g. DC251115A1B2" required maxlength="30"><button class="btn" type="submit">Track</button></form>
${number && !order ? `<div class="error-banner">We couldn't find an order with that number. Please double-check it with our staff.</div>` : ''}
${order ? `<section class="panel track-card">
  <div class="track-head"><div><p class="eyebrow">ORDER ${e(order.order_number)}</p><h2>Hello, ${e(order.customer_name)}!</h2></div><span class="status big ${statusClass(order.status)}" id="track-status">${e(order.status)}</span></div>
  ${order.status === 'Cancelled' ? `<p class="error">This order was cancelled. Please see our staff if this seems wrong.</p>` : timelineHtml}
  <p class="error" id="track-cancel" ${order.status !== 'Cancelled' ? 'hidden' : ''}>This order was cancelled. Please see our staff if this seems wrong.</p>
  ${!['Ready', 'Completed', 'Cancelled'].includes(order.status) ? `<p class="muted" id="track-eta">${e(initEtaLabel)}</p>` : ''}
  <p class="muted" id="track-hint">${hintMsg}</p>
  <div class="table-wrap"><table><tbody>
   ${itemsHtml}
   <tr class="track-total"><td>Total</td><td><strong>${money(order.total)}</strong></td></tr>
  </tbody></table></div>
  <p class="muted small-note">Placed ${e(order.created_at)} · ${e(order.order_type)}${orderTable ? ' · ' + e(orderTable) : ''} · Payment at the counter</p>
</section>` : ''}
</main>
<footer class="client-footer"><span>${e(shop.toUpperCase())} · Made for your everyday coffee moment</span><a class="staff-link" href="/admin/login">🔒 Staff login</a></footer>
<script>
(function () {
  var number = ${JSON.stringify(number)};
  if (!number) return;
  var steps = ['Pending', 'Preparing', 'Ready', 'Completed'];
  var shop = ${JSON.stringify(shop)};
  var lastStatus = ${JSON.stringify(order ? order.status : '')};
  var etaInit = document.getElementById('track-eta');
  if (etaInit) { etaInit.hidden = ['Pending', 'Preparing'].indexOf(lastStatus) === -1; }
  function notifyReady() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var t = ctx.currentTime;
      [880, 1320].forEach(function (freq, i) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t + i * 0.18); osc.stop(t + i * 0.18 + 0.18);
      });
    } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate([250, 100, 250]); } catch (e) {} }
  }
  function render(data) {
    if (!data || !data.status) return;
    var status = data.status;
    var badge = document.getElementById('track-status');
    var idx = steps.indexOf(status);
    document.querySelectorAll('.timeline li').forEach(function (li, i) {
      li.classList.toggle('done', idx !== -1 && i < idx);
      li.classList.toggle('current', i === idx);
    });
    if (badge) badge.textContent = status;
    var cancel = document.getElementById('track-cancel');
    if (cancel) cancel.hidden = status !== 'Cancelled';
    var hint = document.getElementById('track-hint');
    if (hint) {
      hint.textContent =
        status === 'Completed' ? 'Enjoy! Thanks for visiting ' + shop + '.' :
        status === 'Cancelled' ? 'Please ask staff if you need help with this order.' :
        status === 'Ready' ? 'Your order is ready — please pick it up at the counter.' :
        status === 'Preparing' ? 'The counter is preparing your order now.' :
        'Order received. This page updates itself — no need to refresh.';
    }
    var eta = document.getElementById('track-eta');
    if (eta) {
      var etaActive = ['Pending', 'Preparing'].indexOf(status) !== -1;
      eta.hidden = !etaActive;
      if (etaActive && data.eta_label) { eta.textContent = data.eta_label; }
    }
    if (lastStatus && lastStatus !== status) {
      if (status === 'Ready') { notifyReady(); document.title = 'READY · ' + number; }
      else if (status === 'Completed') { document.title = 'Completed · ' + number; }
      else if (status === 'Cancelled') { document.title = 'Cancelled · ' + number; }
    }
    lastStatus = status;
  }
  function refresh() {
    fetch('/client/order_status?number=' + encodeURIComponent(number) + '&json=1', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {});
  }
  setInterval(refresh, 8000);
})();
</script></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
