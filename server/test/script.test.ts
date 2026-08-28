import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineAt, lineForProduct, speakablePrice, sentenceCase } from '../src/script.js';
import type { Product } from '../src/types.js';

const product = (id: number, name: string, priceCents: number, highlight = ''): Product => ({
  id,
  name,
  priceCents,
  highlight,
  position: id,
  active: 1,
});

test('preco e falado, nao lido em simbolos', () => {
  assert.equal(speakablePrice(8990), '89 reais e 90 centavos');
  assert.equal(speakablePrice(24900), '249 reais');
  assert.equal(speakablePrice(100), '1 real');
  assert.equal(speakablePrice(1), '1 centavo');
  assert.equal(speakablePrice(90), '90 centavos');
});

test('destaque em minuscula vira frase', () => {
  assert.equal(sentenceCase('olha so. algodao pima. legal'), 'Olha so. Algodao pima. Legal');
});

test('a fala cita nome, preco e destaque', () => {
  const text = lineForProduct(product(1, 'Kit Camisetas', 8990, 'algodao pima'), 0, 0);
  assert.match(text, /Kit Camisetas/);
  assert.match(text, /89 reais e 90 centavos/);
  assert.match(text, /[Aa]lgodao pima/);
});

test('o loop nao repete a mesma fala em voltas seguidas', () => {
  const p = product(1, 'Kit Camisetas', 8990, 'algodao pima');
  const falas = new Set<string>();
  for (let pass = 0; pass < 6; pass++) falas.add(lineForProduct(p, pass, 0));
  assert.ok(falas.size >= 5, `esperava variacao, veio ${falas.size} falas distintas`);
});

test('o roteiro alterna produtos e quebras de engajamento', () => {
  const products = [product(1, 'A', 1000, 'x'), product(2, 'B', 2000, 'y')];
  const lines = Array.from({ length: 13 }, (_, cursor) => lineAt(products, cursor, 'Loja Teste'));
  assert.equal(lines[0]?.kind, 'opening');
  assert.match(lines[0]?.text ?? '', /Loja Teste/);
  assert.ok(lines.some((l) => l.kind === 'interstitial' && l.cursor > 0));
  assert.ok(lines.some((l) => l.productId === 1));
  assert.ok(lines.some((l) => l.productId === 2));
});

test('sem produto a IA avisa em vez de ficar muda', () => {
  const line = lineAt([], 3, '');
  assert.equal(line.productId, null);
  assert.match(line.text, /produto/i);
});
