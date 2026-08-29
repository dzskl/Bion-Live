/**
 * Teste de ponta a ponta do fluxo real do Bion Live, com navegador de verdade:
 * configuracao -> live -> narracao -> failover -> alerta -> assumir manualmente.
 *
 * Roda contra o build (`npm run build`) para exercitar o mesmo processo que o
 * lojista roda em producao: uma porta, um comando.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = Number(process.env.E2E_PORT ?? 4123);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bion-e2e-'));
const SHOTS = process.env.E2E_SHOTS ?? path.join(DATA_DIR, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const steps = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures++;
  steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(label, fn, timeoutMs = 15_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await wait(intervalMs);
  }
  throw new Error(`tempo esgotado esperando: ${label} (ultimo: ${JSON.stringify(last)?.slice(0, 120)})`);
}

/** Chromium headless nao tem voz instalada; simulamos o motor do navegador. */
const SPEECH_STUB = `
(() => {
  const voices = [
    { name: 'Luciana', lang: 'pt-BR', default: true, localService: true, voiceURI: 'Luciana' },
    { name: 'Felipe', lang: 'pt-BR', default: false, localService: true, voiceURI: 'Felipe' },
  ];
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => voices,
    speak(u) {
      synth.speaking = true;
      window.__spoken = (window.__spoken || []).concat(u.text);
      setTimeout(() => { synth.speaking = false; u.onend && u.onend({}); }, 250);
    },
    cancel() { synth.speaking = false; },
    pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
})();
`;

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), BION_DATA_DIR: DATA_DIR, BION_HEARTBEAT_TIMEOUT_MS: '5000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

let browser;
try {
  await until('servidor no ar', async () => (await fetch(`${BASE}/api/health`)).ok, 20_000);
  check('servidor sobe servindo API e interface na mesma porta', true);

  // Reaproveita o Chromium ja instalado na maquina quando existir (evita download).
  const chromePath = process.env.E2E_CHROME ?? '/opt/pw-browsers/chromium';
  browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
    ...(fs.existsSync(chromePath) ? { executablePath: fs.realpathSync(chromePath) } : {}),
  });
  const page = await browser.newPage();
  await page.addInitScript(SPEECH_STUB);
  page.on('pageerror', (err) => console.log('  [erro no navegador]', err.message));

  // A interface ja subiu sem estilo uma vez em producao. Qualquer asset estatico
  // que nao responda 200 e falha de build ou de entrega, nunca "so um detalhe".
  const falhasEstaticas = [];
  page.on('response', (r) => {
    const caminho = new URL(r.url()).pathname;
    if (r.status() >= 400 && !caminho.startsWith('/api/')) falhasEstaticas.push(`${r.status()} ${caminho}`);
  });
  await page.goto(BASE, { waitUntil: 'load' });

  // Interface sem estilo ja chegou em producao uma vez: o CSS agora vai inline
  // no HTML, e este check garante que continue assim.
  const estilo = await page.evaluate(() => ({
    // Uma variavel do nosso tema: so existe se a folha de estilo entrou.
    tema: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    fonte: getComputedStyle(document.body).fontFamily,
  }));
  check('folha de estilo aplicada', estilo.tema === '#0d1017' && /Inter/.test(estilo.fonte), JSON.stringify(estilo));
  const requisicoesCss = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.css')).length,
  );
  check('estilo nao depende de request separado', requisicoesCss === 0, `${requisicoesCss} arquivos .css`);

  // Cada arquivo publicado precisa ser servido de fato, com o tipo certo.
  const distDir = path.join(process.cwd(), 'web', 'dist');
  const publicados = fs
    .readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.posix.join(path.relative(distDir, e.parentPath ?? e.path).split(path.sep).join('/'), e.name))
    .map((rel) => '/' + rel.replace(/^\/+/, ''));
  const tiposEsperados = { '.js': /javascript/, '.css': /text\/css/, '.html': /text\/html/, '.svg': /image\/svg/ };
  const problemas = [];
  for (const rel of publicados) {
    const resposta = await fetch(`${BASE}${rel}`);
    const tipo = resposta.headers.get('content-type') ?? '';
    const esperado = tiposEsperados[path.extname(rel)];
    if (!resposta.ok) problemas.push(`${resposta.status} ${rel}`);
    else if (esperado && !esperado.test(tipo)) problemas.push(`${rel} veio como ${tipo}`);
  }
  check(
    'todo arquivo publicado e servido com o tipo certo',
    problemas.length === 0,
    problemas.length ? problemas.join('; ') : `${publicados.length} arquivos conferidos`,
  );

  // ---------------------------------------------------------------- configuracao
  const setupStart = Date.now();
  await page.getByPlaceholder('Ateliê da Bia').fill('Ateliê da Bia');
  await page.getByPlaceholder('Nome do produto').fill('Kit 3 Camisetas Básicas');
  await page.getByPlaceholder('R$ 89,90').fill('89,90');
  await page.getByPlaceholder('Frase de destaque (o que faz vender)').fill('algodão pima, não amassa');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByText('Kit 3 Camisetas Básicas').waitFor({ timeout: 5000 });
  check('cadastro de produto sem passo tecnico', true);

  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByText('Escolha a voz').waitFor({ timeout: 5000 });
  await page.locator('.voice-card', { hasText: 'Rafa' }).click();
  check('catalogo curto de vozes', (await page.locator('.voice-card').count()) <= 5, `${await page.locator('.voice-card').count()} vozes`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByRole('button', { name: 'Configurar depois' }).click();
  await page.getByText('Verificação automática').waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, '1-verificacao.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ir para o painel da live' }).click();
  await page.locator('.numbers').waitFor({ timeout: 5000 });
  const setupSeconds = (Date.now() - setupStart) / 1000;
  check('configuracao completa sem terminal e sem instalar nada', true, `${setupSeconds.toFixed(1)}s de interacao`);

  // ---------------------------------------------------------------------- live
  await page.getByRole('button', { name: 'Iniciar live' }).click();
  const falando = page.locator('.now-speaking p');
  await until('primeira fala', async () => {
    const text = await falando.textContent();
    return text && text.includes('Ateliê da Bia');
  });
  check('abertura da live cita o nome da loja', true);

  const narrouProduto = await until('fala de produto', async () => {
    const text = (await falando.textContent()) ?? '';
    return text.includes('Kit 3 Camisetas Básicas') ? text : false;
  }, 20_000);
  check('narracao cita nome do produto', narrouProduto.includes('Kit 3 Camisetas Básicas'));
  check('narracao cita o preco falado', /89 reais e 90 centavos/.test(narrouProduto), narrouProduto.slice(0, 90));

  const spoken = await page.evaluate(() => window.__spoken ?? []);
  check('audio saiu pela voz do navegador, sem cabo virtual', spoken.length > 0, `${spoken.length} falas`);

  check('painel tem exatamente 3 numeros', (await page.locator('.numbers .number').count()) === 3);

  // ------------------------------------------- procedencia dos numeros (Fase 1.1)
  const audiencia = page.locator('.numbers .number').first().locator('strong');
  const vendas = page.locator('.numbers .number').nth(1).locator('strong');
  check(
    'sem integracao o painel nao inventa zero',
    (await audiencia.textContent())?.trim() === '—' && (await vendas.textContent())?.trim() === '—',
    `audiencia=${(await audiencia.textContent())?.trim()} vendas=${(await vendas.textContent())?.trim()}`,
  );
  check('simulador nao liga junto com a live', (await page.locator('.chip-sim').count()) === 0);
  await page.screenshot({ path: path.join(SHOTS, '2-live.png'), fullPage: true });

  await page.getByRole('button', { name: 'Mostrar' }).click();
  await page.getByRole('button', { name: 'Ligar demo' }).click();
  await until('audiencia simulada aparece', async () => Number(await audiencia.textContent()) > 0);
  check('modo demo alimenta o painel quando ligado de proposito', true);
  check('todo numero simulado vem rotulado', (await page.locator('.chip-sim').count()) === 2, `${await page.locator('.chip-sim').count()} rotulos`);
  const avisoDemo = await page.locator('.banner-warn').first().textContent();
  check('banner avisa que os numeros sao inventados', /Modo demo ligado/.test(avisoDemo ?? ''), (avisoDemo ?? '').slice(0, 70));
  await until('venda simulada aparece', async () => Number(await vendas.textContent()) > 0, 45_000);
  check('modo demo conta vendas', true);
  await page.screenshot({ path: path.join(SHOTS, '2b-demo.png'), fullPage: true });

  await page.getByRole('button', { name: 'Desligar demo' }).click();
  await until('painel volta a nao afirmar nada', async () => (await audiencia.textContent())?.trim() === '—');
  check('desligar o demo devolve o painel ao estado honesto', (await page.locator('.chip-sim').count()) === 0);
  await page.getByRole('button', { name: 'Ligar demo' }).click();

  // ------------------------------------------ medidor de ritmo embutido (Fase 1.5)
  const ritmoVisivel = await page.locator('.ritmo span').first().locator('strong').textContent();
  check('o painel mede o ritmo da narracao sozinho', Number(ritmoVisivel) > 0, `${ritmoVisivel} falas/min à vista`);
  const vereditoRitmo = await page.locator('.ritmo').locator('xpath=following-sibling::div[1]').textContent();
  check(
    'o medidor pede mais tempo em vez de concluir cedo demais',
    /linha de base|minimize/i.test(vereditoRitmo ?? ''),
    (vereditoRitmo ?? '').slice(0, 70),
  );

  // ------------------------------------------------------------------ failover
  await page.getByRole('button', { name: 'Derrubar voz do navegador' }).click();
  const bannerFalha = page.locator('.banner-down').first();
  await bannerFalha.waitFor({ timeout: 20_000 });
  check('failover automatico para o audio de seguranca', /Áudio de segurança no ar/.test((await bannerFalha.textContent()) ?? ''));
  await until('alerta registrado', async () => {
    const res = await fetch(`${BASE}/api/live/events?limit=50`);
    const { events } = await res.json();
    return events.some((e) => e.type === 'alert');
  });
  check('alerta disparado na falha de voz', true);
  await page.screenshot({ path: path.join(SHOTS, '3-failover.png'), fullPage: true });

  await page.getByRole('button', { name: 'Religar voz do navegador' }).click();
  await until('recuperacao', async () => (await page.locator('.banner-down').count()) === 0, 30_000);
  check('volta sozinho quando a voz normaliza', true);

  // -------------------------------------------------- watchdog: aba que morre
  await page.getByRole('button', { name: 'Simular aba travada' }).click();
  await until('watchdog', async () => {
    const res = await fetch(`${BASE}/api/live/events?limit=50`);
    const { events } = await res.json();
    return events.some((e) => e.type === 'failover' && /heartbeat/i.test(e.message));
  }, 25_000);
  check('watchdog do servidor percebe o navegador morto', true);
  await page.getByRole('button', { name: 'Reanimar aba travada' }).click();
  await until('watchdog normaliza', async () => {
    const res = await fetch(`${BASE}/api/live/events?limit=60`);
    const { events } = await res.json();
    return events.some((e) => e.type === 'recovered');
  }, 25_000);
  check('watchdog avisa quando volta ao normal', true);

  // --------------------------------------------------------- botao de emergencia
  await page.getByRole('button', { name: 'Pausar e assumir eu mesmo' }).click();
  await page.getByText('Você está no comando').waitFor({ timeout: 8000 });
  const cursorAntes = (await (await fetch(`${BASE}/api/live/state`)).json()).live.cursor;
  check('botao de emergencia cala a IA na hora', true);
  await page.screenshot({ path: path.join(SHOTS, '4-manual.png'), fullPage: true });

  await page.getByRole('button', { name: 'Devolver para a IA' }).click();
  await until('IA retoma', async () => {
    const state = await (await fetch(`${BASE}/api/live/state`)).json();
    return state.live.mode === 'ai' && state.live.cursor >= cursorAntes;
  });
  const depois = await (await fetch(`${BASE}/api/live/state`)).json();
  check('retomar nao perde configuracao nem roteiro', depois.live.cursor >= cursorAntes, `cursor ${cursorAntes} -> ${depois.live.cursor}`);
  check('produtos continuam cadastrados apos assumir e devolver', depois.productCount === 1);

  await page.getByRole('button', { name: 'Encerrar live' }).click();
  await until('live encerrada', async () => {
    const state = await (await fetch(`${BASE}/api/live/state`)).json();
    return state.live === null;
  });
  check('encerrar live limpa o estado', true);

  check(
    'nenhum asset estatico falhou durante toda a sessao',
    falhasEstaticas.length === 0,
    falhasEstaticas.length ? falhasEstaticas.join('; ') : 'nenhuma resposta >= 400 fora da API',
  );
} catch (err) {
  failures++;
  console.log(`FALHA  execucao interrompida - ${err.message}`);
  if (serverLog.length) console.log('--- log do servidor ---\n' + serverLog.join(''));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

console.log(`\n${steps.filter((s) => s.ok).length}/${steps.length} verificacoes passaram. Screenshots em ${SHOTS}`);
process.exit(failures === 0 ? 0 : 1);
