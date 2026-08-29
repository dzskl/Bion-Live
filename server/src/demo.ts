/**
 * Modo demo.
 *
 * Enquanto nao existir integracao real com o TikTok Shop, audiencia e vendas
 * so podem vir de simulacao. Este modulo e a unica fonte da verdade sobre isso,
 * e existe separado para que o motor da live possa reportar a procedencia dos
 * numeros sem depender do simulador (evita import circular).
 *
 * Regra do produto: nenhum numero aparece como real sem ser real.
 */
export type FonteDeDados = 'nenhuma' | 'demo' | 'tiktok';

let fonte: FonteDeDados = 'nenhuma';

export function fonteDeDados(): FonteDeDados {
  return fonte;
}

export function definirFonte(nova: FonteDeDados): void {
  fonte = nova;
}

export function numerosSaoReais(): boolean {
  return fonte === 'tiktok';
}
