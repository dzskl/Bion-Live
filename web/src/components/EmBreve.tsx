import { Icone } from './Icons';
import type { Rota } from './Sidebar';

interface Planejado {
  nome: string;
  icone: string;
  fara: string;
  porqueAinda: string;
}

const PLANEJADOS: Partial<Record<Rota, Planejado>> = {
  'roteiros-ia': {
    nome: 'Roteiros por IA',
    icone: 'roteiro',
    fara: 'Escrever o roteiro de venda a partir da ficha do produto, como sugestão no cadastro — nunca como etapa obrigatória.',
    porqueAinda:
      'Hoje o roteiro é montado por combinação de frases, o que já evita repetição. Gerar texto por IA só entra depois que a narração atual for validada por lojistas de verdade.',
  },
  'resposta-chat': {
    nome: 'Resposta ao chat',
    icone: 'chat',
    fara: 'Responder perguntas de preço, frete, tamanho, cor e disponibilidade — só os temas que você aprovar, com uma resposta segura para o resto.',
    porqueAinda:
      'É a maior diferença para os concorrentes e depende da integração com o chat do TikTok Shop, que exige aprovação de parceiro.',
  },
  'clonagem-voz': {
    nome: 'Clonagem de voz',
    icone: 'clonagem',
    fara: 'Narrar com a sua própria voz, a partir de uma gravação curta.',
    porqueAinda:
      'Depende de provedor pago e de consentimento explícito de quem tem a voz. Nada disso está construído.',
  },
  'multiplas-contas': {
    nome: 'Múltiplas contas',
    icone: 'contas',
    fara: 'Gerenciar várias lojas do TikTok Shop na mesma instalação, com produtos e vozes separados.',
    porqueAinda:
      'Hoje uma instalação atende uma loja. Só faz sentido depois de a primeira loja funcionar bem de ponta a ponta.',
  },
};

/**
 * Existe no menu para mostrar para onde o produto vai, e é inerte de propósito.
 * Nenhuma tela vazia se passando por funcionalidade pronta, nenhum resultado
 * simulado, nenhum cadeado — cadeado sugere que já está construído atrás dele.
 */
export function EmBreve({ rota }: { rota: Rota }) {
  const item = PLANEJADOS[rota];
  if (!item) return null;
  return (
    <div className="em-breve-tela">
      <div className="em-breve-selo">
        <Icone nome={item.icone} tamanho={28} />
      </div>
      <span className="tag-breve grande">Em breve</span>
      <h1>{item.nome}</h1>
      <p className="destaque">Isto ainda não existe. Nada nesta tela funciona.</p>
      <div className="em-breve-caixa">
        <h3>O que vai fazer</h3>
        <p>{item.fara}</p>
        <h3>Por que ainda não</h3>
        <p>{item.porqueAinda}</p>
      </div>
      <p className="muted">
        Está no menu para você saber para onde o produto caminha — não para sugerir que basta assinar um plano para
        desbloquear.
      </p>
    </div>
  );
}
