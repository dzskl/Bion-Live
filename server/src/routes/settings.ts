import { Router } from 'express';
import { getSettings, saveSettings } from '../db.js';
import { publish } from '../engine.js';
import { VOICES, findVoice } from '../voices.js';
import { checkKey } from '../tts/elevenlabs.js';
import type { Settings } from '../types.js';

export const settingsRouter = Router();

/** A API key nunca volta inteira para o navegador. */
function publicSettings(settings: Settings) {
  return {
    storeName: settings.storeName,
    voiceId: settings.voiceId,
    voice: findVoice(settings.voiceId),
    hasElevenLabsKey: Boolean(settings.elevenLabsApiKey),
    elevenLabsKeyHint: settings.elevenLabsApiKey ? `...${settings.elevenLabsApiKey.slice(-4)}` : '',
    telegramConfigured: Boolean(settings.telegramBotToken && settings.telegramChatId),
    telegramChatId: settings.telegramChatId,
    hasTelegramToken: Boolean(settings.telegramBotToken),
    safetyAudio: settings.safetyAudio,
    limiteCaracteresPorLive: Number(settings.limiteCaracteresPorLive),
    onboardingDone: Boolean(settings.onboardingDone),
  };
}

settingsRouter.get('/', (_req, res) => {
  res.json({ settings: publicSettings(getSettings()), voices: VOICES });
});

settingsRouter.put('/', async (req, res) => {
  const body = req.body as Partial<Record<keyof Settings, unknown>>;
  const patch: Partial<Settings> = {};
  if (typeof body.storeName === 'string') patch.storeName = body.storeName.trim();
  if (typeof body.voiceId === 'string' && VOICES.some((v) => v.id === body.voiceId)) patch.voiceId = body.voiceId;
  if (typeof body.onboardingDone === 'boolean') patch.onboardingDone = body.onboardingDone ? 1 : 0;
  if (typeof body.elevenLabsApiKey === 'string') patch.elevenLabsApiKey = body.elevenLabsApiKey.trim();
  if (body.limiteCaracteresPorLive !== undefined) {
    const limite = Number(body.limiteCaracteresPorLive);
    if (Number.isFinite(limite) && limite >= 0) patch.limiteCaracteresPorLive = Math.round(limite);
  }

  const saved = saveSettings(patch);
  let keyCheck: { ok: boolean; error?: string } | undefined;
  if (patch.elevenLabsApiKey) keyCheck = await checkKey(patch.elevenLabsApiKey);
  publish();
  res.json({ settings: publicSettings(saved), keyCheck });
});

settingsRouter.get('/voices', (_req, res) => {
  res.json({ voices: VOICES, selected: getSettings().voiceId });
});
