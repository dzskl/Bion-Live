import type { Product, ScriptLine } from './types.js';

/**
 * Preço escrito do jeito que se fala, não do jeito que se digita.
 * "R$ 89,90" lido por TTS vira "erre cifrão oitenta e nove vírgula noventa".
 */
export function speakablePrice(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const parteReais = reais === 1 ? '1 real' : `${reais} reais`;
  if (centavos === 0) return parteReais;
  const parteCentavos = centavos === 1 ? '1 centavo' : `${centavos} centavos`;
  if (reais === 0) return parteCentavos;
  return `${parteReais} e ${parteCentavos}`;
}

const OPENERS = [
  'Olha só o {name}, gente.',
  'Chegou a vez do {name}.',
  'Deixa eu te mostrar o {name}.',
  'Esse aqui é o queridinho da live: {name}.',
  'Presta atenção nesse aqui, o {name}.',
  'Quem tava esperando o {name}, tá aqui ó.',
  'Vem comigo ver o {name}.',
  'Próximo da lista: {name}.',
];

const PRICES = [
  'Sai por {price}.',
  'Tá saindo por {price}.',
  'O valor hoje é {price}.',
  'Só durante a live: {price}.',
  'Você leva por {price}.',
  'Fica em {price}.',
  'Anota o preço: {price}.',
];

const HIGHLIGHTS = [
  '{h}.',
  'E o melhor: {h}.',
  'Detalhe que faz diferença: {h}.',
  'Por que ele vale a pena? {h}.',
  'Repara nisso: {h}.',
  'Quem já comprou fala isso: {h}.',
];

const CLOSERS = [
  'Toca no carrinho pra garantir o seu.',
  'É só clicar na sacolinha ali embaixo.',
  'Corre que o estoque da live é limitado.',
  'Comenta aqui se você quiser que eu mostre de novo.',
  'Quem quiser, pega agora que eu já sigo pro próximo.',
  'Dá uma olhada na sacolinha, tá o primeiro da lista.',
];

const INTERSTITIALS = [
  'Se você chegou agora, seja muito bem-vindo. Aperta o seguir pra não perder as próximas ofertas.',
  'Comenta aqui embaixo qual produto você quer que eu mostre de novo.',
  'Lembrando: esse preço é só enquanto a gente estiver ao vivo.',
  'Dúvida de tamanho, cor ou entrega? Escreve no chat que a gente responde.',
  'Compartilha a live com aquela pessoa que ia amar isso aqui.',
  'A sacolinha tá ali embaixo com todos os produtos que eu já mostrei.',
];

/** Passos entre uma quebra de engajamento e outra. */
const INTERSTITIAL_EVERY = 5;

/** O destaque do produto vem digitado em minúscula; a fala precisa soar como frase. */
export function sentenceCase(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

function pick(pool: string[], seed: number): string {
  return pool[((seed % pool.length) + pool.length) % pool.length] as string;
}

/**
 * Roteiro sem repetição óbvia: cada pool gira num passo diferente, então a mesma
 * combinação de abertura + preço + destaque + chamada só volta depois de muitas
 * voltas na lista de produtos.
 */
export function lineForProduct(product: Product, pass: number, index: number): string {
  const seed = pass * 7 + index;
  const opener = pick(OPENERS, seed).replace('{name}', product.name);
  const price = pick(PRICES, seed * 3 + 1).replace('{price}', speakablePrice(product.priceCents));
  const closer = pick(CLOSERS, seed * 5 + 2);
  const parts = [opener];
  if (product.highlight.trim()) {
    parts.push(pick(HIGHLIGHTS, seed * 2 + 1).replace('{h}', product.highlight.trim().replace(/[.!]+$/, '')));
  }
  parts.push(price, closer);
  return sentenceCase(parts.join(' '));
}

export function openingLine(storeName: string, productCount: number): string {
  const loja = storeName.trim() || 'nossa loja';
  const quantos = productCount === 1 ? 'um produto selecionado' : `${productCount} produtos selecionados`;
  const fecho = productCount === 1 ? 'Fica comigo que eu vou te contar tudo sobre ele.' : 'Fica comigo que eu vou passar por todos.';
  return `Oi, gente! Bem-vindo à live da ${loja}. Hoje eu trouxe ${quantos} com preço especial. ${fecho}`;
}

/**
 * Devolve a fala do passo `cursor` do loop. O cursor é um contador que só cresce:
 * o servidor é dono dele, então o navegador pode recarregar no meio da live sem
 * repetir o que já foi falado.
 */
export function lineAt(products: Product[], cursor: number, storeName: string): ScriptLine {
  if (products.length === 0) {
    return {
      productId: null,
      kind: 'interstitial',
      cursor,
      text: 'Ainda não tem produto cadastrado na live. Cadastre um produto no painel para eu começar a narrar.',
    };
  }
  if (cursor === 0) {
    return { productId: null, kind: 'opening', cursor, text: openingLine(storeName, products.length) };
  }
  const step = cursor - 1;
  const isInterstitial = step > 0 && step % INTERSTITIAL_EVERY === 0;
  if (isInterstitial) {
    const seed = Math.floor(step / INTERSTITIAL_EVERY) - 1;
    return { productId: null, kind: 'interstitial', cursor, text: pick(INTERSTITIALS, seed) };
  }
  const productStep = step - Math.floor(step / INTERSTITIAL_EVERY);
  const index = productStep % products.length;
  const pass = Math.floor(productStep / products.length);
  const product = products[index] as Product;
  return { productId: product.id, kind: 'product', cursor, text: lineForProduct(product, pass, index) };
}
