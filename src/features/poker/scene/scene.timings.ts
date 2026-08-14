import { TIMINGS } from '../animations/timings';

/**
 * Durações canônicas da crupiê/cena (docs/scenario.md §9.4).
 * Reaproveita os TIMINGS do jogo para manter uma única fonte de verdade —
 * a crupiê nunca fica dessincronizada das cartas.
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
  /** Gesto de distribuir — casa com o voo das cartas do baralho. */
  shakeMs: TIMINGS.dealMs,
  /** Inclinação de revelação — casa com a virada das cartas ocultas. */
  revealMs: TIMINGS.revealMs,
} as const;
