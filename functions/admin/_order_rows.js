import { ORDER_STATUSES, money, statusClass, e } from '../_shared/db.js';

export function renderOrderRows(orders, itemsByOrder, csrfToken) {
  if (!orders.length) {
    return `<tr><td colspan="7"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No orders found.</p></div></td></tr>`;
  }
  return orders.map(o => {
    const items = itemsByOrder[o.id] || [];
    const tableCol = o.order_type + (o.table_label ? ' · ' + o.table_label : (o.table_number ? ' · Table ' + o.table_number : ''));
    const statusOptions = ORDER_STATUSES.map(st => `<option${o.status === st ? ' selected' : ''}>${st}</option>`).join('');
    const itemsHtml = items.map(it => {
      const display = e(it.product_name) + (it.size ? ' · ' + e(it.size) : '') + (it.sweetness && it.sweetness !== '100%' ? ' · ' + e(it.sweetness) + ' sweet' : '');
      const allergenNote = it.allergen_tags ? `<br><span class="item-allergens">⚠ ${e(it.allergen_tags)}</span>` : '';
      return `${e(String(it.quantity))} × ${display}${allergenNote}<br>`;
    }).join('');
    return `<tr data-order-id="${o.id}"><td><strong>${e(o.order_number)}</strong></td><td>${e(o.customer_name)}</td><td>${e(tableCol)}</td><td>${money(o.total)}</td><td>${e(o.created_at)}</td><td><form method="post" class="status-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${o.id}"><select name="status" class="auto-submit">${statusOptions}</select><button class="small-btn">Update</button></form> <span class="status ${statusClass(o.status)}">${e(o.status)}</span></td><td>${itemsHtml}</td></tr>`;
  }).join('');
}
