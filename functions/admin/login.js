export async function onRequestGet(ctx) {
  return new Response('GET OK - no imports', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function onRequestPost(ctx) {
  try {
    const formData = await ctx.request.formData();
    const username = formData.get('username') || '';
    const password = formData.get('password') || '';
    const db = ctx.env.sparks_cafe_db;
    const secret = ctx.env.SESSION_SECRET;
    return new Response(
      'POST OK\nusername=' + username + '\nhas_db=' + !!db + '\nhas_secret=' + !!secret,
      { status: 200, headers: { 'Content-Type': 'text/plain' } }
    );
  } catch(err) {
    return new Response('POST error: ' + err.name + ': ' + err.message + '\n' + err.stack, {
      status: 500, headers: { 'Content-Type': 'text/plain' }
    });
  }
}
