import { Router } from 'express';
import { audience } from '../integrations/audience.js';
import { clearFaults, faults, setFault, type Faults } from '../faults.js';
import { publish } from '../engine.js';

export const simulatorRouter = Router();

simulatorRouter.get('/', (_req, res) => res.json({ running: audience.isRunning(), faults: { ...faults } }));

simulatorRouter.post('/start', (_req, res) => {
  audience.start();
  publish();
  res.json({ running: audience.isRunning() });
});

simulatorRouter.post('/stop', (_req, res) => {
  audience.stop();
  publish();
  res.json({ running: audience.isRunning() });
});

simulatorRouter.post('/fault', (req, res) => {
  const body = req.body as { kind?: unknown; on?: unknown };
  const kind = String(body.kind ?? '');
  if (kind === 'clear') return res.json({ faults: clearFaults() });
  if (kind !== 'tts' && kind !== 'browserVoice' && kind !== 'heartbeat') {
    return res.status(400).json({ error: 'kind deve ser tts, browserVoice, heartbeat ou clear' });
  }
  res.json({ faults: setFault(kind as keyof Faults, Boolean(body.on)) });
});
