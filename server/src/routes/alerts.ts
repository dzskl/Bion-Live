import { Router } from 'express';
import { getSettings, saveSettings } from '../db.js';
import { notify, resetCooldown } from '../alerts/index.js';
import { checkBot, discoverChatId } from '../alerts/telegram.js';
import { publish } from '../engine.js';

export const alertsRouter = Router();

alertsRouter.post('/test', async (_req, res) => {
  resetCooldown('teste');
  const result = await notify('teste', 'Teste de alerta: se você recebeu isso, o aviso de falha vai chegar.', {
    force: true,
  });
  res.json(result);
});

alertsRouter.post('/telegram/token', async (req, res) => {
  const token = String((req.body as { token?: unknown }).token ?? '').trim();
  if (!token) return res.status(400).json({ error: 'Informe o token do bot' });
  const check = await checkBot(token);
  if (!check.ok) return res.status(400).json({ error: check.error ?? 'Token inválido' });
  saveSettings({ telegramBotToken: token });
  publish();
  res.json({ ok: true, username: check.username });
});

/** O lojista manda /start pro bot e a gente descobre o chat_id sozinho. */
alertsRouter.post('/telegram/discover', async (_req, res) => {
  const settings = getSettings();
  const found = await discoverChatId(settings.telegramBotToken);
  if (!found.ok || !found.chatId) return res.status(400).json({ error: found.error ?? 'Não encontrado' });
  saveSettings({ telegramChatId: found.chatId });
  resetCooldown('boas-vindas');
  await notify('boas-vindas', 'Pronto! Os alertas de falha vao chegar aqui.', { force: true });
  publish();
  res.json({ ok: true, chatId: found.chatId, name: found.name ?? '' });
});

alertsRouter.delete('/telegram', (_req, res) => {
  saveSettings({ telegramBotToken: '', telegramChatId: '' });
  publish();
  res.json({ ok: true });
});
