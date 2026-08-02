import type { CSSProperties } from 'react';

import { handStep, miniHandStep } from '../../animations/cards';
import type { Card } from '../../engine/types';
import { Card3D } from '../Card3D';
import { BlazeBurst } from './BlazeBurst';
import { CardVeil } from './CardVeil';

export interface HandRowProps {
  cards: readonly (Card | null)[];
  /** Raiz do `data-testid`; cada carta ganha `${testid}-card-N`. */
  testid: string;
  /** Prefixo dos rótulos acessíveis ("Sua carta", "Carta de Luna"…). */
  labelPrefix: string;
  /** Comprimento CSS da carta. Padrão: a carta cheia da casa. */
  cardSize?: string;
  /** Mão de rival na mesa única: aperta muito mais (ver `miniHandStep`). */
  mini?: boolean;
  /**
   * Onde as cartas se alinham entre si. O duelo CENTRA (as duas mãos são
   * espelho uma da outra em torno do brasão); a mesa única assenta na
   * BASE, porque a fileira de assentos precisa de uma linha de chão comum
   * para ler como cadeiras em volta da mesa.
   */
  align?: 'center' | 'end';
  faceDownAt?: (index: number) => boolean;
  delayFor?: (index: number) => number;
  /** A mão é um blackjack: as cartas ganham o contorno em brasa. */
  ablaze?: boolean;
  /**
   * Esta carta está aberta para VOCÊ e virada para o rival — a última da
   * sua mão, pela regra de POV (ver ./pov). Ela recebe o selo do olho
   * cortado, o único aviso da mesa de que o outro lado não a vê.
   */
  veiledAt?: (index: number) => boolean;
}

/**
 * Uma mão deitada na mesa: cartas retas, uma ao lado da outra, todas
 * inteiramente visíveis. Só uma mão longa demais para o feltro volta a se
 * sobrepor, e apenas o necessário (ver `handStep`/`miniHandStep`). O
 * deslocamento é estático — quem anima entrada e virada é o Card3D de
 * cada carta.
 *
 * É a MESMA fileira nos dois modos. As geometrias das duas arenas são
 * legitimamente diferentes, mas a mão não é: enquanto cada uma tinha a
 * sua cópia, toda melhoria aqui custava dobrado e, na prática, só metade
 * era feita.
 */
export function HandRow({
  cards,
  testid,
  labelPrefix,
  cardSize = 'var(--card-w)',
  mini = false,
  align = 'center',
  faceDownAt,
  delayFor,
  ablaze,
  veiledAt,
}: HandRowProps) {
  const step = mini ? miniHandStep(cards.length) : handStep(cards.length);
  return (
    // O palco existe SEMPRE, mesmo sem fogo: ele é a caixa da mão, e é
    // dela que o BlazeBurst tira o que está queimando. Criá-lo só na
    // hora do estouro faria a mão trocar de caixa no instante mais
    // sensível da cena.
    <div className={`blaze-stage ${ablaze ? 'blaze-stage--lit' : ''}`}>
      {/* A combustão é montada e desmontada pelo `ablaze` — é o
          desmonte, e não um relógio, que apaga o fogo. Mãos mini
          (assentos da mesa única) ganham a mesma cena em escala. */}
      {ablaze && <BlazeBurst variant="blackjack" scale={mini ? 0.55 : 1} />}
      <div
        className={`relative flex justify-center ${align === 'end' ? 'items-end' : 'items-center'}`}
        data-testid={testid}
      >
        {cards.map((card, index) => {
          const veiled = veiledAt?.(index) ?? false;
          return (
            <div
              key={index}
              className="hand-slot"
              data-testid={`${testid}-card-${index + 1}`}
              style={
                {
                  // O selo da carta velada se dimensiona pela CARTA, não pela
                  // tipografia da página: é o que o mantém proporcional da mão
                  // cheia à mini.
                  '--card-size': cardSize,
                  marginLeft: index > 0 ? `calc(${cardSize} * ${step})` : undefined,
                  // Só conta quando a mão aperta: a carta nova cobre a anterior.
                  zIndex: index,
                } as CSSProperties
              }
            >
              <Card3D
                card={card}
                size={cardSize}
                compact={mini}
                faceDown={faceDownAt?.(index) ?? false}
                dealDelayMs={delayFor?.(index) ?? 0}
                ablaze={ablaze}
                label={`${labelPrefix} ${index + 1}`}
              />
              {veiled && <CardVeil compact={mini} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
