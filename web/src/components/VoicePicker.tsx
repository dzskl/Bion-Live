import { useState } from 'react';
import { api, speakPremium } from '../api';
import { loadVoices, pickVoice, speakWithBrowser } from '../audio/browserVoice';
import type { VoiceOption } from '../types';

export function VoicePicker({
  voices,
  selected,
  onSelect,
}: {
  voices: VoiceOption[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [playing, setPlaying] = useState('');
  const [note, setNote] = useState('');

  async function preview(option: VoiceOption): Promise<void> {
    setPlaying(option.id);
    setNote('');
    try {
      await api.saveSettings({ voiceId: option.id });
      onSelect(option.id);
      try {
        const blob = await speakPremium(option.sample);
        if (blob) {
          const audio = new Audio(URL.createObjectURL(blob));
          await audio.play();
          await new Promise((resolve) => (audio.onended = resolve));
          setPlaying('');
          return;
        }
      } catch {
        setNote('Voz premium indisponível agora — tocando com a voz do navegador.');
      }
      const list = await loadVoices();
      const systemVoice = pickVoice(list, option);
      if (!systemVoice) setNote('Seu navegador não tem voz em português instalada. A live ainda funciona, mas o sotaque pode sair estranho.');
      await speakWithBrowser(option.sample, {
        voice: systemVoice,
        rate: option.browser.rate,
        pitch: option.browser.pitch,
        lang: option.browser.lang,
      });
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setPlaying('');
    }
  }

  return (
    <>
      <div className="voice-grid">
        {voices.map((voice) => (
          <button
            key={voice.id}
            type="button"
            className={`voice-card ${selected === voice.id ? 'on' : ''}`}
            onClick={() => {
              onSelect(voice.id);
              void api.saveSettings({ voiceId: voice.id });
            }}
          >
            <span className="voice-name">{voice.label}</span>
            <span className="muted">{voice.description}</span>
            <span
              className="btn ghost small listen"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                void preview(voice);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  void preview(voice);
                }
              }}
            >
              {playing === voice.id ? 'Tocando…' : 'Ouvir'}
            </span>
          </button>
        ))}
      </div>
      {note && <p className="muted">{note}</p>}
    </>
  );
}
