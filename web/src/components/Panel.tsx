import { useEffect, useState } from 'react';
import { api } from '../api';
import { narrator, type NarratorSnapshot } from '../audio/narrator';
import type { Faults, LiveEvent, SafetyInfo, Snapshot, VoiceOption } from '../types';
import { Banner, Card, Dot, clock, money } from './ui';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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
  faults,
  onNavigate,
}: {
  snap: Snapshot;
  voice: VoiceOption;
  safety: SafetyInfo;
  hasPremium: boolean;
  faults: Faults;
  onNavigate: (tab: string) => void;
}) {
  const [narratorState, setNarratorState] = useState<NarratorSnapshot>(narrator.snapshot());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => narrator.subscribe(setNarratorState), []);
  useEffect(() => narrator.setFaults(faults), [faults]);

  const live = snap.live;
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
      await api.simulatorStart().catch(() => undefined);
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
    await api.simulatorStop().catch(() => undefined);
    await api.stopLive();
  }

  return (
    <div className="stack">
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

      <div className="numbers">
        <div className="number">
          <span className="number-label">Assistindo agora</span>
          <strong>{live?.viewers ?? 0}</strong>
        </div>
        <div className="number">
          <span className="number-label">Vendas nesta live</span>
          <strong>{live?.sales ?? 0}</strong>
          <span className="muted">{money(live?.salesCents ?? 0)}</span>
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
            <button className="btn primary big" onClick={() => void startLive()} disabled={busy || snap.productCount === 0}>
              {snap.productCount === 0 ? 'Cadastre um produto primeiro' : busy ? 'Iniciando…' : 'Iniciar live'}
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
          </span>
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
      <TestLab faults={faults} running={running} />
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

function TestLab({ faults, running }: { faults: Faults; running: boolean }) {
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
