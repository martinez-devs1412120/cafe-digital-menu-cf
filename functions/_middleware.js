export async function onRequest(ctx) {
  try {
    const response = await ctx.next();
    return response;
  } catch (err) {
    return new Response(
      'WORKER ERROR: ' + err.name + ': ' + err.message + '\n\nStack:\n' + (err.stack || 'no stack'),
      { status: 500, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}
