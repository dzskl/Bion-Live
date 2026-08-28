import { useState } from 'react';
import { api } from '../api';
import type { PublicSettings, VoiceOption } from '../types';
import { Checks } from './Checks';
import { ProductsEditor } from './Products';
import { StreamGuide } from './StreamGuide';
import { TelegramSetup } from './TelegramSetup';
import { VoicePicker } from './VoicePicker';
import { Banner, Field } from './ui';

const STEPS = ['Sua loja', 'Voz', 'Alerta no celular', 'Tudo pronto'];

export function Wizard({
  settings,
  voices,
  onReload,
  onFinish,
}: {
  settings: PublicSettings;
  voices: VoiceOption[];
  onReload: () => Promise<void>;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState(settings.storeName);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [productCount, setProductCount] = useState(0);

  const canAdvance = step !== 0 || (storeName.trim().length > 0 && productCount > 0);

  async function next(): Promise<void> {
    if (step === 0) await api.saveSettings({ storeName: storeName.trim() });
    if (step === 1) await api.saveSettings({ voiceId });
    await onReload();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish(): Promise<void> {
    await api.saveSettings({ onboardingDone: true });
    await onReload();
    onFinish();
  }

  return (
    <div className="wizard">
      <header className="wizard-head">
        <h1>Bion Live</h1>
        <p className="muted">Sua apresentadora de IA no ar em menos de 5 minutos. Sem terminal, sem driver, sem extensão.</p>
        <ol className="wizard-steps">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? 'on' : index < step ? 'done' : ''}>
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </header>

      <section className="card">
        {step === 0 && (
          <div className="stack">
            <Field label="Nome da loja" hint="A apresentadora usa esse nome na abertura da live.">
              <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ateliê da Bia" />
            </Field>
            <h3>Produtos da live</h3>
            <p className="muted">Nome, preço e uma frase de destaque. É tudo que a IA precisa para narrar.</p>
            <ProductsEditor compact onChange={setProductCount} />
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <h3>Escolha a voz</h3>
            <p className="muted">Quatro vozes, não quarenta. Clique em “Ouvir” para decidir em 10 segundos.</p>
            <VoicePicker voices={voices} selected={voiceId} onSelect={setVoiceId} />
            <Banner kind="info">
              Sem nenhuma configuração, a live usa a voz nativa do seu navegador — grátis e sem cadastro. Se você tiver
              uma chave da ElevenLabs, dá para ativar a voz premium depois em Ajustes; a voz do navegador continua como
              rede de segurança.
            </Banner>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <h3>Aviso no seu celular quando algo falhar</h3>
            <p className="muted">
              Essa é a parte que mais importa: se a narração cair, você fica sabendo na hora, mesmo longe do computador.
            </p>
            <TelegramSetup settings={settings} onDone={() => void onReload()} />
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <h3>Verificação automática</h3>
            <Checks />
            <h3>Como o som entra na sua live</h3>
            <StreamGuide />
          </div>
        )}
      </section>

      <footer className="wizard-foot">
        <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Voltar
        </button>
        <div className="row gap">
          {step === 2 && (
            <button className="btn ghost" onClick={() => void next()}>
              Configurar depois
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn primary" onClick={() => void next()} disabled={!canAdvance}>
              {step === 0 && productCount === 0 ? 'Cadastre um produto para continuar' : 'Continuar'}
            </button>
          ) : (
            <button className="btn primary" onClick={() => void finish()}>
              Ir para o painel da live
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
