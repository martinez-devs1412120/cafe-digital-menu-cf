import { queryOne, run, e } from '../_shared/db.js';
import { hashPassword } from '../_shared/auth.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

function setupPageHtml(csrfToken, message, count) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Set up admin</title><link rel="stylesheet" href="/assets/style.css"></head>
<body class="auth-page"><form class="auth-card" method="post"><p class="eyebrow">FIRST-TIME SETUP</p><h1>Create admin</h1>
${message ? `<div class="notice">${e(message)}</div>` : ''}
${count > 0
  ? `<p>An admin account already exists. Go to <a href="/admin/login">admin login</a>.</p>`
  : `<input type="hidden" name="csrf" value="${e(csrfToken)}"><label>Username</label><input name="username" required maxlength="60"><label>Password (minimum 8 characters)</label><input type="password" name="password" minlength="8" required><button class="btn" type="submit">Create admin account</button>`
}
</form></body></html>`;
}

export async function onRequestGet(ctx) {
  const { env } = ctx;
  const db = env.sparks_cafe_db;
  const countRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM admins');
  const count = countRow ? (countRow.n || 0) : 0;
  if (count > 0) {
    return new Response('Not found.', { status: 404 });
  }
  const csrfToken = generateCsrf();
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(setupPageHtml(csrfToken, '', 0), { headers });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;

  const countRow = await queryOne(db, 'SELECT COUNT(*) AS n FROM admins');
  const count = countRow ? (countRow.n || 0) : 0;
  if (count > 0) {
    return new Response('Not found.', { status: 404 });
  }

  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';
  if (!verifyCsrf(request, csrfFormToken)) {
    const csrfToken = generateCsrf();
    const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
    setCsrfCookie(headers, csrfToken);
    return new Response(setupPageHtml(csrfToken, 'Invalid form token. Please try again.', 0), { headers });
  }

  const username = (formData.get('username') || '').trim();
  const password = formData.get('password') || '';

  if (!username || password.length < 8) {
    const csrfToken = generateCsrf();
    const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
    setCsrfCookie(headers, csrfToken);
    return new Response(setupPageHtml(csrfToken, 'Enter a username and a password with at least 8 characters.', 0), { headers });
  }

  const hash = await hashPassword(password);
  await run(db, "INSERT INTO admins(username, password_hash, role) VALUES(?,?,'admin')", [username, hash]);

  return new Response(setupPageHtml('', 'Admin created. Sign in at /admin/login.', 1), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}
