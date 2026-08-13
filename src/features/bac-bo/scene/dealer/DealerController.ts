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
 * - `nova`: rig da arte nova (public/dealernova/) — ATIVA.
 * - `svg`: rig da arte antiga (public/dealer/) — aposentado, mantido
 *   apenas como referência histórica do primeiro rig.
 * - `none`: sem crupiê em cena.
 */
export type DealerVariant = 'nova' | 'svg' | 'none';

export interface DealerProps {
  reaction: DealerReaction;
  /** Implementação visual. Default: 'nova'. */
  variant?: DealerVariant;
  /** 'low' congela os loops (reduced motion / aparelho fraco). */
  quality?: 'high' | 'low';
}
