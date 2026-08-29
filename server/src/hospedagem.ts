import { db } from './db.js';

/**
 * Autodiagnóstico da hospedagem.
 *
 * Duas perguntas que só se respondem com o tempo, e que o lojista não tem como
 * responder olhando painel de fornecedor:
 *
 *  1. O disco guarda mesmo? Se os dados fossem efêmeros, o contador de boots
 *     voltaria para 1 a cada deploy. Ele passar de 1 é a prova.
 *  2. O plano hiberna? Um pulso a cada minuto deixa rastro; buraco no rastro
 *     significa que o processo esteve fora do ar — que é exatamente quando o
 *     watchdog de failover não teria como avisar ninguém.
 */
const PULSO_MS = 60_000;
/** Abaixo disso é reinício de deploy, não hibernação. */
const TOLERANCIA_MS = 150_000;

function ler(chave: string): string | undefined {
  const linha = db.prepare('SELECT valor FROM hospedagem WHERE chave = ?').get(chave) as { valor: string } | undefined;
  return linha?.valor;
}

function gravar(chave: string, valor: string | number): void {
  db.prepare(
    'INSERT INTO hospedagem (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
  ).run(chave, String(valor));
}

export interface Queda {
  de: number;
  ate: number;
  segundos: number;
}

export interface DiagnosticoHospedagem {
  boots: number;
  primeiroBootEm: number;
  ultimoSinal: number;
  /** Só vira true depois que os dados sobreviveram a pelo menos um reinício. */
  persistenciaConfirmada: boolean;
  quedas24h: Queda[];
  maiorQueda24hSegundos: number;
  hibernando: boolean;
}

let timer: NodeJS.Timeout | null = null;

export function registrarBoot(): DiagnosticoHospedagem {
  const agora = Date.now();
  const boots = Number(ler('boots') ?? 0) + 1;
  const ultimoSinal = Number(ler('ultimoSinal') ?? 0);

  if (ultimoSinal > 0 && agora - ultimoSinal > TOLERANCIA_MS) {
    const segundos = Math.round((agora - ultimoSinal) / 1000);
    db.prepare('INSERT INTO quedas (de, ate, segundos) VALUES (?, ?, ?)').run(ultimoSinal, agora, segundos);
  }

  gravar('boots', boots);
  gravar('ultimoSinal', agora);
  if (!ler('primeiroBootEm')) gravar('primeiroBootEm', agora);

  if (!timer) {
    timer = setInterval(() => gravar('ultimoSinal', Date.now()), PULSO_MS);
    timer.unref?.();
  }
  return diagnostico();
}

export function pararPulso(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function diagnostico(): DiagnosticoHospedagem {
  const agora = Date.now();
  const desde = agora - 24 * 60 * 60 * 1000;
  const quedas = db.prepare('SELECT de, ate, segundos FROM quedas WHERE ate >= ? ORDER BY ate DESC').all(desde) as unknown as Queda[];
  const boots = Number(ler('boots') ?? 1);
  const maior = quedas.reduce((max, q) => Math.max(max, q.segundos), 0);
  return {
    boots,
    primeiroBootEm: Number(ler('primeiroBootEm') ?? agora),
    ultimoSinal: Number(ler('ultimoSinal') ?? agora),
    persistenciaConfirmada: boots > 1,
    quedas24h: quedas.slice(0, 10),
    maiorQueda24hSegundos: maior,
    // Duas ou mais quedas longas em 24h e o padrao de plano que hiberna por
    // inatividade, nao de deploy manual.
    hibernando: quedas.filter((q) => q.segundos >= 300).length >= 2,
  };
}
