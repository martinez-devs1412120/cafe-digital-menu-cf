export async function onRequest(ctx) {
  const response = await ctx.next();
  const r = new Response(response.body, response);
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  r.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return r;
}
