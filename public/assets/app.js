// Sparks Café — Tap-to-Order client logic (item-page pattern).
// One cart; the menu shows one card per drink; tapping a card opens the item
// page where the serving style (Hot/Iced), quantity and oat-milk add-on are
// chosen. Cart survives refreshes; availability and order status stay live.
'use strict';

var CART_KEY = 'dailycup_cart_v1';
var cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]') || []; } catch (e) { cart = []; }
cart = cart.filter(function (x) { return x && x.id && x.qty > 0; });

function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ } }
function cartCount() { return cart.reduce(function (s, x) { return s + x.qty; }, 0); }
function cartTotal() { return cart.reduce(function (s, x) { return s + (Number(x.price) + Number(x.sizeDelta || 0)) * x.qty; }, 0); }

/* ===== dine-in / take-out choice, remembered between visits ===== */
var ORDER_TYPE_KEY = 'dailycup_order_type';
function currentOrderType() {
  try { return localStorage.getItem(ORDER_TYPE_KEY) || 'Dine-in'; } catch (e) { return 'Dine-in'; }
}
function setOrderType(type) {
  var hidden = document.getElementById('order-type');
  if (hidden) hidden.value = type;
  document.querySelectorAll('.tq-type button').forEach(function (b) { b.classList.toggle('on', b.dataset.type === type); });
  try { localStorage.setItem(ORDER_TYPE_KEY, type); } catch (e) {}
}

function toast(message) {
  var root = document.getElementById('toast-root');
  if (!root) { return; }
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  root.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 2600);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(a) { return '₱' + Number(a).toFixed(2); }
// "Table 5" -> "TABLE 5" (never "TABLE TABLE 5"); "Sofa 2" -> "TABLE SOFA 2".
function displayTable(label) {
  var t = String(label || '').trim().toUpperCase();
  if (!t) return 'TABLE';
  return /^(TABLE|TBL)\b/.test(t) ? t : 'TABLE ' + t;
}

/* ===== availability state per product (synced from the server poll) ===== */
var availability = {};

/* ===== item page (sheet) ===== */
var sheet = null; // { key, vid, qty, oat, sweetness, size, sizeDelta, variants, name, desc, img, cat, feat }

function openSheet(card) {
  var d = card.dataset;
  var vs = JSON.parse(d.variants || '[]');
  vs.forEach(function (v) {
    if (availability[v.id] !== undefined) v.avail = availability[v.id] === 1;
  });
  var firstAvail = vs.find(function (x) { return x.avail; });
  if (!firstAvail) { toast(d.basename + ' is sold out right now'); return; }
  sheet = {
    key: d.basekey, vid: firstAvail.id, qty: 1, oat: false,
    sweetness: 100, size: 'Medium', sizeDelta: 0,
    variants: vs, name: d.basename, desc: d.desc, img: d.img, cat: d.cat, feat: d.feat === '1',
    tags: d.tags || ''
  };
  buildSheet();
  document.getElementById('tq-sbackdrop').hidden = false;
  document.getElementById('tq-sheet').hidden = false;
  requestAnimationFrame(function () { document.getElementById('tq-sheet').classList.add('open'); });
}
function closeSheet() {
  var s = document.getElementById('tq-sheet');
  s.classList.remove('open');
  document.getElementById('tq-sbackdrop').hidden = true;
  setTimeout(function () { s.hidden = true; }, 250);
  sheet = null;
}
function sheetVariant() {
  return sheet ? sheet.variants.find(function (x) { return x.id === sheet.vid; }) : null;
}
function buildSheet() {
  if (!sheet) return;
  var v = sheetVariant();
  var body = document.getElementById('tq-sheetbody');
  var oat = oatAddon();
  var showOat = ['Coffee', 'Non-Coffee'].indexOf(sheet.cat) !== -1 && addonAvailable(oat);
  if (!showOat) sheet.oat = false;
  var showCustom = ['Coffee', 'Non-Coffee'].indexOf(sheet.cat) !== -1;
  var total = (v ? v.price : 0) * sheet.qty + sheet.sizeDelta * sheet.qty + (sheet.oat && oat ? oat.price * sheet.qty : 0);
  var canAdd = !!(v && v.avail);
  body.innerHTML =
    '<button type="button" class="tq-sclose" id="tq-sclose" aria-label="Close">✕</button>' +
    '<div class="sh-img"><img src="' + escapeHtml(sheet.img) + '" alt=""></div>' +
    '<h3 class="sh-name">' + escapeHtml(sheet.name) + (sheet.feat ? ' <span class="tq-feat">BEST SELLER</span>' : '') + '</h3>' +
    '<div class="sh-desc">' + escapeHtml(sheet.desc) + '</div>' +
    (sheet.tags ? '<div class="sh-tags">' + sheet.tags.split(',').map(function (t) { t = t.trim(); return t ? '<span class="tq-badge">' + escapeHtml(t.charAt(0).toUpperCase() + t.slice(1)) + '</span>' : ''; }).join('') + '</div>' : '') +
    (sheet.variants.length > 1
      ? '<div class="sh-variants">' + sheet.variants.map(function (x) {
          return '<button type="button" class="sh-vbtn' + (x.id === sheet.vid ? ' on' : '') + (x.avail ? '' : ' out') + '" data-vid="' + x.id + '" ' + (x.avail ? '' : 'disabled') + '>' +
            '<b>' + x.tag + '</b><span>' + money(x.price) + '</span>' + (x.avail ? '' : '<i>sold out</i>') + '</button>';
        }).join('') + '</div>'
      : '') +
    (showOat ? '<label class="sh-oat"><input type="checkbox" id="sh-oat" ' + (sheet.oat ? 'checked' : '') + '> Make it oat milk <b>+' + money(oat.price) + '</b></label>' : '') +
    (showCustom
      ? '<div class="sh-row sh-sweet-row"><span class="sh-rowlabel">Sweetness</span><div class="sh-pills">' +
        [0, 25, 50, 75, 100].map(function (pct) {
          return '<button type="button" class="sh-pill sh-sweet' + (sheet.sweetness === pct ? ' on' : '') + '" data-pct="' + pct + '">' + pct + '%</button>';
        }).join('') + '</div></div>'
      : '') +
    (showCustom
      ? '<div class="sh-row sh-size-row"><span class="sh-rowlabel">Size</span><div class="sh-pills">' +
        ['Small', 'Medium', 'Large'].map(function (sz) {
          var delta = sz === 'Small' ? -15 : (sz === 'Large' ? 20 : 0);
          var label = sz + (delta !== 0 ? ' (' + (delta > 0 ? '+' : '') + '₱' + Math.abs(delta) + ')' : '');
          return '<button type="button" class="sh-pill sh-size' + (sheet.size === sz ? ' on' : '') + '" data-size="' + sz + '">' + label + '</button>';
        }).join('') + '</div></div>'
      : '') +
    '<div class="sh-qtyrow"><button type="button" id="sh-dq">−</button><span class="q">' + sheet.qty + '</span><button type="button" id="sh-iq">+</button></div>' +
    '<button type="button" class="sh-add" id="sh-add" ' + (canAdd ? '' : 'disabled') + '>' + (canAdd ? 'ADD TO ORDER · ' + money(total) : 'SOLD OUT') + '</button>' +
    '<div class="sh-note">Pay at the counter when you claim your order.</div>';
}
function sheetRefresh() {
  if (!sheet) return;
  buildSheet();
}
function addonsList() {
  try { return JSON.parse(document.getElementById('tq-addons').textContent || '[]') || []; } catch (e) { return []; }
}
function oatAddon() {
  var list = addonsList();
  return list.find(function (x) { return /oat/i.test(x.name || ''); }) || null;
}
function addonAvailable(addon) {
  return !!addon && availability[addon.id] !== 0;
}
function sheetAdd() {
  if (!sheet) return;
  var v = sheetVariant();
  if (!v) return;
  if (!v.avail) { toast(v.name + ' is sold out right now'); return; }
  var name = sheet.name, qty = sheet.qty, addOat = sheet.oat;
  var isDrink = ['Coffee', 'Non-Coffee'].indexOf(sheet.cat) !== -1;
  var line = cart.find(function (x) { return x.id === v.id && x.size === (isDrink ? sheet.size : undefined) && x.sweetness === (isDrink ? sheet.sweetness : undefined); });
  if (line) line.qty += qty;
  else {
    var entry = { id: v.id, name: v.name, price: v.price, qty: qty, tags: (sheet.tags || '') };
    if (isDrink) {
      entry.sweetness = sheet.sweetness;
      entry.size = sheet.size;
      entry.sizeDelta = sheet.sizeDelta;
    }
    cart.push(entry);
  }
  var oat = oatAddon();
  if (addOat && addonAvailable(oat)) {
    var oline = cart.find(function (x) { return x.id === oat.id; });
    if (oline) oline.qty += qty;
    else cart.push({ id: oat.id, name: oat.name, price: oat.price, qty: qty });
  }
  saveCart();
  syncCartUI();
  closeSheet();
  toast(name + ' × ' + qty + ' added to your order');
}

/* ===== one sync point: cart -> header badge, card badges, cart bar, rail ===== */
function syncCartUI() {
  var count = cartCount(), total = cartTotal();
  var badge = document.getElementById('tq-count');
  if (badge) {
    badge.textContent = count;
    badge.hidden = count === 0;
  }
  var bar = document.getElementById('tq-cartbar');
  if (bar) {
    bar.hidden = count === 0;
    document.getElementById('tq-barcount').textContent = count;
    document.getElementById('tq-clabel').textContent = count === 1 ? 'item ready' : 'items ready';
    document.getElementById('tq-total').textContent = total.toFixed(2);
  }
  renderRailLines();
  // cards with this drink in the cart show a small qty chip
  document.querySelectorAll('.tq-card[data-basekey]').forEach(function (card) {
    var vs = JSON.parse(card.dataset.variants || '[]');
    var inCart = vs.reduce(function (s, v) {
      var line = cart.find(function (x) { return x.id === v.id; });
      return s + (line ? line.qty : 0);
    }, 0);
    var chip = card.querySelector('.tq-qtychip');
    if (chip) chip.hidden = inCart === 0;
    if (chip && inCart) chip.textContent = inCart + ' in order';
    card.classList.toggle('tq-inorder', inCart > 0);
  });
  saveCart();
}

function renderRailLines() {
  var wrap = document.getElementById('tq-lines');
  if (!wrap) return;
  var hasTags = cart.some(function (x) { return x && String(x.tags || '').trim() !== ''; });
  var warnHtml = (cart.length && hasTags)
    ? '<div class="tq-allergen-warn">⚠ <em>Allergen info is provided by the cafe. Ask staff before ordering if you have a severe allergy. Cross-contact is possible.</em></div>'
    : '';
  var linesHtml = cart.length ? cart.map(function (x, i) {
    var label = escapeHtml(x.name);
    if (x.size) label += ' · ' + escapeHtml(x.size);
    if (x.sweetness != null && x.sweetness !== 100) label += ' · ' + escapeHtml(String(x.sweetness)) + '% sweet';
    var linePrice = (Number(x.price) + Number(x.sizeDelta || 0)) * x.qty;
    return '<div class="tq-line"><span class="tq-linename">' + label + '</span>' +
      '<span class="tq-linestepper"><button type="button" data-line-dec="' + i + '">−</button>' + x.qty +
      '<button type="button" data-line-inc="' + i + '">+</button></span>' +
      '<span class="tq-lineprice">₱' + linePrice.toFixed(2) + '</span></div>';
  }).join('') : '<div class="tq-emptyline">Your order is empty — tap an item to add it.</div>';
  wrap.innerHTML = warnHtml + linesHtml;
  document.getElementById('cart-json').value = JSON.stringify(cart.map(function (x) { return { id: x.id, qty: x.qty, sweetness: x.sweetness != null ? x.sweetness : null, size: x.size || null, sizeDelta: x.sizeDelta || 0 }; }));
  document.getElementById('rail-total').textContent = cartTotal().toFixed(2);
}

/* ===== order slide-over (bottom sheet on phones, side rail on PC) ===== */
function openCart() {
  var panel = document.getElementById('tq-cart');
  var backdrop = document.getElementById('tq-backdrop');
  if (!panel) return;
  panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  requestAnimationFrame(function () { panel.classList.add('open'); });
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  var panel = document.getElementById('tq-cart');
  var backdrop = document.getElementById('tq-backdrop');
  if (!panel) return;
  panel.classList.remove('open');
  if (backdrop) backdrop.hidden = true;
  document.body.style.overflow = '';
  setTimeout(function () { if (!panel.classList.contains('open')) panel.hidden = true; }, 300);
}
function changeCartLine(index, delta) {
  var line = cart[index];
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart.splice(index, 1);
  if (!cart.length) closeCart();
  syncCartUI();
}

/* ===== search + category filter (Best Sellers pill uses data-feat) ===== */
var currentCat = 'all';
function applyFilters() {
  var qn = (document.getElementById('tq-search').value || '').trim().toLowerCase();
  document.querySelectorAll('.tq-card[data-basekey]').forEach(function (card) {
    var inCat = currentCat === 'all' ||
                (currentCat === 'best' && card.dataset.feat === '1') ||
                card.dataset.cat === currentCat;
    var hit = inCat && (!qn || card.dataset.name.indexOf(qn) !== -1);
    card.hidden = !hit;
  });
  var out = document.querySelectorAll('#tq-out .tq-card');
  out.forEach(function (card) {
    var hit = (currentCat === 'all' || currentCat === 'best') &&
              (!qn || card.dataset.name.indexOf(qn) !== -1);
    card.hidden = !hit;
  });
}

/* ===== keep: QR modal ===== */
function showQR() {
  var modal = document.getElementById('qr-modal');
  modal.classList.add('show');
  var target = document.getElementById('qrcode');
  target.innerHTML = '';
  var url = target.dataset.menuUrl || location.href;
  if (window.QRCode) new QRCode(target, { text: url, width: 210, height: 210 });
  else target.textContent = 'QR library unavailable. Check your internet connection.';
}
function hideQR() { document.getElementById('qr-modal').classList.remove('show'); }

/* ===== delegated clicks ===== */
document.addEventListener('click', function (e) {
  var copy = e.target.closest('#copy-menu-url');
  if (copy) {
    var url = document.getElementById('qrcode').dataset.menuUrl || location.href;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () { toast('Menu link copied'); },
        function () { copyMenuLinkFallback(url); }
      );
    } else {
      copyMenuLinkFallback(url);
    }
    return;
  }
  var pill = e.target.closest('.tq-cats button');
  if (pill) {
    currentCat = pill.dataset.cat;
    document.querySelectorAll('.tq-cats button').forEach(function (b) { b.classList.toggle('on', b === pill); });
    applyFilters();
    return;
  }
  var type = e.target.closest('.tq-type button');
  if (type) { setOrderType(type.dataset.type); return; }
  if (e.target.closest('#tq-tablepick') || e.target.closest('#rail-tablepick')) { openTablePicker(); return; }
  if (e.target.closest('#table-close')) { hideTablePicker(); return; }
  if (e.target.closest('#table-takeout')) { chooseTakeout(); return; }
  var tableOpt = e.target.closest('.tq-tableopt');
  if (tableOpt) { selectTable(tableOpt.dataset.token); return; }
  if (e.target.id === 'table-modal') { hideTablePicker(); return; }
  var vbtn = e.target.closest('.sh-vbtn');
  if (vbtn && !vbtn.disabled) {
    sheet.vid = Number(vbtn.dataset.vid);
    sheetRefresh();
    return;
  }
  var swBtn = e.target.closest('.sh-sweet');
  if (swBtn) {
    sheet.sweetness = Number(swBtn.dataset.pct);
    sheetRefresh();
    return;
  }
  var szBtn = e.target.closest('.sh-size');
  if (szBtn) {
    var sz = szBtn.dataset.size;
    sheet.size = sz;
    sheet.sizeDelta = sz === 'Small' ? -15 : (sz === 'Large' ? 20 : 0);
    sheetRefresh();
    return;
  }
  if (e.target.closest('#sh-iq')) { sheet.qty = Math.min(30, sheet.qty + 1); sheetRefresh(); return; }
  if (e.target.closest('#sh-dq')) { if (sheet.qty > 1) { sheet.qty--; sheetRefresh(); } return; }
  if (e.target.closest('#sh-oat')) { sheet.oat = !sheet.oat; sheetRefresh(); return; }
  if (e.target.closest('#sh-add')) { sheetAdd(); return; }
  var inc = e.target.closest('[data-line-inc]');
  if (inc) { changeCartLine(Number(inc.dataset.lineInc), 1); return; }
  var dec = e.target.closest('[data-line-dec]');
  if (dec) { changeCartLine(Number(dec.dataset.lineDec), -1); return; }
  if (e.target.closest('#tq-cartopen') || e.target.closest('#tq-cartbar')) { openCart(); return; }
  if (e.target.closest('#tq-cartclose')) { closeCart(); return; }
  if (e.target.closest('#tq-keep')) { closeCart(); return; }
  if (e.target.closest('#tq-backdrop')) { closeCart(); return; }
  if (e.target.closest('#tq-sclose') || e.target.closest('#tq-sbackdrop')) { closeSheet(); return; }
  var card = e.target.closest('.tq-card[data-basekey][data-avail="1"]');
  if (card) { openSheet(card); return; }
});

function copyMenuLinkFallback(url) {
  var box = document.createElement('textarea');
  box.value = url;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.left = '-9999px';
  document.body.appendChild(box);
  box.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  box.remove();
  if (ok) { toast('Menu link copied'); return; }
  window.prompt('Copy this menu link:', url);
}

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (document.getElementById('tq-cart') && !document.getElementById('tq-cart').hidden) closeCart();
  if (document.getElementById('tq-sheet') && !document.getElementById('tq-sheet').hidden) closeSheet();
});

document.getElementById('order-form')?.addEventListener('submit', function (e) {
  if (!cart.length) { e.preventDefault(); toast('Please add at least one item first.'); return; }
  if (document.body.dataset.mode === 'takeout') {
    var typeEl = document.getElementById('order-type');
    if (typeEl) typeEl.value = 'Takeaway';
  }
  var typeEl = document.getElementById('order-type');
  var tokenEl = document.getElementById('table-token');
  if (typeEl && typeEl.value === 'Dine-in' && document.body.dataset.mode !== 'takeout' && tokenEl && !tokenEl.value) {
    e.preventDefault();
    openTablePicker();
    toast('Pick your table first — or switch to Take-out.');
  }
});
document.getElementById('tq-search')?.addEventListener('input', applyFilters);

/* ===== live availability: cards, the item page and the rail stay current ===== */
function refreshAvailability() {
  fetch('menu_status.php', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
    availability = data.products || {};
    var outBecameAvailable = false;
    document.querySelectorAll('.tq-card[data-basekey]').forEach(function (card) {
      var vs = JSON.parse(card.dataset.variants || '[]');
      vs.forEach(function (v) {
        v.avail = availability[v.id] === undefined ? v.avail : availability[v.id] === 1;
      });
      var anyAvail = vs.some(function (x) { return x.avail; });
      card.dataset.avail = anyAvail ? '1' : '0';
      card.classList.toggle('tq-sold', !anyAvail);
      var soldBadge = card.querySelector('.tq-soldbadge');
      if (!anyAvail && !soldBadge) {
        soldBadge = document.createElement('span');
        soldBadge.className = 'tq-soldbadge';
        soldBadge.textContent = 'SOLD OUT';
        card.querySelector('.tq-cardimg').appendChild(soldBadge);
      }
      if (anyAvail && soldBadge) soldBadge.remove();
      // keep the open item page in step with the latest availability
      if (sheet && sheet.key === card.dataset.basekey) {
        sheet.variants = vs;
        var v = sheetVariant();
        if (v && !v.avail) {
          var first = vs.find(function (x) { return x.avail; });
          if (first) { sheet.vid = first.id; toast(sheet.name + ' — ' + v.tag + ' sold out, showing what is available'); }
          else { toast(sheet.name + ' just sold out'); }
        }
        sheetRefresh();
      }
    });
    // A sold-out card in the "currently unavailable" section moves back into the
    // live grid as soon as staff mark it available — no manual reload needed.
    var liveGrid = document.getElementById('tq-rows');
    document.querySelectorAll('#tq-out .tq-card[data-basekey]').forEach(function (card) {
      var vs = JSON.parse(card.dataset.variants || '[]');
      vs.forEach(function (v) {
        v.avail = availability[v.id] === undefined ? v.avail : availability[v.id] === 1;
      });
      if (!vs.some(function (x) { return x.avail; })) return;
      card.dataset.variants = JSON.stringify(vs);
      card.dataset.avail = '1';
      card.classList.remove('tq-sold');
      var soldBadge = card.querySelector('.tq-soldbadge');
      if (soldBadge) soldBadge.remove();
      if (liveGrid && card.parentNode !== liveGrid) liveGrid.appendChild(card);
      outBecameAvailable = true;
    });
    if (outBecameAvailable) {
      var outWrap = document.getElementById('tq-out');
      if (outWrap && !outWrap.querySelector('.tq-card')) {
        var secLabel = outWrap.previousElementSibling;
        if (secLabel && secLabel.classList.contains('tq-seclab')) secLabel.remove();
        outWrap.remove();
      }
      applyFilters();
    }
    cart.forEach(function (line) {
      var availNow = availability[line.id] === undefined ? true : availability[line.id] === 1;
      if (!availNow && !line.warned) { line.warned = true; toast(line.name + ' just sold out — remove it from your order.'); }
    });
  }).catch(function () { /* offline — retry next tick */ });
}
setInterval(refreshAvailability, 20000);

/* ===== Table anchoring + live order alerts (unchanged mechanics) ===== */
var TABLE_KEY = 'dailycup_table';
var MY_ORDERS_KEY = 'dailycup_my_orders';
var tableToken = '';
var activeTables = [];
(function () {
  // The server only marks the body with a token after validating it against an
  // active table. localStorage can outlive a deleted/deactivated table, so it is
  // accepted only when that table is still in this page's active table list.
  var serverToken = document.body.getAttribute('data-table-token') || '';
  document.querySelectorAll('#table-grid .tq-tableopt').forEach(function (b) {
    activeTables.push({ token: b.dataset.token, label: b.dataset.label || b.textContent.trim() });
  });
  if (serverToken) {
    tableToken = serverToken;
  } else {
    var stored = '';
    try { stored = localStorage.getItem(TABLE_KEY) || ''; } catch (e) {}
    var known = activeTables.some(function (t) { return t.token === stored; });
    if (stored && known) tableToken = stored;
    else if (stored) { try { localStorage.removeItem(TABLE_KEY); } catch (e) {} }
  }
  if (tableToken) {
    try { localStorage.setItem(TABLE_KEY, tableToken); } catch (e) {}
    var hidden = document.getElementById('table-token');
    if (hidden) hidden.value = tableToken;
    var pick = document.getElementById('tq-tablepick');
    var knownTable = activeTables.find(function (t) { return t.token === tableToken; });
    if (pick && knownTable) pick.textContent = displayTable(knownTable.label);
  }
})();

/* ===== table picker for customers who joined WiFi but never scanned a table QR ===== */
function openTablePicker() {
  var modal = document.getElementById('table-modal');
  if (modal) modal.classList.add('show');
}
function hideTablePicker() {
  var modal = document.getElementById('table-modal');
  if (modal) modal.classList.remove('show');
  try { sessionStorage.setItem('tq_table_dismissed', '1'); } catch (e) {}
}
function selectTable(token) {
  if (!/^[a-f0-9]{16}$/.test(token || '')) return;
  try {
    localStorage.setItem(TABLE_KEY, token);
    localStorage.setItem(ORDER_TYPE_KEY, 'Dine-in');
  } catch (e) {}
  location.href = '?t=' + encodeURIComponent(token);
}
function chooseTakeout() {
  setOrderType('Takeaway');
  hideTablePicker();
  toast('Take-out selected — you can change it in your order.');
}
(function initTablePicker() {
  if (document.body.dataset.mode === 'takeout') return;
  var modal = document.getElementById('table-modal');
  if (!modal || tableToken || currentOrderType() === 'Takeaway') return;
  var dismissed = false;
  try { dismissed = sessionStorage.getItem('tq_table_dismissed') === '1'; } catch (e) {}
  if (!dismissed) setTimeout(openTablePicker, 350);
})();
(function initOrderType() {
  if (currentOrderType() === 'Takeaway') setOrderType('Takeaway');
})();

function myOrders() {
  try { return JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || '[]') || []; } catch (e) { return []; }
}
function rememberOrder(num) {
  if (!num) return;
  var list = myOrders().filter(function (x) { return x !== num; });
  list.unshift(num);
  try { localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list.slice(0, 10))); } catch (e) {}
}

// A successful order redirects back with ?order=NUMBER — remember it, then
// jump straight to the live status page.
(function () {
  var num = new URLSearchParams(location.search).get('order');
  if (num) {
    rememberOrder(num);
    // Save the last order for the "Your usual" reorder banner.
    try {
      localStorage.setItem('dailycup_last_order', JSON.stringify({
        savedAt: Date.now(),
        items: cart.map(function (x) {
          return { id: x.id, name: x.name, qty: x.qty, size: x.size || null, sweetness: x.sweetness != null ? x.sweetness : null };
        })
      }));
    } catch (e) { /* private mode */ }
    // The order is safely in MySQL now; keep it from being submitted twice.
    cart = [];
    try { localStorage.removeItem(CART_KEY); } catch (e) {}
    location.replace('order_status.php?number=' + encodeURIComponent(num));
  }
})();

var interacted = false;
document.addEventListener('pointerdown', function once() {
  interacted = true;
  document.removeEventListener('pointerdown', once);
});
function alertBeep() {
  if (!interacted) return;
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
  } catch (e) { /* audio blocked — silent fallback */ }
}
function alertStatusChange(num, status) {
  var msg = status === 'Ready' ? 'Order ' + num + ' is READY — please pick it up!'
    : status === 'Completed' ? 'Order ' + num + ' completed. Thank you!'
    : status === 'Cancelled' ? 'Order ' + num + ' was cancelled — please see our staff.'
    : 'Order ' + num + ' is now ' + status;
  toast(msg);
  alertBeep();
  if (status === 'Ready' && navigator.vibrate) { try { navigator.vibrate([250, 100, 250]); } catch (e) {} }
}
function chipStatusClass(status) {
  return { Pending: 'st-pending', Preparing: 'st-preparing', Ready: 'st-ready', Completed: 'st-completed', Cancelled: 'st-cancelled' }[status] || '';
}
var orderStatusCache = {};
function refreshOrderFeed() {
  var nums = myOrders().join(',');
  if (!tableToken && !nums) return;
  fetch('order_feed.php?t=' + encodeURIComponent(tableToken) + '&n=' + encodeURIComponent(nums))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var wrap = document.getElementById('order-chips');
      if (!wrap) return;
      var orders = data.orders || [];
      orders.forEach(function (o) {
        if (orderStatusCache[o.number] && orderStatusCache[o.number] !== o.status) alertStatusChange(o.number, o.status);
      });
      var active = orders.filter(function (o) { return o.status !== 'Completed' && o.status !== 'Cancelled'; });
      wrap.innerHTML = '';
      if (data.table) {
        var lbl = document.createElement('span');
        lbl.className = 'chip-label';
        lbl.textContent = data.table.label;
        wrap.appendChild(lbl);
        var headTable = document.getElementById('tq-table');
        if (headTable) headTable.textContent = displayTable(data.table.label);
      }
      active.forEach(function (o) {
        var a = document.createElement('a');
        a.className = 'order-chip';
        a.href = 'order_status.php?number=' + encodeURIComponent(o.number);
        a.title = o.items || '';
        a.innerHTML = '<b>' + escapeHtml(o.number) + '</b> <span class="status ' + chipStatusClass(o.status) + '">' + escapeHtml(o.status) + '</span>';
        wrap.appendChild(a);
      });
      wrap.hidden = active.length === 0;
      orders.forEach(function (o) { orderStatusCache[o.number] = o.status; });
    }).catch(function () { /* network hiccup — retry next tick */ });
}
setInterval(function () { if (document.visibilityState === 'visible') refreshOrderFeed(); }, 15000);
refreshOrderFeed();

syncCartUI();
refreshAvailability();

/* ===== F2-01: "Your usual" reorder banner ===== */
(function initLastOrder() {
  var LAST_ORDER_KEY = 'dailycup_last_order';
  var saved;
  try {
    var raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch (e) { return; }
  if (!saved || !saved.savedAt || !Array.isArray(saved.items) || !saved.items.length) return;

  // Expire after 180 days.
  if (Date.now() - saved.savedAt > 15552000000) {
    try { localStorage.removeItem(LAST_ORDER_KEY); } catch (e) {}
    return;
  }

  // Once dismissed per session, do not show again.
  try { if (sessionStorage.getItem('tq_usual_dismissed') === '1') return; } catch (e) {}

  var names = saved.items.map(function (x) { return escapeHtml(x.name); }).join(', ');
  var banner = document.createElement('div');
  banner.className = 'tq-usual-banner';
  banner.innerHTML =
    '<span class="tq-usual-label">Your usual: <em>' + names + '</em></span>' +
    '<button type="button" class="tq-usual-add" id="tq-usual-add">Add again</button>' +
    '<button type="button" class="tq-usual-close" id="tq-usual-close" aria-label="Dismiss">✕</button>';

  var menu = document.getElementById('menu');
  if (menu) menu.parentNode.insertBefore(banner, menu);
  else document.body.appendChild(banner);

  document.getElementById('tq-usual-close').addEventListener('click', function () {
    try { sessionStorage.setItem('tq_usual_dismissed', '1'); } catch (e) {}
    banner.remove();
  });

  document.getElementById('tq-usual-add').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'Adding…';

    var ids = saved.items.map(function (x) { return x.id; });
    fetch('last_order_check.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    }).then(function (r) {
      if (!r.ok) throw new Error('server error');
      return r.json();
    }).then(function (data) {
      var products = data.products || {};
      saved.items.forEach(function (item) {
        var info = products[String(item.id)];
        if (!info || !info.available) {
          toast((item.name || 'An item') + ' is no longer available');
          return;
        }
        var qty = Math.max(1, Math.min(30, item.qty || 1));
        // Use server-returned price, never the stored one.
        var serverPrice = info.price;
        var size = item.size || null;
        var sweetness = item.sweetness != null ? item.sweetness : null;
        // Size delta for display — server price is the base price.
        var sizeDelta = 0;
        if (size === 'Small') sizeDelta = -15;
        else if (size === 'Large') sizeDelta = 20;

        var line = cart.find(function (x) {
          return x.id === item.id && x.size === size && x.sweetness === sweetness;
        });
        if (line) {
          line.qty = Math.min(30, line.qty + qty);
        } else {
          var entry = { id: item.id, name: item.name, price: serverPrice, qty: qty, tags: '' };
          if (size !== null) { entry.size = size; entry.sizeDelta = sizeDelta; }
          if (sweetness !== null) { entry.sweetness = sweetness; }
          cart.push(entry);
        }
      });
      saveCart();
      syncCartUI();
      banner.remove();
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = 'Add again';
      toast('Could not reach the server. Please try again.');
    });
  });
})();
