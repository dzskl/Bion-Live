import { api, speakPremium } from '../api';
import type { Faults, ScriptLine, VoiceOption, VoiceProvider } from '../types';
import { loadVoices, pickVoice, speakWithBrowser } from './browserVoice';

export interface NarratorSnapshot {
  running: boolean;
  paused: boolean;
  provider: VoiceProvider | null;
  speaking: boolean;
  line: ScriptLine | null;
  lastError: string;
  onSafety: boolean;
}

type Listener = (snap: NarratorSnapshot) => void;

const HEARTBEAT_MS = 5000;
const GAP_MS = 900;
const PREMIUM_RETRY_MS = 60_000;
const SAFETY_BACKOFF_MS = [8000, 15_000, 30_000, 60_000];

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve();
    });
  });

/**
 * Motor de narração do navegador.
 *
 * Regra de ouro: em nenhum caminho a live pode ficar em silêncio. Cada provedor
 * tem o próximo abaixo dele; embaixo de todos está o áudio de segurança, que só
 * para quando alguém acima voltar a funcionar.
 */
export class Narrator {
  private listeners = new Set<Listener>();
  private controller: AbortController | null = null;
  private heartbeatTimer: number | null = null;
  private safetyAudio: HTMLAudioElement | null = null;
  private premiumAudio: HTMLAudioElement | null = null;
  private premiumDownUntil = 0;
  private safetyFailures = 0;
  private faults: Faults = { tts: false, browserVoice: false, heartbeat: false };
  private voices: SpeechSynthesisVoice[] = [];
  private systemVoice: SpeechSynthesisVoice | null = null;

  private state: NarratorSnapshot = {
    running: false,
    paused: false,
    provider: null,
    speaking: false,
    line: null,
    lastError: '',
    onSafety: false,
  };

  private voice: VoiceOption | null = null;
  private hasPremium = false;
  private safetyUrl = '';

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<NarratorSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  snapshot(): NarratorSnapshot {
    return this.state;
  }

  setFaults(faults: Faults): void {
    this.faults = faults;
  }

  async configure(voice: VoiceOption, hasPremium: boolean, safetyUrl: string): Promise<void> {
    this.voice = voice;
    this.hasPremium = hasPremium;
    this.safetyUrl = safetyUrl;
    this.voices = await loadVoices();
    this.systemVoice = pickVoice(this.voices, voice);
  }

  systemVoiceName(): string {
    return this.systemVoice?.name ?? '';
  }

  /** Precisa acontecer dentro de um clique: navegador não toca áudio sem gesto. */
  async unlock(): Promise<void> {
    if (!this.premiumAudio) {
      this.premiumAudio = new Audio();
      this.premiumAudio.preload = 'auto';
    }
    if (!this.safetyAudio && this.safetyUrl) {
      this.safetyAudio = new Audio(this.safetyUrl);
      this.safetyAudio.loop = true;
      this.safetyAudio.volume = 0.55;
    }
    try {
      if ('speechSynthesis' in window) {
        const warmup = new SpeechSynthesisUtterance(' ');
        warmup.volume = 0;
        window.speechSynthesis.speak(warmup);
      }
    } catch {
      /* sem síntese: o failover cuida */
    }
  }

  start(): void {
    if (this.state.running) return;
    this.controller = new AbortController();
    this.emit({ running: true, paused: false, lastError: '' });
    this.startHeartbeat();
    void this.loop(this.controller.signal);
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.stopSafety();
    this.cancelSpeech();
    this.emit({ running: false, paused: false, speaking: false, provider: null, line: null, onSafety: false });
  }

  /** Botão de emergência: cala a IA na hora, sem perder nada da configuração. */
  setPaused(paused: boolean): void {
    this.emit({ paused });
    if (paused) {
      this.cancelSpeech();
      this.stopSafety();
      this.emit({ speaking: false, provider: null });
    }
  }

  private cancelSpeech(): void {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignora */
    }
    if (this.premiumAudio) {
      this.premiumAudio.pause();
      this.premiumAudio.currentTime = 0;
    }
  }

  private startHeartbeat(): void {
    const beat = (): void => {
      if (this.faults.heartbeat) return; // simulando aba morta
      void api
        .heartbeat({ provider: this.state.provider, speaking: this.state.speaking, queued: 0 })
        .catch(() => undefined);
    };
    beat();
    this.heartbeatTimer = window.setInterval(beat, HEARTBEAT_MS);
  }

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      if (this.state.paused) {
        await sleep(400, signal);
        continue;
      }
      let line: ScriptLine;
      try {
        line = (await api.nextLine()).line;
      } catch (err) {
        await this.enterSafety(`Sem conexão com o servidor: ${(err as Error).message}`);
        await sleep(this.safetyDelay(), signal);
        continue;
      }
      if (signal.aborted) return;
      this.emit({ line });
      const spoke = await this.speak(line.text, signal);
      if (signal.aborted) return;
      await sleep(spoke ? GAP_MS : this.safetyDelay(), signal);
    }
  }

  private safetyDelay(): number {
    const index = Math.min(this.safetyFailures, SAFETY_BACKOFF_MS.length - 1);
    return SAFETY_BACKOFF_MS[index] ?? 8000;
  }

  /** Devolve true se alguma voz de verdade falou a frase. */
  private async speak(text: string, signal: AbortSignal): Promise<boolean> {
    if (await this.tryPremium(text, signal)) return this.afterSuccess('elevenlabs');
    if (signal.aborted) return false;
    if (await this.tryBrowser(text, signal)) return this.afterSuccess('browser');
    if (signal.aborted) return false;
    await this.enterSafety(this.state.lastError || 'Nenhuma voz disponível');
    return false;
  }

  private afterSuccess(provider: VoiceProvider): boolean {
    if (this.state.onSafety) {
      this.stopSafety();
      this.safetyFailures = 0;
      void api.recovered({ component: 'voice', detail: `Narracao normalizada com a voz ${provider}` }).catch(() => undefined);
    }
    this.emit({ provider, speaking: false, onSafety: false });
    return true;
  }

  private async tryPremium(text: string, signal: AbortSignal): Promise<boolean> {
    if (!this.hasPremium) return false;
    if (Date.now() < this.premiumDownUntil) return false;
    try {
      const blob = await speakPremium(text, signal);
      if (!blob) {
        this.hasPremium = false;
        return false;
      }
      this.emit({ provider: 'elevenlabs', speaking: true });
      await this.playBlob(blob, signal);
      return true;
    } catch (err) {
      if (signal.aborted) return false;
      const message = (err as Error).message;
      this.premiumDownUntil = Date.now() + PREMIUM_RETRY_MS;
      this.emit({ lastError: message, speaking: false });
      void api
        .incident({ component: 'voice', level: 'warn', detail: `Voz premium falhou (${message}). Seguindo com a voz do navegador.`, provider: 'browser' })
        .catch(() => undefined);
      return false;
    }
  }

  private async tryBrowser(text: string, signal: AbortSignal): Promise<boolean> {
    if (this.faults.browserVoice) {
      this.emit({ lastError: 'Falha simulada na voz do navegador', speaking: false });
      return false;
    }
    if (!this.voice) return false;
    try {
      this.emit({ provider: 'browser', speaking: true });
      await speakWithBrowser(text, {
        voice: this.systemVoice,
        rate: this.voice.browser.rate,
        pitch: this.voice.browser.pitch,
        lang: this.voice.browser.lang,
        signal,
      });
      return true;
    } catch (err) {
      const message = (err as Error).message;
      this.emit({ speaking: false, lastError: message === 'cancelado' ? '' : message });
      return false;
    }
  }

  private playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = this.premiumAudio ?? new Audio();
      this.premiumAudio = audio;
      const url = URL.createObjectURL(blob);
      const cleanup = (): void => {
        URL.revokeObjectURL(url);
        audio.onended = null;
        audio.onerror = null;
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        audio.pause();
        cleanup();
        reject(new Error('cancelado'));
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error('Falha ao tocar o áudio da voz premium'));
      };
      signal.addEventListener('abort', onAbort);
      audio.src = url;
      audio.play().catch((err: Error) => {
        cleanup();
        reject(err);
      });
    });
  }

  private async enterSafety(reason: string): Promise<void> {
    this.safetyFailures += 1;
    if (this.state.onSafety) return;
    if (!this.safetyAudio && this.safetyUrl) {
      this.safetyAudio = new Audio(this.safetyUrl);
      this.safetyAudio.loop = true;
      this.safetyAudio.volume = 0.55;
    }
    try {
      await this.safetyAudio?.play();
    } catch {
      /* sem gesto do usuário ainda: o alerta abaixo ainda dispara */
    }
    this.emit({ provider: 'safety', speaking: false, onSafety: true, lastError: reason });
    void api
      .incident({ component: 'voice', level: 'down', detail: `Áudio de segurança no ar: ${reason}`, provider: 'safety' })
      .catch(() => undefined);
  }

  private stopSafety(): void {
    if (this.safetyAudio) {
      this.safetyAudio.pause();
      this.safetyAudio.currentTime = 0;
    }
    if (this.state.onSafety) this.emit({ onSafety: false });
  }
}

export const narrator = new Narrator();
