import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Precisa vir antes do import do banco: o caminho e resolvido no carregamento.
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'bion-hosp-'));
process.env.BION_DATA_DIR = dados;

const { registrarBoot, diagnostico, pararPulso } = await import('../src/hospedagem.js');
const { db } = await import('../src/db.js');

test('primeiro boot nao pode afirmar que o disco guarda', () => {
  const d = registrarBoot();
  assert.equal(d.boots, 1);
  assert.equal(d.persistenciaConfirmada, false, 'nao ha prova ainda, e afirmar que ha seria mentir');
});

test('sobreviver a um reinicio e a prova de que o disco guarda', () => {
  const d = registrarBoot();
  assert.equal(d.boots, 2);
  assert.equal(d.persistenciaConfirmada, true);
});

test('buraco no pulso vira queda registrada', () => {
  const dezMinAtras = Date.now() - 10 * 60 * 1000;
  db.prepare("UPDATE hospedagem SET valor = ? WHERE chave = 'ultimoSinal'").run(String(dezMinAtras));
  registrarBoot();
  const d = diagnostico();
  assert.equal(d.quedas24h.length, 1, 'a queda de 10 min precisa aparecer');
  assert.ok((d.quedas24h[0]?.segundos ?? 0) >= 590, `esperava ~600s, veio ${d.quedas24h[0]?.segundos}`);
});

test('reinicio rapido de deploy nao conta como queda', () => {
  const antes = diagnostico().quedas24h.length;
  db.prepare("UPDATE hospedagem SET valor = ? WHERE chave = 'ultimoSinal'").run(String(Date.now() - 20_000));
  registrarBoot();
  assert.equal(diagnostico().quedas24h.length, antes, 'deploy normal nao pode virar alarme falso');
});

test('quedas longas e repetidas levantam o sinal de hibernacao', () => {
  assert.equal(diagnostico().hibernando, false, 'uma queda so nao e padrao');
  const agora = Date.now();
  db.prepare('INSERT INTO quedas (de, ate, segundos) VALUES (?, ?, ?)').run(agora - 3_600_000, agora - 3_000_000, 600);
  assert.equal(diagnostico().hibernando, true, 'duas quedas longas em 24h levantam o sinal');
  pararPulso();
});

test('quedas fora da janela de 24h saem do diagnostico', () => {
  const doisDiasAtras = Date.now() - 48 * 60 * 60 * 1000;
  db.prepare('INSERT INTO quedas (de, ate, segundos) VALUES (?, ?, ?)').run(doisDiasAtras, doisDiasAtras + 600_000, 600);
  const d = diagnostico();
  assert.ok(
    d.quedas24h.every((q) => q.ate >= Date.now() - 24 * 60 * 60 * 1000),
    'queda antiga nao pode continuar assombrando o painel',
  );
});
