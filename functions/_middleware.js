export async function onRequest(ctx) {
  let response;
  try {
    response = await ctx.next();
  } catch (err) {
    return new Response('Internal error: ' + err.message, { status: 500 });
  }

  // Pass through redirects and bodyless responses unchanged —
  // cloning them triggers a Workers runtime error.
  const status = response.status;
  if (status >= 300 && status < 400) return response;
  if (status === 204 || status === 304) return response;
  if (!response.body) return response;

  try {
    const r = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    r.headers.set('X-Frame-Options', 'DENY');
    r.headers.set('X-Content-Type-Options', 'nosniff');
    r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    r.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return r;
  } catch (err) {
    // If cloning fails for any reason, return the original response unmodified.
    return response;
  }
}
