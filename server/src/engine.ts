import { HEARTBEAT_TIMEOUT_MS, WATCHDOG_INTERVAL_MS } from './config.js';
import { currentLive, db, getSettings, listEvents, listProducts, recordEvent } from './db.js';
import { broadcast } from './events.js';
import { notify } from './alerts/index.js';
import { lineAt } from './script.js';
import type {
  HealthComponent,
  HealthLevel,
  HealthReport,
  LiveSession,
  LiveStatus,
  NarratorMode,
  ScriptLine,
  VoiceProvider,
} from './types.js';

const now = () => Date.now();
const component = (level: HealthLevel, detail: string): HealthComponent => ({ level, detail, since: now() });

interface HealthState {
  narrator: HealthComponent;
  voice: HealthComponent;
  alerts: HealthComponent;
  activeProvider: VoiceProvider | null;
  lastHeartbeatAt: number | null;
}

const health: HealthState = {
  narrator: component('ok', 'Aguardando início da live'),
  voice: component('ok', 'Pronta'),
  alerts: component('warn', 'Alerta no celular ainda não configurado'),
  activeProvider: null,
  lastHeartbeatAt: null,
};

function setComponent(key: 'narrator' | 'voice' | 'alerts', level: HealthLevel, detail: string): boolean {
  const prev = health[key];
  if (prev.level === level && prev.detail === detail) return false;
  health[key] = prev.level === level ? { ...prev, detail } : component(level, detail);
  return true;
}

const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, down: 2 };

export function getHealth(): HealthReport {
  const settings = getSettings();
  if (settings.telegramBotToken && settings.telegramChatId) {
    if (health.alerts.level === 'warn' && health.alerts.detail.includes('ainda não configurado')) {
      health.alerts = component('ok', 'Telegram conectado');
    }
  } else if (health.alerts.level === 'ok') {
    health.alerts = component('warn', 'Alerta no celular ainda não configurado');
  }
  // O canal de alerta sozinho nunca pinta o painel de vermelho: ele nao derruba a live.
  const overall = ([health.narrator.level, health.voice.level] as HealthLevel[]).reduce<HealthLevel>(
    (worst, level) => (RANK[level] > RANK[worst] ? level : worst),
    health.alerts.level === 'down' ? 'warn' : 'ok',
  );
  return {
    overall,
    narrator: health.narrator,
    voice: health.voice,
    alerts: health.alerts,
    activeProvider: health.activeProvider,
    lastHeartbeatAt: health.lastHeartbeatAt,
  };
}

export interface Snapshot {
  live: LiveSession | null;
  health: HealthReport;
  productCount: number;
  events: ReturnType<typeof listEvents>;
}

export function snapshot(): Snapshot {
  const live = currentLive() ?? null;
  return {
    live,
    health: getHealth(),
    productCount: listProducts(true).length,
    events: listEvents(live?.id ?? null, 30),
  };
}

export function publish(): Snapshot {
  const snap = snapshot();
  broadcast('state', snap);
  return snap;
}

// ---------------------------------------------------------------- ciclo da live

export function startLive(): LiveSession {
  const existing = currentLive();
  if (existing) return existing;
  const ts = now();
  const info = db
    .prepare("INSERT INTO lives (startedAt, status, mode, viewers, sales, salesCents, cursor) VALUES (?, 'live', 'ai', 0, 0, 0, 0)")
    .run(ts);
  const id = Number(info.lastInsertRowid);
  health.narrator = component('ok', 'Live iniciada, aguardando primeira fala');
  health.voice = component('ok', 'Pronta');
  health.lastHeartbeatAt = null;
  health.activeProvider = null;
  recordEvent(id, 'live_start', 'Live iniciada');
  publish();
  return currentLive() as LiveSession;
}

export function stopLive(): LiveSession | null {
  const live = currentLive();
  if (!live) return null;
  db.prepare("UPDATE lives SET endedAt = ?, status = 'idle' WHERE id = ?").run(now(), live.id);
  recordEvent(live.id, 'live_stop', 'Live encerrada');
  health.narrator = component('ok', 'Aguardando início da live');
  health.voice = component('ok', 'Pronta');
  health.activeProvider = null;
  health.lastHeartbeatAt = null;
  publish();
  return { ...live, endedAt: now(), status: 'idle' };
}

/** `silent` evita log duplicado quando quem chamou ja registrou o motivo. */
export function setStatus(status: LiveStatus, message?: string, opts: { silent?: boolean } = {}): LiveSession | null {
  const live = currentLive();
  if (!live) return null;
  if (live.status === status) return live;
  db.prepare('UPDATE lives SET status = ? WHERE id = ?').run(status, live.id);
  if (!opts.silent) recordEvent(live.id, `status_${status}`, message ?? `Status: ${status}`);
  publish();
  return currentLive() ?? null;
}

/**
 * O botao de emergencia. Trocar para manual e instantaneo e nao apaga nada:
 * produtos, voz, cursor do roteiro e metricas continuam de pe, entao voltar
 * para a IA e um clique, sem reconfigurar.
 */
export function setMode(mode: NarratorMode): LiveSession | null {
  const live = currentLive();
  if (!live) return null;
  const status: LiveStatus = mode === 'manual' ? 'paused' : 'live';
  db.prepare('UPDATE lives SET mode = ?, status = ? WHERE id = ?').run(mode, status, live.id);
  recordEvent(
    live.id,
    mode === 'manual' ? 'manual_takeover' : 'ai_resumed',
    mode === 'manual' ? 'Lojista assumiu a live' : 'IA retomou a narração',
  );
  publish();
  return currentLive() ?? null;
}

export function nextLine(): ScriptLine {
  const live = currentLive();
  const settings = getSettings();
  const products = listProducts(true);
  const cursor = live?.cursor ?? 0;
  const line = lineAt(products, cursor, settings.storeName);
  if (live) {
    db.prepare('UPDATE lives SET cursor = ? WHERE id = ?').run(cursor + 1, live.id);
  }
  broadcast('narration', line);
  return line;
}

export function updateMetrics(patch: { viewers?: number; sales?: number; salesCents?: number }): LiveSession | null {
  const live = currentLive();
  if (!live) return null;
  const viewers = patch.viewers ?? live.viewers;
  const sales = patch.sales ?? live.sales;
  const salesCents = patch.salesCents ?? live.salesCents;
  db.prepare('UPDATE lives SET viewers = ?, sales = ?, salesCents = ? WHERE id = ?').run(
    viewers,
    sales,
    salesCents,
    live.id,
  );
  publish();
  return currentLive() ?? null;
}

export function registerSale(valueCents: number): LiveSession | null {
  const live = currentLive();
  if (!live) return null;
  return updateMetrics({ sales: live.sales + 1, salesCents: live.salesCents + valueCents });
}

// ------------------------------------------------------------------ saude

export interface HeartbeatInput {
  provider: VoiceProvider | null;
  speaking: boolean;
  queued: number;
}

export function heartbeat(input: HeartbeatInput): HealthReport {
  const wasDown = health.narrator.level === 'down';
  health.lastHeartbeatAt = now();
  health.activeProvider = input.provider;

  let changed = false;
  if (input.provider === 'safety') {
    changed = setComponent('narrator', 'down', 'Tocando áudio de segurança');
  } else {
    changed = setComponent('narrator', 'ok', input.speaking ? 'Narrando' : 'Conectada');
  }

  if (wasDown && input.provider !== 'safety') {
    const live = currentLive();
    if (live && live.status === 'failover') {
      setStatus(live.mode === 'manual' ? 'paused' : 'live', 'Narração normalizada', { silent: true });
    }
    recordEvent(live?.id ?? null, 'recovered', 'Narração voltou ao normal');
    void notify('narrator-down-recovered', 'Tudo normalizado: a apresentadora voltou a narrar.', { force: true });
    changed = true;
  }
  if (changed) publish();
  return getHealth();
}

export interface IncidentInput {
  component: 'voice' | 'narrator';
  level: HealthLevel;
  detail: string;
  provider?: VoiceProvider | null;
  alert?: boolean;
}

export function reportIncident(input: IncidentInput): HealthReport {
  const live = currentLive();
  setComponent(input.component, input.level, input.detail);
  if (input.provider !== undefined) health.activeProvider = input.provider;

  if (input.level === 'down') {
    setStatus('failover', input.detail, { silent: true });
    recordEvent(live?.id ?? null, 'failover', input.detail, { component: input.component });
  } else if (input.level === 'warn') {
    recordEvent(live?.id ?? null, 'degraded', input.detail, { component: input.component });
  }

  if (input.alert !== false && input.level !== 'ok') {
    const prefixo = input.level === 'down' ? 'FALHA:' : 'Atenção:';
    void notify(`${input.component}-${input.level}`, `${prefixo} ${input.detail}`);
  }
  publish();
  return getHealth();
}

export function clearIncident(componentKey: 'voice' | 'narrator', detail: string): HealthReport {
  const changed = setComponent(componentKey, 'ok', detail);
  if (changed) {
    const live = currentLive();
    if (live && live.status === 'failover') {
      setStatus(live.mode === 'manual' ? 'paused' : 'live', detail, { silent: true });
    }
    publish();
  }
  return getHealth();
}

let watchdogTimer: NodeJS.Timeout | null = null;

/**
 * O navegador do lojista pode fechar, travar ou perder a rede sem avisar
 * ninguem. O watchdog roda no servidor justamente para que a falha mais
 * comum - a aba morrer - continue gerando alerta no celular.
 */
export function startWatchdog(): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    const live = currentLive();
    if (!live) return;
    const last = health.lastHeartbeatAt ?? live.startedAt;
    const silentFor = now() - last;
    if (silentFor <= HEARTBEAT_TIMEOUT_MS) return;
    if (health.narrator.level === 'down' && health.narrator.detail.includes('sem resposta')) return;

    const seconds = Math.round(silentFor / 1000);
    setComponent('narrator', 'down', `Navegador sem resposta há ${seconds}s`);
    setStatus('failover', 'Navegador da live parou de responder', { silent: true });
    recordEvent(live.id, 'failover', `Sem heartbeat há ${seconds}s`);
    void notify(
      'heartbeat-lost',
      `FALHA: a live parou de responder há ${seconds}s. O áudio de segurança deve estar tocando. Abra o painel do Bion Live.`,
      { force: true },
    );
    publish();
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref?.();
}

export function stopWatchdog(): void {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
}
