import { useEffect, useState } from 'react';
import { api } from '../api';
import { narrator, type NarratorSnapshot } from '../audio/narrator';
import type { Faults, LiveEvent, SafetyInfo, Snapshot, VoiceOption } from '../types';
import { Banner, Card, Dot, clock, money } from './ui';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Amarelo antes do teto, para o lojista não ser pego de surpresa pela troca de voz. */
function consumoPremium(usados: number, limite: number): 'ok' | 'warn' | 'down' {
  if (limite <= 0) return 'ok';
  const fracao = usados / limite;
  if (fracao >= 1) return 'down';
  if (fracao >= 0.8) return 'warn';
  return 'ok';
}

const STATUS_TEXT: Record<string, string> = {
  ok: 'Tudo funcionando',
  warn: 'Funcionando com ressalva',
  down: 'Precisa da sua atenção',
};

const PROVIDER_TEXT: Record<string, string> = {
  elevenlabs: 'voz premium',
  browser: 'voz do navegador',
  safety: 'áudio de segurança',
};

export function Panel({
  snap,
  voice,
  safety,
  hasPremium,
  limiteCaracteres,
  faults,
  onNavigate,
}: {
  snap: Snapshot;
  voice: VoiceOption;
  safety: SafetyInfo;
  hasPremium: boolean;
  limiteCaracteres: number;
  faults: Faults;
  onNavigate: (tab: string) => void;
}) {
  const [narratorState, setNarratorState] = useState<NarratorSnapshot>(narrator.snapshot());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => narrator.subscribe(setNarratorState), []);
  useEffect(() => narrator.setFaults(faults), [faults]);

  // Sem voz em português e sem voz premium não existe narração possível: a
  // gratuita sairia com sotaque inglês, o que é pior do que não narrar.
  const semVozUsavel = !narratorState.temVozPortugues && !hasPremium;
  const live = snap.live;
  // Um numero so aparece se ele for medido de verdade ou explicitamente rotulado
  // como simulado. Zero seria mentira: da a entender que ninguem esta assistindo.
  const medido = snap.fonte !== 'nenhuma';
  const running = Boolean(live && live.endedAt === null);
  const manual = live?.mode === 'manual';
  const level = snap.health.overall;

  async function startLive(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await narrator.unlock(); // precisa estar dentro do clique
      await narrator.configure(voice, hasPremium, safety.url);
      await api.startLive();
      narrator.start();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function takeOver(): Promise<void> {
    narrator.setPaused(true);
    await api.setMode('manual');
  }

  async function giveBack(): Promise<void> {
    await narrator.unlock();
    narrator.setPaused(false);
    await api.setMode('ai');
  }

  async function endLive(): Promise<void> {
    narrator.stop();
    // O demo é por live: encerrar a live não pode deixar números inventados na tela.
    await api.simulatorStop().catch(() => undefined);
    await api.stopLive();
  }

  return (
    <div className="stack">
      {semVozUsavel && (
        <Banner kind="down">
          <strong>Seu navegador não tem voz em português instalada.</strong> A narração sairia com sotaque inglês,
          então ela está bloqueada. Três saídas, da mais rápida para a mais definitiva: abrir o Bion Live no{' '}
          <strong>Google Chrome</strong> (o Brave costuma desativar as vozes online); instalar o pacote de fala em
          Windows (Configurações → Hora e Idioma → Idioma → Português (Brasil) → Opções → Fala); ou conectar uma chave
          da ElevenLabs em Ajustes, que não depende do sistema.
        </Banner>
      )}
      {narratorState.onSafety && (
        <Banner kind="down">
          <strong>Áudio de segurança no ar.</strong> A narração falhou e o Bion assumiu com a trilha de espera. Um alerta
          já foi disparado. Motivo: {narratorState.lastError || 'falha na voz'}.
        </Banner>
      )}
      {manual && running && (
        <Banner kind="warn">
          <strong>Você está no comando.</strong> A IA está calada e nada foi perdido — é só clicar em “Devolver para a
          IA” quando quiser.
        </Banner>
      )}

      {snap.fonte === 'demo' && (
        <Banner kind="warn">
          <strong>Modo demo ligado.</strong> Audiência e vendas na tela são inventados por um simulador, para você
          testar o fluxo. Não são medições. Desligue em “Testar o failover” antes de mostrar o painel para alguém.
        </Banner>
      )}

      <div className="numbers">
        <div className="number">
          <span className="number-label">
            Assistindo agora
            {snap.fonte === 'demo' && <em className="chip-sim">simulado</em>}
          </span>
          <strong>{medido ? (live?.viewers ?? 0) : '—'}</strong>
          {!medido && <span className="muted">Sem integração com o TikTok Shop</span>}
        </div>
        <div className="number">
          <span className="number-label">
            Vendas nesta live
            {snap.fonte === 'demo' && <em className="chip-sim">simulado</em>}
          </span>
          <strong>{medido ? (live?.sales ?? 0) : '—'}</strong>
          <span className="muted">{medido ? money(live?.salesCents ?? 0) : 'Nada é contado ainda'}</span>
        </div>
        <div className={`number status status-${level}`}>
          <span className="number-label">Status</span>
          <strong>
            <Dot level={level} />
            {STATUS_TEXT[level]}
          </strong>
          <span className="muted">
            {!running
              ? 'Live não iniciada'
              : narratorState.onSafety
                ? 'Áudio de segurança no ar'
                : narratorState.provider
                  ? `Narrando com ${PROVIDER_TEXT[narratorState.provider]}`
                  : 'Conectando…'}
          </span>
        </div>
      </div>

      <Card
        title={running ? 'Live no ar' : 'Pronto para começar'}
        subtitle={
          running
            ? `Iniciada às ${clock(live?.startedAt ?? Date.now())} · ${plural(snap.productCount, 'produto', 'produtos')} na rotação`
            : `${plural(snap.productCount, 'produto', 'produtos')} na rotação · voz ${voice.label}`
        }
        actions={
          running ? (
            <>
              {manual ? (
                <button className="btn primary" onClick={() => void giveBack()}>
                  Devolver para a IA
                </button>
              ) : (
                <button className="btn emergency" onClick={() => void takeOver()}>
                  Pausar e assumir eu mesmo
                </button>
              )}
              <button className="btn ghost danger" onClick={() => void endLive()}>
                Encerrar live
              </button>
            </>
          ) : (
            <button
              className="btn primary big"
              onClick={() => void startLive()}
              disabled={busy || snap.productCount === 0 || semVozUsavel}
            >
              {snap.productCount === 0
                ? 'Cadastre um produto primeiro'
                : semVozUsavel
                  ? 'Resolva a voz para começar'
                  : busy
                    ? 'Iniciando…'
                    : 'Iniciar live'}
            </button>
          )
        }
      >
        {error && <p className="error">{error}</p>}
        <div className="now-speaking">
          <span className="number-label">Falando agora</span>
          <p className={narratorState.speaking ? 'speaking' : ''}>
            {manual
              ? 'Silêncio — você assumiu a narração.'
              : narratorState.onSafety
                ? 'Trilha de espera no ar. A narração volta sozinha assim que alguma voz responder.'
                : (narratorState.line?.text ??
                  (running ? 'Preparando a primeira fala…' : 'A narração aparece aqui quando a live começar.'))}
          </p>
        </div>
        <div className="health-row">
          <span>
            <Dot level={snap.health.narrator.level} /> Narração: {snap.health.narrator.detail}
          </span>
          <span>
            <Dot level={snap.health.voice.level} /> Voz: {snap.health.voice.detail}
            {narratorState.nomeDaVoz && ` (${narratorState.nomeDaVoz})`}
          </span>
          {hasPremium && running && (
            <span>
              <Dot level={consumoPremium(live?.caracteresPremium ?? 0, limiteCaracteres)} /> Voz premium:{' '}
              {(live?.caracteresPremium ?? 0).toLocaleString('pt-BR')}
              {limiteCaracteres > 0 ? ` de ${limiteCaracteres.toLocaleString('pt-BR')} caracteres` : ' caracteres (sem teto)'}
            </span>
          )}
          <span>
            <Dot level={snap.health.alerts.level} /> Alertas: {snap.health.alerts.detail}
            {snap.health.alerts.level !== 'ok' && (
              <button className="btn ghost small" onClick={() => onNavigate('ajustes')}>
                Configurar
              </button>
            )}
          </span>
        </div>
      </Card>

      <EventLog events={snap.events} />
      <TestLab faults={faults} running={running} fonte={snap.fonte} narrador={narratorState} />
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  live_start: 'Live iniciada',
  live_stop: 'Live encerrada',
  manual_takeover: 'Você assumiu a live',
  ai_resumed: 'IA retomou',
  failover: 'Failover',
  degraded: 'Degradado',
  recovered: 'Normalizado',
  alert: 'Alerta',
  status_failover: 'Status: failover',
  status_live: 'Status: no ar',
  status_paused: 'Status: pausado',
};

function EventLog({ events }: { events: LiveEvent[] }) {
  if (events.length === 0) return null;
  return (
    <Card title="O que aconteceu" subtitle="Só o que exige atenção — falhas, alertas e trocas de comando.">
      <ul className="log">
        {[...events].reverse().map((event) => (
          <li key={event.id} className={`log-${event.type}`}>
            <time>{clock(event.ts)}</time>
            <span className="log-type">{EVENT_LABEL[event.type] ?? event.type}</span>
            <span className="grow">{event.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const MIN_VISIVEL_MS = 2 * 60_000;
// O Chrome só aplica o estrangulamento agressivo depois de 5 minutos oculto.
const MIN_OCULTO_MS = 5 * 60_000;
const LIMIAR_RITMO = 0.7;

function porMinuto(r: { falas: number; ms: number }): number {
  return r.ms > 0 ? (r.falas / r.ms) * 60_000 : 0;
}

function MedidorDeRitmo({ narrador, running }: { narrador: NarratorSnapshot; running: boolean }) {
  const vis = narrador.ritmoVisivel;
  const oculto = narrador.ritmoOculto;
  const minutos = (ms: number) => (ms / 60_000).toFixed(1);
  const razao = porMinuto(vis) > 0 ? porMinuto(oculto) / porMinuto(vis) : 0;

  let veredito: { kind: 'ok' | 'warn' | 'down' | 'info'; texto: string };
  if (!running) {
    veredito = { kind: 'info', texto: 'Inicie a live para medir.' };
  } else if (vis.ms < MIN_VISIVEL_MS) {
    veredito = {
      kind: 'info',
      texto: `Deixe esta janela à vista por ${minutos(MIN_VISIVEL_MS - vis.ms)} min a mais para formar a linha de base.`,
    };
  } else if (oculto.ms < MIN_OCULTO_MS) {
    veredito = {
      kind: 'info',
      texto:
        oculto.ms === 0
          ? 'Agora minimize esta janela e vá fazer outra coisa por 10 minutos. Volte aqui depois.'
          : `Faltam ${minutos(MIN_OCULTO_MS - oculto.ms)} min minimizada. O Chrome só aperta de verdade depois de 5 min.`,
    };
  } else if (razao >= LIMIAR_RITMO) {
    veredito = {
      kind: 'ok',
      texto: `A narração manteve ${(razao * 100).toFixed(0)}% do ritmo em segundo plano. A proteção está funcionando na sua máquina.`,
    };
  } else {
    veredito = {
      kind: 'down',
      texto: `A narração caiu para ${(razao * 100).toFixed(0)}% do ritmo em segundo plano. A proteção não bastou aqui — vale reportar.`,
    };
  }

  return (
    <div className="demo-toggle">
      <div className="grow">
        <strong>A live aguenta a janela minimizada?</strong>
        <p className="muted">
          O Chrome desacelera páginas em segundo plano. O Bion se protege disso, e aqui você confere se a proteção
          funcionou na sua máquina — sem instalar nada.
        </p>
        <div className="ritmo">
          <span>
            À vista: <strong>{porMinuto(vis).toFixed(1)}</strong> falas/min
            <em>{minutos(vis.ms)} min medidos</em>
          </span>
          <span>
            Minimizada: <strong>{oculto.ms > 0 ? porMinuto(oculto).toFixed(1) : '—'}</strong> falas/min
            <em>{minutos(oculto.ms)} min medidos</em>
          </span>
        </div>
        <Banner kind={veredito.kind}>{veredito.texto}</Banner>
      </div>
      <button className="btn ghost" onClick={() => narrator.zerarRitmo()} disabled={!running}>
        Zerar
      </button>
    </div>
  );
}

function TestLab({
  faults,
  running,
  fonte,
  narrador,
}: {
  faults: Faults;
  running: boolean;
  fonte: Snapshot['fonte'];
  narrador: NarratorSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  async function toggle(kind: keyof Faults): Promise<void> {
    await api.fault(kind, !faults[kind]);
    setNote(
      !faults[kind]
        ? 'Falha injetada. Acompanhe o painel: em segundos o Bion deve cair para o próximo recurso e alertar.'
        : 'Falha removida.',
    );
  }

  return (
    <Card
      title="Testar o failover"
      subtitle="Confiabilidade que nunca foi testada é só esperança. Derrube de propósito e veja o que acontece."
      actions={
        <button className="btn ghost small" onClick={() => setOpen((v) => !v)}>
          {open ? 'Esconder' : 'Mostrar'}
        </button>
      }
    >
      {open && (
        <div className="stack">
          <div className="demo-toggle">
            <div className="grow">
              <strong>Modo demo</strong>
              <p className="muted">
                Inventa audiência e vendas para você ver o painel se mexer. Os números ficam marcados como simulados
                enquanto estiver ligado.
              </p>
            </div>
            <button
              className={`btn ${fonte === 'demo' ? 'on' : ''}`}
              onClick={async () => {
                if (fonte === 'demo') await api.simulatorStop();
                else await api.simulatorStart();
              }}
            >
              {fonte === 'demo' ? 'Desligar demo' : 'Ligar demo'}
            </button>
          </div>
          <MedidorDeRitmo narrador={narrador} running={running} />
          <div className="row gap wrap">
            <button className={`btn ${faults.tts ? 'on' : ''}`} onClick={() => void toggle('tts')}>
              {faults.tts ? 'Religar' : 'Derrubar'} provedor de voz premium
            </button>
            <button className={`btn ${faults.browserVoice ? 'on' : ''}`} onClick={() => void toggle('browserVoice')}>
              {faults.browserVoice ? 'Religar' : 'Derrubar'} voz do navegador
            </button>
            <button className={`btn ${faults.heartbeat ? 'on' : ''}`} onClick={() => void toggle('heartbeat')}>
              {faults.heartbeat ? 'Reanimar' : 'Simular'} aba travada
            </button>
            <button className="btn ghost" onClick={() => void api.fault('clear')}>
              Limpar tudo
            </button>
          </div>
          {!running && <p className="muted">Inicie a live para ver o failover acontecendo de verdade.</p>}
          {note && <p className="muted">{note}</p>}
        </div>
      )}
    </Card>
  );
}
