/** Telegram foi escolhido por ser o unico canal com envio por HTTP puro, sem
 *  cadastro de negocio, sem aprovacao de template e sem numero verificado. */
export interface TelegramResult {
  ok: boolean;
  error?: string;
}

const API = 'https://api.telegram.org';

export async function sendTelegram(token: string, chatId: string, text: string): Promise<TelegramResult> {
  if (!token || !chatId) return { ok: false, error: 'Telegram não configurado' };
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !body.ok) return { ok: false, error: body.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Descobre o chat_id sozinho: o lojista so precisa mandar qualquer mensagem
 * para o bot. Sem isso ele teria que caçar o proprio id numa terceira ferramenta,
 * que e exatamente o tipo de passo que esse produto existe para eliminar.
 */
export async function discoverChatId(token: string): Promise<{ ok: boolean; chatId?: string; name?: string; error?: string }> {
  if (!token) return { ok: false, error: 'Informe o token do bot' };
  try {
    const res = await fetch(`${API}/bot${token}/getUpdates?limit=10&timeout=0`, {
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: Array<{ message?: { chat?: { id?: number; first_name?: string; title?: string } } }>;
    };
    if (!res.ok || !body.ok) return { ok: false, error: body.description ?? `HTTP ${res.status}` };
    const updates = body.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const chat = updates[i]?.message?.chat;
      if (chat?.id != null) {
        return { ok: true, chatId: String(chat.id), name: chat.first_name ?? chat.title ?? '' };
      }
    }
    return { ok: false, error: 'Nenhuma mensagem encontrada. Mande /start para o seu bot e tente de novo.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkBot(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!token) return { ok: false, error: 'Token vazio' };
  try {
    const res = await fetch(`${API}/bot${token}/getMe`, { signal: AbortSignal.timeout(8000) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { username?: string } };
    if (!res.ok || !body.ok) return { ok: false, error: body.description ?? `HTTP ${res.status}` };
    return { ok: true, username: body.result?.username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
