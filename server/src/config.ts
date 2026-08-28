import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/ em producao, src/ em dev -> a raiz do repo esta dois niveis acima.
export const REPO_ROOT = path.resolve(here, '..', '..');
export const DATA_DIR = process.env.BION_DATA_DIR ?? path.join(REPO_ROOT, 'data');
export const SAFETY_DIR = path.join(DATA_DIR, 'safety');
export const WEB_DIST = path.join(REPO_ROOT, 'web', 'dist');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SAFETY_DIR, { recursive: true });

export const PORT = Number(process.env.PORT ?? 4000);

/** Quanto tempo sem heartbeat do navegador ate considerarmos a live caida. */
export const HEARTBEAT_TIMEOUT_MS = Number(process.env.BION_HEARTBEAT_TIMEOUT_MS ?? 15_000);
/** De quanto em quanto tempo o watchdog verifica. */
export const WATCHDOG_INTERVAL_MS = 3_000;
/** Silencia alertas repetidos do mesmo componente nesse intervalo. */
export const ALERT_COOLDOWN_MS = 60_000;
