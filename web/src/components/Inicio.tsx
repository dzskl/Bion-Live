import { Icone } from './Icons';
import type { Rota } from './Sidebar';
import type { PublicSettings, Snapshot, VoiceOption } from '../types';
import { Banner, Card, Dot, clock } from './ui';

/**
 * Visão geral. Só mostra o que é fato: quantos produtos existem, qual voz está
 * escolhida, se o alerta está configurado e se a live está no ar. Nenhum número
 * estimado, nenhuma projeção.
 */
export function Inicio({
  snap,
  settings,
  voz,
  onNavegar,
}: {
  snap: Snapshot;
  settings: PublicSettings;
  voz: VoiceOption;
  onNavegar: (r: Rota) => void;
}) {
  const noAr = Boolean(snap.live && snap.live.endedAt === null);
  const pendencias = [
    snap.productCount === 0 && { texto: 'Nenhum produto cadastrado', rota: 'produtos' as Rota },
    !settings.telegramConfigured && { texto: 'Alerta no celular não configurado', rota: 'ajustes' as Rota },
  ].filter(Boolean) as Array<{ texto: string; rota: Rota }>;

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <p className="sobre-titulo">
            {noAr ? 'Sua live está no ar' : settings.storeName ? `Olá, ${settings.storeName}` : 'Tudo pronto por aqui'}
          </p>
          <h1>{noAr ? 'A apresentadora está narrando' : 'Comece uma live'}</h1>
          <p className="hero-texto">
            {noAr
              ? `No ar desde ${clock(snap.live?.startedAt ?? Date.now())}. Acompanhe o status e assuma o comando a qualquer momento no painel.`
              : 'A apresentadora narra seus produtos em loop enquanto você mostra na câmera. O áudio sai direto deste navegador.'}
          </p>
          <button className="btn primary grande" onClick={() => onNavegar('painel')}>
            {noAr ? 'Ir para o painel' : 'Abrir painel da live'}
            <Icone nome="seta" tamanho={18} />
          </button>
        </div>
      </div>

      {pendencias.length > 0 && (
        <Banner kind="warn">
          <strong>Falta resolver:</strong>{' '}
          {pendencias.map((p, i) => (
            <span key={p.texto}>
              {i > 0 && ' · '}
              <button className="link" onClick={() => onNavegar(p.rota)}>
                {p.texto}
              </button>
            </span>
          ))}
        </Banner>
      )}

      <div className="resumo">
        <button className="resumo-card" onClick={() => onNavegar('produtos')}>
          <Icone nome="produtos" />
          <strong>{snap.productCount}</strong>
          <span>{snap.productCount === 1 ? 'produto na rotação' : 'produtos na rotação'}</span>
        </button>
        <button className="resumo-card" onClick={() => onNavegar('vozes')}>
          <Icone nome="vozes" />
          <strong>{voz.label}</strong>
          <span>{settings.hasElevenLabsKey ? 'voz premium ativa' : 'voz do navegador'}</span>
        </button>
        <button className="resumo-card" onClick={() => onNavegar('ajustes')}>
          <Icone nome="ajustes" />
          <strong className="linha-dot">
            <Dot level={snap.health.alerts.level} />
            {settings.telegramConfigured ? 'Ligado' : 'Desligado'}
          </strong>
          <span>alerta no celular</span>
        </button>
      </div>

      <Card
        title="Por que este produto não pede instalação"
        subtitle="A diferença que mais economiza o seu tempo não aparece numa lista de recursos."
        actions={
          <button className="btn ghost" onClick={() => onNavegar('instalacao')}>
            Ver comparação
          </button>
        }
      >
        <p className="muted">
          Sem extensão, sem cabo de áudio virtual, sem driver. Você abre esta página, liga “áudio do sistema” no
          programa que já usa para transmitir, e acabou.
        </p>
      </Card>
    </div>
  );
}
