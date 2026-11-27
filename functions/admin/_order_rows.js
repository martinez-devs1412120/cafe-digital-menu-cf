import { money, e } from '../_shared/db.js';

// Kitchen-display board: each active order is a card in its status column,
// with ONE button that moves it to the next stage. Replaces the old
// dropdown-per-row table.
const NEXT_STATUS = { Pending: 'Preparing', Preparing: 'Ready', Ready: 'Completed' };
const ACTION_LABEL = { Pending: 'Start preparing', Preparing: 'Mark ready', Ready: 'Complete order' };
const ACTION_CLASS = { Pending: 'bact-start', Preparing: 'bact-ready', Ready: 'bact-done' };

function ageChip(created_at) {
  const t = Date.parse(String(created_at).replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const label = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm';
  const warn = mins >= 10 ? ' warn' : '';
  return `<span class="bcard-age${warn}" title="Placed ${e(String(created_at))} UTC">${label}</span>`;
}

function orderCard(o, itemsByOrder, csrfToken) {
  const items = itemsByOrder[o.id] || [];
  const tableCol = o.table_label ? e(o.table_label) : (o.table_number ? 'Table ' + e(String(o.table_number)) : '');
  const meta = [e(o.customer_name || 'Customer'), e(o.order_type || ''), tableCol].filter(Boolean).join(' · ');
  const itemsHtml = items.map(it => {
    const display = e(it.product_name) + (it.size ? ' · ' + e(it.size) : '') + (it.sweetness && it.sweetness !== '100%' ? ' · ' + e(it.sweetness) + ' sweet' : '');
    const allergenNote = it.allergen_tags ? `<span class="item-allergens">⚠ ${e(it.allergen_tags)}</span>` : '';
    return `<li>${e(String(it.quantity))} × ${display}${allergenNote}</li>`;
  }).join('');
  const next = NEXT_STATUS[o.status];
  const actionHtml = next ? `
  <form method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${o.id}"><input type="hidden" name="status" value="${next}">
    <button class="baction ${ACTION_CLASS[o.status]}" type="submit">${ACTION_LABEL[o.status]}</button>
  </form>` : '';
  const cancelHtml = (o.status === 'Pending' || o.status === 'Preparing') ? `
  <form method="post" class="bcancel-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${o.id}"><input type="hidden" name="status" value="Cancelled">
    <button class="bcancel" type="submit">Cancel order</button>
  </form>` : '';
  return `<article class="bcard" data-order-id="${o.id}">
  <div class="bcard-top"><strong class="bcard-num">${e(o.order_number)}</strong>${ageChip(o.created_at)}</div>
  <div class="bcard-meta">${meta}</div>
  ${items.length ? `<ul class="bcard-items">${itemsHtml}</ul>` : ''}
  <div class="bcard-total">${money(o.total)}</div>
  ${actionHtml}
  ${cancelHtml}
</article>`;
}

export function renderOrderBoard(orders, itemsByOrder, csrfToken, counts) {
  const columns = ['Pending', 'Preparing', 'Ready'].map(st => {
    const colOrders = orders
      .filter(o => o.status === st)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); // oldest first — next up is always on top
    const cards = colOrders.map(o => orderCard(o, itemsByOrder, csrfToken)).join('');
    const body = cards || '<div class="bcol-empty">Nothing here</div>';
    return `<section class="bcol"><header class="bcol-head"><h2>${st}</h2><b data-count="${st}">${counts ? (counts[st] || 0) : colOrders.length}</b></header><div class="bcol-cards">${body}</div></section>`;
  }).join('');
  return columns;
}

export function renderOrderHistory(history) {
  if (!history.length) return '<p class="muted small-note" style="margin:10px 2px">Nothing completed or cancelled today.</p>';
  return history.map(o => `<div class="bhist-row"><span><strong>${e(o.order_number)}</strong> · ${e(o.customer_name || 'Customer')}</span><span><span class="status ${o.status === 'Completed' ? 'st-completed' : 'st-cancelled'}">${e(o.status)}</span> ${money(o.total)}</span></div>`).join('');
}
