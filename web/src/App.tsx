import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { narrator } from './audio/narrator';
import { EmBreve } from './components/EmBreve';
import { Inicio } from './components/Inicio';
import { Instalacao } from './components/Instalacao';
import { Login } from './components/Login';
import { Panel } from './components/Panel';
import { ProductsEditor } from './components/Products';
import { SettingsPage } from './components/SettingsPage';
import { SECOES, Sidebar, type Rota } from './components/Sidebar';
import { VozesPage } from './components/VozesPage';
import { Wizard } from './components/Wizard';
import type { Faults, PublicSettings, SafetyInfo, Snapshot, VoiceOption } from './types';

interface Extras {
  voice: VoiceOption;
  safety: SafetyInfo;
  hasElevenLabsKey: boolean;
}

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Rodar sem senha na própria máquina é o padrão. Rodar sem senha numa URL
 * pública é um vazamento — e é fácil de não perceber, então a interface avisa.
 */
function semSenhaNaInternet(acesso: { exigeSenha: boolean } | null): boolean {
  if (!acesso || acesso.exigeSenha) return false;
  return !LOCAIS.has(window.location.hostname);
}

// Todo item do menu tem título no topo: saber em que tela se está é o mínimo
// que uma navegação com seções precisa entregar.
const TITULOS: Record<Rota, string> = Object.fromEntries(
  SECOES.flatMap((secao) => secao.itens.map((item) => [item.rota, item.nome])),
) as Record<Rota, string>;

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [faults, setFaults] = useState<Faults>({ tts: false, browserVoice: false, heartbeat: false });
  // O painel é a tela de trabalho: quem abre o Bion Live quase sempre vem
  // para cá, então é aqui que a navegação começa.
  const [rota, setRota] = useState<Rota>('painel');
  const [menuAberto, setMenuAberto] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [offline, setOffline] = useState(false);
  const [acesso, setAcesso] = useState<{ exigeSenha: boolean; autenticado: boolean; senhaMalformada?: boolean } | null>(
    null,
  );

  const reload = useCallback(async () => {
    const estado = await api.authStatus();
    setAcesso(estado);
    if (estado.exigeSenha && !estado.autenticado) {
      setSnap(null);
      return;
    }
    const [live, cfg, sim] = await Promise.all([api.state(), api.settings(), api.simulator()]);
    const { voice, safety, hasElevenLabsKey, ...rest } = live;
    setSnap(rest);
    setExtras({ voice, safety, hasElevenLabsKey });
    setSettings(cfg.settings);
    setVoices(cfg.voices);
    setFaults(sim.faults);
    setWizard(!cfg.settings.onboardingDone);
  }, []);

  useEffect(() => {
    void reload().catch(() => setOffline(true));
  }, [reload]);

  // O estado do servidor chega por SSE: o painel nunca fica desatualizado
  // enquanto o lojista está olhando para ele.
  useEffect(() => {
    if (acesso?.exigeSenha && !acesso.autenticado) return;
    const source = new EventSource('/api/live/stream');
    source.addEventListener('state', (event) => {
      setOffline(false);
      setSnap(JSON.parse((event as MessageEvent<string>).data) as Snapshot);
    });
    source.addEventListener('faults', (event) => {
      const next = JSON.parse((event as MessageEvent<string>).data) as Faults;
      setFaults(next);
      narrator.setFaults(next);
    });
    source.onerror = () => setOffline(true);
    source.onopen = () => setOffline(false);
    return () => source.close();
  }, [acesso?.exigeSenha, acesso?.autenticado]);

  // A voz pode mudar em Ajustes no meio da live: reconfigura sem reiniciar nada.
  useEffect(() => {
    if (!extras) return;
    void narrator.configure(extras.voice, extras.hasElevenLabsKey, extras.safety.url);
  }, [extras?.voice.id, extras?.hasElevenLabsKey, extras?.safety.url]);

  if (acesso?.exigeSenha && !acesso.autenticado) {
    return <Login onEntrar={reload} senhaMalformada={acesso.senhaMalformada} />;
  }

  if (!snap || !settings || !extras) {
    return (
      <div className="boot">
        <p>{offline ? 'Sem conexão com o Bion Live. Verifique se o servidor está rodando.' : 'Carregando…'}</p>
      </div>
    );
  }

  if (wizard) {
    return (
      <div className="app-simples">
        <Wizard
          settings={settings}
          voices={voices}
          onReload={reload}
          onFinish={() => {
            setWizard(false);
            setRota('painel');
          }}
        />
      </div>
    );
  }

  const emBreve = SECOES.at(-1)?.itens.some((i) => i.rota === rota && i.emBreve) ?? false;
  const noAr = Boolean(snap.live && snap.live.endedAt === null);

  return (
    <div className="app">
      <Sidebar
        rota={rota}
        onNavegar={setRota}
        nomeDaLoja={settings.storeName}
        saude={snap.health.overall}
        noAr={noAr}
        aberta={menuAberto}
        onFechar={() => setMenuAberto(false)}
      />

      <div className="conteudo">
        <header className="barra">
          <button className="menu-botao" onClick={() => setMenuAberto((v) => !v)} aria-label="Abrir menu">
            <span />
            <span />
            <span />
          </button>
          <h1 className="barra-titulo">{TITULOS[rota] ?? 'Bion Live'}</h1>
          {emBreve && <span className="tag-breve">Em breve</span>}
          {acesso?.exigeSenha && (
            <button
              className="btn ghost small"
              onClick={async () => {
                await api.logout();
                await reload();
              }}
            >
              Sair
            </button>
          )}
        </header>

        {semSenhaNaInternet(acesso) && (
          <div className="banner banner-down offline">
            <strong>Este painel está aberto na internet sem senha.</strong> Qualquer pessoa com o link vê seus produtos,
            seus tokens e consegue encerrar sua live. Defina a variável <code>BION_SENHA</code> na hospedagem e faça o
            deploy de novo.
          </div>
        )}
        {offline && <div className="banner banner-down offline">Sem conexão com o servidor. Reconectando…</div>}

        <main>
          {emBreve && <EmBreve rota={rota} />}
          {rota === 'inicio' && <Inicio snap={snap} settings={settings} voz={extras.voice} onNavegar={setRota} />}
          {rota === 'painel' && (
            <Panel
              snap={snap}
              voice={extras.voice}
              safety={extras.safety}
              hasPremium={extras.hasElevenLabsKey}
              limiteCaracteres={settings.limiteCaracteresPorLive}
              faults={faults}
              onNavigate={() => setRota('ajustes')}
            />
          )}
          {rota === 'produtos' && <ProductsEditor />}
          {rota === 'vozes' && (
            <VozesPage settings={settings} voices={voices} onReload={reload} onNavegar={setRota} />
          )}
          {rota === 'instalacao' && <Instalacao />}
          {rota === 'ajustes' && (
            <SettingsPage
              settings={settings}
              safety={extras.safety}
              onReload={reload}
              onRestartWizard={() => setWizard(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
