import { Router, raw } from 'express';
import { generateWithVoice, safetyInfo, saveRecording, useDefaultSafety, SAFETY_TEXT } from '../safety.js';
import { publish } from '../engine.js';

export const safetyRouter = Router();

safetyRouter.get('/', (_req, res) => res.json({ safety: safetyInfo(), suggestedText: SAFETY_TEXT }));

safetyRouter.post('/recording', raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }), (req, res) => {
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Áudio vazio' });
  const type = String(req.headers['content-type'] ?? '');
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : 'webm';
  const info = saveRecording(body, ext);
  publish();
  res.json({ safety: info });
});

safetyRouter.post('/generate', async (_req, res) => {
  const result = await generateWithVoice();
  if (!result.ok) return res.status(400).json({ error: result.error });
  publish();
  res.json({ safety: result.info });
});

safetyRouter.post('/default', (_req, res) => {
  const info = useDefaultSafety();
  publish();
  res.json({ safety: info });
});
