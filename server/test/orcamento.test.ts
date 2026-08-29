import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'bion-orc-'));
process.env.BION_DATA_DIR = dados;

const { db, saveSettings, currentLive } = await import('../src/db.js');
const { avaliar, registrarConsumo } = await import('../src/orcamento.js');

function abrirLive(): void {
  db.prepare("INSERT INTO lives (startedAt, status, mode) VALUES (?, 'live', 'ai')").run(Date.now());
}

test('sem teto configurado, nada e barrado', () => {
  abrirLive();
  saveSettings({ limiteCaracteresPorLive: 0 });
  assert.equal(avaliar(999_999).permitido, true);
});

test('abaixo do teto, a voz premium segue', () => {
  saveSettings({ limiteCaracteresPorLive: 1000 });
  const v = avaliar(300);
  assert.equal(v.permitido, true);
  assert.equal(v.limite, 1000);
});

test('o consumo acumula ao longo da live', () => {
  registrarConsumo(300);
  registrarConsumo(400);
  assert.equal(currentLive()?.caracteresPremium, 700);
  assert.equal(avaliar(100).usados, 700);
});

test('a fala que estouraria o teto e barrada antes de gastar', () => {
  const v = avaliar(500); // 700 + 500 > 1000
  assert.equal(v.permitido, false, 'precisa barrar ANTES de chamar o provedor, senao o gasto ja aconteceu');
  assert.match(v.motivo ?? '', /[Tt]eto/);
  assert.equal(currentLive()?.caracteresPremium, 700, 'barrar nao pode consumir cota');
});

test('cabe exatamente no teto ainda passa', () => {
  assert.equal(avaliar(300).permitido, true, '700 + 300 = 1000 e o limite, nao o excesso');
});

test('teto e por live: a proxima comeca do zero', () => {
  db.prepare('UPDATE lives SET endedAt = ? WHERE endedAt IS NULL').run(Date.now());
  abrirLive();
  const v = avaliar(900);
  assert.equal(v.usados, 0);
  assert.equal(v.permitido, true);
});
