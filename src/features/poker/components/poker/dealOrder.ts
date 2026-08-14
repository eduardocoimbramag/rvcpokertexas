import { TIMINGS } from '../../animations/timings';
import type { Duelist } from '../../engine/types';

/**
 * A ORDEM DA DISTRIBUIÇÃO, uma carta de cada vez: jogador, rival,
 * jogador, rival — a mesma da engine (ver `LocalPokerEngine.beginHand`).
 *
 * Ela existe na tela porque a coreografia PRECISA reproduzi-la: uma
 * distribuição em que as duas cartas de um lado caem juntas não parece
 * um crupiê distribuindo, parece a mesa aparecendo pronta.
 */
export const DEAL_ORDER: Record<Duelist, readonly number[]> = {
  player: [0, 2],
  opponent: [1, 3],
};

/** Atraso de entrada de uma carta na coreografia da distribuição. */
export function dealDelay(side: Duelist, index: number, dealing: boolean): number {
  if (!dealing) return 0;
  return (DEAL_ORDER[side][index] ?? 0) * TIMINGS.dealCardMs;
}
