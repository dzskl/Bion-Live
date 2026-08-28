/**
 * Catálogo curto de propósito: 4 vozes com personalidade clara valem mais que
 * 40 nomes que o lojista não sabe diferenciar.
 *
 * Cada voz descreve como tocar nos dois provedores:
 *  - browser: dicas para escolher a melhor voz pt-BR instalada no sistema
 *  - elevenlabs: id da voz premium equivalente (usado só se houver API key)
 */
export interface VoiceOption {
  id: string;
  label: string;
  description: string;
  gender: 'f' | 'm';
  browser: { lang: string; prefer: string[]; rate: number; pitch: number };
  elevenLabsVoiceId: string;
  sample: string;
}

export const VOICES: VoiceOption[] = [
  {
    id: 'ana',
    label: 'Ana',
    description: 'Animada e rápida. Boa para promoção e senso de urgência.',
    gender: 'f',
    browser: { lang: 'pt-BR', prefer: ['Luciana', 'Francisca', 'Microsoft Maria', 'Google português do Brasil'], rate: 1.08, pitch: 1.05 },
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    sample: 'Oi gente, tudo bem? Olha só o preço que eu trouxe pra vocês hoje!',
  },
  {
    id: 'bia',
    label: 'Bia',
    description: 'Calma e próxima. Boa para produto que precisa de explicação.',
    gender: 'f',
    browser: { lang: 'pt-BR', prefer: ['Google português do Brasil', 'Microsoft Maria', 'Luciana', 'Joana'], rate: 0.98, pitch: 1 },
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    sample: 'Deixa eu te explicar com calma por que esse produto vale a pena.',
  },
  {
    id: 'rafa',
    label: 'Rafa',
    description: 'Vendedor clássico, energia alta.',
    gender: 'm',
    browser: { lang: 'pt-BR', prefer: ['Felipe', 'Microsoft Daniel', 'Ricardo', 'Google português do Brasil'], rate: 1.06, pitch: 0.98 },
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV',
    sample: 'Corre que esse preço é só durante a live, hein!',
  },
  {
    id: 'theo',
    label: 'Theo',
    description: 'Firme e confiável. Boa para ticket mais alto.',
    gender: 'm',
    browser: { lang: 'pt-BR', prefer: ['Microsoft Daniel', 'Felipe', 'Ricardo', 'Google português do Brasil'], rate: 0.96, pitch: 0.95 },
    elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
    sample: 'Esse aqui é um investimento que dura. Deixa eu te mostrar o porquê.',
  },
];

export function findVoice(id: string): VoiceOption {
  return VOICES.find((v) => v.id === id) ?? (VOICES[0] as VoiceOption);
}
