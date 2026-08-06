import type { CSSProperties } from 'react';

import { TIMINGS } from '../../animations/timings';
import type { Card } from '../../engine/types';
import { Card3D } from '../Card3D';

export interface CommunityBoardProps {
  /** As comunitárias já abertas (0, 3, 4 ou 5). */
  cards: readonly Card[];
  /**
   * As cinco cartas da mão vencedora. As comunitárias que estão nela
   * acendem no showdown — é o crupiê apontando o que decidiu o pote.
   */
  highlight?: readonly Card[];
  /** Movimento reduzido: as cartas aparecem sem voo. */
  instant: boolean;
}

/** Quantas cartas a mesa tem no total, abertas ou não. */
const BOARD_SLOTS = 5;

/**
 * A MESA — as cinco cartas comunitárias, que são de todo mundo e é isso
 * que faz do Hold'em o que ele é: as duas fechadas de cada um só valem
 * alguma coisa em cima delas.
 *
 * OS CINCO LUGARES EXISTEM DESDE O PRIMEIRO INSTANTE, vazios. É a
 * decisão de layout mais importante desta cena, e ela é de jogo, não de
 * estética: o lugar vago diz "ainda vem carta aí", que é exatamente a
 * informação de que se precisa para decidir uma aposta no flop. Uma
 * fileira que crescesse de três para cinco empurraria a mesa inteira de
 * lugar a cada rua — e, pior, esconderia quantas cartas ainda faltam.
 *
 * A entrada é escalonada: no flop as três voam uma atrás da outra, como
 * a mão de um crupiê as vira. Turn e river entram sozinhas, sem espera —
 * são uma carta só, e o beat delas já é o da rua (ver `pokerStreetMs`).
 */
export function CommunityBoard({ cards, highlight, instant }: CommunityBoardProps) {
  return (
    <div className="board" data-testid="board" aria-label="Cartas da mesa">
      {Array.from({ length: BOARD_SLOTS }, (_, index) => {
        const card = cards[index];
        if (!card) {
          return (
            <span
              key={index}
              className="board__slot board__slot--empty"
              data-testid={`board-slot-${index + 1}`}
              aria-hidden="true"
            />
          );
        }

        // Só o flop tem coreografia: turn e river são uma carta só.
        const staggered = cards.length === 3;
        const lit = highlight?.some((held) => held.rank === card.rank && held.suit === card.suit);

        return (
          <span
            key={index}
            className={`board__slot ${lit ? 'board__slot--lit' : ''}`}
            data-testid={`board-slot-${index + 1}`}
            style={{ '--card-size': 'var(--board-card-w)' } as CSSProperties}
          >
            <Card3D
              card={card}
              size="var(--board-card-w)"
              dealDelayMs={staggered ? index * TIMINGS.dealCardMs * 0.45 : 0}
              silent={instant}
              label={`Carta da mesa ${index + 1}`}
            />
          </span>
        );
      })}
    </div>
  );
}
