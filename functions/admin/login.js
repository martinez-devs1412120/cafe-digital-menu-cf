import { queryOne, run, getSetting, e } from '../_shared/db.js';
import { signSession, verifySession, newSessionExp, verifyPassword, getSessionFromCookie } from '../_shared/auth.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

function clientIp(request) {
  return (request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    '0.0.0.0').substring(0, 45);
}

async function throttleWait(db, ip, username) {
  const row = await queryOne(db,
    "SELECT MAX(CASE WHEN locked_until > datetime('now') THEN CAST((julianday(locked_until) - julianday('now')) * 86400 AS INTEGER) ELSE 0 END) AS wait FROM login_throttle WHERE ip=? AND username IN (?,?) AND locked_until > datetime('now')",
    [ip, username, '']
  );
  return row ? (parseInt(row.wait) || 0) : 0;
}

async function throttleFail(db, ip, username) {
  // Reset expired locks
  await run(db,
    "UPDATE login_throttle SET attempts = 0, locked_until = NULL WHERE ip=? AND username IN (?,?) AND locked_until IS NOT NULL AND locked_until <= datetime('now')",
    [ip, username, '']
  );
  // Upsert per-user counter
  await run(db,
    "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
    [ip, username]
  );
  // Upsert IP-wide counter (username = '')
  await run(db,
    "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
    [ip, '']
  );
  // Lock if limit reached
  await run(db,
    "UPDATE login_throttle SET locked_until = datetime('now','+15 minutes') WHERE ip=? AND ((username = ? AND attempts >= 5) OR (username = '' AND attempts >= 30)) AND (locked_until IS NULL OR locked_until <= datetime('now'))",
    [ip, username]
  );
}

async function throttleClear(db, ip, username) {
  await run(db, 'DELETE FROM login_throttle WHERE ip=? AND username IN (?,?)', [ip, username, '']);
}

export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  if (!env.sparks_cafe_db) return new Response('DB binding missing: sparks_cafe_db', { status: 500 });
  if (!env.SESSION_SECRET) return new Response('Secret missing: SESSION_SECRET', { status: 500 });
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  // Redirect if already logged in
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (session) {
    return Response.redirect(new URL(session.role === 'admin' ? '/admin/dashboard' : '/admin/orders', request.url).href, 302);
  }

  const brandName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
  const csrfToken = generateCsrf();
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);

  const html = loginPageHtml(brandName, csrfToken, '');
  return new Response(html, { headers });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (!env.sparks_cafe_db) return new Response('DB binding missing', { status: 500 });
  if (!env.SESSION_SECRET) return new Response('Secret missing', { status: 500 });
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;

  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';

  if (!verifyCsrf(request, csrfFormToken)) {
    const brandName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
    const csrfToken = generateCsrf();
    const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
    setCsrfCookie(headers, csrfToken);
    return new Response(loginPageHtml(brandName, csrfToken, 'Invalid form token. Please try again.'), { headers });
  }

  const username = (formData.get('username') || '').trim().substring(0, 60);
  const password = formData.get('password') || '';
  const ip = clientIp(request);
  const brandName = await getSetting(db, 'shop_name', 'SPARKS CAFE');

  const wait = await throttleWait(db, ip, username);
  if (wait > 0) {
    const csrfToken = generateCsrf();
    const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
    setCsrfCookie(headers, csrfToken);
    const mins = Math.ceil(wait / 60);
    return new Response(loginPageHtml(brandName, csrfToken, `Too many failed attempts. Try again in ${mins} minute(s).`), { headers });
  }

  const admin = await queryOne(db, 'SELECT * FROM admins WHERE username = ?', [username]);
  let passwordOk = false;
  if (admin) {
    const hash = String(admin.password_hash || '');
    if (hash.startsWith('$2')) {
      // bcrypt — not supported in Workers
      const csrfToken = generateCsrf();
      const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
      setCsrfCookie(headers, csrfToken);
      return new Response(loginPageHtml(brandName, csrfToken, 'Please use the /admin/setup endpoint to set a new password for cloud mode.'), { headers });
    }
    passwordOk = await verifyPassword(password, hash);
  }

  if (admin && passwordOk) {
    await throttleClear(db, ip, username);
    const payload = {
      admin_id: parseInt(admin.id),
      username: String(admin.username),
      role: (admin.role === 'staff') ? 'staff' : 'admin',
      exp: newSessionExp(),
    };
    const sessionToken = await signSession(payload, secret);
    const redirectUrl = payload.role === 'admin' ? '/admin/dashboard' : '/admin/orders';
    const headers = new Headers();
    headers.set('Location', new URL(redirectUrl, request.url).href);
    headers.append('Set-Cookie', `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
    return new Response(null, { status: 302, headers });
  }

  await throttleFail(db, ip, username);
  const csrfToken = generateCsrf();
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(loginPageHtml(brandName, csrfToken, 'Incorrect username or password.'), { headers });
}

function loginPageHtml(brandName, csrfToken, error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Staff Login · ${e(brandName)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/style.css"></head>
<body class="auth-page"><form class="auth-card" method="post"><p class="eyebrow">${e(brandName.toUpperCase())} · STAFF</p><h1>Welcome back.</h1><p class="muted">Sign in to manage the menu and handle customer orders.</p>
${error ? `<div class="error">${e(error)}</div>` : ''}
<input type="hidden" name="csrf" value="${e(csrfToken)}"><label>Username</label><input name="username" required maxlength="60" autocomplete="username"><label>Password</label><input type="password" name="password" required autocomplete="current-password"><button class="btn" type="submit">Sign in</button><a class="text-link" href="/client/">Open customer menu</a></form></body></html>`;
}
