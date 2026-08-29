import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { narrator } from './audio/narrator';
import { Panel } from './components/Panel';
import { ProductsEditor } from './components/Products';
import { SettingsPage } from './components/SettingsPage';
import { Wizard } from './components/Wizard';
import { Login } from './components/Login';
import { Dot } from './components/ui';
import type { Faults, PublicSettings, SafetyInfo, Snapshot, VoiceOption } from './types';

type Tab = 'painel' | 'produtos' | 'ajustes';

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Rodar sem senha na propria maquina e o padrao. Rodar sem senha numa URL
 * publica e um vazamento - e facil de nao perceber, entao a interface avisa.
 */
function semSenhaNaInternet(acesso: { exigeSenha: boolean } | null): boolean {
  if (!acesso || acesso.exigeSenha) return false;
  return !LOCAIS.has(window.location.hostname);
}

interface Extras {
  voice: VoiceOption;
  safety: SafetyInfo;
  hasElevenLabsKey: boolean;
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [faults, setFaults] = useState<Faults>({ tts: false, browserVoice: false, heartbeat: false });
  const [tab, setTab] = useState<Tab>('painel');
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
  // enquanto o lojista esta olhando para ele. So conecta depois do login, senao
  // o EventSource fica tentando de novo contra um 401.
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
      <div className="app">
        <Wizard settings={settings} voices={voices} onReload={reload} onFinish={() => setWizard(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Dot level={snap.health.overall} />
          <strong>Bion Live</strong>
          {settings.storeName && <span className="muted">{settings.storeName}</span>}
        </div>
        <nav className="tabs">
          {(['painel', 'produtos', 'ajustes'] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? 'on' : ''} onClick={() => setTab(item)}>
              {item === 'painel' ? 'Painel' : item === 'produtos' ? 'Produtos' : 'Ajustes'}
            </button>
          ))}
          {acesso?.exigeSenha && (
            <button
              onClick={async () => {
                await api.logout();
                await reload();
              }}
            >
              Sair
            </button>
          )}
        </nav>
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
        {tab === 'painel' && (
          <Panel
            snap={snap}
            voice={extras.voice}
            safety={extras.safety}
            hasPremium={extras.hasElevenLabsKey}
            limiteCaracteres={settings.limiteCaracteresPorLive}
            faults={faults}
            onNavigate={() => setTab('ajustes')}
          />
        )}
        {tab === 'produtos' && <ProductsEditor />}
        {tab === 'ajustes' && (
          <SettingsPage
            settings={settings}
            voices={voices}
            safety={extras.safety}
            onReload={reload}
            onRestartWizard={() => setWizard(true)}
          />
        )}
      </main>
    </div>
  );
}
