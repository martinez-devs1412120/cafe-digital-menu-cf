export async function onRequest(ctx) {
  try {
    const response = await ctx.next();
    const status = response.status;
    // Pass through redirects and bodyless responses unchanged
    if (status >= 300 && status < 400) return response;
    if (status === 204 || status === 304 || !response.body) return response;
    const r = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    r.headers.set('X-Frame-Options', 'DENY');
    r.headers.set('X-Content-Type-Options', 'nosniff');
    r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    r.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return r;
  } catch(err) {
    return new Response('Middleware error: ' + err.name + ': ' + err.message + '\n' + err.stack, {
      status: 500, headers: { 'Content-Type': 'text/plain' }
    });
  }
}
