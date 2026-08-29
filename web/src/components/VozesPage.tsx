import { api } from '../api';
import type { PublicSettings, VoiceOption } from '../types';
import { VoicePicker } from './VoicePicker';
import { Banner, Card } from './ui';

export function VozesPage({
  settings,
  voices,
  onReload,
  onNavegar,
}: {
  settings: PublicSettings;
  voices: VoiceOption[];
  onReload: () => Promise<void>;
  onNavegar: (r: 'ajustes') => void;
}) {
  return (
    <div className="stack">
      <div className="hero compacto">
        <div>
          <p className="sobre-titulo">Vozes</p>
          <h1>Quatro vozes, não quarenta</h1>
          <p className="hero-texto">
            Escolher entre dezenas de nomes que você não sabe diferenciar não é liberdade, é trabalho. Estas quatro
            têm personalidade clara. Clique em “Ouvir” e decida em dez segundos.
          </p>
        </div>
      </div>

      <Card>
        <VoicePicker voices={voices} selected={settings.voiceId} onSelect={() => void onReload()} />
      </Card>

      <Card title="Voz premium" subtitle="Opcional. Sem ela a live roda com a voz nativa do navegador.">
        {settings.hasElevenLabsKey ? (
          <Banner kind="ok">
            Voz premium ativa ({settings.elevenLabsKeyHint}). A voz do navegador continua como rede de segurança se o
            provedor cair ou o teto de gasto for atingido.
          </Banner>
        ) : (
          <Banner kind="info">
            Sem chave configurada. A narração usa a voz do sistema — grátis, sem cadastro, e é também o que assume se
            a voz premium falhar.
          </Banner>
        )}
        <button className="btn ghost" onClick={() => onNavegar('ajustes')}>
          {settings.hasElevenLabsKey ? 'Trocar a chave em Ajustes' : 'Conectar uma chave em Ajustes'}
        </button>
      </Card>

      <Card title="Áudio de segurança" subtitle="O que entra no ar se todas as vozes falharem.">
        <p className="muted">
          Configurado em Ajustes: dá para gravar com a sua própria voz, gerar com a voz escolhida, ou usar a trilha de
          espera embutida.
        </p>
        <button className="btn ghost" onClick={() => onNavegar('ajustes')}>
          Abrir Ajustes
        </button>
      </Card>
    </div>
  );
}
