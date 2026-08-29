import { Router } from 'express';
import { getSettings } from '../db.js';
import { faults } from '../faults.js';
import { synthesize, checkKey } from '../tts/elevenlabs.js';
import { avaliar, registrarConsumo, registrarEstouro } from '../orcamento.js';
import { reportIncident } from '../engine.js';
import { findVoice } from '../voices.js';

export const ttsRouter = Router();

ttsRouter.get('/status', async (_req, res) => {
  const settings = getSettings();
  if (!settings.elevenLabsApiKey) {
    return res.json({ premium: false, ok: true, detail: 'Usando a voz nativa do navegador' });
  }
  if (faults.tts) return res.json({ premium: true, ok: false, detail: 'Falha simulada ativa' });
  const check = await checkKey(settings.elevenLabsApiKey);
  res.json({ premium: true, ok: check.ok, detail: check.ok ? 'Voz premium ativa' : (check.error ?? 'Falha') });
});

/**
 * O navegador pede a fala aqui. Qualquer resposta que nao seja audio faz o
 * cliente cair para a voz nativa - por isso o erro precisa ser rapido e claro.
 */
ttsRouter.post('/speak', async (req, res) => {
  const text = String((req.body as { text?: unknown }).text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'Texto vazio' });

  const settings = getSettings();
  if (!settings.elevenLabsApiKey) {
    return res.status(409).json({ error: 'Sem voz premium configurada', fallback: 'browser' });
  }
  if (faults.tts) {
    return res.status(503).json({ error: 'Falha simulada no provedor de voz', fallback: 'browser' });
  }

  // Estouro de teto sai por 402: para o cliente e o mesmo failover de sempre,
  // mas ele sabe que nao adianta tentar de novo nesta live.
  const veredito = avaliar(text.length);
  if (!veredito.permitido) {
    registrarEstouro(veredito);
    reportIncident({
      component: 'voice',
      level: 'warn',
      detail: `${veredito.motivo} A narração continua com a voz do navegador.`,
      provider: 'browser',
    });
    return res.status(402).json({ error: veredito.motivo, fallback: 'browser', motivo: 'orcamento' });
  }

  const voice = findVoice(settings.voiceId);
  const result = await synthesize(settings.elevenLabsApiKey, voice.elevenLabsVoiceId, text);
  if (!result.ok || !result.audio) {
    return res.status(503).json({ error: result.error ?? 'Provedor de voz indisponível', fallback: 'browser' });
  }
  registrarConsumo(text.length);
  res.set('Content-Type', result.contentType ?? 'audio/mpeg');
  res.set('Cache-Control', 'no-store');
  res.send(result.audio);
});
