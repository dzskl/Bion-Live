/**
 * Mede o que acontece com a narração quando a aba do lojista vai para segundo
 * plano — a lacuna que o relatório marcou como "não testado".
 *
 * O Chrome estrangula temporizadores de abas ocultas e, depois de 5 minutos,
 * aplica o estrangulamento agressivo (cerca de uma volta por minuto). O loop de
 * narração depende desses temporizadores. A defesa do produto é um oscilador
 * inaudível que mantém a aba "audível", categoria que o Chrome isenta.
 *
 * POR QUE ESTE TESTE PRECISA DE VOCÊ: ocultar uma aba é estado real de janela do
 * sistema operacional. Em ambiente headless, e mesmo com janela virtual sem
 * gerenciador de janelas, o Chromium continua reportando a página como visível —
 * três rotas foram tentadas (segunda página, aba via window.open, minimizar por
 * CDP) e nenhuma funcionou. Então o teste abre uma janela de verdade e pede que
 * você a deixe em segundo plano.
 *
 *   npm run build && node scripts/teste-aba-oculta.mjs
 *   MINUTOS_OCULTA=2 node scripts/teste-aba-oculta.mjs    # versão curta
 *
 * Duas janelas abrem lado a lado: uma com a proteção ligada e outra sem, que é o
 * controle. Sem o controle o resultado não significaria nada — se nenhuma das
 * duas desacelerasse, seria impossível saber se a proteção funcionou ou se o
 * ambiente simplesmente não estrangula.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SEG_VISIVEL = Number(process.env.SEGUNDOS_VISIVEL ?? 90);
const SEG_OCULTA = Number(process.env.MINUTOS_OCULTA ?? 10) * 60;
const ESPERA_MAX_OCULTAR = Number(process.env.SEGUNDOS_PARA_OCULTAR ?? 120) * 1000;

/** Playwright desliga o estrangulamento por padrão para deixar testes
 *  determinísticos. Aqui isso destruiria justamente o que queremos medir. */
const FLAGS_QUE_MATAM_O_TESTE = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

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

const cursor = async (base) => (await (await fetch(`${base}/api/live/state`)).json()).live?.cursor ?? 0;

async function preparar(nome, keepalive, porta, posicaoX) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bion-oculta-${porta}-`));
  const base = `http://localhost:${porta}`;
  const servidor = await subirServidor(porta, dir);

  await fetch(`${base}/api/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Kit Camisetas', price: '89,90', highlight: 'algodão pima' }),
  });
  await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeName: nome, onboardingDone: true }),
  });

  const chromePath = process.env.E2E_CHROME ?? '/opt/pw-browsers/chromium';
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', `--window-position=${posicaoX},0`, '--window-size=700,600'],
    ignoreDefaultArgs: FLAGS_QUE_MATAM_O_TESTE,
    ...(fs.existsSync(chromePath) ? { executablePath: fs.realpathSync(chromePath) } : {}),
  });
  const pagina = await browser.newPage();
  if (!keepalive) await pagina.addInitScript('window.__bionSemKeepalive = true;');
  await pagina.goto(base, { waitUntil: 'load' });
  await pagina.getByRole('button', { name: 'Iniciar live' }).click();
  await espera(3000);
  return { nome, keepalive, base, browser, pagina, servidor };
}

async function medirVisivel(inst) {
  const antes = await cursor(inst.base);
  await espera(SEG_VISIVEL * 1000);
  inst.porMinutoVisivel = (((await cursor(inst.base)) - antes) / SEG_VISIVEL) * 60;
}

async function medirOculta(inst) {
  inst.ocultou = await inst.pagina.evaluate(() => document.hidden);
  const antes = await cursor(inst.base);
  await espera(SEG_OCULTA * 1000);
  inst.porMinutoOculta = (((await cursor(inst.base)) - antes) / SEG_OCULTA) * 60;
  inst.razao = inst.porMinutoVisivel > 0 ? inst.porMinutoOculta / inst.porMinutoVisivel : 0;
}

console.log('Abrindo duas janelas: uma com a proteção de áudio, outra sem (o controle).\n');
const instancias = await Promise.all([
  preparar('Com protecao', true, 4301, 40),
  preparar('Controle sem protecao', false, 4302, 760),
]);

console.log(`Medindo ${SEG_VISIVEL}s com as janelas à vista...`);
await Promise.all(instancias.map(medirVisivel));

console.log('\n>>> AGORA: minimize as DUAS janelas do Chromium, ou troque para outra janela.');
console.log('>>> Não as feche. Deixe-as em segundo plano e volte daqui a alguns minutos.\n');

const limite = Date.now() + ESPERA_MAX_OCULTAR;
let ocultaram = false;
while (Date.now() < limite) {
  const estados = await Promise.all(instancias.map((i) => i.pagina.evaluate(() => document.hidden)));
  if (estados.every(Boolean)) {
    ocultaram = true;
    break;
  }
  await espera(2000);
}

if (!ocultaram) {
  console.log('As janelas continuaram visíveis. Sem isso não há o que medir.');
  console.log('Se você minimizou e mesmo assim apareceu esta mensagem, seu ambiente não');
  console.log('reproduz o estado de segundo plano do Chrome — foi o que aconteceu no sandbox.');
  await Promise.all(instancias.map((i) => i.browser.close()));
  instancias.forEach((i) => i.servidor.kill('SIGTERM'));
  process.exit(1);
}

console.log(`Janelas ocultas. Medindo por ${SEG_OCULTA / 60} minutos...\n`);
await Promise.all(instancias.map(medirOculta));
await Promise.all(instancias.map((i) => i.browser.close()));
instancias.forEach((i) => i.servidor.kill('SIGTERM'));

for (const i of instancias) {
  console.log(i.nome);
  console.log(`  falas/min à vista: ${i.porMinutoVisivel.toFixed(1)}`);
  console.log(`  falas/min oculta:  ${i.porMinutoOculta.toFixed(1)}`);
  console.log(`  manteve ${(i.razao * 100).toFixed(0)}% do ritmo\n`);
}

const comProtecao = instancias.find((i) => i.keepalive);
const controle = instancias.find((i) => !i.keepalive);
const LIMIAR = 0.7;

if (controle.razao >= LIMIAR) {
  console.log('INCONCLUSIVO: nem o controle desacelerou, então este ambiente não estrangula');
  console.log('temporizadores em segundo plano. A proteção continua correta pela documentação');
  console.log('do Chrome, mas este teste não provou que ela é necessária.');
  process.exit(2);
} else if (comProtecao.razao >= LIMIAR) {
  console.log('CONCLUSIVO: sem a proteção a narração desacelera; com ela, o ritmo se mantém.');
  process.exit(0);
} else {
  console.log('FALHA: a narração desacelera mesmo com a proteção. Ela não basta.');
  process.exit(3);
}
