import { queryAll } from '../_shared/db.js';

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = env.sparks_cafe_db;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!Array.isArray(body?.ids)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid ids array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ids = {};
  for (const raw of body.ids) {
    const id = parseInt(raw);
    if (id > 0) ids[id] = true;
    if (Object.keys(ids).length >= 50) break;
  }

  if (!Object.keys(ids).length) {
    return new Response(JSON.stringify({ products: {} }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const idList = Object.keys(ids).map(Number);
  const placeholders = idList.map(() => '?').join(',');
  const rows = await queryAll(db, `SELECT id, price, is_available FROM products WHERE id IN (${placeholders})`, idList);

  const products = {};
  for (const row of rows) {
    products[String(parseInt(row.id))] = {
      price: parseFloat(row.price),
      available: parseInt(row.is_available) === 1,
    };
  }

  return new Response(JSON.stringify({ products: Object.keys(products).length ? products : {} }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
