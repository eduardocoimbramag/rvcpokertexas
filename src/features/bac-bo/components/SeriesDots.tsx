import { motion, useReducedMotion } from 'framer-motion';

import { SERIES_ROUNDS } from '../engine/rules';
import type { CardColors } from '../store/cardColors';
import { CARD_COLORS } from '../store/cardColors';
import type { SeriesState } from '../store/gameStore';

export interface SeriesDotsProps {
  series: SeriesState;
  /** Cores da partida (o cara-ou-coroa pode ter trocado os lados). */
  cardColors: CardColors;
}

/**
 * Os três círculos do melhor de 3: cada rodada DECIDIDA preenche um, na
 * ordem, com a cor das cartas de quem a venceu — empate re-distribui e
 * não preenche nada. É o placar-vivo da série, e mora num lugar só: a
 * pílula do topo da mesa, presente do primeiro sorteio ao resultado
 * final.
 */
export function SeriesDots({ series, cardColors }: SeriesDotsProps) {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div
      className="series-dots"
      role="img"
      aria-label={`Melhor de 3: você ${series.playerWins}, oponente ${series.opponentWins}`}
      data-testid="series-dots"
      data-score={`${series.playerWins}-${series.opponentWins}`}
    >
      {Array.from({ length: SERIES_ROUNDS }, (_, i) => {
        const winner = series.roundWinners[i] ?? null;
        const def = winner ? CARD_COLORS[cardColors[winner]] : null;
        return (
          <motion.span
            key={`${i}-${winner ?? 'empty'}`}
            className={`series-dot ${def ? 'series-dot--filled' : ''}`}
            style={
              def
                ? ({ '--dot-a': def.gradientA, '--dot-b': def.gradientB } as React.CSSProperties)
                : undefined
            }
            initial={def && !reducedMotion ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            data-testid={`series-dot-${i + 1}`}
            data-winner={winner ?? 'empty'}
          />
        );
      })}
    </div>
  );
}
