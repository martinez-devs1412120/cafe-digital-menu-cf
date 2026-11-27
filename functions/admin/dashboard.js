import { getSetting, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie } from '../_shared/auth.js';

export async function onRequest(ctx) {
  try {
    const { request, env } = ctx;
    const db = env.sparks_cafe_db;
    const secret = env.SESSION_SECRET;

    const token = getSessionFromCookie(request);
    const session = token ? await verifySession(token, secret) : null;
    if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);

    const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');

    return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Dashboard · ${e(shopName)}</title>
<link rel="stylesheet" href="/assets/style.css"></head><body>
<header class="topbar"><a class="brand" href="/admin/dashboard">${e(shopName)} <small>ADMIN</small></a>
<nav>
<a href="/admin/dashboard" class="active">Dashboard</a>
<a href="/admin/products">Products</a>
<a href="/admin/categories">Categories</a>
<a href="/admin/tables">Tables</a>
<a href="/admin/orders">Orders</a>
<a href="/admin/settings">Settings</a>
<a href="/client/" target="_blank">Client menu ↗</a>
<span class="staff-chip">${e(session.username)} · Admin</span>
</nav></header>
<main class="container">
<div class="page-heading"><div><p class="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p class="muted">Welcome back, ${e(session.username)}.</p></div></div>
<div class="panel"><p>Dashboard is loading. <a href="/admin/orders">Go to Orders</a></p></div>
</main></body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=utf-8' }
    });
  } catch(err) {
    return new Response('Dashboard error: ' + err.name + ': ' + err.message + '\n' + err.stack, {
      status: 500, headers: { 'Content-Type': 'text/plain' }
    });
  }
}
