import { e } from './db.js';

/**
 * Produces the full admin page HTML.
 * @param {object} session  - { username, role }
 * @param {string} pageTitle
 * @param {string} shopName
 * @param {string} currentPath - e.g. '/admin/dashboard'
 * @param {string} bodyHtml
 * @param {string} csrfToken
 */
export function adminLayout(session, pageTitle, shopName, currentPath, bodyHtml, csrfToken) {
  const isManager = session && session.role === 'admin';
  const username = session ? session.username : '';
  const roleLabel = isManager ? 'Admin' : 'Staff';

  const navLinks = isManager
    ? [
        ['/admin/orders', 'Orders'],
        ['/admin/products', 'Products'],
        ['/admin/tables', 'Tables'],
        ['/admin/settings', 'Settings'],
      ]
    : [['/admin/orders', 'Orders']];

  const homeHref = '/admin/orders';

  const navHtml = navLinks.map(([href, label]) => {
    const active = currentPath === href || currentPath.startsWith(href + '?') ? ' class="active"' : '';
    return `<a href="${e(href)}"${active}>${e(label)}</a>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#261c13"><meta name="robots" content="noindex"><title>${e(pageTitle)} · ${e(shopName)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/style.css"><script src="/assets/admin.js" defer></script></head><body>
<header class="topbar"><a class="brand" href="${e(homeHref)}">${e(shopName.toUpperCase())} <small>${e(roleLabel.toUpperCase())}</small></a><nav>
${navHtml}
<a href="/client/" target="_blank">Client menu ↗</a>
<span class="staff-chip" title="Signed in as ${e(username)}">${e(username)} · ${e(roleLabel)}</span>
<form method="post" action="/admin/logout" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><button type="submit" class="nav-logout">Logout</button></form>
</nav></header><main class="container">
${bodyHtml}
</main><footer class="footer">${e(shopName)} · Menu management</footer></body></html>`;
}
