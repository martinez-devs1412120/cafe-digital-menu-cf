var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _shared/db.js
var ORDER_STATUSES = ["Pending", "Preparing", "Ready", "Completed", "Cancelled"];
async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const r = await (params.length ? stmt.bind(...params) : stmt).all();
  return r.results || [];
}
__name(queryAll, "queryAll");
async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return await (params.length ? stmt.bind(...params) : stmt).first();
}
__name(queryOne, "queryOne");
async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return await (params.length ? stmt.bind(...params) : stmt).run();
}
__name(run, "run");
async function settingsAll(db) {
  const rows = await queryAll(db, "SELECT skey, svalue FROM settings");
  const o = {};
  for (const r of rows) o[r.skey] = r.svalue || "";
  return o;
}
__name(settingsAll, "settingsAll");
async function getSetting(db, key, def = "") {
  const all = await settingsAll(db);
  return all[key] || def;
}
__name(getSetting, "getSetting");
async function settingSet(db, key, value) {
  await run(db, "INSERT OR REPLACE INTO settings(skey,svalue) VALUES(?,?)", [key, value]);
}
__name(settingSet, "settingSet");
function money(n) {
  return "\u20B1" + Number(n).toFixed(2);
}
__name(money, "money");
function statusClass(s) {
  return { Pending: "st-pending", Preparing: "st-preparing", Ready: "st-ready", Completed: "st-completed", Cancelled: "st-cancelled" }[s] || "";
}
__name(statusClass, "statusClass");
function productImage(image, category) {
  if (image) return "https://sparks.page.gd/uploads/" + encodeURIComponent(image);
  return {
    Coffee: "/assets/placeholders/coffee.svg",
    "Non-Coffee": "/assets/placeholders/noncoffee.svg",
    Food: "/assets/placeholders/food.svg",
    "Add-ons": "/assets/placeholders/addon.svg"
  }[category] || "/assets/coffee-placeholder.svg";
}
__name(productImage, "productImage");
function e(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
__name(e, "e");
async function tableForToken(db, token) {
  if (!token || !/^[a-f0-9]{16}$/.test(token)) return null;
  return await queryOne(db, "SELECT id, label, token FROM restaurant_tables WHERE token = ? AND is_active = 1", [token]);
}
__name(tableForToken, "tableForToken");
function tableDisplay(label) {
  label = (label || "").trim();
  if (!label) return "TABLE";
  if (/^(table|tbl)\b/i.test(label)) return label.toUpperCase();
  return "TABLE " + label.toUpperCase();
}
__name(tableDisplay, "tableDisplay");
function tableShortLabel(label) {
  label = (label || "").trim();
  const m = label.match(/^table\s+(.+)$/i);
  if (m) return m[1];
  return label;
}
__name(tableShortLabel, "tableShortLabel");
async function fetchOrdersPage(db, status = "all", q = "", perPage = 20, page = 1) {
  const where = [];
  const params = [];
  if (status !== "all") {
    where.push("o.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(o.order_number LIKE ? OR o.customer_name LIKE ?)");
    params.push("%" + q + "%", "%" + q + "%");
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const countRow = await queryOne(db, `SELECT COUNT(*) AS n FROM orders o ${whereSql}`, params);
  const total = countRow ? countRow.n || 0 : 0;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  page = Math.min(Math.max(1, page), pages);
  const orders = await queryAll(
    db,
    `SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params
  );
  const itemsByOrder = {};
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const inPlaceholders = ids.map(() => "?").join(",");
    const items = await queryAll(
      db,
      `SELECT oi.order_id, oi.product_name, oi.quantity, oi.price, oi.sweetness, oi.size, oi.size_price_delta, p.allergen_tags FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (${inPlaceholders}) ORDER BY oi.id`,
      ids
    );
    for (const it of items) {
      const oid = it.order_id;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }
  }
  return [orders, itemsByOrder, total, pages];
}
__name(fetchOrdersPage, "fetchOrdersPage");
async function orderStatusCounts(db, q = "") {
  const counts = { all: 0 };
  for (const st of ORDER_STATUSES) counts[st] = 0;
  let sql = "SELECT status, COUNT(*) AS n FROM orders";
  const params = [];
  if (q) {
    sql += " WHERE (order_number LIKE ? OR customer_name LIKE ?)";
    params.push("%" + q + "%", "%" + q + "%");
  }
  sql += " GROUP BY status";
  const rows = await queryAll(db, sql, params);
  for (const r of rows) {
    counts[r.status] = r.n || 0;
    counts.all += r.n || 0;
  }
  return counts;
}
__name(orderStatusCounts, "orderStatusCounts");
function ordersQs(status, q, page, base = "/admin/orders") {
  const p = new URLSearchParams();
  if (status !== "all") p.set("status", status);
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return base + (qs ? "?" + qs : "");
}
__name(ordersQs, "ordersQs");

// _shared/auth.js
var SESSION_EXPIRY_MS = 8 * 60 * 60 * 1e3;
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
__name(b64url, "b64url");
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
__name(b64urlDecode, "b64urlDecode");
async function signSession(payload, secret) {
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return payloadB64 + "." + b64url(sig);
}
__name(signSession, "signSession");
async function verifySession(token, secret) {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  let valid;
  try {
    valid = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(payloadB64));
  } catch {
    return null;
  }
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
__name(verifySession, "verifySession");
function newSessionExp() {
  return Date.now() + SESSION_EXPIRY_MS;
}
__name(newSessionExp, "newSessionExp");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 1e5 },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:sha256:100000:${saltHex}:${hashHex}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 5) return false;
  const iterations = parseInt(parts[2]);
  const salt = new Uint8Array(parts[3].match(/.{2}/g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  const computed = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === parts[4];
}
__name(verifyPassword, "verifyPassword");
function getSessionFromCookie(request) {
  const h = request.headers.get("Cookie") || "";
  const m = h.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}
__name(getSessionFromCookie, "getSessionFromCookie");

// _shared/csrf.js
function generateCsrf() {
  return crypto.randomUUID().replace(/-/g, "");
}
__name(generateCsrf, "generateCsrf");
function getCsrfFromCookie(request) {
  const h = request.headers.get("Cookie") || "";
  const m = h.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? m[1] : null;
}
__name(getCsrfFromCookie, "getCsrfFromCookie");
function verifyCsrf(request, formToken) {
  const c = getCsrfFromCookie(request);
  return !!(c && formToken && c === formToken);
}
__name(verifyCsrf, "verifyCsrf");
function setCsrfCookie(headers, token) {
  headers.append("Set-Cookie", `csrf_token=${token}; Path=/; SameSite=Lax; HttpOnly`);
}
__name(setCsrfCookie, "setCsrfCookie");

// admin/login.js
function clientIp(request) {
  return (request.headers.get("CF-Connecting-IP") || (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() || "0.0.0.0").substring(0, 45);
}
__name(clientIp, "clientIp");
async function throttleWait(db, ip, username) {
  const row = await queryOne(
    db,
    "SELECT MAX(CASE WHEN locked_until > datetime('now') THEN CAST((julianday(locked_until) - julianday('now')) * 86400 AS INTEGER) ELSE 0 END) AS wait FROM login_throttle WHERE ip=? AND username IN (?,?) AND locked_until > datetime('now')",
    [ip, username, ""]
  );
  return row ? parseInt(row.wait) || 0 : 0;
}
__name(throttleWait, "throttleWait");
async function throttleFail(db, ip, username) {
  await run(
    db,
    "UPDATE login_throttle SET attempts = 0, locked_until = NULL WHERE ip=? AND username IN (?,?) AND locked_until IS NOT NULL AND locked_until <= datetime('now')",
    [ip, username, ""]
  );
  await run(
    db,
    "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
    [ip, username]
  );
  await run(
    db,
    "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
    [ip, ""]
  );
  await run(
    db,
    "UPDATE login_throttle SET locked_until = datetime('now','+15 minutes') WHERE ip=? AND ((username = ? AND attempts >= 5) OR (username = '' AND attempts >= 30)) AND (locked_until IS NULL OR locked_until <= datetime('now'))",
    [ip, username]
  );
}
__name(throttleFail, "throttleFail");
async function throttleClear(db, ip, username) {
  await run(db, "DELETE FROM login_throttle WHERE ip=? AND username IN (?,?)", [ip, username, ""]);
}
__name(throttleClear, "throttleClear");
async function onRequestGet(ctx) {
  try {
    const { request, env } = ctx;
    if (!env.sparks_cafe_db) return new Response("DB binding missing: sparks_cafe_db", { status: 500 });
    if (!env.SESSION_SECRET) return new Response("Secret missing: SESSION_SECRET", { status: 500 });
    const db = env.sparks_cafe_db;
    const secret = env.SESSION_SECRET;
    const token = getSessionFromCookie(request);
    const session = token ? await verifySession(token, secret) : null;
    if (session) {
      return Response.redirect(new URL(session.role === "admin" ? "/admin/dashboard" : "/admin/orders", request.url).href, 302);
    }
    const brandName = await getSetting(db, "shop_name", "SPARKS CAFE");
    const csrfToken = generateCsrf();
    const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
    setCsrfCookie(headers, csrfToken);
    const html = loginPageHtml(brandName, csrfToken, "");
    return new Response(html, { headers });
  } catch (err) {
    return new Response("Login GET error: " + err.message + "\n" + err.stack, { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;
    if (!env.sparks_cafe_db) return new Response("DB binding missing", { status: 500 });
    if (!env.SESSION_SECRET) return new Response("Secret missing", { status: 500 });
    const db = env.sparks_cafe_db;
    const secret = env.SESSION_SECRET;
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      const brandName2 = await getSetting(db, "shop_name", "SPARKS CAFE");
      const csrfToken2 = generateCsrf();
      const headers2 = new Headers({ "Content-Type": "text/html;charset=utf-8" });
      setCsrfCookie(headers2, csrfToken2);
      return new Response(loginPageHtml(brandName2, csrfToken2, "Invalid form token. Please try again."), { headers: headers2 });
    }
    const username = (formData.get("username") || "").trim().substring(0, 60);
    const password = formData.get("password") || "";
    const ip = clientIp(request);
    const brandName = await getSetting(db, "shop_name", "SPARKS CAFE");
    const wait = await throttleWait(db, ip, username);
    if (wait > 0) {
      const csrfToken2 = generateCsrf();
      const headers2 = new Headers({ "Content-Type": "text/html;charset=utf-8" });
      setCsrfCookie(headers2, csrfToken2);
      const mins = Math.ceil(wait / 60);
      return new Response(loginPageHtml(brandName, csrfToken2, `Too many failed attempts. Try again in ${mins} minute(s).`), { headers: headers2 });
    }
    const admin = await queryOne(db, "SELECT * FROM admins WHERE username = ?", [username]);
    let passwordOk = false;
    if (admin) {
      const hash = String(admin.password_hash || "");
      if (hash.startsWith("$2")) {
        const csrfToken2 = generateCsrf();
        const headers2 = new Headers({ "Content-Type": "text/html;charset=utf-8" });
        setCsrfCookie(headers2, csrfToken2);
        return new Response(loginPageHtml(brandName, csrfToken2, "Please use the /admin/setup endpoint to set a new password for cloud mode."), { headers: headers2 });
      }
      passwordOk = await verifyPassword(password, hash);
    }
    if (admin && passwordOk) {
      await throttleClear(db, ip, username);
      const payload = {
        admin_id: parseInt(admin.id),
        username: String(admin.username),
        role: admin.role === "staff" ? "staff" : "admin",
        exp: newSessionExp()
      };
      const sessionToken = await signSession(payload, secret);
      const redirectUrl = payload.role === "admin" ? "/admin/dashboard" : "/admin/orders";
      const headers2 = new Headers();
      headers2.set("Location", new URL(redirectUrl, request.url).href);
      headers2.append("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
      return new Response(null, { status: 302, headers: headers2 });
    }
    await throttleFail(db, ip, username);
    const csrfToken = generateCsrf();
    const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
    setCsrfCookie(headers, csrfToken);
    return new Response(loginPageHtml(brandName, csrfToken, "Incorrect username or password."), { headers });
  } catch (err) {
    return new Response("Login POST error: " + err.message + "\n" + err.stack, { status: 500 });
  }
}
__name(onRequestPost, "onRequestPost");
function loginPageHtml(brandName, csrfToken, error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Staff Login \xB7 ${e(brandName)}</title><link rel="stylesheet" href="/assets/style.css"></head>
<body class="auth-page"><form class="auth-card" method="post"><p class="eyebrow">${e(brandName.toUpperCase())} \xB7 STAFF</p><h1>Welcome back.</h1><p class="muted">Sign in to manage the menu and handle customer orders.</p>
${error ? `<div class="error">${e(error)}</div>` : ""}
<input type="hidden" name="csrf" value="${e(csrfToken)}"><label>Username</label><input name="username" required maxlength="60" autocomplete="username"><label>Password</label><input type="password" name="password" required autocomplete="current-password"><button class="btn" type="submit">Sign in</button><a class="text-link" href="/client/">Open customer menu</a></form></body></html>`;
}
__name(loginPageHtml, "loginPageHtml");

// admin/logout.js
async function onRequestGet2(ctx) {
  return Response.redirect(new URL("/admin/dashboard", ctx.request.url).href, 302);
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost2(ctx) {
  const { request } = ctx;
  const formData = await request.formData();
  const csrfFormToken = formData.get("csrf") || "";
  const headers = new Headers();
  headers.set("Location", new URL("/admin/login", request.url).href);
  headers.append("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}
__name(onRequestPost2, "onRequestPost");

// admin/setup.js
function setupPageHtml(csrfToken, message, count) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Set up admin</title><link rel="stylesheet" href="/assets/style.css"></head>
<body class="auth-page"><form class="auth-card" method="post"><p class="eyebrow">FIRST-TIME SETUP</p><h1>Create admin</h1>
${message ? `<div class="notice">${e(message)}</div>` : ""}
${count > 0 ? `<p>An admin account already exists. Go to <a href="/admin/login">admin login</a>.</p>` : `<input type="hidden" name="csrf" value="${e(csrfToken)}"><label>Username</label><input name="username" required maxlength="60"><label>Password (minimum 8 characters)</label><input type="password" name="password" minlength="8" required><button class="btn" type="submit">Create admin account</button>`}
</form></body></html>`;
}
__name(setupPageHtml, "setupPageHtml");
async function onRequestGet3(ctx) {
  const { env } = ctx;
  const db = env.sparks_cafe_db;
  const countRow = await queryOne(db, "SELECT COUNT(*) AS n FROM admins");
  const count = countRow ? countRow.n || 0 : 0;
  if (count > 0) {
    return new Response("Not found.", { status: 404 });
  }
  const csrfToken = generateCsrf();
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(setupPageHtml(csrfToken, "", 0), { headers });
}
__name(onRequestGet3, "onRequestGet");
async function onRequestPost3(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const countRow = await queryOne(db, "SELECT COUNT(*) AS n FROM admins");
  const count = countRow ? countRow.n || 0 : 0;
  if (count > 0) {
    return new Response("Not found.", { status: 404 });
  }
  const formData = await request.formData();
  const csrfFormToken = formData.get("csrf") || "";
  if (!verifyCsrf(request, csrfFormToken)) {
    const csrfToken = generateCsrf();
    const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
    setCsrfCookie(headers, csrfToken);
    return new Response(setupPageHtml(csrfToken, "Invalid form token. Please try again.", 0), { headers });
  }
  const username = (formData.get("username") || "").trim();
  const password = formData.get("password") || "";
  if (!username || password.length < 8) {
    const csrfToken = generateCsrf();
    const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
    setCsrfCookie(headers, csrfToken);
    return new Response(setupPageHtml(csrfToken, "Enter a username and a password with at least 8 characters.", 0), { headers });
  }
  const hash = await hashPassword(password);
  await run(db, "INSERT INTO admins(username, password_hash, role) VALUES(?,?,'admin')", [username, hash]);
  return new Response(setupPageHtml("", "Admin created. Sign in at /admin/login.", 1), {
    headers: { "Content-Type": "text/html;charset=utf-8" }
  });
}
__name(onRequestPost3, "onRequestPost");

// _shared/layout.js
function adminLayout(session, pageTitle, shopName, currentPath, bodyHtml, csrfToken) {
  const isManager = session && session.role === "admin";
  const username = session ? session.username : "";
  const roleLabel = isManager ? "Admin" : "Staff";
  const navLinks = isManager ? [
    ["/admin/dashboard", "Dashboard"],
    ["/admin/products", "Products"],
    ["/admin/categories", "Categories"],
    ["/admin/tables", "Tables"],
    ["/admin/orders", "Orders"],
    ["/admin/settings", "Settings"]
  ] : [["/admin/orders", "Orders"]];
  const homeHref = isManager ? "/admin/dashboard" : "/admin/orders";
  const navHtml = navLinks.map(([href, label]) => {
    const active = currentPath === href || currentPath.startsWith(href + "?") ? ' class="active"' : "";
    return `<a href="${e(href)}"${active}>${e(label)}</a>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(pageTitle)} \xB7 ${e(shopName)}</title><link rel="stylesheet" href="/assets/style.css"><script src="/assets/admin.js" defer><\/script></head><body>
<header class="topbar"><a class="brand" href="${e(homeHref)}">${e(shopName.toUpperCase())} <small>${e(roleLabel.toUpperCase())}</small></a><nav>
${navHtml}
<a href="/client/" target="_blank">Client menu \u2197</a>
<span class="staff-chip" title="Signed in as ${e(username)}">${e(username)} \xB7 ${e(roleLabel)}</span>
<form method="post" action="/admin/logout" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><button type="submit" class="nav-logout">Logout</button></form>
</nav></header><main class="container">
${bodyHtml}
</main><footer class="footer">${e(shopName)} \xB7 Menu management</footer></body></html>`;
}
__name(adminLayout, "adminLayout");

// admin/categories.js
async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  let error = "";
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL("/admin/categories", request.url).href, 302);
    }
    if (formData.has("delete_id")) {
      const deleteId = parseInt(formData.get("delete_id") || 0);
      if (deleteId > 0) await run(db, "DELETE FROM categories WHERE id = ?", [deleteId]);
      return Response.redirect(new URL("/admin/categories", request.url).href, 302);
    }
    const name = (formData.get("name") || "").trim();
    if (name) {
      try {
        await run(db, "INSERT INTO categories(name) VALUES(?)", [name]);
        return Response.redirect(new URL("/admin/categories", request.url).href, 302);
      } catch (err) {
        const msg = String(err.message || "").toLowerCase();
        if (msg.includes("unique") || msg.includes("constraint")) {
          error = "That category already exists.";
        } else {
          error = "Could not save the category. Please try again.";
        }
      }
    }
  }
  const cats = await queryAll(db, "SELECT c.*, COUNT(p.id) AS product_count FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name");
  const csrfToken = generateCsrf();
  const tableHtml = !cats.length ? `<tr><td colspan="3"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No categories yet. Add one above.</p></div></td></tr>` : cats.map((c) => `<tr><td>${e(c.name)}</td><td>${c.product_count}</td><td><form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="delete_id" value="${c.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join("");
  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">ORGANIZE YOUR MENU</p><h1>Categories</h1></div></div>
<form class="panel inline-form category-form" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input name="name" placeholder="e.g. Signature Coffee" required maxlength="80"><button class="btn" type="submit">Add category</button></form>
${error ? `<p class="error">${e(error)}</p>` : ""}
<div class="panel table-wrap"><table><thead><tr><th>Category</th><th>Products</th><th>Action</th></tr></thead>
${tableHtml}
</table></div>`;
  const html = adminLayout(session, "Categories", shopName, "/admin/categories", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest, "onRequest");

// admin/dashboard.js
async function onRequest2(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  const csrfToken = generateCsrf();
  const productsRow = await queryOne(db, "SELECT COUNT(*) AS n FROM products");
  const products = productsRow ? productsRow.n || 0 : 0;
  const soldRow = await queryOne(db, "SELECT COUNT(*) AS n FROM products WHERE is_available=0");
  const sold = soldRow ? soldRow.n || 0 : 0;
  const pendingRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing','Ready')");
  const pending = pendingRow ? pendingRow.n || 0 : 0;
  const todayRow = await queryOne(db, "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'Cancelled' AND DATE(datetime(created_at,'+8 hours')) = date('now','+8 hours')");
  const today = todayRow ? parseFloat(todayRow.s || 0) : 0;
  const recent = await queryAll(db, "SELECT * FROM orders ORDER BY created_at DESC LIMIT 6");
  const recentHtml = recent.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>${recent.map((o) => `<tr><td>${e(o.order_number)}</td><td>${e(o.customer_name)}</td><td>${money(o.total)}</td><td><span class="status ${statusClass(o.status)}">${e(o.status)}</span></td><td>${e(o.created_at)}</td></tr>`).join("")}</table></div>` : `<div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No orders yet. They will appear here the moment a customer checks out.</p></div>`;
  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">OVERVIEW</p><h1>Good day, ${e(session.username)}.</h1><p class="muted">Here is what is happening at your cafe.</p></div><a class="btn" href="/admin/products">Manage menu</a></div>
<section class="stats"><article class="stat"><span>Menu products</span><strong>${products}</strong></article><article class="stat"><span>Sold out</span><strong>${sold}</strong></article><article class="stat"><span>Active orders</span><strong>${pending}</strong></article><article class="stat"><span title="Sum of every order placed today except cancelled ones. This is order value, not verified income.">Sales today \u24D8</span><strong>${money(today)}</strong></article></section>
<section class="panel"><div class="section-head"><h2>Recent orders</h2><a class="text-link" href="/admin/orders">View all</a></div>
${recentHtml}</section>`;
  const html = adminLayout(session, "Dashboard", shopName, "/admin/dashboard", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest2, "onRequest");

// admin/delete_product.js
async function onRequest3(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  if (request.method !== "POST") {
    return Response.redirect(new URL("/admin/products", request.url).href, 302);
  }
  const formData = await request.formData();
  const csrfFormToken = formData.get("csrf") || "";
  if (!verifyCsrf(request, csrfFormToken)) {
    return Response.redirect(new URL("/admin/products", request.url).href, 302);
  }
  const id = parseInt(formData.get("id") || 0);
  if (id > 0) {
    await run(db, "DELETE FROM products WHERE id = ?", [id]);
  }
  return Response.redirect(new URL("/admin/products", request.url).href, 302);
}
__name(onRequest3, "onRequest");

// admin/export_orders.js
function validDate(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return v;
}
__name(validDate, "validDate");
function csvSafe(v) {
  v = String(v == null ? "" : v);
  if (v && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}
__name(csvSafe, "csvSafe");
function escCsv(v) {
  v = String(v == null ? "" : v);
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}
__name(escCsv, "escCsv");
function csvRow(fields) {
  return fields.map(escCsv).join(",") + "\r\n";
}
__name(csvRow, "csvRow");
async function onRequest4(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const url = new URL(request.url);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  let from = validDate(url.searchParams.get("from")) || today;
  let to = validDate(url.searchParams.get("to")) || from;
  if (to < from) {
    [from, to] = [to, from];
  }
  let status = url.searchParams.get("status") || "all";
  if (!ORDER_STATUSES.includes(status) && status !== "all") status = "all";
  const q = (url.searchParams.get("q") || "").trim();
  const where = ["DATE(datetime(o.created_at,'+8 hours')) BETWEEN ? AND ?"];
  const params = [from, to];
  if (status !== "all") {
    where.push("o.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(o.order_number LIKE ? OR o.customer_name LIKE ?)");
    params.push("%" + q + "%", "%" + q + "%");
  }
  const orders = await queryAll(
    db,
    `SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE ${where.join(" AND ")} ORDER BY o.created_at`,
    params
  );
  const itemsByOrder = {};
  if (orders.length) {
    const ids = orders.map((o) => parseInt(o.id));
    const inPlaceholders = ids.map(() => "?").join(",");
    const items = await queryAll(
      db,
      `SELECT order_id, product_name, quantity, sweetness, size FROM order_items WHERE order_id IN (${inPlaceholders}) ORDER BY id`,
      ids
    );
    for (const it of items) {
      const oid = it.order_id;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(it);
    }
  }
  let csv = "\uFEFF";
  csv += csvRow(["Order #", "Placed at", "Customer", "Type", "Table", "Status", "Total", "Items"]);
  for (const o of orders) {
    const oItems = (itemsByOrder[o.id] || []).map(
      (it) => csvSafe(it.quantity + "x " + it.product_name + (it.size ? " (" + it.size + ")" : "") + (it.sweetness && it.sweetness !== "100%" ? " (" + it.sweetness + " sweet)" : ""))
    );
    const table = o.table_label || (o.table_number ? "Table " + o.table_number : "");
    csv += csvRow([
      csvSafe(o.order_number),
      o.created_at,
      csvSafe(o.customer_name),
      o.order_type,
      csvSafe(table),
      o.status,
      Number(o.total).toFixed(2),
      oItems.join("; ")
    ]);
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders_${from}_to_${to}.csv"`
    }
  });
}
__name(onRequest4, "onRequest");

// admin/_order_rows.js
function renderOrderRows(orders, itemsByOrder, csrfToken) {
  if (!orders.length) {
    return `<tr><td colspan="7"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No orders found.</p></div></td></tr>`;
  }
  return orders.map((o) => {
    const items = itemsByOrder[o.id] || [];
    const tableCol = o.order_type + (o.table_label ? " \xB7 " + o.table_label : o.table_number ? " \xB7 Table " + o.table_number : "");
    const statusOptions = ORDER_STATUSES.map((st) => `<option${o.status === st ? " selected" : ""}>${st}</option>`).join("");
    const itemsHtml = items.map((it) => {
      const display = e(it.product_name) + (it.size ? " \xB7 " + e(it.size) : "") + (it.sweetness && it.sweetness !== "100%" ? " \xB7 " + e(it.sweetness) + " sweet" : "");
      const allergenNote = it.allergen_tags ? `<br><span class="item-allergens">\u26A0 ${e(it.allergen_tags)}</span>` : "";
      return `${e(String(it.quantity))} \xD7 ${display}${allergenNote}<br>`;
    }).join("");
    return `<tr data-order-id="${o.id}"><td><strong>${e(o.order_number)}</strong></td><td>${e(o.customer_name)}</td><td>${e(tableCol)}</td><td>${money(o.total)}</td><td>${e(o.created_at)}</td><td><form method="post" class="status-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${o.id}"><select name="status" class="auto-submit">${statusOptions}</select><button class="small-btn">Update</button></form> <span class="status ${statusClass(o.status)}">${e(o.status)}</span></td><td>${itemsHtml}</td></tr>`;
  }).join("");
}
__name(renderOrderRows, "renderOrderRows");

// admin/orders.js
async function onRequest5(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  let status = url.searchParams.get("status") || "all";
  if (!ORDER_STATUSES.includes(status) && status !== "all") status = "all";
  const q = (url.searchParams.get("q") || "").trim();
  let page = Math.max(1, parseInt(url.searchParams.get("page") || 1));
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (verifyCsrf(request, csrfFormToken)) {
      const newStatus = formData.get("status") || "";
      const orderId = parseInt(formData.get("id") || 0);
      if (orderId > 0 && ORDER_STATUSES.includes(newStatus)) {
        await run(db, "UPDATE orders SET status = ? WHERE id = ?", [newStatus, orderId]);
      }
    }
    return Response.redirect(new URL(ordersQs(status, q, page), request.url).href, 302);
  }
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  const csrfToken = generateCsrf();
  const [orders, itemsByOrder, total, pages] = await fetchOrdersPage(db, status, q, 20, page);
  page = Math.min(Math.max(1, page), pages);
  const statusCounts = await orderStatusCounts(db, q);
  const statusTabsHtml = [
    `<a class="pill ${status === "all" ? "active" : ""}" href="${e(ordersQs("all", q, 1))}">All <b data-count="all">${statusCounts.all}</b></a>`,
    ...ORDER_STATUSES.map((st) => `<a class="pill ${status === st ? "active" : ""}" href="${e(ordersQs(st, q, 1))}">${st} <b data-count="${st}">${statusCounts[st] || 0}</b></a>`)
  ].join("");
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const fromVal = url.searchParams.get("from") || today;
  const toVal = url.searchParams.get("to") || today;
  const rowsHtml = renderOrderRows(orders, itemsByOrder, csrfToken);
  let pagerHtml = "";
  if (pages > 1) {
    const prevLink = page > 1 ? `<a class="small-btn" href="${e(ordersQs(status, q, page - 1))}">\u2190 Prev</a>` : "";
    const nextLink = page < pages ? `<a class="small-btn" href="${e(ordersQs(status, q, page + 1))}">Next \u2192</a>` : "";
    const pageLinks = Array.from({ length: Math.min(pages, 5) }, (_, i) => {
      const p = Math.max(1, Math.min(pages, page - 2 + i));
      return `<a class="pill ${p === page ? "active" : ""}" href="${e(ordersQs(status, q, p))}">${p}</a>`;
    }).join("");
    pagerHtml = `<div class="pager">${prevLink}${pageLinks}${nextLink}</div>`;
  }
  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">SALES &amp; FULFILLMENT</p><h1>Orders</h1><p class="muted">Review customer orders and update their progress.</p></div></div>
<div class="orders-toolbar panel">
 <div class="status-tabs">${statusTabsHtml}</div>
 <form class="order-search" method="get"><input type="hidden" name="status" value="${e(status)}"><input name="q" value="${e(q)}" placeholder="Search order # or customer" maxlength="60"><button class="small-btn" type="submit">Search</button></form>
 <form class="order-export" method="get" action="/admin/export_orders"><input type="hidden" name="status" value="${e(status)}"><input type="hidden" name="q" value="${e(q)}"><label>From</label><input type="date" name="from" value="${e(fromVal)}"><label>To</label><input type="date" name="to" value="${e(toVal)}"><button class="small-btn" type="submit">Export CSV</button></form>
</div>
<div class="panel table-wrap">
<table><thead><tr><th>Order</th><th>Customer</th><th>Type / Table</th><th>Total</th><th>Placed</th><th>Status</th><th>Items</th></tr></thead>
<tbody id="orders-tbody">
${rowsHtml}
</tbody></table>
<div class="table-meta"><span id="orders-updated" class="muted"></span><span class="muted">${total} order${total === 1 ? "" : "s"}${pages > 1 ? ` \xB7 page ${page}/${pages}` : ""}</span></div>
${pagerHtml}
</div>`;
  const html = adminLayout(session, "Orders", shopName, "/admin/orders", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest5, "onRequest");

// admin/orders_fragment.js
async function onRequest6(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) {
    return new Response("login required", { status: 401, headers: { "Content-Type": "text/plain" } });
  }
  let status = url.searchParams.get("status") || "all";
  if (!ORDER_STATUSES.includes(status) && status !== "all") status = "all";
  const q = (url.searchParams.get("q") || "").trim();
  let page = Math.max(1, parseInt(url.searchParams.get("page") || 1));
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (verifyCsrf(request, csrfFormToken)) {
      const newStatus = formData.get("status") || "";
      const orderId = parseInt(formData.get("id") || 0);
      if (orderId > 0 && ORDER_STATUSES.includes(newStatus)) {
        await run(db, "UPDATE orders SET status = ? WHERE id = ?", [newStatus, orderId]);
      }
    }
    return Response.redirect(new URL(ordersQs(status, q, page, "/admin/orders"), request.url).href, 302);
  }
  const [orders, itemsByOrder, total, pages] = await fetchOrdersPage(db, status, q, 20, page);
  const counts = await orderStatusCounts(db, q);
  const csrfToken = getCsrfFromCookie(request) || generateCsrf();
  const rowsHtml = renderOrderRows(orders, itemsByOrder, csrfToken);
  return new Response(rowsHtml, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store",
      "X-Order-Counts": JSON.stringify(counts)
    }
  });
}
__name(onRequest6, "onRequest");

// admin/product_form.js
var ALLERGEN_WHITELIST = ["dairy", "nuts", "gluten", "soy", "eggs", "vegan", "vegetarian", "caffeine", "decaf"];
async function onRequest7(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  const id = parseInt(url.searchParams.get("id") || 0);
  let product = { name: "", description: "", price: "", category_id: "", image: null, is_available: 1, is_featured: 0, allergen_tags: "" };
  if (id) {
    const row = await queryOne(db, "SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return Response.redirect(new URL("/admin/products", request.url).href, 302);
    product = row;
  }
  const cats = await queryAll(db, "SELECT * FROM categories ORDER BY name");
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL("/admin/product_form" + (id ? "?id=" + id : ""), request.url).href, 302);
    }
    const name = (formData.get("name") || "").trim();
    const desc = (formData.get("description") || "").trim();
    const price = parseFloat(formData.get("price") || 0);
    const catId = parseInt(formData.get("category_id") || 0) || null;
    const available = formData.has("is_available") ? 1 : 0;
    const featured = formData.has("is_featured") ? 1 : 0;
    const existingImage = formData.get("existing_image") || product.image || null;
    const rawTags = formData.getAll("allergen_tags");
    const filteredTags = [...new Set(rawTags.filter((t) => ALLERGEN_WHITELIST.includes(t)))];
    const allergens = filteredTags.join(",");
    const imageFile = formData.get("image");
    let imageUploadNotice = "";
    if (imageFile && imageFile.size > 0) {
      imageUploadNotice = "Image upload is temporarily disabled. Existing images are still displayed.";
    }
    product = { ...product, name, description: desc, price, category_id: catId, is_available: available, is_featured: featured, allergen_tags: allergens, image: existingImage };
    if (!name || price < 0) {
      const csrfToken2 = generateCsrf();
      const headers2 = new Headers({ "Content-Type": "text/html;charset=utf-8" });
      setCsrfCookie(headers2, csrfToken2);
      const html2 = adminLayout(session, id ? "Edit product" : "Add product", shopName, "/admin/product_form", renderForm(id, product, cats, csrfToken2, "Enter a product name and a valid price.", imageUploadNotice), csrfToken2);
      return new Response(html2, { headers: headers2 });
    }
    try {
      if (id) {
        await run(
          db,
          "UPDATE products SET category_id=?, name=?, description=?, price=?, image=?, is_available=?, is_featured=?, allergen_tags=? WHERE id=?",
          [catId, name, desc, price, existingImage, available, featured, allergens, id]
        );
      } else {
        await run(
          db,
          "INSERT INTO products(category_id, name, description, price, image, is_available, is_featured, allergen_tags) VALUES(?,?,?,?,?,?,?,?)",
          [catId, name, desc, price, existingImage, available, featured, allergens]
        );
      }
    } catch (err) {
      const csrfToken2 = generateCsrf();
      const headers2 = new Headers({ "Content-Type": "text/html;charset=utf-8" });
      setCsrfCookie(headers2, csrfToken2);
      const html2 = adminLayout(session, id ? "Edit product" : "Add product", shopName, "/admin/product_form", renderForm(id, product, cats, csrfToken2, "Could not save the product. If a category was just deleted elsewhere, pick it again and retry.", imageUploadNotice), csrfToken2);
      return new Response(html2, { headers: headers2 });
    }
    return Response.redirect(new URL("/admin/products", request.url).href, 302);
  }
  const csrfToken = generateCsrf();
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  const html = adminLayout(session, id ? "Edit product" : "Add product", shopName, "/admin/product_form", renderForm(id, product, cats, csrfToken, "", ""), csrfToken);
  return new Response(html, { headers });
}
__name(onRequest7, "onRequest");
function renderForm(id, product, cats, csrfToken, error, imageUploadNotice) {
  const currentTags = (product.allergen_tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  const allergenCheckboxes = [
    ["dairy", "Contains dairy"],
    ["nuts", "Contains nuts"],
    ["gluten", "Contains gluten"],
    ["soy", "Contains soy"],
    ["eggs", "Contains eggs"],
    ["vegan", "Vegan"],
    ["vegetarian", "Vegetarian"],
    ["caffeine", "Caffeine"],
    ["decaf", "Decaf"]
  ].map(([val, label]) => `<label class="check"><input type="checkbox" name="allergen_tags[]" value="${val}"${currentTags.includes(val) ? " checked" : ""}> ${label}</label>`).join("");
  const catOptions = cats.map((c) => `<option value="${c.id}"${product.category_id == c.id ? " selected" : ""}>${e(c.name)}</option>`).join("");
  const currentImageHtml = product.image ? `<div class="full current-image"><img src="${e(productImage(product.image, null))}" alt="Current product photo"><span>Current photo \u2014 uploading a new one replaces it.</span></div>` : "";
  return `
<div class="page-heading"><div><p class="eyebrow">MENU MANAGEMENT</p><h1>${id ? "Edit product" : "Add a product"}</h1></div><a class="text-link" href="/admin/products">\u2190 Back to products</a></div>
<form class="panel form-grid" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="existing_image" value="${e(product.image || "")}">
${error ? `<div class="error full">${e(error)}</div>` : ""}
${imageUploadNotice ? `<div class="notice full">${e(imageUploadNotice)}</div>` : ""}
<div><label>Product name</label><input name="name" value="${e(product.name)}" required maxlength="120"></div>
<div><label>Price (\u20B1)</label><input type="number" name="price" min="0" step="0.01" value="${e(String(product.price))}" required></div>
<div><label>Category</label><select name="category_id"><option value="">Uncategorized</option>${catOptions}</select></div>
<div><label>Product image (JPG/PNG/WEBP, max 4 MB)</label><p class="muted small-note">Image upload is temporarily disabled. Existing images are still displayed.</p></div>
${currentImageHtml}
<div class="full"><label>Description</label><textarea name="description" rows="3" maxlength="1000">${e(product.description || "")}</textarea></div>
<label class="check full"><input type="checkbox" name="is_available"${product.is_available ? " checked" : ""}> Available on customer menu</label>
<label class="check full"><input type="checkbox" name="is_featured"${product.is_featured ? " checked" : ""}> Show in Best Sellers</label>
<fieldset class="full allergen-fieldset"><legend>Allergen &amp; dietary tags</legend>
${allergenCheckboxes}
</fieldset>
<div class="full"><button class="btn" type="submit">Save product</button></div></form>`;
}
__name(renderForm, "renderForm");

// admin/products.js
async function onRequest8(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL("/admin/products", request.url).href, 302);
    }
    if (formData.has("available")) {
      const id = parseInt(formData.get("id") || 0);
      const available = parseInt(formData.get("available") || 0) ? 1 : 0;
      if (id > 0) {
        await run(db, "UPDATE products SET is_available = ? WHERE id = ?", [available, id]);
      }
    }
    return Response.redirect(new URL("/admin/products", request.url).href, 302);
  }
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  const csrfToken = generateCsrf();
  const rows = await queryAll(db, "SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.created_at DESC, p.id DESC");
  const tableHtml = !rows.length ? `<tr><td colspan="5"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No products yet. Add your first menu item to get started.</p><a class="btn" href="/admin/product_form">+ Add product</a></div></td></tr>` : rows.map((p) => `<tr><td><div class="product-cell"><img src="${e(productImage(p.image, p.category))}" alt=""><strong>${e(p.name)}</strong>${p.is_featured ? ' <span class="pill">Best seller</span>' : ""}</div></td><td>${e(p.category || "Uncategorized")}</td><td>${money(p.price)}</td><td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="available" value="${p.is_available ? 0 : 1}"><button class="toggle ${p.is_available ? "on" : "off"}" type="submit">${p.is_available ? "\u25CF Available" : "\u25CF Sold Out"}</button></form></td><td><a class="text-link" href="/admin/product_form?id=${p.id}">Edit</a> \xB7 <form method="post" action="/admin/delete_product" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="id" value="${p.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join("");
  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">MENU MANAGEMENT</p><h1>Products</h1><p class="muted">Update prices, photos and availability.</p></div><a class="btn" href="/admin/product_form">+ Add product</a></div>
<div class="panel table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Availability</th><th>Actions</th></tr></thead>
${tableHtml}
</table></div>`;
  const html = adminLayout(session, "Products", shopName, "/admin/products", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest8, "onRequest");

// admin/settings.js
function isPrivateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
    }
    return false;
  } catch {
    return false;
  }
}
__name(isPrivateUrl, "isPrivateUrl");
async function onRequest9(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const shopName = await getSetting(db, "shop_name", "SPARKS CAFE");
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL("/admin/settings", request.url).href, 302);
    }
    const section = formData.get("section") || "";
    if (section === "brand") {
      const shop = (formData.get("shop_name") || "").trim();
      if (!shop || shop.length > 60) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Shop name must be 1-60 characters."), request.url).href, 302);
      }
      await settingSet(db, "shop_name", shop);
      return Response.redirect(new URL("/admin/settings?saved=1", request.url).href, 302);
    }
    if (section === "menu") {
      let menu = (formData.get("menu_base_url") || "").trim().replace(/\/$/, "");
      const valid = menu === "" || /^https:\/\//i.test(menu) && (() => {
        try {
          new URL(menu);
          return true;
        } catch {
          return false;
        }
      })() && !isPrivateUrl(menu);
      if (!valid) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Menu address must be a public https:// address, not localhost or a private IP. Example: https://sparks-aurora.pages.dev"), request.url).href, 302);
      }
      await settingSet(db, "menu_base_url", menu);
      return Response.redirect(new URL("/admin/settings?saved=1", request.url).href, 302);
    }
    if (section === "team_add") {
      const uname = (formData.get("username") || "").trim().substring(0, 60);
      const pwd = formData.get("password") || "";
      const role = formData.get("role") === "admin" ? "admin" : "staff";
      if (!uname || pwd.length < 8) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Enter a username and a password with at least 8 characters."), request.url).href, 302);
      }
      try {
        const hash = await hashPassword(pwd);
        await run(db, "INSERT INTO admins(username, password_hash, role) VALUES(?,?,?)", [uname, hash, role]);
      } catch (err) {
        const msg = String(err.message || "").toLowerCase();
        if (msg.includes("unique") || msg.includes("constraint")) {
          return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("That username is already taken."), request.url).href, 302);
        }
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Could not create account."), request.url).href, 302);
      }
      return Response.redirect(new URL("/admin/settings?saved=1", request.url).href, 302);
    }
    if (section === "team_delete") {
      const teamId = parseInt(formData.get("team_id") || 0);
      if (teamId === session.admin_id) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("You cannot delete the account you are signed in with."), request.url).href, 302);
      }
      const target = await queryOne(db, "SELECT role FROM admins WHERE id = ?", [teamId]);
      if (target && target.role === "admin") {
        const countRow = await queryOne(db, "SELECT COUNT(*) AS n FROM admins WHERE role = 'admin'");
        if (!countRow || countRow.n <= 1) {
          return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Keep at least one admin account."), request.url).href, 302);
        }
      }
      if (target) await run(db, "DELETE FROM admins WHERE id = ?", [teamId]);
      return Response.redirect(new URL("/admin/settings?saved=1", request.url).href, 302);
    }
    if (section === "password") {
      const current = formData.get("current_password") || "";
      const newPwd = formData.get("new_password") || "";
      const myAdmin = await queryOne(db, "SELECT password_hash FROM admins WHERE id = ?", [session.admin_id]);
      const hash = myAdmin ? String(myAdmin.password_hash || "") : "";
      let ok = false;
      if (hash.startsWith("pbkdf2:")) {
        ok = await verifyPassword(current, hash);
      }
      if (!ok) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("Your current password is incorrect."), request.url).href, 302);
      }
      if (newPwd.length < 8) {
        return Response.redirect(new URL("/admin/settings?error=" + encodeURIComponent("The new password must have at least 8 characters."), request.url).href, 302);
      }
      const newHash = await hashPassword(newPwd);
      await run(db, "UPDATE admins SET password_hash = ? WHERE id = ?", [newHash, session.admin_id]);
      return Response.redirect(new URL("/admin/settings?saved=1", request.url).href, 302);
    }
    return Response.redirect(new URL("/admin/settings", request.url).href, 302);
  }
  const S = await (async () => {
    const rows = await queryAll(db, "SELECT skey, svalue FROM settings");
    const o = {};
    for (const r of rows) o[r.skey] = r.svalue || "";
    return o;
  })();
  const team = await queryAll(db, "SELECT id, username, role, created_at FROM admins ORDER BY role, username");
  const menuBaseUrl = await getSetting(db, "menu_base_url", "https://sparks-aurora.pages.dev");
  const menuUrl = (menuBaseUrl || "https://sparks-aurora.pages.dev").replace(/\/$/, "") + "/client/";
  const savedMsg = url.searchParams.has("saved") ? '<div class="success-banner">Settings saved.</div>' : "";
  const errorMsg = url.searchParams.get("error") ? `<div class="error-banner">${e(url.searchParams.get("error"))}</div>` : "";
  const csrfToken = generateCsrf();
  const teamRows = team.map((member) => `<tr>
    <td>${e(member.username)}</td>
    <td><span class="status ${member.role === "admin" ? "st-ready" : "st-preparing"}">${e(member.role.charAt(0).toUpperCase() + member.role.slice(1))}</span></td>
    <td>${e(member.created_at)}</td>
    <td>${parseInt(member.id) !== session.admin_id ? `<form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="section" value="team_delete"><input type="hidden" name="team_id" value="${member.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form>` : '<span class="muted">You</span>'}</td>
  </tr>`).join("");
  const bodyHtml = `
${savedMsg}${errorMsg}
<div class="page-heading"><div><p class="eyebrow">SHOP CONFIGURATION</p><h1>Settings</h1><p class="muted">Caf\xE9 branding, public menu address, and team accounts.</p></div></div>

<div class="panel" style="max-width:700px">
  <h2>Shop name</h2>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="brand">
    <label>Shown on the customer menu and printed standee</label>
    <input name="shop_name" required maxlength="60" value="${e(S.shop_name || "SPARKS CAFE")}">
    <button class="btn" type="submit">Save shop name</button>
  </form>
</div>

<div class="panel" style="max-width:700px">
  <h2>Public menu address for QR codes</h2>
  <p class="muted">The public HTTPS address customers use to open the menu. Example: <code>https://sparks-aurora.pages.dev</code></p>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="menu">
    <label>Base address (no trailing slash)</label>
    <input name="menu_base_url" maxlength="200" inputmode="url" placeholder="https://sparks-aurora.pages.dev" value="${e(S.menu_base_url || "")}">
    <button class="btn" type="submit">Save menu address</button>
  </form>
  <p class="muted small-note">Current QR base: <span class="mono">${e(menuBaseUrl)}</span><br>Full menu URL: <span class="mono">${e(menuUrl)}</span></p>
</div>

<div class="panel" style="max-width:700px">
  <h2>Printable table standee</h2>
  <p class="muted">One QR per table, with the table label and the menu link. Print, cut, place on the table.</p>
  <a class="btn" href="/admin/standee_print" target="_blank">Open standee print sheet \u2197</a>
</div>

<div class="panel" style="max-width:700px">
  <h2>Team accounts</h2>
  <p class="muted">Staff accounts can open the live Orders board. Admin accounts can also change the menu, tables, settings and team.</p>
  <div class="table-wrap"><table><thead><tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody>
  ${teamRows}
  </tbody></table></div>
  <h3 style="margin-top:22px">Add a team account</h3>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="team_add">
    <label>Username</label><input name="username" required maxlength="60" autocomplete="off">
    <label>Password (minimum 8 characters)</label><input type="password" name="password" required minlength="8" autocomplete="new-password">
    <label>Role</label><select name="role"><option value="staff">Staff \u2014 orders only</option><option value="admin">Admin \u2014 full access</option></select>
    <button class="btn" type="submit">Create account</button>
  </form>
</div>

<div class="panel" style="max-width:700px">
  <h2>Change my password</h2>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="password">
    <label>Current password</label><input type="password" name="current_password" required autocomplete="current-password">
    <label>New password (minimum 8 characters)</label><input type="password" name="new_password" required minlength="8" autocomplete="new-password">
    <button class="btn" type="submit">Update password</button>
  </form>
</div>`;
  const html = adminLayout(session, "Settings", shopName, "/admin/settings", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest9, "onRequest");

// admin/standee_print.js
function tableDisplay2(label) {
  label = (label || "").trim();
  if (!label) return "TABLE";
  if (/^(table|tbl)\b/i.test(label)) return label.toUpperCase();
  return "TABLE " + label.toUpperCase();
}
__name(tableDisplay2, "tableDisplay");
async function onRequest10(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const tables = await queryAll(db, "SELECT id, label, token FROM restaurant_tables WHERE is_active = 1");
  tables.sort((a, b) => a.label.localeCompare(b.label, void 0, { numeric: true, sensitivity: "base" }));
  const shop = await getSetting(db, "shop_name", "SPARKS CAFE");
  const menuBaseUrl = await getSetting(db, "menu_base_url", "https://sparks-aurora.pages.dev");
  const menuBase = (menuBaseUrl || "https://sparks-aurora.pages.dev").replace(/\/$/, "");
  const menuUrl = menuBase + "/client/";
  const now = /* @__PURE__ */ new Date();
  const monthYear = now.toLocaleString("en-US", { month: "short", year: "numeric" });
  const standeesHtml = tables.map((t) => {
    const tableMenuUrl = menuUrl + "?t=" + encodeURIComponent(t.token);
    return `<div class="standee">
  <div class="shop">${e(shop)}</div>
  <div class="sub">FRESH COFFEE \xB7 ORDER FROM YOUR TABLE</div>
  <div class="tlabel">${e(tableDisplay2(t.label))}</div>
  <div class="qr" data-qr="${e(tableMenuUrl)}"></div>
  <div class="scan">Scan to order</div>
  <div class="qsub">${e(tableMenuUrl)}</div>
  <div class="foot">Works on any phone with internet \xB7 pay at the counter \xB7 ${e(monthYear)}</div>
</div>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table standees \xB7 ${e(shop)}</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/vendor/qrcode.min.js"><\/script>
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
  <a class="note" href="/admin/tables">\u2190 Back to tables</a>
</div>

${!tables.length ? "<p>No active tables yet. Create them in Admin \u2192 Tables first.</p>" : ""}

${standeesHtml}

<script>
document.querySelectorAll('[data-qr]').forEach(function (el) {
  if (window.QRCode) new QRCode(el, { text: el.dataset.qr, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
});
<\/script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
__name(onRequest10, "onRequest");

// admin/tables.js
function randomHex16() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex16, "randomHex16");
async function onRequest11(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL("/admin/login", request.url).href, 302);
  if (session.role !== "admin") return Response.redirect(new URL("/admin/orders", request.url).href, 302);
  const shop = await getSetting(db, "shop_name", "SPARKS CAFE");
  const menuBaseUrl = await getSetting(db, "menu_base_url", "https://sparks-aurora.pages.dev");
  const menuBase = (menuBaseUrl || "https://sparks-aurora.pages.dev").replace(/\/$/, "");
  if (url.searchParams.has("takeout_qr")) {
    const takeoutUrl = menuBase + "/client/?mode=takeout";
    return new Response(takeoutQrHtml(shop, takeoutUrl), { headers: { "Content-Type": "text/html;charset=utf-8" } });
  }
  if (url.searchParams.has("print")) {
    const tables2 = await queryAll(db, "SELECT * FROM restaurant_tables WHERE is_active = 1");
    tables2.sort((a, b) => a.label.localeCompare(b.label, void 0, { numeric: true, sensitivity: "base" }));
    const base = menuBase + "/client/";
    return new Response(printQrHtml(shop, tables2, base), { headers: { "Content-Type": "text/html;charset=utf-8" } });
  }
  let error = "";
  if (request.method === "POST") {
    const formData = await request.formData();
    const csrfFormToken = formData.get("csrf") || "";
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL("/admin/tables", request.url).href, 302);
    }
    if (formData.has("add_label")) {
      const label = (formData.get("add_label") || "").trim();
      if (label && label.length <= 40) {
        try {
          await run(db, "INSERT INTO restaurant_tables(label, token) VALUES(?,?)", [label, randomHex16()]);
          return Response.redirect(new URL("/admin/tables", request.url).href, 302);
        } catch (err) {
          const msg = String(err.message || "").toLowerCase();
          if (msg.includes("unique") || msg.includes("constraint")) {
            error = "A table with that name already exists.";
          } else {
            error = "Could not save the table. Please try again.";
          }
        }
      }
    } else if (formData.has("rename_id")) {
      const label = (formData.get("label") || "").trim();
      const renameId = parseInt(formData.get("rename_id") || 0);
      if (label && label.length <= 40 && renameId > 0) {
        try {
          await run(db, "UPDATE restaurant_tables SET label = ? WHERE id = ?", [label, renameId]);
          return Response.redirect(new URL("/admin/tables", request.url).href, 302);
        } catch (err) {
          const msg = String(err.message || "").toLowerCase();
          if (msg.includes("unique") || msg.includes("constraint")) {
            error = "A table with that name already exists.";
          } else {
            error = "Could not rename the table. Please try again.";
          }
        }
      }
    } else if (formData.has("toggle_id")) {
      const toggleId = parseInt(formData.get("toggle_id") || 0);
      if (toggleId > 0) await run(db, "UPDATE restaurant_tables SET is_active = 1 - is_active WHERE id = ?", [toggleId]);
      return Response.redirect(new URL("/admin/tables", request.url).href, 302);
    } else if (formData.has("delete_id")) {
      const deleteId = parseInt(formData.get("delete_id") || 0);
      if (deleteId > 0) await run(db, "DELETE FROM restaurant_tables WHERE id = ?", [deleteId]);
      return Response.redirect(new URL("/admin/tables", request.url).href, 302);
    }
  }
  const tables = await queryAll(
    db,
    "SELECT t.*, (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.status IN ('Pending','Preparing','Ready') AND DATE(datetime(o.created_at,'+8 hours')) = date('now','+8 hours')) AS active_orders FROM restaurant_tables t"
  );
  tables.sort((a, b) => a.label.localeCompare(b.label, void 0, { numeric: true, sensitivity: "base" }));
  const csrfToken = generateCsrf();
  const tableHtml = !tables.length ? `<tr><td colspan="4"><div class="empty-state"><img src="/assets/coffee-placeholder.svg" alt=""><p>No tables yet. Add one above, then print the QR codes and stick them on the tables.</p></div></td></tr>` : tables.map((t) => `<tr><td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="rename_id" value="${t.id}"><input name="label" value="${e(t.label)}" maxlength="40" class="rename-input"><button class="small-btn" type="submit">Rename</button></form></td>
<td>${t.active_orders}</td>
<td><span class="status ${t.is_active ? "st-ready" : "st-cancelled"}">${t.is_active ? "Active" : "Off"}</span></td>
<td><form method="post" class="inline-form"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="toggle_id" value="${t.id}"><button class="small-btn" type="submit">${t.is_active ? "Turn off" : "Turn on"}</button></form>
 <form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="delete_id" value="${t.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form></td></tr>`).join("");
  const bodyHtml = `
<div class="page-heading"><div><p class="eyebrow">FLOOR PLAN</p><h1>Tables</h1><p class="muted">Each table gets its own QR code, so orders and updates know where they belong.</p></div><a class="btn" href="/admin/tables?takeout_qr=1" target="_blank">\u{1F3F7} Takeout Counter QR</a><a class="btn" href="/admin/tables?print=1" target="_blank">\u{1F5A8} Print QR codes</a></div>
<form class="panel inline-form category-form" method="post"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input name="add_label" placeholder="e.g. Table 5, Sofa 2, Bar 1" required maxlength="40"><button class="btn" type="submit">+ Add table</button></form>
${error ? `<p class="error">${e(error)}</p>` : ""}
<div class="panel table-wrap"><table><thead><tr><th>Table</th><th>Active orders today</th><th>Status</th><th>Actions</th></tr></thead>
${tableHtml}
</table></div>
<p class="muted small-note">Turning a table off hides it from new QR sheets; scans of its code stop anchoring orders. Deleting it keeps past orders (their table link is simply removed).</p>`;
  const html = adminLayout(session, "Tables", shop, "/admin/tables", bodyHtml, csrfToken);
  const headers = new Headers({ "Content-Type": "text/html;charset=utf-8" });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest11, "onRequest");
function takeoutQrHtml(shop, takeoutUrl) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Takeout Counter QR \xB7 ${e(shop)}</title>
<script src="/assets/vendor/qrcode.min.js"><\/script>
<style>
  body{margin:0;font:14px Arial,sans-serif;color:#25251f;background:#f7f5ef}
  .bar{padding:14px 20px;background:#fffefa;border-bottom:1px solid #e8e5dc;display:flex;gap:12px;align-items:center}
  .bar button{padding:10px 18px;background:#405c4a;color:#fff;border:0;border-radius:5px;font-weight:700;cursor:pointer}
  .bar a{color:#405c4a;font-weight:600}
  .sheet{display:flex;justify-content:center;padding:40px 20px}
  .card{background:#fff;border:1px solid #d8d4c8;border-radius:10px;padding:28px 32px;text-align:center;max-width:280px}
  .card h2{margin:0 0 12px;font-size:22px;letter-spacing:1px}
  .qr{display:flex;justify-content:center}
  .card p{font-size:10px;color:#77776f;word-break:break-all;margin:10px 0 0}
  .card .hint{font-size:12px;color:#405c4a;font-weight:700;margin-top:8px}
  @media print{.bar{display:none}body{background:#fff}.card{border-color:#bbb}}
</style></head><body>
<div class="bar"><button onclick="window.print()">\u{1F5A8} Print this card</button><a href="/admin/tables">\u2190 Back to Tables</a><span>Post this at the counter. Customers scan to order takeout \u2014 no table required.</span></div>
<div class="sheet">
  <div class="card">
    <h2>TAKEOUT COUNTER</h2>
    <div class="qr" id="takeout-qr" data-url="${e(takeoutUrl)}"></div>
    <p class="hint">Scan to order takeout \u2014 no table required.</p>
    <p>${e(takeoutUrl)}</p>
  </div>
</div>
<script>
(function () {
  var el = document.getElementById('takeout-qr');
  if (window.QRCode) new QRCode(el, { text: el.dataset.url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
  window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
})();
<\/script></body></html>`;
}
__name(takeoutQrHtml, "takeoutQrHtml");
function printQrHtml(shop, tables, base) {
  const cards = tables.map((t) => {
    const url = base + "?t=" + encodeURIComponent(t.token);
    return `<div class="card"><h2>${e(t.label)}</h2><div class="qr" data-url="${e(url)}"></div><p class="hint">Scan to view the menu &amp; order</p><p>${e(url)}</p></div>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Table QR codes \xB7 ${e(shop)}</title>
<script src="/assets/vendor/qrcode.min.js"><\/script>
<style>
  body{margin:0;font:14px Arial,sans-serif;color:#25251f;background:#f7f5ef}
  .bar{padding:14px 20px;background:#fffefa;border-bottom:1px solid #e8e5dc;display:flex;gap:12px;align-items:center}
  .bar button{padding:10px 18px;background:#405c4a;color:#fff;border:0;border-radius:5px;font-weight:700;cursor:pointer}
  .bar a{color:#405c4a;font-weight:600}
  .sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;padding:20px}
  .card{background:#fff;border:1px solid #d8d4c8;border-radius:10px;padding:18px;text-align:center;page-break-inside:avoid}
  .card h2{margin:0 0 12px;font-size:21px;letter-spacing:1px}
  .qr{display:flex;justify-content:center}
  .card p{font-size:10px;color:#77776f;word-break:break-all;margin:10px 0 0}
  .card .hint{font-size:11px;color:#405c4a;font-weight:700;margin-top:6px}
  @media print{.bar{display:none}body{background:#fff}.card{border-color:#bbb}}
</style></head><body>
<div class="bar"><button onclick="window.print()">\u{1F5A8} Print this sheet</button><a href="/admin/tables">\u2190 Back to Tables</a><span>Stick each code on its table. Customers scan with any phone camera; the menu needs internet.</span></div>
<div class="sheet">${!tables.length ? "<p>No active tables yet. Create them in Admin \u2192 Tables.</p>" : ""}${cards}</div>
<script>
document.querySelectorAll('.qr').forEach(function (el) {
  if (window.QRCode) new QRCode(el, { text: el.dataset.url, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR library unavailable.';
});
window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });
<\/script></body></html>`;
}
__name(printQrHtml, "printQrHtml");

// client/last_order_check.js
async function onRequest12(ctx) {
  const { request, env } = ctx;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }
  const db = env.sparks_cafe_db;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (!Array.isArray(body?.ids)) {
    return new Response(JSON.stringify({ error: "Missing or invalid ids array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const ids = {};
  for (const raw of body.ids) {
    const id = parseInt(raw);
    if (id > 0) ids[id] = true;
    if (Object.keys(ids).length >= 50) break;
  }
  if (!Object.keys(ids).length) {
    return new Response(JSON.stringify({ products: {} }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  const idList = Object.keys(ids).map(Number);
  const placeholders = idList.map(() => "?").join(",");
  const rows = await queryAll(db, `SELECT id, price, is_available FROM products WHERE id IN (${placeholders})`, idList);
  const products = {};
  for (const row of rows) {
    products[String(parseInt(row.id))] = {
      price: parseFloat(row.price),
      available: parseInt(row.is_available) === 1
    };
  }
  return new Response(JSON.stringify({ products: Object.keys(products).length ? products : {} }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequest12, "onRequest");

// client/menu_status.js
async function onRequest13(ctx) {
  const { env } = ctx;
  const db = env.sparks_cafe_db;
  const rows = await queryAll(db, "SELECT id, is_available FROM products");
  const products = {};
  for (const r of rows) {
    products[String(r.id)] = parseInt(r.is_available);
  }
  return new Response(JSON.stringify({ products, time: Date.now() }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
__name(onRequest13, "onRequest");

// client/order_feed.js
async function onRequest14(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;
  const table = await tableForToken(db, url.searchParams.get("t") || "");
  const numbers = [];
  for (const n of (url.searchParams.get("n") || "").split(",")) {
    const trimmed = n.trim().toUpperCase();
    if (/^DC[0-9A-Z]{2,28}$/.test(trimmed)) numbers.push(trimmed);
  }
  const mineSet = Object.fromEntries(numbers.map((n) => [n, true]));
  const out = {
    table: table ? { id: parseInt(table.id), label: table.label } : null,
    orders: []
  };
  if (!numbers.length && !table) {
    return new Response(JSON.stringify(out), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  const where = ["DATE(datetime(o.created_at,'+8 hours')) = date('now','+8 hours')"];
  const params = [];
  const clauses = [];
  if (numbers.length) {
    const inPlaceholders = numbers.map(() => "?").join(",");
    clauses.push(`o.order_number IN (${inPlaceholders})`);
    params.push(...numbers);
  }
  if (table) {
    clauses.push("(o.table_id = ? AND o.status IN ('Pending','Preparing','Ready'))");
    params.push(parseInt(table.id));
  }
  where.push("(" + clauses.join(" OR ") + ")");
  const orders = await queryAll(
    db,
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.customer_name FROM orders o WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 20`,
    params
  );
  if (orders.length) {
    const ids = orders.map((o) => parseInt(o.id));
    const inPlaceholders = ids.map(() => "?").join(",");
    const items = await queryAll(
      db,
      `SELECT order_id, product_name, quantity FROM order_items WHERE order_id IN (${inPlaceholders}) ORDER BY id`,
      ids
    );
    const itemsBy = {};
    for (const r of items) {
      const oid = r.order_id;
      if (!itemsBy[oid]) itemsBy[oid] = [];
      itemsBy[oid].push(r.quantity + "x " + r.product_name);
    }
    for (const o of orders) {
      out.orders.push({
        number: o.order_number,
        status: o.status,
        total: parseFloat(o.total),
        placed: o.created_at,
        items: (itemsBy[o.id] || []).join("; "),
        mine: !!mineSet[o.order_number]
      });
    }
  }
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
__name(onRequest14, "onRequest");

// client/order_status.js
async function onRequest15(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;
  const number = (url.searchParams.get("number") || "").trim();
  const isJson = url.searchParams.has("json");
  if (isJson) {
    const row = await queryOne(db, "SELECT id, status, created_at FROM orders WHERE order_number = ?", [number]);
    if (!row) {
      return new Response(JSON.stringify({ error: "not found" }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    const items2 = await queryAll(db, "SELECT product_name, quantity, price, sweetness, size FROM order_items WHERE order_id = ? ORDER BY id", [parseInt(row.id)]);
    const itemsOut = items2.map((it) => ({
      name: String(it.product_name),
      qty: parseInt(it.quantity),
      price: parseFloat(it.price),
      sweetness: it.sweetness || null,
      size: it.size || null
    }));
    let etaLabel = "";
    if (["Pending", "Preparing"].includes(row.status)) {
      const aheadRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing') AND created_at < (SELECT created_at FROM orders WHERE order_number = ?)", [number]);
      const ahead = aheadRow ? aheadRow.n || 0 : 0;
      const etaMin = Math.max(2, ahead * 4);
      etaLabel = etaMin > 30 ? "Ask staff for timing" : "Estimated ready in ~" + etaMin + " min";
    }
    return new Response(JSON.stringify({ status: row.status, items: itemsOut, eta_label: etaLabel }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  const shop = await getSetting(db, "shop_name", "SPARKS CAFE");
  let order = null;
  let items = [];
  if (number) {
    order = await queryOne(db, "SELECT o.*, t.label AS table_label FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.order_number = ?", [number]);
    if (order) {
      items = await queryAll(db, "SELECT product_name, quantity, price, sweetness, size FROM order_items WHERE order_id = ? ORDER BY id", [parseInt(order.id)]);
    }
  }
  const steps = ["Pending", "Preparing", "Ready", "Completed"];
  const currentIdx = order ? steps.indexOf(order.status) : -1;
  const orderTable = order ? (order.table_label || "") !== "" ? order.table_label : (order.table_number || "") !== "" ? "Table " + order.table_number : "" : "";
  let initEtaLabel = "";
  if (order && ["Pending", "Preparing"].includes(order.status)) {
    const aheadRow = await queryOne(db, "SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Preparing') AND created_at < ?", [order.created_at]);
    const initAhead = aheadRow ? aheadRow.n || 0 : 0;
    const initEtaMin = Math.max(2, initAhead * 4);
    initEtaLabel = initEtaMin > 30 ? "Ask staff for timing" : "Estimated ready in ~" + initEtaMin + " min";
  }
  const timelineHtml = order && order.status !== "Cancelled" ? `<ol class="timeline">${steps.map((st, i) => `<li class="${currentIdx !== -1 && i < currentIdx ? "done" : ""} ${i === currentIdx ? "current" : ""}"><span class="dot"></span>${st}</li>`).join("")}</ol>` : "";
  const itemsHtml = order ? items.map((it) => {
    const display = it.product_name + (it.size ? " \xB7 " + it.size : "") + (it.sweetness && it.sweetness !== "100%" ? " \xB7 " + it.sweetness + " sweet" : "");
    return `<tr><td>${e(String(it.quantity))} \xD7 ${e(display)}</td><td>${money(parseFloat(it.price) * parseInt(it.quantity))}</td></tr>`;
  }).join("") : "";
  const hintMsg = !order ? "" : order.status === "Completed" ? `Enjoy! Thanks for visiting ${e(shop)}.` : order.status === "Cancelled" ? "Please ask staff if you need help with this order." : "This page updates itself \u2014 no need to refresh.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fbfaf6"><title>Track order \xB7 ${e(shop.toUpperCase())}</title><link rel="stylesheet" href="/assets/style.css"></head><body class="client-body">
<header class="client-header"><a class="brand" href="/client/">${e(shop.toUpperCase())}<span>COFFEE \xB7 COMMUNITY \xB7 COMFORT</span></a><div class="header-actions"><a class="outline-btn small-action" href="/client/">\u2190 Back to menu</a></div></header>
<main class="track-main">
<h1>Track your order</h1>
<form class="track-form" method="get"><input name="number" value="${e(number)}" placeholder="Order number, e.g. DC251115A1B2" required maxlength="30"><button class="btn" type="submit">Track</button></form>
${number && !order ? `<div class="error-banner">We couldn't find an order with that number. Please double-check it with our staff.</div>` : ""}
${order ? `<section class="panel track-card">
  <div class="track-head"><div><p class="eyebrow">ORDER ${e(order.order_number)}</p><h2>Hello, ${e(order.customer_name)}!</h2></div><span class="status big ${statusClass(order.status)}" id="track-status">${e(order.status)}</span></div>
  ${order.status === "Cancelled" ? `<p class="error">This order was cancelled. Please see our staff if this seems wrong.</p>` : timelineHtml}
  <p class="error" id="track-cancel" ${order.status !== "Cancelled" ? "hidden" : ""}>This order was cancelled. Please see our staff if this seems wrong.</p>
  ${!["Ready", "Completed", "Cancelled"].includes(order.status) ? `<p class="muted" id="track-eta">${e(initEtaLabel)}</p>` : ""}
  <p class="muted" id="track-hint">${hintMsg}</p>
  <div class="table-wrap"><table><tbody>
   ${itemsHtml}
   <tr class="track-total"><td>Total</td><td><strong>${money(order.total)}</strong></td></tr>
  </tbody></table></div>
  <p class="muted small-note">Placed ${e(order.created_at)} \xB7 ${e(order.order_type)}${orderTable ? " \xB7 " + e(orderTable) : ""} \xB7 Payment at the counter</p>
</section>` : ""}
</main>
<footer class="client-footer"><span>${e(shop.toUpperCase())} \xB7 Made for your everyday coffee moment</span><a class="staff-link" href="/admin/login">\u{1F512} Staff login</a></footer>
<script>
(function () {
  var number = ${JSON.stringify(number)};
  if (!number) return;
  var steps = ['Pending', 'Preparing', 'Ready', 'Completed'];
  var shop = ${JSON.stringify(shop)};
  var lastStatus = ${JSON.stringify(order ? order.status : "")};
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
        status === 'Ready' ? 'Your order is ready \u2014 please pick it up at the counter.' :
        status === 'Preparing' ? 'The counter is preparing your order now.' :
        'Order received. This page updates itself \u2014 no need to refresh.';
    }
    var eta = document.getElementById('track-eta');
    if (eta) {
      var etaActive = ['Pending', 'Preparing'].indexOf(status) !== -1;
      eta.hidden = !etaActive;
      if (etaActive && data.eta_label) { eta.textContent = data.eta_label; }
    }
    if (lastStatus && lastStatus !== status) {
      if (status === 'Ready') { notifyReady(); document.title = 'READY \xB7 ' + number; }
      else if (status === 'Completed') { document.title = 'Completed \xB7 ' + number; }
      else if (status === 'Cancelled') { document.title = 'Cancelled \xB7 ' + number; }
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
<\/script></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(onRequest15, "onRequest");

// client/place_order.js
async function onRequest16(ctx) {
  const { request, env } = ctx;
  if (request.method !== "POST") {
    return Response.redirect(new URL("/client/", request.url).href, 302);
  }
  const db = env.sparks_cafe_db;
  const formData = await request.formData();
  const csrfFormToken = formData.get("csrf") || "";
  if (!verifyCsrf(request, csrfFormToken)) {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Invalid form token. Please try again."), request.url).href, 302);
  }
  let name = (formData.get("customer_name") || "").trim();
  let type = formData.get("order_type") || "Dine-in";
  const mode = formData.get("mode") || "";
  const tableToken = formData.get("table_token") || "";
  const cartStr = formData.get("cart") || "[]";
  if (mode === "takeout") type = "Takeaway";
  if (name === "") name = "Customer";
  if (name.length > 120) {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Please use a shorter name (120 characters max)."), request.url).href, 302);
  }
  if (!["Dine-in", "Takeaway"].includes(type)) {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Invalid order type."), request.url).href, 302);
  }
  let cart;
  try {
    cart = JSON.parse(cartStr);
  } catch {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Invalid cart data."), request.url).href, 302);
  }
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 50) {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Please add at least one item to your order."), request.url).href, 302);
  }
  const dineTable = tableToken ? await tableForToken(db, tableToken) : null;
  const tableId = dineTable ? parseInt(dineTable.id) : null;
  const tableNumber = dineTable ? String(dineTable.label) : "";
  if (type === "Dine-in" && !tableId) {
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Please choose your table, or switch to Take-out."), request.url).href, 302);
  }
  const finalTableId = type === "Takeaway" ? null : tableId;
  const finalTableNumber = type === "Takeaway" ? "" : tableNumber;
  try {
    const clean = [];
    let total = 0;
    const seen = {};
    for (const entry of cart) {
      const id = parseInt(entry.id || 0);
      let qty = Math.max(1, Math.min(30, parseInt(entry.qty || 1)));
      if (id <= 0) continue;
      const sizeKeyRaw = entry.size ? String(entry.size).toLowerCase() : "";
      const dedupKey = id + ":" + sizeKeyRaw;
      if (seen[dedupKey] !== void 0) {
        clean[seen[dedupKey]].qty = Math.min(30, clean[seen[dedupKey]].qty + qty);
        continue;
      }
      const p = await queryOne(db, "SELECT p.id, p.name, p.price, p.is_available, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?", [id]);
      if (!p || !parseInt(p.is_available)) {
        return Response.redirect(new URL("/client/?error=" + encodeURIComponent("An item in your order just sold out. Please refresh the menu and try again."), request.url).href, 302);
      }
      const isBeverage = ["Coffee", "Non-Coffee"].includes(String(p.category));
      const sweetnessAllowed = ["0%", "25%", "50%", "75%", "100%"];
      let sweetness = null;
      if (isBeverage) {
        const sweetnessRaw = entry.sweetness != null ? entry.sweetness : null;
        if (sweetnessRaw !== null) {
          const swStr = !isNaN(sweetnessRaw) ? parseInt(sweetnessRaw) + "%" : String(sweetnessRaw);
          sweetness = sweetnessAllowed.includes(swStr) ? swStr : "100%";
        } else {
          sweetness = "100%";
        }
      }
      const sizeAllowed = ["Small", "Medium", "Large"];
      let size = null;
      if (isBeverage) {
        const sizeRaw = entry.size != null ? entry.size : null;
        if (sizeRaw !== null) {
          size = sizeAllowed.includes(String(sizeRaw)) ? String(sizeRaw) : "Medium";
        } else {
          size = "Medium";
        }
      }
      let delta = 0;
      if (isBeverage) {
        if (size === "Small") delta = -15;
        else if (size === "Large") delta = 20;
      }
      const finalPrice = parseFloat(p.price) + delta;
      seen[dedupKey] = clean.length;
      clean.push({ id: parseInt(p.id), name: String(p.name), price: finalPrice, qty, sweetness, size, size_price_delta: delta });
      total += finalPrice * qty;
    }
    if (!clean.length) {
      return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Please add at least one item to your order."), request.url).href, 302);
    }
    const now = /* @__PURE__ */ new Date();
    const pad = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad");
    const datePart = String(now.getUTCFullYear()).slice(2) + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());
    let orderNumber = "";
    let orderId = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      const candidate = "DC" + datePart + rnd;
      try {
        const stmts = [
          db.prepare("INSERT INTO orders(order_number, customer_name, table_number, table_id, order_type, total) VALUES(?,?,?,?,?,?)").bind(candidate, name, finalTableNumber ? finalTableNumber.substring(0, 30) : null, finalTableId, type, total)
        ];
        const results = await db.batch(stmts);
        if (results[0].success) {
          orderNumber = candidate;
          const orderRow = await queryOne(db, "SELECT id FROM orders WHERE order_number = ?", [candidate]);
          orderId = orderRow ? parseInt(orderRow.id) : null;
          break;
        }
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
    if (!orderNumber || !orderId) {
      return Response.redirect(new URL("/client/?error=" + encodeURIComponent("Could not create your order number. Please try again."), request.url).href, 302);
    }
    const itemStmts = clean.map(
      (item) => db.prepare("INSERT INTO order_items(order_id, product_id, product_name, price, quantity, sweetness, size, size_price_delta) VALUES(?,?,?,?,?,?,?,?)").bind(orderId, item.id, item.name, item.price, item.qty, item.sweetness, item.size, item.size_price_delta)
    );
    await db.batch(itemStmts);
    const suffix = finalTableId ? "&t=" + encodeURIComponent(tableToken) : "";
    return Response.redirect(new URL("/client/?order=" + encodeURIComponent(orderNumber) + suffix, request.url).href, 302);
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "We could not save your order. Please ask staff for help.";
    return Response.redirect(new URL("/client/?error=" + encodeURIComponent(message), request.url).href, 302);
  }
}
__name(onRequest16, "onRequest");

// client/index.js
function md5Polyfill(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
__name(md5Polyfill, "md5Polyfill");
function baseName(n) {
  return n.replace(/\s*\((Hot|Iced)\)$/u, "");
}
__name(baseName, "baseName");
function fmtPrice(n) {
  n = parseFloat(n);
  return "\u20B1" + (Number.isInteger(n) ? n.toLocaleString("en") : n.toFixed(2));
}
__name(fmtPrice, "fmtPrice");
async function onRequest17(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const db = env.sparks_cafe_db;
  const takeoutMode = url.searchParams.get("mode") === "takeout";
  let tableToken = url.searchParams.get("t") || "";
  let dineTable = tableToken ? await tableForToken(db, tableToken) : null;
  if (!dineTable) tableToken = "";
  if (takeoutMode) {
    tableToken = "";
    dineTable = null;
  }
  let tableChoices = [];
  if (!dineTable && !takeoutMode) {
    tableChoices = await queryAll(db, "SELECT label, token FROM restaurant_tables WHERE is_active=1");
    tableChoices.sort((a, b) => a.label.localeCompare(b.label, void 0, { numeric: true, sensitivity: "base" }));
  }
  const cats = await queryAll(db, "SELECT c.name, COUNT(p.id) AS items FROM categories c LEFT JOIN products p ON p.category_id=c.id WHERE c.name != 'Add-ons' GROUP BY c.id, c.name HAVING items > 0 ORDER BY c.name");
  const all = await queryAll(db, "SELECT p.*,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.name,p.name");
  const groups = {};
  const gorder = [];
  for (const p of all) {
    const key = (p.category || "") + "|" + baseName(p.name);
    if (!groups[key]) {
      groups[key] = { cat: p.category, base: baseName(p.name), desc: p.description || "", items: [] };
      gorder.push(key);
    }
    groups[key].items.push(p);
  }
  const cards = [];
  const outCards = [];
  for (const key of gorder) {
    const g = groups[key];
    if ((g.cat || "") === "Add-ons") continue;
    const variants = g.items.map((p) => {
      const m = p.name.match(/\((Hot|Iced)\)$/u);
      const tag = m ? m[1].toUpperCase() : "";
      return { id: parseInt(p.id), name: p.name, price: parseFloat(p.price), avail: parseInt(p.is_available) === 1, tag, image: p.image || null };
    });
    g.variants = variants;
    g.anyAvail = variants.some((v) => v.avail);
    g.feat = g.items.some((p) => p.is_featured);
    const prices = variants.map((v) => v.price);
    g.priceLabel = [...new Set(prices)].length > 1 ? fmtPrice(Math.min(...prices)) + " / " + fmtPrice(Math.max(...prices)) : fmtPrice(prices[0]);
    const firstAvail = variants.filter((v) => v.avail);
    const imgSrc = (firstAvail.length ? firstAvail : variants)[0];
    g.img = productImage(imgSrc.image, g.cat);
    g.tags = g.items[0].allergen_tags || "";
    g.basekey = md5Polyfill(key);
    if (g.anyAvail) cards.push(g);
    else outCards.push(g);
  }
  const addonsRaw = all.filter((p) => p.category === "Add-ons" && parseInt(p.is_available) === 1);
  const addonsJson = JSON.stringify(addonsRaw.map((p) => ({ id: parseInt(p.id), name: p.name, price: parseFloat(p.price) })));
  const success = url.searchParams.get("order") || "";
  const error = url.searchParams.get("error") || "";
  const shop = await getSetting(db, "shop_name", "SPARKS CAFE");
  const menuBaseUrl = await getSetting(db, "menu_base_url", "https://sparks-aurora.pages.dev");
  const menuUrl = (menuBaseUrl || "https://sparks-aurora.pages.dev").replace(/\/$/, "") + "/client/";
  const csrfToken = generateCsrf();
  function renderCard(g, sold = false) {
    const soldClass = sold ? " tq-sold" : "";
    const badgesHtml = g.tags ? g.tags.split(",").map((tag) => `<span class="tq-badge">${e(tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1))}</span>`).join("") : "";
    return `<div class="tq-card${soldClass}" data-basekey="${e(g.basekey)}" data-basename="${e(g.base)}" data-cat="${e(g.cat)}" data-feat="${e(String(g.feat ? 1 : 0))}" data-avail="${e(String(g.anyAvail ? 1 : 0))}" data-name="${e((g.base + " " + g.desc).toLowerCase())}"
     data-variants="${e(JSON.stringify(g.variants))}"
     data-img="${e(g.img)}" data-desc="${e(g.desc)}" data-pricelabel="${e(g.priceLabel)}" data-tags="${e(g.tags || "")}">
  <div class="tq-cardimg"><img src="${e(g.img)}" alt="${e(g.base)}" loading="lazy">
    ${g.feat ? '<span class="tq-feat">BEST SELLER</span>' : ""}
    ${!g.anyAvail ? '<span class="tq-soldbadge">SOLD OUT</span>' : ""}
  </div>
  <div class="tq-cardbody">
    <div class="tq-cardname">${e(g.base)}</div>
    <div class="tq-carddesc">${e(g.desc)}</div>
    ${badgesHtml ? `<div class="tq-badges">${badgesHtml}</div>` : ""}
    <div class="tq-cardfoot"><span class="tq-cardprice">${e(g.priceLabel)}</span><span class="tq-plus">+</span></div>
  </div>
</div>`;
  }
  __name(renderCard, "renderCard");
  const catPillsHtml = cats.map((c) => `<button data-cat="${e(c.name)}">${e(c.name)}</button>`).join("");
  const tablePickerModal = !dineTable && !takeoutMode ? `
<div class="modal" id="table-modal">
  <div class="modal-card tq-tablecard">
    <button class="modal-close" type="button" id="table-close" aria-label="Close">\u2715</button>
    <p class="eyebrow">WELCOME IN</p>
    <h2>Which table are you at?</h2>
    <p class="muted">Pick your table so the counter knows where to bring your order.</p>
    <div class="tq-tablegrid" id="table-grid">
      ${tableChoices.map((t) => `<button type="button" class="tq-tableopt" data-token="${e(t.token)}" data-label="${e(tableDisplay(t.label))}"><span>TABLE</span><b>${e(tableShortLabel(t.label).toUpperCase())}</b></button>`).join("")}
    </div>
    ${!tableChoices.length ? '<p class="muted">No tables are set up yet. Ask staff, or choose take-out.</p>' : ""}
    <button type="button" class="outline-btn tq-takeoutbtn" id="table-takeout">Order take-out instead</button>
  </div>
</div>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fbfaf6"><title>Menu \xB7 ${e(shop.toUpperCase())}</title><link rel="stylesheet" href="/assets/style.css"><script src="/assets/vendor/qrcode.min.js"><\/script></head><body class="client-body tq" data-table-token="${e(dineTable ? tableToken : "")}" data-mode="${takeoutMode ? "takeout" : "normal"}">

<div class="tq-sticky">
  <header class="tq-head">
    <div class="tq-brandwrap">
      <span class="tq-brand">${e(shop.toUpperCase())}</span>
      <span class="tq-live" id="tq-live">LIVE \u2014 availability updates by itself</span>
    </div>
    <div class="tq-headright">
      ${!takeoutMode ? dineTable ? `<span class="tq-table" id="tq-table" data-token="${e(tableToken)}">${e(tableDisplay(dineTable.label))}</span>` : `<button type="button" class="tq-table tq-tablepick" id="tq-tablepick" title="Choose your table">TABLE</button>` : ""}
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
  ${success ? `<div class="tq-banner ok">Order <b>${e(success)}</b> sent \u2014 opening live status\u2026</div>` : ""}
  ${error ? `<div class="tq-banner err">${e(error)}</div>` : ""}
  <p class="tq-allergen-note muted">Allergen info is provided by the cafe. Ask staff before ordering if you have a severe allergy. Cross-contact is possible.</p>

  <div class="tq-grid" id="tq-rows">
  ${cards.map((g) => renderCard(g)).join("\n")}
  </div>

  ${outCards.length ? `
  <div class="tq-seclab">CURRENTLY UNAVAILABLE</div>
  <div class="tq-grid" id="tq-out">
    ${outCards.map((g) => renderCard(g, true)).join("\n")}
  </div>` : ""}
</main>

<script type="application/json" id="tq-addons">${addonsJson}<\/script>

<div class="tq-sbackdrop" id="tq-sbackdrop" hidden></div>
<div class="tq-sheet" id="tq-sheet" hidden><div id="tq-sheetbody"></div></div>

<div class="tq-backdrop" id="tq-backdrop" hidden></div>
<aside class="tq-cart" id="tq-cart" hidden>
  <div class="tq-chead"><h3>Your order</h3><button type="button" class="tq-cartx" id="tq-cartclose">\u2715</button></div>
  <form id="order-form" method="post" action="/client/place_order">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="cart" id="cart-json">
    <input type="hidden" name="table_token" id="table-token" value="${e(tableToken)}">
    <input type="hidden" name="order_type" id="order-type" value="${takeoutMode ? "Takeaway" : "Dine-in"}">
    <div id="tq-lines"><div class="tq-emptyline">Your order is empty \u2014 tap an item to add it.</div></div>
    <div class="tq-field"><label>TABLE</label><span class="tq-val" id="rail-table">${e(dineTable ? tableDisplay(dineTable.label) : "\u2014")}</span>${!dineTable && !takeoutMode ? '<button type="button" class="tq-picklink" id="rail-tablepick">Select</button>' : ""}</div>
    <div class="tq-field"><label>NAME</label><input name="customer_name" id="cust-name" maxlength="120" placeholder="Optional \u2014 for the cup label" autocomplete="name"></div>
    ${!takeoutMode ? '<div class="tq-type"><button type="button" data-type="Dine-in" class="on">DINE-IN</button><button type="button" data-type="Takeaway">TAKE-OUT</button></div>' : ""}
    <input type="hidden" name="mode" value="${takeoutMode ? "takeout" : "normal"}">
    <div class="tq-total">TOTAL <b id="rail-total">\u20B10.00</b></div>
    <div class="tq-paynote">Pay at the counter when you claim your order \u2014 cash or GCash.</div>
    <button class="tq-send" type="submit">SEND ORDER</button>
    <button type="button" class="tq-keep" id="tq-keep">Add more items</button>
  </form>
</aside>

<div class="tq-cartbar" id="tq-cartbar" hidden>
  <span class="tq-cinfo"><b id="tq-barcount">0</b> <small id="tq-clabel">items ready</small><small class="tq-bartotal">\u20B1<b id="tq-total">0.00</b></small></span>
  <span class="tq-cgo">Review order <i>\u2192</i></span>
</div>

<div class="modal" id="qr-modal"><div class="modal-card"><button class="modal-close" onclick="hideQR()">\u2715</button><p class="eyebrow">SHARE OUR MENU</p><h2>Scan to explore</h2><div id="qrcode" data-menu-url="${e(menuUrl)}"></div><p class="qr-url"><span id="qr-url-text">${e(menuUrl)}</span><button type="button" class="small-btn" id="copy-menu-url">Copy link</button></p><p class="muted">Customers scan this to open the menu.</p><button class="outline-btn" onclick="hideQR()">Close</button></div></div>

${tablePickerModal}
<div id="toast-root" aria-live="polite"></div>
<footer class="client-footer"><span>${e(shop)} \xB7 digital menu</span><a class="staff-link" href="/admin/login">\u{1F512} Staff login</a></footer><script src="/assets/app.js"><\/script></body></html>`;
  const headers = new Headers({
    "Content-Type": "text/html;charset=utf-8",
    "Cache-Control": "no-store"
  });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
__name(onRequest17, "onRequest");

// _middleware.js
async function onRequest18(ctx) {
  try {
    const response = await ctx.next();
    if (response.status >= 300 && response.status < 400) return response;
    const r = new Response(response.body, response);
    r.headers.set("X-Frame-Options", "DENY");
    r.headers.set("X-Content-Type-Options", "nosniff");
    r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    r.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    r.headers.set("Strict-Transport-Security", "max-age=31536000");
    return r;
  } catch (err) {
    return new Response("Middleware error: " + err.message + "\n" + err.stack, { status: 500 });
  }
}
__name(onRequest18, "onRequest");

// ../.wrangler/tmp/pages-RSRj2z/functionsRoutes-0.9665361628485049.mjs
var routes = [
  {
    routePath: "/admin/login",
    mountPath: "/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/admin/login",
    mountPath: "/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/admin/logout",
    mountPath: "/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/admin/logout",
    mountPath: "/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/admin/setup",
    mountPath: "/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/admin/setup",
    mountPath: "/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/admin/categories",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/admin/dashboard",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/admin/delete_product",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/admin/export_orders",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/admin/orders",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/admin/orders_fragment",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/admin/product_form",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/admin/products",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/admin/settings",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/admin/standee_print",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/admin/tables",
    mountPath: "/admin",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/client/last_order_check",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest12]
  },
  {
    routePath: "/client/menu_status",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest13]
  },
  {
    routePath: "/client/order_feed",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest14]
  },
  {
    routePath: "/client/order_status",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest15]
  },
  {
    routePath: "/client/place_order",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest16]
  },
  {
    routePath: "/client",
    mountPath: "/client",
    method: "",
    middlewares: [],
    modules: [onRequest17]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest18],
    modules: []
  }
];

// ../../../../Users/91460/AppData/Roaming/npm/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../Users/91460/AppData/Roaming/npm/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function getOriginalPathPrefix(requestPath, normalizedPrefix) {
  let end = 0;
  for (let index = 0; index < normalizedPrefix.length; index++) {
    end++;
    if (normalizedPrefix[index] === "/") {
      while (requestPath[end] === "/") {
        end++;
      }
    }
  }
  return requestPath.slice(0, end);
}
__name(getOriginalPathPrefix, "getOriginalPathPrefix");
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  const normalizedRequestPath = requestPath.replace(/\/+/g, "/");
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath) || routeMatcher(normalizedRequestPath);
    const originalMountMatch = mountMatcher(requestPath);
    const mountMatchResult = originalMountMatch || mountMatcher(normalizedRequestPath);
    if (matchResult && mountMatchResult) {
      const path = originalMountMatch ? originalMountMatch.path : getOriginalPathPrefix(requestPath, mountMatchResult.path);
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
