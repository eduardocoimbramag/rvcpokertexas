import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Icon } from '@/shared/components/Icon';

import { CATEGORY_NAME, decidingHand } from '../../engine/poker/handRank';
import type { PokerResult } from '../../engine/poker/types';
import type { Duelist } from '../../engine/types';
import { Card3D } from '../Card3D';

export interface WinnerPlateProps {
  result: PokerResult;
  opponentName: string;
  /**
   * Você abriu a mão que levou o pote por desistência (ver
   * ShowCardsPrompt). Só diz alguma coisa quando NÃO houve showdown: com
   * showdown as duas mãos são públicas e não há o que revelar.
   */
  cardsShown: boolean;
  /** Movimento reduzido: a placa aparece montada, sem carimbo nem voo. */
  instant: boolean;
}

/**
 * O PLACAR DO DESFECHO — uma placa só, na cor de quem levou o pote, com
 * a mão que decidiu aberta ao lado.
 *
 * Eram DUAS placas, uma de cada lado da crupiê, e o problema delas era o
 * que mostravam: no fim de uma mão em que o par estava na mesa, as duas
 * escreviam "PAR DE DAMAS" e uma trazia a coroa — a tela dizia empate e
 * o jogo dizia derrota. Duas placas simétricas anunciam uma comparação;
 * o que aconteceu foi um VEREDITO, e veredito tem um dono só.
 *
 * Com uma placa só sobra largura, e ela é gasta na única coisa que
 * responde "por quê": AS CARTAS QUE DECIDIRAM, deitadas à direita. Uma
 * quadra de setes ou um flush de espadas deixam de ser um nome e viram
 * a mão que qualquer um reconhece de relance.
 *
 * São as que decidiram, e não a mão de cinco: um par de Reis são duas
 * cartas, três se um kicker separou as mãos. Os outros kickers estão na
 * mão de cinco porque a mão de poker tem cinco cartas — pendurá-los ali
 * faria o olho procurar a combinação dentro do monte (ver
 * `decidingHand`).
 *
 * O EMPATE é a exceção e tem cara própria: não há dono, então a placa
 * veste o neutro da casa e diz que o pote se dividiu — coroar alguém ali
 * seria mentir sobre o que a mesa fez.
 */
export function WinnerPlate({ result, opponentName, cardsShown, instant }: WinnerPlateProps) {
  const tie = result.outcome === 'tie';
  const winner: Duelist = result.outcome === 'lose' ? 'opponent' : 'player';
  const rank = winner === 'player' ? result.playerRank : result.opponentRank;
  const name = tie ? 'Pote dividido' : winner === 'player' ? 'Você' : opponentName;

  /* Numa mão levada por desistência o pote não foi ganho por força de
     mão: foi entregue. A placa diz isso, porque é o que aconteceu — e é
     a informação que explica por que uma carta alta levou o dinheiro. */
  const byFold = !result.showdown;

  /* A MÃO GUARDADA. Quem levou o pote sem ninguém pagar para ver
     escolheu não abrir (ou deixou os cinco segundos passarem, que vale o
     mesmo). A placa então NÃO abre as cartas: escancarar aqui o que a
     mesa acabou de aceitar guardar seria desfazer a jogada — e guardar a
     mão É jogada, com valor nas mãos seguintes.

     Vale para OS DOIS LADOS. A placa mostra a mão de quem venceu, então é
     a escolha DELE que manda: a sua quando o pote foi seu, a dele quando
     foi dele (ver `botShowsHand`). */
  const shownByWinner = winner === 'player' ? cardsShown : result.opponentShown;
  const concealed = byFold && !shownByWinner;

  /* AS CARTAS QUE RESPONDEM "POR QUÊ": a combinação e, quando houve, o
     kicker que separou as duas mãos — nada além disso. A mão de cinco
     traz kickers que só estão ali porque a mão de poker tem cinco
     cartas, e um par de Reis exibido como KK937 faz o olho procurar a
     combinação dentro do monte.

     Quem aponta o kicker é a ENGINE (`decidedCard`), porque isso só se
     sabe com as duas mãos à mesa e a placa vê uma. Numa desistência não
     há nenhum: ninguém comparou nada. */
  const cards = decidingHand(rank, result.decidedCard);

  const enter = instant
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 260, damping: 24, delay: 0.1 };

  return (
    <motion.div
      className={`winner-plate winner-plate--${tie ? 'tie' : winner}`}
      data-testid="winner-plate"
      data-outcome={result.outcome}
      initial={instant ? false : { opacity: 0, scale: 0.82, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={enter}
    >
      {/* O carimbo de luz que abre a placa: um clarão que se expande e
          morre, o mesmo gesto do anel do letreiro de ouro. Ele vem numa
          camada que RECORTA — o estouro tem de morrer na borda da placa,
          e é só ele que precisa disso (a coroa, montada na borda, seria
          decapitada por um recorte na placa inteira). */}
      {!instant && (
        <span className="winner-plate__flash-clip" aria-hidden="true">
          <motion.span
            className="winner-plate__flash"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.6, 1.15, 1.3] }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </span>
      )}

      {/* A COROA no alto e ao centro, montada sobre a borda — o lugar
          que ela ocupa nas placas da casa. Ali ela coroa a PLACA (que é
          o veredito inteiro); dentro da linha do nome, coroava um nome,
          e virava mais um ícone numa fileira de texto miúdo. */}
      {!tie && (
        <motion.span
          className="winner-plate__crown"
          aria-hidden="true"
          initial={instant ? false : { opacity: 0, y: 10, scale: 0.4, rotate: -25 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          transition={
            instant ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 14, delay: 0.42 }
          }
        >
          <Icon name="crown" size={19} />
        </motion.span>
      )}

      <div className="winner-plate__body">
        <span className="winner-plate__who">{name}</span>

        {/* Com a mão guardada a placa não escreve o nome dela: a leitura
            ("PAR DE ASES") é exatamente o que se escolheu não contar. */}
        <span className="winner-plate__hand" data-testid="winner-hand">
          {concealed ? 'MÃO GUARDADA' : CATEGORY_NAME[rank.category]}
        </span>

        {!concealed && rank.detail && (
          <span className="winner-plate__detail">{rank.detail}</span>
        )}

        {/* Uma LINHA PRÓPRIA para o desempate e para a desistência: são
            frases, não apostos de um nome de mão, e pendurá-las na mesma
            linha com um traço fazia o olho ler tudo como um rótulo só. */}
        {concealed ? (
          <span className="winner-plate__note" data-testid="winner-note">
            decidiu não revelar
          </span>
        ) : byFold ? (
          <span className="winner-plate__note" data-testid="winner-note">
            {result.foldedBy === 'player' ? 'você desistiu' : `${opponentName} desistiu`}
          </span>
        ) : (
          result.decidedBy && (
            <span className="winner-plate__note" data-testid="winner-note">
              decidiu no {result.decidedBy}
            </span>
          )
        )}
      </div>

      {/* AS CARTAS que decidiram, deitadas à direita — abrindo uma a uma,
          como um crupiê que vira a mão vencedora carta por carta.

          Guardada a mão, no lugar delas ficam DUAS INTERROGAÇÕES: o lugar
          das cartas continua ocupado (a placa não muda de forma conforme
          a resposta) e o que ele diz é exatamente o que a mesa sabe —
          havia duas cartas ali, e ninguém pagou para vê-las. */}
      <div className="winner-plate__cards" data-testid="winner-cards">
        {concealed
          ? [0, 1].map((index) => (
              <motion.span
                key={index}
                className="winner-plate__card winner-plate__card--hidden"
                data-testid={`winner-card-hidden-${index + 1}`}
                style={{ '--card-size': 'var(--winner-card-w)' } as CSSProperties}
                aria-hidden="true"
                initial={instant ? false : { opacity: 0, y: 16, rotate: -12, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={
                  instant
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 340, damping: 22, delay: 0.32 + index * 0.09 }
                }
              >
                ?
              </motion.span>
            ))
          : cards.map((card, index) => (
              <motion.span
                key={`${card.rank}-${card.suit}`}
                className="winner-plate__card"
                style={{ '--card-size': 'var(--winner-card-w)' } as CSSProperties}
                initial={instant ? false : { opacity: 0, y: 16, rotate: -12, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={
                  instant
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 340, damping: 22, delay: 0.32 + index * 0.09 }
                }
              >
                <Card3D
                  card={card}
                  size="var(--winner-card-w)"
                  compact
                  silent
                  label={`Carta ${index + 1} da mão vencedora`}
                />
              </motion.span>
            ))}
      </div>
    </motion.div>
  );
}
