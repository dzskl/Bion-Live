import { Icone } from './Icons';
import { Card } from './ui';

interface Passo {
  texto: string;
  detalhe?: string;
}

const COM_BION: Passo[] = [
  { texto: 'Abrir esta página no navegador', detalhe: 'Nada para baixar' },
  { texto: 'Cadastrar os produtos e escolher a voz', detalhe: 'Leva alguns minutos' },
  { texto: 'Ligar "áudio do sistema" no OBS ou no TikTok LIVE Studio', detalhe: 'Uma caixa de seleção' },
];

const CAMINHO_COMUM: Passo[] = [
  { texto: 'Baixar e instalar uma extensão de navegador', detalhe: 'Refazer a cada atualização' },
  { texto: 'Instalar um cabo de áudio virtual', detalhe: 'Driver de sistema, exige reiniciar' },
  { texto: 'Rotear a saída do programa para o cabo virtual', detalhe: 'Entender entrada e saída de áudio' },
  { texto: 'Apontar a entrada do LIVE Studio para o cabo', detalhe: 'Errar aqui deixa a live muda' },
  { texto: 'Testar e descobrir que o microfone sumiu', detalhe: 'Voltar e refazer o roteamento' },
];

/**
 * A vantagem real do produto é o que ele NÃO exige. Isso não aparece numa lista
 * de recursos — precisa ser mostrado lado a lado para significar alguma coisa.
 */
export function Instalacao() {
  return (
    <div className="stack">
      <div className="hero compacto">
        <div>
          <p className="sobre-titulo">Instalação</p>
          <h1>Nada para instalar</h1>
          <p className="hero-texto">
            O áudio da apresentadora sai deste navegador, como qualquer vídeo que você assiste. Por isso a lista da
            esquerda é curta — e é essa diferença que decide se você vai ao ar hoje ou no fim de semana.
          </p>
        </div>
      </div>

      <div className="comparacao">
        <div className="coluna boa">
          <header>
            <Icone nome="instalacao" />
            <div>
              <h3>Com o Bion Live</h3>
              <p>3 passos, nenhum técnico</p>
            </div>
          </header>
          <ol>
            {COM_BION.map((passo, i) => (
              <li key={passo.texto}>
                <span className="marcador feito">{i + 1}</span>
                <div>
                  <strong>{passo.texto}</strong>
                  {passo.detalhe && <em>{passo.detalhe}</em>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="coluna ruim">
          <header>
            <Icone nome="ajustes" />
            <div>
              <h3>O caminho comum</h3>
              <p>5 passos, três deles técnicos</p>
            </div>
          </header>
          <ol>
            {CAMINHO_COMUM.map((passo, i) => (
              <li key={passo.texto}>
                <span className="marcador evitado">{i + 1}</span>
                <div>
                  <strong>{passo.texto}</strong>
                  {passo.detalhe && <em>{passo.detalhe}</em>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="nota-comparacao">
        A coluna da direita descreve o método que ferramentas baseadas em extensão e cabo de áudio virtual exigem —
        não é uma afirmação sobre nenhum produto específico do mercado. Se a ferramenta que você usa hoje faz
        diferente, o que vale é a coluna da esquerda.
      </p>

      <Card title="Como ligar o áudio do sistema" subtitle="Os dois programas que os lojistas usam para transmitir.">
        <div className="guia-grid">
          <div>
            <h4>TikTok LIVE Studio</h4>
            <ol className="steps">
              <li>Abra Configurações → Áudio.</li>
              <li>
                Ligue <strong>Áudio do sistema</strong>.
              </li>
              <li>Deixe esta aba aberta enquanto a live roda.</li>
            </ol>
          </div>
          <div>
            <h4>OBS Studio</h4>
            <ol className="steps">
              <li>
                Fontes → + → <strong>Captura de saída de áudio</strong>.
              </li>
              <li>Escolha a mesma saída que você ouve.</li>
              <li>Confira o medidor mexendo quando a IA falar.</li>
            </ol>
          </div>
        </div>
        <p className="muted">
          Use fone de ouvido no microfone para a voz da IA não voltar com eco quando você assumir a live.
        </p>
      </Card>
    </div>
  );
}
