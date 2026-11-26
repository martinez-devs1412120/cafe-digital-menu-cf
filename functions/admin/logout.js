import { verifyCsrf } from '../_shared/csrf.js';

export async function onRequestGet(ctx) {
  return Response.redirect(new URL('/admin/dashboard', ctx.request.url).href, 302);
}

export async function onRequestPost(ctx) {
  const { request } = ctx;
  const formData = await request.formData();
  const csrfFormToken = formData.get('csrf') || '';
  // Always clear the cookie; CSRF failure just means we still log out
  const headers = new Headers();
  headers.set('Location', new URL('/admin/login', request.url).href);
  headers.append('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return new Response(null, { status: 302, headers });
}
