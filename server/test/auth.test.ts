import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SENHA = 'senha-de-teste';
process.env.BION_SENHA = SENHA;

const { criarToken, tokenValido, exigeSenha } = await import('../src/auth.js');

test('a trava so liga quando existe senha', () => {
  assert.equal(exigeSenha, true);
});

test('token recem-criado vale', () => {
  assert.equal(tokenValido(criarToken()), true);
});

test('token adulterado nao vale', () => {
  const token = criarToken();
  const [expira, assinatura] = token.split('.');
  const trocado = `${expira}.${(assinatura as string).replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))}`;
  assert.equal(tokenValido(trocado), false);
});

test('nao da pra esticar a validade sem a senha', () => {
  const futuro = Date.now() + 10 * 365 * 24 * 3600 * 1000;
  const assinaturaFalsa = crypto.createHmac('sha256', 'outra-senha').update(String(futuro)).digest('hex');
  assert.equal(tokenValido(`${futuro}.${assinaturaFalsa}`), false);
});

test('token expirado nao vale', () => {
  const passado = Date.now() - 1000;
  const assinatura = crypto.createHmac('sha256', SENHA).update(String(passado)).digest('hex');
  assert.equal(tokenValido(`${passado}.${assinatura}`), false);
});

test('lixo nao vale', () => {
  for (const valor of ['', 'abc', 'abc.def', '.', undefined]) {
    assert.equal(tokenValido(valor as string | undefined), false, `aceitou ${JSON.stringify(valor)}`);
  }
});

// ------------------------------------------------------ a fronteira de verdade
const here = path.dirname(fileURLToPath(import.meta.url));
const entrada = path.join(here, '..', 'src', 'index.ts');
const porta = 4500 + Math.floor(Math.random() * 400);
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'bion-auth-'));
const base = `http://127.0.0.1:${porta}`;

const servidor = spawn(process.execPath, ['--import', 'tsx', entrada], {
  env: { ...process.env, PORT: String(porta), BION_DATA_DIR: dados, BION_SENHA: SENHA, NODE_ENV: 'production' },
  stdio: 'ignore',
});
after(() => servidor.kill('SIGKILL'));

async function esperarServidor(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('servidor nao subiu');
}

test('com senha ligada, a API fica fechada e a interface aberta', async () => {
  await esperarServidor();

  assert.equal((await fetch(`${base}/api/health`)).status, 200, 'health precisa ficar livre para o healthcheck');
  assert.equal((await fetch(`${base}/`)).status, 200, 'a tela de login precisa carregar');

  assert.equal((await fetch(`${base}/api/products`)).status, 401, 'produtos vazaram sem login');
  assert.equal((await fetch(`${base}/api/settings`)).status, 401, 'ajustes vazaram sem login');
  assert.equal((await fetch(`${base}/api/live/stream`)).status, 401, 'o painel vazou sem login');
  assert.equal((await fetch(`${base}/safety/bion-espera.wav`)).status, 401, 'áudio vazou sem login');
  assert.equal(
    (await fetch(`${base}/api/live/stop`, { method: 'POST' })).status,
    401,
    'qualquer um conseguiria derrubar a live',
  );

  const errada = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senha: 'chute' }),
  });
  assert.equal(errada.status, 401);

  const certa = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senha: SENHA }),
  });
  assert.equal(certa.status, 200);
  const cookie = (certa.headers.get('set-cookie') ?? '').split(';')[0] as string;
  assert.match(cookie, /^bion_sessao=/);
  assert.match(certa.headers.get('set-cookie') ?? '', /HttpOnly/i);

  const comLogin = await fetch(`${base}/api/products`, { headers: { cookie } });
  assert.equal(comLogin.status, 200);
});
