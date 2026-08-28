import { useState } from 'react';
import { api } from '../api';
import type { PublicSettings } from '../types';
import { Banner } from './ui';

export function TelegramSetup({ settings, onDone }: { settings: PublicSettings; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveToken(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const res = await api.telegramToken(token.trim());
      setStatus(`Bot @${res.username} reconhecido. Agora mande /start para ele no Telegram.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function discover(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const res = await api.telegramDiscover();
      setStatus(`Pronto${res.name ? `, ${res.name}` : ''}! Mandamos uma mensagem de confirmação para o seu Telegram.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const res = await api.testAlert();
      setStatus(res.delivered ? 'Alerta de teste enviado para o seu celular.' : `Não entregou: ${res.error}. O alerta continua aparecendo no painel.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (settings.telegramConfigured) {
    return (
      <div className="stack">
        <Banner kind="ok">Alerta no celular ligado. Se a live cair, a mensagem chega no seu Telegram.</Banner>
        <div className="row gap">
          <button className="btn" onClick={() => void test()} disabled={busy}>
            Enviar alerta de teste
          </button>
          <button
            className="btn ghost danger"
            onClick={async () => {
              await api.telegramClear();
              onDone();
            }}
          >
            Desconectar
          </button>
        </div>
        {status && <p className="muted">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      <ol className="steps">
        <li>
          No Telegram, abra <code>@BotFather</code>, mande <code>/newbot</code> e copie o token que ele responde.
        </li>
        <li>Cole o token aqui embaixo.</li>
        <li>
          Mande <code>/start</code> para o seu bot e clique em <strong>Detectar automaticamente</strong>. A gente descobre o resto.
        </li>
      </ol>
      <div className="row gap">
        <input
          className="grow"
          placeholder="123456:ABC-DEF..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        <button className="btn" onClick={() => void saveToken()} disabled={busy || !token.trim()}>
          Validar token
        </button>
      </div>
      {settings.hasTelegramToken && (
        <div className="row gap">
          <button className="btn primary" onClick={() => void discover()} disabled={busy}>
            Detectar automaticamente
          </button>
          <span className="muted">Mande /start para o seu bot antes de clicar.</span>
        </div>
      )}
      {status && <Banner kind="info">{status}</Banner>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
