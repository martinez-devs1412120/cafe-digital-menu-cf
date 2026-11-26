import { queryAll } from '../_shared/db.js';

export async function onRequest(ctx) {
  const { env } = ctx;
  const db = env.sparks_cafe_db;
  const rows = await queryAll(db, 'SELECT id, is_available FROM products');
  const products = {};
  for (const r of rows) {
    products[String(r.id)] = parseInt(r.is_available);
  }
  return new Response(JSON.stringify({ products, time: Date.now() }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
