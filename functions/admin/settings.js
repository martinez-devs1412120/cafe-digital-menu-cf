import { queryAll, queryOne, run, getSetting, settingSet, e } from '../_shared/db.js';
import { verifySession, getSessionFromCookie, hashPassword, verifyPassword } from '../_shared/auth.js';
import { adminLayout } from '../_shared/layout.js';
import { generateCsrf, setCsrfCookie, verifyCsrf } from '../_shared/csrf.js';

function isPrivateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    // Check private IP ranges
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
    }
    return false;
  } catch { return false; }
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const db = env.sparks_cafe_db;
  const secret = env.SESSION_SECRET;
  const url = new URL(request.url);

  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return Response.redirect(new URL('/admin/login', request.url).href, 302);
  if (session.role !== 'admin') return Response.redirect(new URL('/admin/orders', request.url).href, 302);

  const shopName = await getSetting(db, 'shop_name', 'SPARKS CAFE');

  if (request.method === 'POST') {
    const formData = await request.formData();
    const csrfFormToken = formData.get('csrf') || '';
    if (!verifyCsrf(request, csrfFormToken)) {
      return Response.redirect(new URL('/admin/settings', request.url).href, 302);
    }

    const section = formData.get('section') || '';

    if (section === 'brand') {
      const shop = (formData.get('shop_name') || '').trim();
      if (!shop || shop.length > 60) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Shop name must be 1-60 characters.'), request.url).href, 302);
      }
      await settingSet(db, 'shop_name', shop);
      return Response.redirect(new URL('/admin/settings?saved=1', request.url).href, 302);
    }

    if (section === 'menu') {
      let menu = (formData.get('menu_base_url') || '').trim().replace(/\/$/, '');
      const valid = menu === '' || (
        /^https:\/\//i.test(menu) &&
        (() => { try { new URL(menu); return true; } catch { return false; } })() &&
        !isPrivateUrl(menu)
      );
      if (!valid) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Menu address must be a public https:// address, not localhost or a private IP. Example: https://sparks-aurora.pages.dev'), request.url).href, 302);
      }
      await settingSet(db, 'menu_base_url', menu);
      return Response.redirect(new URL('/admin/settings?saved=1', request.url).href, 302);
    }

    if (section === 'team_add') {
      const uname = (formData.get('username') || '').trim().substring(0, 60);
      const pwd = formData.get('password') || '';
      const role = formData.get('role') === 'admin' ? 'admin' : 'staff';
      if (!uname || pwd.length < 8) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Enter a username and a password with at least 8 characters.'), request.url).href, 302);
      }
      try {
        const hash = await hashPassword(pwd);
        await run(db, 'INSERT INTO admins(username, password_hash, role) VALUES(?,?,?)', [uname, hash, role]);
      } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('unique') || msg.includes('constraint')) {
          return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('That username is already taken.'), request.url).href, 302);
        }
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Could not create account.'), request.url).href, 302);
      }
      return Response.redirect(new URL('/admin/settings?saved=1', request.url).href, 302);
    }

    if (section === 'team_delete') {
      const teamId = parseInt(formData.get('team_id') || 0);
      if (teamId === session.admin_id) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('You cannot delete the account you are signed in with.'), request.url).href, 302);
      }
      const target = await queryOne(db, 'SELECT role FROM admins WHERE id = ?', [teamId]);
      if (target && target.role === 'admin') {
        const countRow = await queryOne(db, "SELECT COUNT(*) AS n FROM admins WHERE role = 'admin'");
        if (!countRow || countRow.n <= 1) {
          return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Keep at least one admin account.'), request.url).href, 302);
        }
      }
      if (target) await run(db, 'DELETE FROM admins WHERE id = ?', [teamId]);
      return Response.redirect(new URL('/admin/settings?saved=1', request.url).href, 302);
    }

    if (section === 'password') {
      const current = formData.get('current_password') || '';
      const newPwd = formData.get('new_password') || '';
      const myAdmin = await queryOne(db, 'SELECT password_hash FROM admins WHERE id = ?', [session.admin_id]);
      const hash = myAdmin ? String(myAdmin.password_hash || '') : '';
      let ok = false;
      if (hash.startsWith('pbkdf2:')) {
        ok = await verifyPassword(current, hash);
      }
      if (!ok) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('Your current password is incorrect.'), request.url).href, 302);
      }
      if (newPwd.length < 8) {
        return Response.redirect(new URL('/admin/settings?error=' + encodeURIComponent('The new password must have at least 8 characters.'), request.url).href, 302);
      }
      const newHash = await hashPassword(newPwd);
      await run(db, 'UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, session.admin_id]);
      return Response.redirect(new URL('/admin/settings?saved=1', request.url).href, 302);
    }

    return Response.redirect(new URL('/admin/settings', request.url).href, 302);
  }

  // GET
  const S = await (async () => {
    const rows = await queryAll(db, 'SELECT skey, svalue FROM settings');
    const o = {};
    for (const r of rows) o[r.skey] = r.svalue || '';
    return o;
  })();
  const team = await queryAll(db, 'SELECT id, username, role, created_at FROM admins ORDER BY role, username');
  const menuBaseUrl = await getSetting(db, 'menu_base_url', 'https://sparks-aurora.pages.dev');
  const menuUrl = (menuBaseUrl || 'https://sparks-aurora.pages.dev').replace(/\/$/, '') + '/client/';
  const savedMsg = url.searchParams.has('saved') ? '<div class="success-banner">Settings saved.</div>' : '';
  const errorMsg = url.searchParams.get('error') ? `<div class="error-banner">${e(url.searchParams.get('error'))}</div>` : '';

  const csrfToken = generateCsrf();

  const teamRows = team.map(member => `<tr>
    <td>${e(member.username)}</td>
    <td><span class="status ${member.role === 'admin' ? 'st-ready' : 'st-preparing'}">${e(member.role.charAt(0).toUpperCase() + member.role.slice(1))}</span></td>
    <td>${e(member.created_at)}</td>
    <td>${parseInt(member.id) !== session.admin_id
      ? `<form method="post" class="inline-form confirm-delete"><input type="hidden" name="csrf" value="${e(csrfToken)}"><input type="hidden" name="section" value="team_delete"><input type="hidden" name="team_id" value="${member.id}"><button class="text-link danger-text link-button" type="submit">Delete</button></form>`
      : '<span class="muted">You</span>'
    }</td>
  </tr>`).join('');

  const bodyHtml = `
${savedMsg}${errorMsg}
<div class="page-heading"><div><p class="eyebrow">SHOP CONFIGURATION</p><h1>Settings</h1><p class="muted">Café branding, public menu address, and team accounts.</p></div></div>

<div class="panel panel-narrow">
  <h2>Café identity</h2>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="brand">
    <label>Shop name — shown on the customer menu and printed standee</label>
    <input name="shop_name" required maxlength="60" value="${e(S.shop_name || 'SPARKS CAFE')}">
    <button class="btn" type="submit">Save shop name</button>
  </form>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="menu">
    <label>Public menu address for QR codes (no trailing slash)</label>
    <input name="menu_base_url" maxlength="200" inputmode="url" placeholder="https://sparks-aurora.pages.dev" value="${e(S.menu_base_url || '')}">
    <button class="btn" type="submit">Save menu address</button>
  </form>
  <p class="muted small-note">Current QR base: <span class="mono">${e(menuBaseUrl)}</span><br>Full menu URL: <span class="mono">${e(menuUrl)}</span></p>
</div>

<div class="panel panel-narrow">
  <h2>Team accounts</h2>
  <p class="muted">Staff accounts can open the live Orders board. Admin accounts can also change the menu, tables, settings and team.</p>
  <div class="table-wrap"><table><thead><tr><th>Username</th><th>Role</th><th>Created</th><th></th></tr></thead><tbody>
  ${teamRows}
  </tbody></table></div>
  <h3>Add a team account</h3>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="team_add">
    <label>Username</label><input name="username" required maxlength="60" autocomplete="off">
    <label>Password (minimum 8 characters)</label><input type="password" name="password" required minlength="8" autocomplete="new-password">
    <label>Role</label><select name="role"><option value="staff">Staff — orders only</option><option value="admin">Admin — full access</option></select>
    <button class="btn" type="submit">Create account</button>
  </form>
</div>

<div class="panel panel-narrow">
  <h2>Change my password</h2>
  <form method="post">
    <input type="hidden" name="csrf" value="${e(csrfToken)}">
    <input type="hidden" name="section" value="password">
    <label>Current password</label><input type="password" name="current_password" required autocomplete="current-password">
    <label>New password (minimum 8 characters)</label><input type="password" name="new_password" required minlength="8" autocomplete="new-password">
    <button class="btn" type="submit">Update password</button>
  </form>
</div>`;

  const html = adminLayout(session, 'Settings', shopName, '/admin/settings', bodyHtml, csrfToken);
  const headers = new Headers({ 'Content-Type': 'text/html;charset=utf-8' });
  setCsrfCookie(headers, csrfToken);
  return new Response(html, { headers });
}
