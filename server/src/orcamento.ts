import { currentLive, db, getSettings, recordEvent } from './db.js';

/**
 * Teto de gasto da voz premium.
 *
 * Uma live de quatro horas narrando em loop consome muito caractere da
 * ElevenLabs. Em vez de inventar um sistema de aviso novo, o estouro entra como
 * mais um gatilho do failover que já existe: a voz premium sai de cena, a voz
 * do navegador assume, e a live não para nem gera fatura surpresa.
 */
export interface Veredito {
  permitido: boolean;
  motivo?: string;
  usados: number;
  limite: number;
}

export function avaliar(caracteres: number): Veredito {
  const limite = Number(getSettings().limiteCaracteresPorLive) || 0;
  const live = currentLive();
  const usados = live?.caracteresPremium ?? 0;
  if (limite <= 0) return { permitido: true, usados, limite: 0 };
  if (usados + caracteres <= limite) return { permitido: true, usados, limite };
  return {
    permitido: false,
    usados,
    limite,
    motivo: `Teto da voz premium atingido nesta live (${usados.toLocaleString('pt-BR')} de ${limite.toLocaleString('pt-BR')} caracteres).`,
  };
}

export function registrarConsumo(caracteres: number): number {
  const live = currentLive();
  if (!live) return 0;
  const total = live.caracteresPremium + caracteres;
  db.prepare('UPDATE lives SET caracteresPremium = ? WHERE id = ?').run(total, live.id);
  return total;
}

export function registrarEstouro(veredito: Veredito): void {
  const live = currentLive();
  recordEvent(live?.id ?? null, 'orcamento', veredito.motivo ?? 'Teto da voz premium atingido', {
    usados: veredito.usados,
    limite: veredito.limite,
  });
}
