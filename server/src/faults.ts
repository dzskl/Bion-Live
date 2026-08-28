import { broadcast } from './events.js';

/**
 * Injecao de falha. Existe porque a funcionalidade mais importante do produto
 * e o failover - e failover que nunca foi testado nao e failover, e esperanca.
 */
export interface Faults {
  tts: boolean;
  browserVoice: boolean;
  heartbeat: boolean;
}

export const faults: Faults = { tts: false, browserVoice: false, heartbeat: false };

export function setFault(kind: keyof Faults, on: boolean): Faults {
  faults[kind] = on;
  broadcast('faults', { ...faults });
  return { ...faults };
}

export function clearFaults(): Faults {
  faults.tts = false;
  faults.browserVoice = false;
  faults.heartbeat = false;
  broadcast('faults', { ...faults });
  return { ...faults };
}
