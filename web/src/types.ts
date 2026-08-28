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

export interface LiveEvent {
  id: number;
  liveId: number | null;
  ts: number;
  type: string;
  message: string;
  data: string;
}

export interface Snapshot {
  live: LiveSession | null;
  health: HealthReport;
  productCount: number;
  events: LiveEvent[];
}

export interface VoiceOption {
  id: string;
  label: string;
  description: string;
  gender: 'f' | 'm';
  browser: { lang: string; prefer: string[]; rate: number; pitch: number };
  elevenLabsVoiceId: string;
  sample: string;
}

export interface PublicSettings {
  storeName: string;
  voiceId: string;
  voice: VoiceOption;
  hasElevenLabsKey: boolean;
  elevenLabsKeyHint: string;
  telegramConfigured: boolean;
  telegramChatId: string;
  hasTelegramToken: boolean;
  safetyAudio: string;
  onboardingDone: boolean;
}

export interface SafetyInfo {
  file: string;
  url: string;
  kind: 'gravado' | 'gerado' | 'padrao';
  label: string;
}

export interface Check {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: { label: string; auto: boolean };
  goto?: string;
}

export interface ScriptLine {
  productId: number | null;
  kind: 'product' | 'interstitial' | 'opening';
  text: string;
  cursor: number;
}

export interface Faults {
  tts: boolean;
  browserVoice: boolean;
  heartbeat: boolean;
}
