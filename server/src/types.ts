export type LiveStatus = 'idle' | 'live' | 'paused' | 'failover';
export type NarratorMode = 'ai' | 'manual';
export type VoiceProvider = 'browser' | 'elevenlabs' | 'safety';
export type HealthLevel = 'ok' | 'warn' | 'down';

export interface Product {
  id: number;
  name: string;
  priceCents: number;
  highlight: string;
  position: number;
  active: 0 | 1;
}

export interface Settings {
  storeName: string;
  voiceId: string;
  elevenLabsApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  safetyAudio: string; // nome do arquivo em data/safety, vazio = usar o embutido
  onboardingDone: 0 | 1;
  limiteCaracteresPorLive: number;
}

export interface LiveSession {
  id: number;
  startedAt: number;
  endedAt: number | null;
  status: LiveStatus;
  mode: NarratorMode;
  viewers: number;
  sales: number;
  salesCents: number;
  cursor: number;
  caracteresPremium: number;
}

export interface LiveEvent {
  id: number;
  liveId: number | null;
  ts: number;
  type: string;
  message: string;
  data: string;
}

export interface HealthComponent {
  level: HealthLevel;
  detail: string;
  since: number;
}

export interface HealthReport {
  overall: HealthLevel;
  narrator: HealthComponent;
  voice: HealthComponent;
  alerts: HealthComponent;
  activeProvider: VoiceProvider | null;
  lastHeartbeatAt: number | null;
}

export interface ScriptLine {
  productId: number | null;
  kind: 'product' | 'interstitial' | 'opening';
  text: string;
  cursor: number;
}
