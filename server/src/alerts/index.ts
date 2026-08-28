import { ALERT_COOLDOWN_MS } from '../config.js';
import { currentLive, getSettings, recordEvent } from '../db.js';
import { broadcast } from '../events.js';
import { sendTelegram } from './telegram.js';

export interface AlertResult {
  delivered: boolean;
  channel: 'telegram' | 'painel';
  error?: string;
  skipped?: boolean;
}

const lastSentAt = new Map<string, number>();

/**
 * Um alerta sempre aparece no painel, mesmo quando o Telegram nao esta
 * configurado ou esta fora do ar. Alerta que some porque o canal falhou seria
 * o pior bug possivel num produto que vende confiabilidade.
 */
export async function notify(
  kind: string,
  text: string,
  opts: { force?: boolean; liveId?: number | null } = {},
): Promise<AlertResult> {
  const now = Date.now();
  const previous = lastSentAt.get(kind) ?? 0;
  if (!opts.force && now - previous < ALERT_COOLDOWN_MS) {
    return { delivered: false, channel: 'painel', skipped: true };
  }
  lastSentAt.set(kind, now);

  const settings = getSettings();
  const liveId = opts.liveId !== undefined ? opts.liveId : (currentLive()?.id ?? null);
  const prefix = settings.storeName.trim() ? `[Bion Live - ${settings.storeName.trim()}]` : '[Bion Live]';
  const message = `${prefix} ${text}`;

  let result: AlertResult = { delivered: false, channel: 'painel' };
  if (settings.telegramBotToken && settings.telegramChatId) {
    const sent = await sendTelegram(settings.telegramBotToken, settings.telegramChatId, message);
    result = sent.ok
      ? { delivered: true, channel: 'telegram' }
      : { delivered: false, channel: 'telegram', error: sent.error };
  } else {
    result = { delivered: false, channel: 'painel', error: 'Telegram não configurado' };
  }

  const event = recordEvent(liveId, 'alert', text, { kind, ...result });
  broadcast('alert', { ...event, data: { kind, ...result } });
  return result;
}

export function resetCooldown(kind?: string): void {
  if (kind) lastSentAt.delete(kind);
  else lastSentAt.clear();
}
