const BASE = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_multilingual_v2';

export interface SynthResult {
  ok: boolean;
  audio?: Buffer;
  contentType?: string;
  error?: string;
  status?: number;
}

export async function synthesize(
  apiKey: string,
  voiceId: string,
  text: string,
  timeoutMs = 12_000,
): Promise<SynthResult> {
  if (!apiKey) return { ok: false, error: 'Sem API key da ElevenLabs' };
  try {
    const res = await fetch(`${BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: `HTTP ${res.status} ${detail.slice(0, 200)}` };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return { ok: true, audio, contentType: 'audio/mpeg' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey) return { ok: false, error: 'Sem API key' };
  try {
    const res = await fetch(`${BASE}/voices`, {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
