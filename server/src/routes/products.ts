import { Router } from 'express';
import { db, getProduct, listProducts } from '../db.js';
import { publish } from '../engine.js';
import type { Product } from '../types.js';

export const productsRouter = Router();

interface ProductBody {
  name?: unknown;
  priceCents?: unknown;
  price?: unknown;
  highlight?: unknown;
  active?: unknown;
}

/** Aceita 89,90 / 89.90 / R$ 89,90 / 8990 (centavos já prontos). */
export function parsePrice(body: ProductBody): number | null {
  if (typeof body.priceCents === 'number' && Number.isFinite(body.priceCents)) {
    return Math.max(0, Math.round(body.priceCents));
  }
  const raw = body.price ?? body.priceCents;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw * 100));
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value * 100));
}

productsRouter.get('/', (_req, res) => {
  res.json({ products: listProducts() });
});

productsRouter.post('/', (req, res) => {
  const body = req.body as ProductBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const priceCents = parsePrice(body);
  const highlight = typeof body.highlight === 'string' ? body.highlight.trim() : '';
  if (!name) return res.status(400).json({ error: 'Informe o nome do produto' });
  if (priceCents === null) return res.status(400).json({ error: 'Informe um preço válido' });

  const maxRow = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM products').get() as { max: number };
  const info = db
    .prepare('INSERT INTO products (name, priceCents, highlight, position, active) VALUES (?, ?, ?, ?, 1)')
    .run(name, priceCents, highlight, Number(maxRow.max) + 1);
  publish();
  res.status(201).json({ product: getProduct(Number(info.lastInsertRowid)) });
});

productsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
  const body = req.body as ProductBody;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name;
  const parsed = parsePrice(body);
  const priceCents = parsed === null ? existing.priceCents : parsed;
  const highlight = typeof body.highlight === 'string' ? body.highlight.trim() : existing.highlight;
  const active: Product['active'] = body.active === undefined ? existing.active : body.active ? 1 : 0;
  db.prepare('UPDATE products SET name = ?, priceCents = ?, highlight = ?, active = ? WHERE id = ?').run(
    name,
    priceCents,
    highlight,
    active,
    id,
  );
  publish();
  res.json({ product: getProduct(id) });
});

productsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  publish();
  res.json({ ok: true });
});

productsRouter.post('/reorder', (req, res) => {
  const ids = (req.body as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Envie a lista de ids' });
  const stmt = db.prepare('UPDATE products SET position = ? WHERE id = ?');
  ids.forEach((id, index) => stmt.run(index + 1, Number(id)));
  publish();
  res.json({ products: listProducts() });
});
