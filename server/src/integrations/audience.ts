import { currentLive, listProducts } from '../db.js';
import { registerSale, updateMetrics } from '../engine.js';

/**
 * Fonte de audiencia da live.
 *
 * O MVP roda com a fonte simulada: a API de live do TikTok Shop depende de
 * aprovacao de parceiro, e travar o produto inteiro nisso atrasaria o teste do
 * que importa (narracao + failover + painel). Quando a credencial existir,
 * basta implementar outra fonte com essa mesma interface e trocar em
 * `startAudience`.
 */
export interface AudienceSource {
  readonly name: string;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

export class SimulatedAudience implements AudienceSource {
  readonly name = 'simulada';
  private timer: NodeJS.Timeout | null = null;
  private viewers = 0;
  private ticksSemVenda = 0;

  start(): void {
    if (this.timer) return;
    this.ticksSemVenda = 0;
    this.viewers = 40 + Math.floor(Math.random() * 30);
    updateMetrics({ viewers: this.viewers });
    this.timer = setInterval(() => {
      const live = currentLive();
      if (!live) return;
      // Audiencia sobe devagar e oscila; venda e evento raro por tick.
      const drift = Math.round((Math.random() - 0.42) * 12);
      this.viewers = Math.max(3, this.viewers + drift);
      updateMetrics({ viewers: this.viewers });
      // A chance de venda sobe enquanto nenhuma acontece: mantem o painel vivo
      // sem virar uma metralhadora de vendas irreais.
      const chance = Math.min(0.8, 0.18 + 0.12 * this.ticksSemVenda);
      if (Math.random() < chance) {
        const products = listProducts(true);
        const product = products[Math.floor(Math.random() * products.length)];
        registerSale(product?.priceCents ?? 0);
        this.ticksSemVenda = 0;
      } else {
        this.ticksSemVenda += 1;
      }
    }, 4000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

export const audience: AudienceSource = new SimulatedAudience();
