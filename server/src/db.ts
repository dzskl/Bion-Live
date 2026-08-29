import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';
import type { LiveEvent, LiveSession, Product, Settings } from './types.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'bion.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    priceCents INTEGER NOT NULL,
    highlight TEXT    NOT NULL DEFAULT '',
    position  INTEGER NOT NULL DEFAULT 0,
    active    INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lives (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    startedAt  INTEGER NOT NULL,
    endedAt    INTEGER,
    status     TEXT    NOT NULL,
    mode       TEXT    NOT NULL DEFAULT 'ai',
    viewers    INTEGER NOT NULL DEFAULT 0,
    sales      INTEGER NOT NULL DEFAULT 0,
    salesCents INTEGER NOT NULL DEFAULT 0,
    cursor     INTEGER NOT NULL DEFAULT 0,
    -- Quanto da voz premium ja foi gasto nesta live. E o que permite parar
    -- antes da fatura, em vez de descobrir depois.
    caracteresPremium INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    liveId  INTEGER,
    ts      INTEGER NOT NULL,
    type    TEXT    NOT NULL,
    message TEXT    NOT NULL DEFAULT '',
    data    TEXT    NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_events_live ON events(liveId, id DESC);

  -- Autodiagnostico da hospedagem: prova que o disco persiste e detecta
  -- hibernacao do plano, sem depender de ninguem conferir painel de fornecedor.
  CREATE TABLE IF NOT EXISTS hospedagem (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quedas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    de       INTEGER NOT NULL,
    ate      INTEGER NOT NULL,
    segundos INTEGER NOT NULL
  );
`);

const DEFAULT_SETTINGS: Settings = {
  storeName: '',
  voiceId: 'ana',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  safetyAudio: '',
  onboardingDone: 0,
  // 0 = sem teto. O padrao cobre com folga uma live longa antes de cair para a
  // voz do navegador, que continua narrando de graca.
  limiteCaracteresPorLive: 150_000,
};

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    out[key] = typeof DEFAULT_SETTINGS[key as keyof Settings] === 'number' ? Number(value) : value;
  }
  return out as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !(key in DEFAULT_SETTINGS)) continue;
    stmt.run(key, String(value));
  }
  return getSettings();
}

export function listProducts(onlyActive = false): Product[] {
  const sql = onlyActive
    ? 'SELECT * FROM products WHERE active = 1 ORDER BY position ASC, id ASC'
    : 'SELECT * FROM products ORDER BY position ASC, id ASC';
  return db.prepare(sql).all() as unknown as Product[];
}

export function getProduct(id: number): Product | undefined {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as unknown as Product | undefined;
}

export function currentLive(): LiveSession | undefined {
  return db
    .prepare("SELECT * FROM lives WHERE endedAt IS NULL ORDER BY id DESC LIMIT 1")
    .get() as unknown as LiveSession | undefined;
}

export function getLive(id: number): LiveSession | undefined {
  return db.prepare('SELECT * FROM lives WHERE id = ?').get(id) as unknown as LiveSession | undefined;
}

export function recordEvent(
  liveId: number | null,
  type: string,
  message = '',
  data: Record<string, unknown> = {},
): LiveEvent {
  const ts = Date.now();
  const info = db
    .prepare('INSERT INTO events (liveId, ts, type, message, data) VALUES (?, ?, ?, ?, ?)')
    .run(liveId, ts, type, message, JSON.stringify(data));
  return { id: Number(info.lastInsertRowid), liveId, ts, type, message, data: JSON.stringify(data) };
}

export function listEvents(liveId: number | null, limit = 40): LiveEvent[] {
  const sql = liveId
    ? 'SELECT * FROM events WHERE liveId = ? ORDER BY id DESC LIMIT ?'
    : 'SELECT * FROM events ORDER BY id DESC LIMIT ?';
  const rows = liveId
    ? (db.prepare(sql).all(liveId, limit) as unknown as LiveEvent[])
    : (db.prepare(sql).all(limit) as unknown as LiveEvent[]);
  return rows.reverse();
}
