/**
 * Contrato do dealer (docs/scenario.md §7.2).
 * A UI do jogo só conhece estes tipos — a implementação visual
 * (rig SVG hoje, Rive amanhã) é um detalhe plugável.
 */

/** Todas as reações do dealer, na ordem do mapa evento → reação (§9.1). */
export const DEALER_REACTIONS = [
  'idle',
  'greet',
  'present',
  'anticipate',
  'shake',
  'reveal',
  'celebrate',
  'console',
  'shrug',
  'apologize',
] as const;

export type DealerReaction = (typeof DEALER_REACTIONS)[number];

/**
 * Implementações disponíveis do dealer:
 * - `nova`: rig da arte nova (public/dealernova/) — a ATIVA, e a única.
 * - `none`: sem crupiê em cena (cenário reduzido/desligado).
 *
 * Houve um `svg`, o primeiro rig (public/dealer/). O jogo nunca o pediu
 * e ele foi removido junto com a arte dele; o tipo continua sendo uma
 * união porque é o ponto de troca para a próxima implementação.
 */
export type DealerVariant = 'nova' | 'none';

export interface DealerProps {
  reaction: DealerReaction;
  /** Implementação visual. Default: 'nova'. */
  variant?: DealerVariant;
  /** 'low' congela os loops (reduced motion / aparelho fraco). */
  quality?: 'high' | 'low';
}
