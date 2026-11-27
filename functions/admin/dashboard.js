import { verifySession, getSessionFromCookie } from '../_shared/auth.js';

// The dashboard merged into the Orders board — this route only keeps old
// bookmarks alive by forwarding to the live orders home.
export async function onRequest(ctx) {
  const { request, env } = ctx;
  const token = getSessionFromCookie(request);
  const session = token ? await verifySession(token, env.SESSION_SECRET) : null;
  return Response.redirect(new URL(session ? '/admin/orders' : '/admin/login', request.url).href, 302);
}
