import { useRef, useState } from 'react';
import { api } from '../api';
import type { SafetyInfo } from '../types';
import { Banner } from './ui';

export function SafetyAudio({
  safety,
  hasPremium,
  suggestedText,
  onChange,
}: {
  safety: SafetyInfo;
  hasPremium: boolean;
  suggestedText: string;
  onChange: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);

  async function startRecording(): Promise<void> {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        await api.safetyUpload(blob);
        setNote('Gravação salva. É ela que entra no ar se a narração falhar.');
        onChange();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      window.setTimeout(() => {
        if (recorderRef.current?.state === 'recording') stopRecording();
      }, 15_000);
    } catch (err) {
      setError(`Não consegui acessar o microfone: ${(err as Error).message}`);
    }
  }

  function stopRecording(): void {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="stack">
      <p className="muted">
        Se todas as vozes falharem, isso aqui entra no ar em loop para a live não ficar muda. Sugestão de fala:{' '}
        <em>“{suggestedText}”</em>
      </p>
      <Banner kind={safety.kind === 'padrao' ? 'warn' : 'ok'}>Em uso: {safety.label}</Banner>
      <audio controls src={safety.url} className="grow" />
      <div className="row gap wrap">
        {recording ? (
          <button className="btn emergency" onClick={stopRecording}>
            Parar gravação
          </button>
        ) : (
          <button className="btn" onClick={() => void startRecording()}>
            Gravar com a minha voz
          </button>
        )}
        <button
          className="btn"
          disabled={!hasPremium}
          title={hasPremium ? '' : 'Precisa de uma chave da ElevenLabs'}
          onClick={async () => {
            setError('');
            try {
              await api.safetyGenerate();
              setNote('Mensagem gerada com a voz escolhida.');
              onChange();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Gerar com a voz escolhida
        </button>
        <button
          className="btn ghost"
          onClick={async () => {
            await api.safetyDefault();
            setNote('Voltamos para a trilha de espera embutida.');
            onChange();
          }}
        >
          Usar trilha padrão
        </button>
      </div>
      {note && <p className="muted">{note}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
