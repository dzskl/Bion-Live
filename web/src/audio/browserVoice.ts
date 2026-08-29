import type { VoiceOption } from '../types';

export function browserVoiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** As vozes do sistema carregam de forma assíncrona no Chrome. */
export function loadVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!browserVoiceSupported()) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    const done = (): void => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, timeoutMs);
  });
}

/** Só vozes que realmente falam português. Nada de "quase". */
export function vozesEmPortugues(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const normalizada = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  const ptBR = voices.filter((v) => normalizada(v).startsWith('pt-br'));
  return ptBR.length ? ptBR : voices.filter((v) => normalizada(v).startsWith('pt'));
}

/**
 * Escolhe a voz do sistema mais próxima da personalidade pedida.
 *
 * Devolve `null` quando não existe nenhuma voz em português instalada — e isso
 * é deliberado. A versão anterior caía para a primeira voz do sistema, que no
 * Windows costuma ser inglesa: o roteiro em português saía lido com fonética
 * inglesa, o que é pior do que não narrar. Quem chama precisa tratar o null.
 */
export function pickVoice(voices: SpeechSynthesisVoice[], option: VoiceOption): SpeechSynthesisVoice | null {
  const pool = vozesEmPortugues(voices);
  if (!pool.length) return null;
  for (const wanted of option.browser.prefer) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(wanted.toLowerCase()));
    if (hit) return hit;
  }
  // Sem nome conhecido: respeita ao menos o gênero pedido quando dá pra inferir.
  const feminine = /(luciana|francisca|maria|joana|ines|female|mulher)/i;
  const masculine = /(felipe|ricardo|daniel|joaquim|male|homem)/i;
  const wanted = option.gender === 'f' ? feminine : masculine;
  return pool.find((v) => wanted.test(v.name)) ?? pool[0] ?? null;
}

export interface BrowserSpeakOptions {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  lang: string;
  signal?: AbortSignal;
}

/**
 * Fala e resolve quando termina. Rejeita em erro ou se travar: o Chrome às
 * vezes engole o evento `end`, e uma live parada em silêncio é pior do que
 * uma live que cai pro áudio de segurança.
 */
export function speakWithBrowser(text: string, opts: BrowserSpeakOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!browserVoiceSupported()) return reject(new Error('Navegador sem síntese de voz'));
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    if (opts.voice) utterance.voice = opts.voice;
    utterance.lang = opts.voice?.lang ?? opts.lang;
    utterance.rate = opts.rate;
    utterance.pitch = opts.pitch;

    const budget = Math.max(9000, text.length * 160);
    let settled = false;
    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(keepAlive);
      opts.signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve();
    };
    const onAbort = (): void => {
      synth.cancel();
      finish(new Error('cancelado'));
    };
    const timer = window.setTimeout(() => {
      synth.cancel();
      finish(new Error('A voz do navegador travou'));
    }, budget);
    // Chrome suspende a fala depois de ~15s se ninguem cutucar.
    const keepAlive = window.setInterval(() => {
      if (synth.speaking && !synth.paused) synth.resume();
    }, 5000);

    utterance.onend = () => finish();
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return finish(new Error('cancelado'));
      finish(new Error(`Voz do navegador falhou: ${event.error}`));
    };
    opts.signal?.addEventListener('abort', onAbort);
    synth.cancel();
    synth.speak(utterance);
  });
}
