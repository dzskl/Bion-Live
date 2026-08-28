import { Router } from 'express';
import { currentLive, getSettings, listEvents } from '../db.js';
import { addClient } from '../events.js';
import {
  heartbeat,
  clearIncident,
  nextLine,
  registerSale,
  reportIncident,
  setMode,
  snapshot,
  startLive,
  stopLive,
  updateMetrics,
} from '../engine.js';
import { safetyInfo } from '../safety.js';
import { findVoice } from '../voices.js';
import type { HealthLevel, VoiceProvider } from '../types.js';

export const liveRouter = Router();

liveRouter.get('/state', (_req, res) => {
  const settings = getSettings();
  res.json({
    ...snapshot(),
    voice: findVoice(settings.voiceId),
    safety: safetyInfo(),
    hasElevenLabsKey: Boolean(settings.elevenLabsApiKey),
  });
});

liveRouter.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  const remove = addClient(res);
  res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    remove();
    res.end();
  });
});

liveRouter.post('/start', (_req, res) => res.json({ live: startLive() }));
liveRouter.post('/stop', (_req, res) => res.json({ live: stopLive() }));

liveRouter.post('/mode', (req, res) => {
  const mode = (req.body as { mode?: unknown }).mode;
  if (mode !== 'ai' && mode !== 'manual') return res.status(400).json({ error: 'mode deve ser ai ou manual' });
  const live = setMode(mode);
  if (!live) return res.status(409).json({ error: 'Nenhuma live ativa' });
  res.json({ live });
});

liveRouter.post('/next-line', (_req, res) => res.json({ line: nextLine() }));

liveRouter.post('/heartbeat', (req, res) => {
  const body = req.body as { provider?: VoiceProvider | null; speaking?: boolean; queued?: number };
  const report = heartbeat({
    provider: body.provider ?? null,
    speaking: Boolean(body.speaking),
    queued: Number(body.queued ?? 0),
  });
  res.json({ health: report, live: currentLive() ?? null });
});

liveRouter.post('/incident', (req, res) => {
  const body = req.body as {
    component?: 'voice' | 'narrator';
    level?: HealthLevel;
    detail?: string;
    provider?: VoiceProvider | null;
    alert?: boolean;
  };
  const componentKey = body.component === 'narrator' ? 'narrator' : 'voice';
  const level: HealthLevel = body.level === 'down' || body.level === 'warn' ? body.level : 'warn';
  const report = reportIncident({
    component: componentKey,
    level,
    detail: String(body.detail ?? 'Falha na narração'),
    provider: body.provider ?? undefined,
    alert: body.alert,
  });
  res.json({ health: report });
});

liveRouter.post('/recovered', (req, res) => {
  const body = req.body as { component?: 'voice' | 'narrator'; detail?: string };
  const componentKey = body.component === 'narrator' ? 'narrator' : 'voice';
  res.json({ health: clearIncident(componentKey, String(body.detail ?? 'Normalizado')) });
});

liveRouter.post('/metrics', (req, res) => {
  const body = req.body as { viewers?: number; sales?: number; salesCents?: number };
  const live = updateMetrics(body);
  if (!live) return res.status(409).json({ error: 'Nenhuma live ativa' });
  res.json({ live });
});

liveRouter.post('/sale', (req, res) => {
  const valueCents = Number((req.body as { valueCents?: number }).valueCents ?? 0);
  const live = registerSale(Number.isFinite(valueCents) ? valueCents : 0);
  if (!live) return res.status(409).json({ error: 'Nenhuma live ativa' });
  res.json({ live });
});

liveRouter.get('/events', (req, res) => {
  const live = currentLive();
  const limit = Math.min(200, Number(req.query.limit ?? 50) || 50);
  res.json({ events: listEvents(live?.id ?? null, limit) });
});
