export async function onRequest(ctx) {
  return new Response('Worker is alive', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
