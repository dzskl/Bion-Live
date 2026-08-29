import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, SAFETY_DIR, WEB_DIST } from './config.js';
import { authRouter, exigeSenha, protegido } from './auth.js';
import { startWatchdog } from './engine.js';
import { ensureDefaultSafetyAudio } from './safety.js';
import { productsRouter } from './routes/products.js';
import { settingsRouter } from './routes/settings.js';
import { liveRouter } from './routes/live.js';
import { ttsRouter } from './routes/tts.js';
import { alertsRouter } from './routes/alerts.js';
import { setupRouter } from './routes/setup.js';
import { safetyRouter } from './routes/safety.js';
import { simulatorRouter } from './routes/simulator.js';

ensureDefaultSafetyAudio();

const producao = process.env.NODE_ENV === 'production';

const app = express();
// Atras do proxy da hospedagem: precisa para IP real no freio de senha e para
// marcar o cookie como `secure` quando a conexao chega por HTTPS.
if (producao) app.set('trust proxy', 1);
// Em producao a interface e servida pelo mesmo processo, entao CORS so atrapalha.
if (!producao) app.use(cors({ origin: true, credentials: true }));
app.use('/api/safety/recording', express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(protegido);

app.get('/api/health', (_req, res) => res.json({ ok: true, product: 'Bion Live', version: '0.1.0' }));
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/live', liveRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/setup', setupRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/simulator', simulatorRouter);

app.use('/safety', express.static(SAFETY_DIR, { maxAge: 0 }));

// Em producao um processo so serve API e interface: uma porta, um comando.
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/safety')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[bion] erro não tratado:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
});

startWatchdog();

app.listen(PORT, () => {
  console.log(`\n  Bion Live rodando em http://localhost:${PORT}`);
  if (!fs.existsSync(WEB_DIST)) {
    console.log(`  Interface em modo dev: http://localhost:5173`);
  }
  console.log(
    exigeSenha
      ? '  Acesso protegido por senha (BION_SENHA).\n'
      : '  Sem senha: defina BION_SENHA antes de expor numa URL publica.\n',
  );
});
