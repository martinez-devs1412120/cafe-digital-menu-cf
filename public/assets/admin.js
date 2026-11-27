// Admin area helpers: live order board polling, delete confirms.
(function () {
  'use strict';

  // Confirm before destructive POSTs.
  document.querySelectorAll('form.confirm-delete').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm('Delete this item? This cannot be undone.')) e.preventDefault();
    });
  });

  // Live orders board: poll the board fragment every 10s while the tab is visible.
  var board = document.getElementById('oboard');
  if (!board) return;
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
    } catch (e) { /* audio blocked — the NEW card is still visible */ }
  }

  function markSeen() {
    board.querySelectorAll('.bcard[data-order-id]').forEach(function (card) {
      seen.add(card.getAttribute('data-order-id'));
    });
  }
  function stamp() {
    if (updated) updated.textContent = 'Live — updated ' + new Date().toLocaleTimeString();
  }
  function poll() {
    if (document.visibilityState === 'hidden') return;
    // Never yank the board out from under a staff member tapping a button.
    if (document.activeElement && board.contains(document.activeElement)) return;
    var countHeader = null;
    fetch('orders_fragment' + location.search, { headers: { 'X-Requested-With': 'fetch' }, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { window.location.href = 'login'; throw new Error('login'); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        countHeader = r.headers.get('X-Order-Counts');
        return r.text();
      })
      .then(function (html) {
        board.innerHTML = html;
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
        board.querySelectorAll('.bcard[data-order-id]').forEach(function (card) {
          if (!seen.has(card.getAttribute('data-order-id'))) {
            card.classList.add('bcard-new');
            fresh++;
            setTimeout(function () { card.classList.remove('bcard-new'); }, 6000);
          }
        });
        markSeen();
        stamp();
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
