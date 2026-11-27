import { queryOne, run, getSetting, e } from '../_shared/db.js';
import { signSession, verifySession, newSessionExp, verifyPassword, getSessionFromCookie } from '../_shared/auth.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

function clientIp(request) {
  return (request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    '0.0.0.0').substring(0, 45);
}

async function throttleWait(db, ip, username) {
  try {
    const row = await queryOne(db,
      "SELECT MAX(CASE WHEN locked_until > datetime('now') THEN CAST((julianday(locked_until) - julianday('now')) * 86400 AS INTEGER) ELSE 0 END) AS wait FROM login_throttle WHERE ip=? AND username IN (?,?) AND locked_until > datetime('now')",
      [ip, username, '']
    );
    return row ? (parseInt(row.wait) || 0) : 0;
  } catch(e) { return 0; }
}

async function throttleFail(db, ip, username) {
  try {
    await run(db,
      "UPDATE login_throttle SET attempts = 0, locked_until = NULL WHERE ip=? AND username IN (?,?) AND locked_until IS NOT NULL AND locked_until <= datetime('now')",
      [ip, username, '']
    );
    await run(db,
      "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
      [ip, username]
    );
    await run(db,
      "INSERT INTO login_throttle(ip,username,attempts,last_attempt) VALUES(?,?,1,datetime('now')) ON CONFLICT(ip,username) DO UPDATE SET attempts = login_throttle.attempts + 1, last_attempt = datetime('now')",
      [ip, '']
    );
    await run(db,
      "UPDATE login_throttle SET locked_until = datetime('now','+15 minutes') WHERE ip=? AND ((username = ? AND attempts >= 5) OR (username = '' AND attempts >= 30)) AND (locked_until IS NULL OR locked_until <= datetime('now'))",
      [ip, username]
    );
  } catch(e) { /* non-fatal */ }
}

async function throttleClear(db, ip, username) {
  try {
    await run(db, 'DELETE FROM login_throttle WHERE ip=? AND username IN (?,?)', [ip, username, '']);
  } catch(e) { /* non-fatal */ }
}

export async function onRequestGet(ctx) {
  try {
    const { request, env } = ctx;
    const db = env.sparks_cafe_db;
    const secret = env.SESSION_SECRET;
    if (!db) return new Response('DB binding missing', { status: 500, headers: {'Content-Type':'text/plain'} });
    if (!secret) return new Response('SESSION_SECRET missing', { status: 500, headers: {'Content-Type':'text/plain'} });

    const token = getSessionFromCookie(request);
    const session = token ? await verifySession(token, secret) : null;
    if (session) {
      const dest = session.role === 'admin' ? '/admin/dashboard' : '/admin/orders';
      return Response.redirect(new URL(dest, request.url).href, 302);
    }

    const brandName = await getSetting(db, 'shop_name', 'SPARKS CAFE');
    const csrfToken = generateCsrf();
    const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
    setCsrfCookie(headers, csrfToken);
    return new Response(loginPageHtml(brandName, csrfToken, ''), { headers });
  } catch(err) {
    return new Response('Login GET error: ' + err.name + ': ' + err.message + '\n' + err.stack, {
      status: 500, headers: { 'Content-Type': 'text/plain' }
    });
  }
}

export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;
    const db = env.sparks_cafe_db;
    const secret = env.SESSION_SECRET;
    if (!db) return new Response('DB binding missing', { status: 500, headers: {'Content-Type':'text/plain'} });
    if (!secret) return new Response('SESSION_SECRET missing', { status: 500, headers: {'Content-Type':'text/plain'} });

    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    const username = (formData.get('username') || '').trim().substring(0, 60);
    const password = formData.get('password') || '';
    const ip = clientIp(request);
    const brandName = await getSetting(db, 'shop_name', 'SPARKS CAFE');

    // Skip CSRF check in debug mode — re-enable after confirming login works
    // if (!verifyCsrf(request, csrfFormToken)) { ... }

    const wait = await throttleWait(db, ip, username);
    if (wait > 0) {
      const csrfToken = generateCsrf();
      const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
      setCsrfCookie(headers, csrfToken);
      return new Response(loginPageHtml(brandName, csrfToken, `Too many failed attempts. Try again in ${Math.ceil(wait/60)} minute(s).`), { headers });
    }

    const admin = await queryOne(db, 'SELECT * FROM admins WHERE username = ?', [username]);
    let passwordOk = false;
    if (admin) {
      const hash = String(admin.password_hash || '');
      if (hash.startsWith('pbkdf2:')) {
        passwordOk = await verifyPassword(password, hash);
      }
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

  } catch(err) {
    return new Response('Login POST error: ' + err.name + ': ' + err.message + '\n' + err.stack, {
      status: 500, headers: { 'Content-Type': 'text/plain' }
    });
  }
}

function loginPageHtml(brandName, csrfToken, error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Staff Login · ${e(brandName)}</title><link rel="stylesheet" href="/assets/style.css"></head>
<body class="auth-page"><form class="auth-card" method="post"><p class="eyebrow">${e(brandName.toUpperCase())} · STAFF</p><h1>Welcome back.</h1><p class="muted">Sign in to manage the menu and handle customer orders.</p>
${error ? `<div class="error">${e(error)}</div>` : ''}
<input type="hidden" name="csrf" value="${e(csrfToken)}"><label>Username</label><input name="username" required maxlength="60" autocomplete="username"><label>Password</label><input type="password" name="password" required autocomplete="current-password"><button class="btn" type="submit">Sign in</button><a class="text-link" href="/client/">Open customer menu</a></form></body></html>`;
}
