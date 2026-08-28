import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PublicSettings, SafetyInfo, VoiceOption } from '../types';
import { Checks } from './Checks';
import { SafetyAudio } from './SafetyAudio';
import { StreamGuide } from './StreamGuide';
import { TelegramSetup } from './TelegramSetup';
import { VoicePicker } from './VoicePicker';
import { Banner, Card, Field } from './ui';

export function SettingsPage({
  settings,
  voices,
  safety,
  onReload,
  onRestartWizard,
}: {
  settings: PublicSettings;
  voices: VoiceOption[];
  safety: SafetyInfo;
  onReload: () => Promise<void>;
  onRestartWizard: () => void;
}) {
  const [storeName, setStoreName] = useState(settings.storeName);
  const [apiKey, setApiKey] = useState('');
  const [keyNote, setKeyNote] = useState('');
  const [suggested, setSuggested] = useState('');

  useEffect(() => {
    void api.safety().then((res) => setSuggested(res.suggestedText));
  }, []);

  return (
    <div className="stack">
      <Card title="Verificação" subtitle="O que impede a live de rodar redondo — com botão de resolver.">
        <Checks />
      </Card>

      <Card title="Loja e voz">
        <div className="stack">
          <Field label="Nome da loja">
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              onBlur={() => void api.saveSettings({ storeName: storeName.trim() }).then(onReload)}
            />
          </Field>
          <VoicePicker voices={voices} selected={settings.voiceId} onSelect={() => void onReload()} />
        </div>
      </Card>

      <Card
        title="Voz premium (opcional)"
        subtitle="Sem chave, a live roda com a voz do navegador. Com chave, a voz do navegador vira a rede de segurança."
      >
        <div className="row gap">
          <input
            className="grow"
            type="password"
            placeholder={settings.hasElevenLabsKey ? `Chave salva (${settings.elevenLabsKeyHint})` : 'Chave da ElevenLabs'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <button
            className="btn"
            onClick={async () => {
              const res = await api.saveSettings({ elevenLabsApiKey: apiKey.trim() });
              setApiKey('');
              setKeyNote(
                !apiKey.trim()
                  ? 'Chave removida. A live segue com a voz do navegador.'
                  : res.keyCheck?.ok
                    ? 'Chave válida. Voz premium ativa.'
                    : `Chave recusada: ${res.keyCheck?.error ?? 'erro desconhecido'}`,
              );
              await onReload();
            }}
          >
            Salvar
          </button>
        </div>
        {keyNote && <p className="muted">{keyNote}</p>}
      </Card>

      <Card title="Alerta no celular" subtitle="A funcionalidade mais importante: você fica sabendo antes do público.">
        <TelegramSetup settings={settings} onDone={() => void onReload()} />
      </Card>

      <Card title="Áudio de segurança">
        <SafetyAudio
          safety={safety}
          hasPremium={settings.hasElevenLabsKey}
          suggestedText={suggested}
          onChange={() => void onReload()}
        />
      </Card>

      <Card title="Como o som entra na sua live">
        <StreamGuide />
      </Card>

      <Card title="Recomeçar">
        <Banner kind="info">Refazer a configuração inicial não apaga produtos nem histórico.</Banner>
        <button
          className="btn ghost"
          onClick={async () => {
            await api.saveSettings({ onboardingDone: false });
            await onReload();
            onRestartWizard();
          }}
        >
          Refazer configuração inicial
        </button>
      </Card>
    </div>
  );
}
