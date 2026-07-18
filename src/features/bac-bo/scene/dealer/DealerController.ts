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
 * - `svg`: rig SVG em camadas (modelo em public/dealer/) — ativa.
 * - `rive`: reservado para uma futura arte riggada.
 */
export type DealerVariant = 'svg' | 'rive' | 'none';

export interface DealerProps {
  reaction: DealerReaction;
  /** Implementação visual. Default: 'svg' (Tier 1). */
  variant?: DealerVariant;
  /** 'low' congela os loops (reduced motion / aparelho fraco). */
  quality?: 'high' | 'low';
}
