import { useEffect, useState } from 'react';
import { api, speakPremium } from '../api';
import { loadVoices, pickVoice, speakWithBrowser, vozesEmPortugues } from '../audio/browserVoice';
import type { VoiceOption } from '../types';
import { Banner } from './ui';

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
  const [semPortugues, setSemPortugues] = useState(false);

  // Descobrir isso só na hora de tocar seria tarde: o lojista já teria escolhido
  // uma voz que o navegador dele não sabe falar.
  useEffect(() => {
    void loadVoices().then((lista) => setSemPortugues(lista.length > 0 && vozesEmPortugues(lista).length === 0));
  }, []);

  async function preview(option: VoiceOption): Promise<void> {
    setPlaying(option.id);
    setNote('');
    try {
      await api.saveSettings({ voiceId: option.id });
      onSelect(option.id);
      try {
        const resultado = await speakPremium(option.sample);
        if (resultado.tipo === 'audio') {
          const audio = new Audio(URL.createObjectURL(resultado.blob));
          await audio.play();
          await new Promise((resolve) => (audio.onended = resolve));
          setPlaying('');
          return;
        }
        if (resultado.tipo === 'orcamento') setNote(resultado.detalhe);
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
      {semPortugues && (
        <Banner kind="down">
          <strong>Este navegador não tem voz em português instalada.</strong> Sem ela, a narração gratuita sairia
          lendo o português com sotaque inglês — então ela fica bloqueada. Abra o Bion Live no <strong>Google
          Chrome</strong> (o Brave costuma desativar as vozes online), ou instale o pacote de fala em Configurações →
          Hora e Idioma → Idioma → Português (Brasil) → Opções → Fala. Uma chave da ElevenLabs também resolve, e não
          depende do sistema.
        </Banner>
      )}
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
