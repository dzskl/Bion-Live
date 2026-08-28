import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Check } from '../types';
import { Dot } from './ui';

const LEVEL = { ok: 'ok', warn: 'warn', fail: 'down' } as const;

export function Checks({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      const res = await api.checks();
      setChecks(res.checks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function fix(id: string): Promise<void> {
    setBusy(id);
    setNote('');
    try {
      const res = await api.fix(id);
      setChecks(res.checks);
      if (!res.ok && res.error) setNote(res.error);
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="stack">
      <ul className="checks">
        {checks.map((check) => (
          <li key={check.id}>
            <Dot level={LEVEL[check.status]} />
            <div className="grow">
              <strong>{check.label}</strong>
              <p className="muted">{check.detail}</p>
            </div>
            {check.fix?.auto && (
              <button className="btn" onClick={() => void fix(check.id)} disabled={busy === check.id}>
                {busy === check.id ? 'Resolvendo…' : 'Resolver automaticamente'}
              </button>
            )}
            {!check.fix?.auto && check.goto && onNavigate && (
              <button className="btn ghost" onClick={() => onNavigate(check.goto as string)}>
                Abrir
              </button>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="error">{note}</p>}
      <button className="btn ghost small" onClick={() => void refresh()} disabled={loading}>
        {loading ? 'Verificando…' : 'Verificar de novo'}
      </button>
    </div>
  );
}
