import { TIMINGS } from '../animations/timings';

/**
 * Durações canônicas do dealer/cena (docs/scenario.md §9.4).
 * Reaproveita os TIMINGS do jogo para manter uma única fonte de verdade —
 * o dealer nunca fica dessincronizado dos dados.
 */
export const DEALER_TIMINGS = {
  /** Crossfade entre reações (nunca corte seco). */
  blendMs: 200,
  /** Intervalo médio entre piscadas do dealer. */
  blinkEveryMs: 5000,
  /** Duração de uma piscada. */
  blinkMs: 110,
  /** Aceno do "oponente encontrado" — casa com o FoundSplash. */
  greetMs: TIMINGS.foundSplashMs,
  /** Pulso de antecipação por tick do countdown. */
  anticipateBeatMs: TIMINGS.countdownTickMs,
  /** Chacoalhar do copo — casa com o giro dos dados. */
  shakeMs: TIMINGS.rollingMs,
  /** Inclinação de revelação. */
  revealMs: TIMINGS.revealMs,
} as const;
