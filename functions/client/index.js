import { queryAll, queryOne, getSetting, tableForToken, tableDisplay, tableShortLabel, productImage, e } from '../_shared/db.js';
import { generateCsrf, setCsrfCookie } from '../_shared/csrf.js';

function md5Polyfill(str) {
  // Simple deterministic hash for data-basekey (matches PHP md5 behavior not required, just needs to be unique per key)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function baseName(n) {
  return n.replace(/\s*\((Hot|Iced)\)$/u, '');
}

function fmtPrice(n) {
  n = parseFloat(n);
  return '₱' + (Number.isInteger(n) ? n.toLocaleString('en') : n.toFixed(2));
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;

  const takeoutMode = url.searchParams.get('mode') === 'takeout';
  let tableToken = url.searchParams.get('t') || '';
  let dineTable = tableToken ? await tableForToken(db, tableToken) : null;
  if (!dineTable) tableToken = '';
  if (takeoutMode) { tableToken = ''; dineTable = null; }

  let tableChoices = [];
  if (!dineTable && !takeoutMode) {
    tableChoices = await queryAll(db, 'SELECT label, token FROM restaurant_tables WHERE is_active=1');
    tableChoices.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }

  const cats = await queryAll(db, "SELECT c.name, COUNT(p.id) AS items FROM categories c LEFT JOIN products p ON p.category_id=c.id WHERE c.name != 'Add-ons' GROUP BY c.id, c.name HAVING items > 0 ORDER BY c.name");
  const all = await queryAll(db, 'SELECT p.*,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.name,p.name');

  // Group hot/iced variants
  const groups = {};
  const gorder = [];
  for (const p of all) {
    const key = (p.category || '') + '|' + baseName(p.name);
    if (!groups[key]) {
      groups[key] = { cat: p.category, base: baseName(p.name), desc: p.description || '', items: [] };
      gorder.push(key);
    }
    groups[key].items.push(p);
  }

  const cards = [];
  const outCards = [];

  for (const key of gorder) {
    const g = groups[key];
    if ((g.cat || '') === 'Add-ons') continue;
    const variants = g.items.map(p => {
      const m = p.name.match(/\((Hot|Iced)\)$/u);
      const tag = m ? m[1].toUpperCase() : '';
      return { id: parseInt(p.id), name: p.name, price: parseFloat(p.price), avail: parseInt(p.is_available) === 1, tag, image: p.image || null };
    });
    g.variants = variants;
    g.anyAvail = variants.some(v => v.avail);
    g.feat = g.items.some(p => p.is_featured);
    const prices = variants.map(v => v.price);
    g.priceLabel = [...new Set(prices)].length > 1
      ? fmtPrice(Math.min(...prices)) + ' / ' + fmtPrice(Math.max(...prices))
      : fmtPrice(prices[0]);
    const firstAvail = variants.filter(v => v.avail);
    const imgSrc = (firstAvail.length ? firstAvail : variants)[0];
    g.img = productImage(imgSrc.image, g.cat);
    g.tags = g.items[0].allergen_tags || '';
    g.basekey = md5Polyfill(key);
    if (g.anyAvail) cards.push(g); else outCards.push(g);
  }

  const addonsRaw = all.filter(p => p.category === 'Add-ons' && parseInt(p.is_available) === 1);
  const addonsJson = JSON.stringify(addonsRaw.map(p => ({ id: parseInt(p.id), name: p.name, price: parseFloat(p.price) })));

  const success = url.searchParams.get('order') || '';
  const error = url.searchParams.get('error') || '';
  const shop = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const menuBaseUrl = await getSetting(db, 'menu_base_url', 'https://sparks-aurora.pages.dev');
  const menuUrl = (menuBaseUrl || 'https://sparks-aurora.pages.dev').replace(/\/$/, '') + '/client/';

  const csrfToken = generateCsrf();

  function renderCard(g, sold = false) {
    const soldClass = sold ? ' tq-sold' : '';
    const badgesHtml = g.tags ? g.tags.split(',').map(tag => `<span class="tq-badge">${e(tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1))}</span>`).join('') : '';
    return `<div class="tq-card${soldClass}" data-basekey="${e(g.basekey)}" data-basename="${e(g.base)}" data-cat="${e(g.cat)}" data-feat="${e(String(g.feat ? 1 : 0))}" data-avail="${e(String(g.anyAvail ? 1 : 0))}" data-name="${e((g.base + ' ' + g.desc).toLowerCase())}"
     data-variants="${e(JSON.stringify(g.variants))}"
     data-img="${e(g.img)}" data-desc="${e(g.desc)}" data-pricelabel="${e(g.priceLabel)}" data-tags="${e(g.tags || '')}">
  <div class="tq-cardimg"><img src="${e(g.img)}" alt="${e(g.base)}" loading="lazy">
    ${g.feat ? '<span class="tq-feat">BEST SELLER</span>' : ''}
    ${!g.anyAvail ? '<span class="tq-soldbadge">SOLD OUT</span>' : ''}
  </div>
  <div class="tq-cardbody">
    <div class="tq-cardname">${e(g.base)}</div>
    <div class="tq-carddesc">${e(g.desc)}</div>
    ${badgesHtml ? `<div class="tq-badges">${badgesHtml}</div>` : ''}
    <div class="tq-cardfoot"><span class="tq-cardprice">${e(g.priceLabel)}</span><span class="tq-plus">+</span></div>
  </div>
</div>`;
  }

  const catPillsHtml = cats.map(c => `<button data-cat="${e(c.name)}">${e(c.name)}</button>`).join('');

  const tablePickerModal = (!dineTable && !takeoutMode) ? `
<div class="modal" id="table-modal">
  <div class="modal-card tq-tablecard">
    <button class="modal-close" type="button" id="table-close" aria-label="Close">✕</button>
    <p class="eyebrow">WELCOME IN</p>
    <h2>Which table are you at?</h2>
    <p class="muted">Pick your table so the counter knows where to bring your order.</p>
    <div class="tq-tablegrid" id="table-grid">
      ${tableChoices.map(t => `<button type="button" class="tq-tableopt" data-token="${e(t.token)}" data-label="${e(tableDisplay(t.label))}"><span>TABLE</span><b>${e(tableShortLabel(t.label).toUpperCase())}</b></button>`).join('')}
    </div>
    ${!tableChoices.length ? '<p class="muted">No tables are set up yet. Ask staff, or choose take-out.</p>' : ''}
    <button type="button" class="outline-btn tq-takeoutbtn" id="table-takeout">Order take-out instead</button>
  </div>
</div>` : '';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fbfaf6"><title>Menu · ${e(shop.toUpperCase())}</title><link rel="stylesheet" href="/assets/style.css"><script src="/assets/vendor/qrcode.min.js"></script></head><body class="client-body tq" data-table-token="${e(dineTable ? tableToken : '')}" data-mode="${takeoutMode ? 'takeout' : 'normal'}">

<div class="tq-sticky">
  <header class="tq-head">
    <div class="tq-brandwrap">
      <span class="tq-brand">${e(shop.toUpperCase())}</span>
      <span class="tq-live" id="tq-live">LIVE — availability updates by itself</span>
    </div>
    <div class="tq-headright">
      ${!takeoutMode ? (dineTable
        ? `<span class="tq-table" id="tq-table" data-token="${e(tableToken)}">${e(tableDisplay(dineTable.label))}</span>`
        : `<button type="button" class="tq-table tq-tablepick" id="tq-tablepick" title="Choose your table">TABLE</button>`) : ''}
      <a class="tq-track" href="/client/order_status">Track order</a>
      <button type="button" class="tq-cartbtn" id="tq-cartopen" title="Your order">
        <svg viewBox="0 0 24 24"><path d="M4 6h13l-1.5 9h-10z"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>
        <span class="tq-count" id="tq-count" hidden>0</span>
      </button>
    </div>
  </header>
  <div id="order-chips" hidden></div>
  <div class="tq-find">
    <div class="tq-searchrow">
      <div class="tq-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg><input id="tq-search" type="search" placeholder="Search the menu" autocomplete="off"></div>
      <button type="button" class="tq-qrbtn" onclick="showQR()" title="Share menu QR" aria-label="Share menu QR">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="19" width="2" height="2"/><path d="M19 14h2M14 19v2"/></svg>
        <span>Share menu</span>
      </button>
    </div>
    <div class="tq-cats" id="tq-cats">
      <button class="on" data-cat="all">All</button>
      <button data-cat="best">Best Sellers</button>
      ${catPillsHtml}
    </div>
  </div>
</div>

<main class="tq-main" id="menu">
  ${success ? `<div class="tq-banner ok">Order <b>${e(success)}</b> sent — opening live status…</div>` : ''}
  ${error ? `<div class="tq-banner err">${e(error)}</div>` : ''}
  <p class="tq-allergen-note muted">Allergen info is provided by the cafe. Ask staff before ordering if you have a severe allergy. Cross-contact is possible.</p>

  <div class="tq-grid" id="tq-rows">
  ${cards.map(g => renderCard(g)).join('\n')}
  </div>

  ${outCards.length ? `
  <div class="tq-seclab">CURRENTLY UNAVAILABLE</div>
  <div class="tq-grid" id="tq-out">
    ${outCards.map(g => renderCard(g, true)).join('\n')}
  </div>` : ''}
</main>

<script type="application/json" id="tq-addons">${addonsJson}</script>

<div class="tq-sbackdrop" id="tq-sbackdrop" hidden></div>
<div class="tq-sheet" id="tq-sheet" hidden><div id="tq-sheetbody"></div></div>

<div class="tq-backdrop" id="tq-backdrop" hidden></div>
<aside class="tq-cart" id="tq-cart" hidden>
  <div class="tq-chead"><h3>Your order</h3><button type="button" class="tq-cartx" id="tq-cartclose">✕</button></div>
  <form id="order-form" method="post" action="/client/place_order">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="cart" id="cart-json">
    <input type="hidden" name="table_token" id="table-token" value="${e(tableToken)}">
    <input type="hidden" name="order_type" id="order-type" value="${takeoutMode ? 'Takeaway' : 'Dine-in'}">
    <div id="tq-lines"><div class="tq-emptyline">Your order is empty — tap an item to add it.</div></div>
    <div class="tq-field"><label>TABLE</label><span class="tq-val" id="rail-table">${e(dineTable ? tableDisplay(dineTable.label) : '—')}</span>${(!dineTable && !takeoutMode) ? '<button type="button" class="tq-picklink" id="rail-tablepick">Select</button>' : ''}</div>
    <div class="tq-field"><label>NAME</label><input name="customer_name" id="cust-name" maxlength="120" placeholder="Optional — for the cup label" autocomplete="name"></div>
    ${!takeoutMode ? '<div class="tq-type"><button type="button" data-type="Dine-in" class="on">DINE-IN</button><button type="button" data-type="Takeaway">TAKE-OUT</button></div>' : ''}
    <input type="hidden" name="mode" value="${takeoutMode ? 'takeout' : 'normal'}">
    <div class="tq-total">TOTAL <b id="rail-total">₱0.00</b></div>
    <div class="tq-paynote">Pay at the counter when you claim your order — cash or GCash.</div>
    <button class="tq-send" type="submit">SEND ORDER</button>
    <button type="button" class="tq-keep" id="tq-keep">Add more items</button>
  </form>
</aside>

<div class="tq-cartbar" id="tq-cartbar" hidden>
  <span class="tq-cinfo"><b id="tq-barcount">0</b> <small id="tq-clabel">items ready</small><small class="tq-bartotal">₱<b id="tq-total">0.00</b></small></span>
  <span class="tq-cgo">Review order <i>→</i></span>
</div>

<div class="modal" id="qr-modal"><div class="modal-card"><button class="modal-close" onclick="hideQR()">✕</button><p class="eyebrow">SHARE OUR MENU</p><h2>Scan to explore</h2><div id="qrcode" data-menu-url="${e(menuUrl)}"></div><p class="qr-url"><span id="qr-url-text">${e(menuUrl)}</span><button type="button" class="small-btn" id="copy-menu-url">Copy link</button></p><p class="muted">Customers scan this to open the menu.</p><button class="outline-btn" onclick="hideQR()">Close</button></div></div>

${tablePickerModal}
<div id="toast-root" aria-live="polite"></div>
<footer class="client-footer"><span>${e(shop)} · digital menu</span><a class="staff-link" href="/admin/login">🔒 Staff login</a></footer><script src="/assets/app.js"></script></body></html>`;

  const headers = new Headers({
    'Content-Type': 'text/html;charset=utf-8',
    'Cache-Control': 'no-store',
  });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
