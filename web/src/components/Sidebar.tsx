import { Icone } from './Icons';
import type { HealthLevel } from '../types';
import { Dot } from './ui';

export type Rota =
  | 'inicio'
  | 'painel'
  | 'produtos'
  | 'vozes'
  | 'instalacao'
  | 'ajustes'
  | 'roteiros-ia'
  | 'resposta-chat'
  | 'clonagem-voz'
  | 'multiplas-contas';

export interface ItemDeMenu {
  rota: Rota;
  nome: string;
  icone: string;
  emBreve?: boolean;
}

/**
 * A navegação mostra para onde o produto vai, mas nunca finge que já chegou.
 * Itens de "Em breve" ficam visíveis e desabilitados — sem cadeado, porque
 * cadeado sugere que existe algo pronto atrás dele.
 */
export const SECOES: Array<{ titulo: string; itens: ItemDeMenu[] }> = [
  {
    titulo: 'Principal',
    itens: [
      { rota: 'inicio', nome: 'Início', icone: 'inicio' },
      { rota: 'painel', nome: 'Painel da live', icone: 'painel' },
      { rota: 'produtos', nome: 'Produtos', icone: 'produtos' },
      { rota: 'vozes', nome: 'Vozes', icone: 'vozes' },
    ],
  },
  {
    titulo: 'Configuração',
    itens: [
      { rota: 'instalacao', nome: 'Instalação', icone: 'instalacao' },
      { rota: 'ajustes', nome: 'Ajustes', icone: 'ajustes' },
    ],
  },
  {
    titulo: 'Em breve',
    itens: [
      { rota: 'roteiros-ia', nome: 'Roteiros por IA', icone: 'roteiro', emBreve: true },
      { rota: 'resposta-chat', nome: 'Resposta ao chat', icone: 'chat', emBreve: true },
      { rota: 'clonagem-voz', nome: 'Clonagem de voz', icone: 'clonagem', emBreve: true },
      { rota: 'multiplas-contas', nome: 'Múltiplas contas', icone: 'contas', emBreve: true },
    ],
  },
];

export function Sidebar({
  rota,
  onNavegar,
  nomeDaLoja,
  saude,
  noAr,
  aberta,
  onFechar,
}: {
  rota: Rota;
  onNavegar: (r: Rota) => void;
  nomeDaLoja: string;
  saude: HealthLevel;
  noAr: boolean;
  aberta: boolean;
  onFechar: () => void;
}) {
  return (
    <>
      {aberta && <div className="lateral-fundo" onClick={onFechar} aria-hidden />}
      <aside className={`lateral ${aberta ? 'aberta' : ''}`}>
        <div className="lateral-marca">
          <span className="marca-sigla" aria-hidden>
            B
          </span>
          <span className="marca-texto">
            <strong>Bion Live</strong>
            {nomeDaLoja && <em>{nomeDaLoja}</em>}
          </span>
        </div>

        <div className={`lateral-estado estado-${noAr ? saude : 'off'}`}>
          {/* Verde quer dizer "no ar e saudável". Fora do ar não é bom nem ruim,
              é ausência de live — então não pode roubar a cor do estado bom. */}
          {noAr ? <Dot level={saude} /> : <span className="dot dot-off" aria-hidden />}
          {noAr ? 'No ar' : 'Fora do ar'}
        </div>

        <nav className="lateral-nav">
          {SECOES.map((secao) => (
            <div key={secao.titulo} className="lateral-secao">
              <h2>{secao.titulo}</h2>
              <ul>
                {secao.itens.map((item) => (
                  <li key={item.rota}>
                    <button
                      className={`lateral-item ${rota === item.rota ? 'ativo' : ''} ${item.emBreve ? 'em-breve' : ''}`}
                      onClick={() => {
                        onNavegar(item.rota);
                        onFechar();
                      }}
                      aria-current={rota === item.rota ? 'page' : undefined}
                    >
                      <Icone nome={item.icone} tamanho={18} />
                      <span className="grow">{item.nome}</span>
                      {item.emBreve && <span className="tag-breve">Em breve</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
