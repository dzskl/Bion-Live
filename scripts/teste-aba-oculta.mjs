/**
 * Mede o que acontece com a narração quando a aba do lojista vai para segundo
 * plano — a lacuna que o relatório anterior marcou como "não testado".
 *
 * O Chrome estrangula temporizadores de abas ocultas, e depois de 5 minutos
 * aplica o estrangulamento agressivo (cerca de uma volta por minuto). O loop de
 * narração depende desses temporizadores.
 *
 * Roda duas instâncias em paralelo, idênticas exceto por uma coisa: uma com o
 * keepalive de áudio ligado, outra sem. Sem esse controle o teste não valeria
 * nada — se nenhuma das duas desacelerasse, seria impossível saber se a
 * proteção funcionou ou se este ambiente simplesmente não estrangula.
 *
 *   node scripts/teste-aba-oculta.mjs            # 90s visível + 10min oculta
 *   MINUTOS_OCULTA=2 node scripts/teste-aba-oculta.mjs   # versão curta
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SEG_VISIVEL = Number(process.env.SEGUNDOS_VISIVEL ?? 90);
const SEG_OCULTA = Number(process.env.MINUTOS_OCULTA ?? 10) * 60;

const SPEECH_STUB = `
(() => {
  const voices = [{ name: 'Luciana', lang: 'pt-BR', default: true, localService: true, voiceURI: 'Luciana' }];
  const synth = {
    speaking: false, paused: false, pending: false,
    getVoices: () => voices,
    speak(u) { synth.speaking = true; setTimeout(() => { synth.speaking = false; u.onend && u.onend({}); }, 250); },
    cancel() { synth.speaking = false; }, pause() {}, resume() {},
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
})();
`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function subirServidor(porta, dir) {
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/dist/index.js'], {
    env: { ...process.env, PORT: String(porta), BION_DATA_DIR: dir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://localhost:${porta}/api/health`)).ok) return proc;
    } catch {
      /* subindo */
    }
    await espera(250);
  }
  throw new Error(`servidor da porta ${porta} não subiu`);
}

async function cursor(base) {
  const estado = await (await fetch(`${base}/api/live/state`)).json();
  return estado.live?.cursor ?? 0;
}

async function medir(nome, keepalive, porta) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bion-oculta-${porta}-`));
  const base = `http://localhost:${porta}`;
  const servidor = await subirServidor(porta, dir);

  // Configura por API: o objetivo aqui é o loop, não a interface.
  await fetch(`${base}/api/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Kit Camisetas', price: '89,90', highlight: 'algodão pima' }),
  });
  await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeName: 'Teste', onboardingDone: true }),
  });

  const chromePath = process.env.E2E_CHROME ?? '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
    ...(fs.existsSync(chromePath) ? { executablePath: fs.realpathSync(chromePath) } : {}),
  });
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.addInitScript(SPEECH_STUB);
  if (!keepalive) await pagina.addInitScript('window.__bionSemKeepalive = true;');
  await pagina.goto(base, { waitUntil: 'load' });
  await pagina.getByRole('button', { name: 'Iniciar live' }).click();
  await espera(3000);

  const inicioVisivel = await cursor(base);
  await espera(SEG_VISIVEL * 1000);
  const fimVisivel = await cursor(base);
  const porMinutoVisivel = ((fimVisivel - inicioVisivel) / SEG_VISIVEL) * 60;

  // Uma segunda aba na frente é o que realmente oculta a primeira.
  const outra = await contexto.newPage();
  await outra.goto('about:blank');
  await outra.bringToFront();
  const oculta = await pagina.evaluate(() => document.hidden);

  const inicioOculta = await cursor(base);
  await espera(SEG_OCULTA * 1000);
  const fimOculta = await cursor(base);
  const porMinutoOculta = ((fimOculta - inicioOculta) / SEG_OCULTA) * 60;

  await browser.close();
  servidor.kill('SIGTERM');

  const razao = porMinutoVisivel > 0 ? porMinutoOculta / porMinutoVisivel : 0;
  return { nome, keepalive, oculta, porMinutoVisivel, porMinutoOculta, razao };
}

console.log(`Medindo ${SEG_VISIVEL}s visível + ${SEG_OCULTA / 60}min oculta, nas duas variantes em paralelo.`);
console.log('Isso leva alguns minutos. O controle sem keepalive é o que dá sentido ao resultado.\n');

const resultados = await Promise.all([
  medir('com keepalive de áudio', true, 4301),
  medir('sem keepalive (controle)', false, 4302),
]);

for (const r of resultados) {
  console.log(`${r.nome}`);
  console.log(`  aba realmente oculta: ${r.oculta}`);
  console.log(`  falas/min visível: ${r.porMinutoVisivel.toFixed(1)}`);
  console.log(`  falas/min oculta:  ${r.porMinutoOculta.toFixed(1)}`);
  console.log(`  manteve ${(r.razao * 100).toFixed(0)}% do ritmo\n`);
}

const comKeep = resultados.find((r) => r.keepalive);
const semKeep = resultados.find((r) => !r.keepalive);
const LIMIAR = 0.7;

if (!comKeep?.oculta) {
  console.log('INCONCLUSIVO: a aba não ficou oculta de verdade; a medição não vale.');
  process.exit(1);
} else if ((semKeep?.razao ?? 1) >= LIMIAR) {
  console.log(
    'INCONCLUSIVO: nem o controle desacelerou, então este ambiente não reproduz o\n' +
      'estrangulamento do Chrome. O keepalive continua sendo a proteção correta, mas\n' +
      'este teste não prova que ele é necessário. Confirme num Chrome de verdade.',
  );
  process.exit(2);
} else if ((comKeep?.razao ?? 0) >= LIMIAR) {
  console.log('CONCLUSIVO: sem keepalive a narração desacelera; com keepalive ela se mantém.');
  process.exit(0);
} else {
  console.log('FALHA: a narração desacelera mesmo com o keepalive. A proteção não basta.');
  process.exit(3);
}
