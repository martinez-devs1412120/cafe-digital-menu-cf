// Admin area helpers: live orders board, status auto-submit, delete confirms.
(function () {
  'use strict';

  function bindAutoSubmit(root) {
    root.querySelectorAll('select.auto-submit').forEach(function (sel) {
      if (sel.dataset.bound === '1') return;
      sel.dataset.bound = '1';
      sel.addEventListener('change', function () { sel.form.submit(); });
    });
  }

  // Status selects submit their form as soon as a new status is picked.
  bindAutoSubmit(document);

  // Confirm before destructive POSTs.
  document.querySelectorAll('form.confirm-delete').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm('Delete this item? This cannot be undone.')) e.preventDefault();
    });
  });

  // Live orders board: poll the table fragment every 10s while the tab is visible.
  var tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  var seen = new Set();
  var updated = document.getElementById('orders-updated');
  var baseTitle = document.title;
  var audioCtx = null;

  function newOrderBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime;
      [660, 990].forEach(function (freq, i) {
        var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.14, t + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t + i * 0.16); osc.stop(t + i * 0.16 + 0.16);
      });
    } catch (e) { /* audio blocked — the NEW row is still visible */ }
  }

  function markSeen() {
    tbody.querySelectorAll('tr[data-order-id]').forEach(function (tr) {
      seen.add(tr.getAttribute('data-order-id'));
    });
  }
  function stamp() {
    if (updated) updated.textContent = 'Live — updated ' + new Date().toLocaleTimeString();
  }
  // Staff may be reviewing page 2 or 3; new orders always land on page 1, so the
  // visible rows can't show them. The count header knows, though — surface a
  // jump link instead of silently staying blind.
  var searchParams = new URLSearchParams(location.search);
  var onPageOne = !searchParams.get('page') || searchParams.get('page') === '1';
  var lastAllCount = null;
  function nudgeNewOrders(counts) {
    if (onPageOne || !updated || !counts) return;
    var all = Number(counts.all);
    if (lastAllCount !== null && all > lastAllCount) {
      searchParams.delete('page');
      var back = searchParams.toString();
      updated.innerHTML = '<a class="text-link" href="orders' + (back ? '?' + back : '') + '">↑ New orders arrived — back to page 1</a>';
    }
    lastAllCount = all;
  }
  function poll() {
    if (document.visibilityState === 'hidden') return;
    // Never yank the board out from under a staff member changing a status.
    if (document.activeElement && tbody.contains(document.activeElement)) return;
    var countHeader = null;
    fetch('orders_fragment' + location.search, { headers: { 'X-Requested-With': 'fetch' }, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { window.location.href = 'login'; throw new Error('login'); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        countHeader = r.headers.get('X-Order-Counts');
        return r.text();
      })
      .then(function (html) {
        tbody.innerHTML = html;
        var counts = null;
        if (countHeader) {
          try {
            counts = JSON.parse(countHeader);
            Object.keys(counts).forEach(function (key) {
              var el = document.querySelector('[data-count="' + key + '"]');
              if (el) el.textContent = counts[key];
            });
          } catch (e) { /* count header is optional */ }
        }
        var fresh = 0;
        tbody.querySelectorAll('tr[data-order-id]').forEach(function (tr) {
          if (!seen.has(tr.getAttribute('data-order-id'))) {
            tr.classList.add('row-new');
            fresh++;
            setTimeout(function () { tr.classList.remove('row-new'); }, 6000);
          }
        });
        markSeen();
        bindAutoSubmit(tbody);
        stamp();
        nudgeNewOrders(counts);
        if (fresh > 0) {
          newOrderBeep();
          document.title = '(' + fresh + ' new) ' + baseTitle;
          setTimeout(function () { if (document.title.indexOf('new)') !== -1) document.title = baseTitle; }, 15000);
        }
      })
      .catch(function () { /* network hiccup — try again next tick */ });
  }
  markSeen();
  stamp();
  setInterval(poll, 10000);
})();
