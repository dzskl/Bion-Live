import fs from 'node:fs';
import path from 'node:path';
import { SAFETY_DIR } from './config.js';
import { getSettings, saveSettings } from './db.js';
import { findVoice } from './voices.js';
import { synthesize } from './tts/elevenlabs.js';

export const DEFAULT_SAFETY_FILE = 'bion-espera.wav';
export const SAFETY_TEXT =
  'Ficou um instante em silêncio? Já voltamos. Aproveita pra dar uma olhada na sacolinha aqui embaixo.';

/**
 * Pad suave de 8 segundos, gerado em codigo. Nenhum asset externo para faltar,
 * e as frequencias fecham um numero inteiro de ciclos em 8s para o loop nao
 * estalar na emenda.
 */
function renderPadWav(): Buffer {
  const sampleRate = 22_050;
  const seconds = 8;
  const total = sampleRate * seconds;
  const pcm = Buffer.alloc(total * 2);
  const partials = [
    { hz: 220, gain: 0.5 },
    { hz: 275, gain: 0.32 },
    { hz: 330, gain: 0.26 },
    { hz: 440, gain: 0.12 },
  ];
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const lfo = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.25 * t);
    let sample = 0;
    for (const { hz, gain } of partials) sample += gain * Math.sin(2 * Math.PI * hz * t);
    const value = Math.max(-1, Math.min(1, sample * 0.16 * lfo));
    pcm.writeInt16LE(Math.round(value * 32_767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function ensureDefaultSafetyAudio(): string {
  const file = path.join(SAFETY_DIR, DEFAULT_SAFETY_FILE);
  if (!fs.existsSync(file)) fs.writeFileSync(file, renderPadWav());
  return file;
}

export type SafetyKind = 'gravado' | 'gerado' | 'padrao';

export interface SafetyInfo {
  file: string;
  url: string;
  kind: SafetyKind;
  label: string;
}

export function safetyInfo(): SafetyInfo {
  ensureDefaultSafetyAudio();
  const chosen = getSettings().safetyAudio;
  if (chosen) {
    const candidate = path.join(SAFETY_DIR, path.basename(chosen));
    if (fs.existsSync(candidate)) {
      const kind: SafetyKind = chosen.startsWith('gerado') ? 'gerado' : 'gravado';
      return {
        file: candidate,
        url: `/safety/${path.basename(chosen)}`,
        kind,
        label: kind === 'gerado' ? 'Mensagem gerada com a voz escolhida' : 'Sua gravação',
      };
    }
  }
  return {
    file: path.join(SAFETY_DIR, DEFAULT_SAFETY_FILE),
    url: `/safety/${DEFAULT_SAFETY_FILE}`,
    kind: 'padrao',
    label: 'Trilha de espera padrão (embutida)',
  };
}

export function saveRecording(buffer: Buffer, ext: string): SafetyInfo {
  const name = `gravado-${Date.now()}.${ext.replace(/[^a-z0-9]/gi, '') || 'webm'}`;
  fs.writeFileSync(path.join(SAFETY_DIR, name), buffer);
  saveSettings({ safetyAudio: name });
  return safetyInfo();
}

export async function generateWithVoice(): Promise<{ ok: boolean; info?: SafetyInfo; error?: string }> {
  const settings = getSettings();
  if (!settings.elevenLabsApiKey) return { ok: false, error: 'Sem API key da ElevenLabs' };
  const voice = findVoice(settings.voiceId);
  const result = await synthesize(settings.elevenLabsApiKey, voice.elevenLabsVoiceId, SAFETY_TEXT);
  if (!result.ok || !result.audio) return { ok: false, error: result.error ?? 'Falha ao gerar' };
  const name = `gerado-${voice.id}-${Date.now()}.mp3`;
  fs.writeFileSync(path.join(SAFETY_DIR, name), result.audio);
  saveSettings({ safetyAudio: name });
  return { ok: true, info: safetyInfo() };
}

export function useDefaultSafety(): SafetyInfo {
  saveSettings({ safetyAudio: '' });
  return safetyInfo();
}
