import type { Check, Faults, LiveSession, Product, PublicSettings, SafetyInfo, ScriptLine, Snapshot, VoiceOption } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body && !(init.body instanceof Blob) ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const message = (body as { error?: string }).error ?? `Erro ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status, body });
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  state: () => request<Snapshot & { voice: VoiceOption; safety: SafetyInfo; hasElevenLabsKey: boolean }>('/api/live/state'),
  products: () => request<{ products: Product[] }>('/api/products'),
  createProduct: (data: { name: string; price: string; highlight: string }) => post<{ product: Product }>('/api/products', data),
  updateProduct: (id: number, data: Partial<{ name: string; price: string; highlight: string; active: boolean }>) =>
    request<{ product: Product }>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => request<{ ok: true }>(`/api/products/${id}`, { method: 'DELETE' }),

  settings: () => request<{ settings: PublicSettings; voices: VoiceOption[] }>('/api/settings'),
  saveSettings: (patch: Partial<{ storeName: string; voiceId: string; onboardingDone: boolean; elevenLabsApiKey: string }>) =>
    request<{ settings: PublicSettings; keyCheck?: { ok: boolean; error?: string } }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  startLive: () => post<{ live: LiveSession }>('/api/live/start'),
  stopLive: () => post<{ live: LiveSession | null }>('/api/live/stop'),
  setMode: (mode: 'ai' | 'manual') => post<{ live: LiveSession }>('/api/live/mode', { mode }),
  nextLine: () => post<{ line: ScriptLine }>('/api/live/next-line'),
  heartbeat: (data: { provider: string | null; speaking: boolean; queued: number }) =>
    post<unknown>('/api/live/heartbeat', data),
  incident: (data: { component?: 'voice' | 'narrator'; level: 'warn' | 'down'; detail: string; provider?: string | null }) =>
    post<unknown>('/api/live/incident', data),
  recovered: (data: { component?: 'voice' | 'narrator'; detail: string }) => post<unknown>('/api/live/recovered', data),

  checks: () => request<{ checks: Check[] }>('/api/setup/checks'),
  fix: (id: string) => post<{ ok: boolean; error?: string; checks: Check[] }>(`/api/setup/fix/${id}`),

  safety: () => request<{ safety: SafetyInfo; suggestedText: string }>('/api/safety'),
  safetyGenerate: () => post<{ safety: SafetyInfo }>('/api/safety/generate'),
  safetyDefault: () => post<{ safety: SafetyInfo }>('/api/safety/default'),
  safetyUpload: (blob: Blob) =>
    request<{ safety: SafetyInfo }>('/api/safety/recording', {
      method: 'POST',
      body: blob,
      headers: { 'content-type': blob.type || 'audio/webm' },
    }),

  testAlert: () => post<{ delivered: boolean; channel: string; error?: string }>('/api/alerts/test'),
  telegramToken: (token: string) => post<{ ok: boolean; username?: string }>('/api/alerts/telegram/token', { token }),
  telegramDiscover: () => post<{ ok: boolean; chatId: string; name: string }>('/api/alerts/telegram/discover'),
  telegramClear: () => request<{ ok: true }>('/api/alerts/telegram', { method: 'DELETE' }),

  simulator: () => request<{ running: boolean; faults: Faults }>('/api/simulator'),
  simulatorStart: () => post<{ running: boolean }>('/api/simulator/start'),
  simulatorStop: () => post<{ running: boolean }>('/api/simulator/stop'),
  fault: (kind: keyof Faults | 'clear', on = true) => post<{ faults: Faults }>('/api/simulator/fault', { kind, on }),
};

export async function speakPremium(text: string, signal?: AbortSignal): Promise<Blob | null> {
  const res = await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (res.status === 409) return null; // sem voz premium configurada: caminho normal
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return await res.blob();
}
