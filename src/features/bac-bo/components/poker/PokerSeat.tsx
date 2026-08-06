import { AnimatePresence, motion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import type { Card, Duelist } from '../../engine/types';
import { Card3D } from '../Card3D';
import { ChipRack } from './ChipRack';

export interface PokerSeatProps {
  side: Duelist;
  name: string;
  /**
   * As duas cartas fechadas do assento. `null` no lugar de uma carta é
   * uma carta de bruços — é assim que a mão do rival chega aqui até o
   * showdown (a engine não manda as cartas dele, ver LocalPokerEngine).
   */
  cards: readonly (Card | null)[];
  /** Fichas que ainda restam a este lado. */
  stack: number;
  /** Fichas que este lado já pôs NESTA rua; 0 não desenha aposta. */
  committed: number;
  /**
   * Este assento tem o BOTÃO DO DEALER. Nesta mesa ele não cobra blind
   * nenhum — a entrada é igual dos dois lados —, e diz uma coisa só:
   * fala primeiro no pré-flop e por último do flop em diante. Ver
   * docs/dmisterioso.md.
   */
  button: boolean;
  /** A mesa está esperando a decisão deste lado. */
  toAct: boolean;
  /** Não sobrou ficha nenhuma: ele está com tudo no meio. */
  allIn: boolean;
  /**
   * Você ABRIU esta mão para o rival depois de levar o pote sem showdown
   * (ver ShowCardsPrompt). É um gesto voluntário, e por isso tem selo
   * próprio: quem olha a mesa precisa distinguir uma carta que a mesa
   * virou de uma que o dono escolheu virar.
   */
  shown?: boolean;
  /** A mão deste lado, lida com as comunitárias — só a sua aparece. */
  reading?: string;
  /** As cinco cartas vencedoras: as fechadas que estão nelas acendem. */
  highlight?: readonly Card[];
  /** Atraso da carta na coreografia da distribuição. */
  dealDelayFor: (index: number) => number;
  instant: boolean;
}

/**
 * UM ASSENTO DA MESA: quem é, quanto tem, o que pôs e as duas cartas
 * fechadas dele.
 *
 * O que se mostra de um lado da mesa é exatamente o que uma mesa de
 * verdade mostra: o STACK e a APOSTA são públicos — é com eles que se
 * calcula tudo o que há para calcular no poker — e as CARTAS não são. A
 * mão do rival fica de bruços até o showdown, e a leitura ("dois pares")
 * só existe do seu lado, porque só sai da sua própria mão.
 *
 * A APOSTA DA RUA fica solta entre o assento e o centro do feltro, não
 * dentro da placa: são as fichas que a pessoa empurrou para a mesa e
 * ainda não foram recolhidas ao pote. É essa distinção — o que já é pote
 * e o que ainda é aposta de alguém — que deixa ler uma rua de olho nu.
 */
export function PokerSeat({
  side,
  name,
  cards,
  stack,
  committed,
  button,
  toAct,
  allIn,
  shown = false,
  reading,
  highlight,
  dealDelayFor,
  instant,
}: PokerSeatProps) {
  const you = side === 'player';
  const cardSize = you ? 'var(--hole-card-w)' : 'var(--rival-card-w)';

  const identity = (
    <div className={`poker-seat__id ${toAct ? 'is-turn' : ''}`} data-testid={`seat-${side}`}>
      <span className="poker-seat__dot" aria-hidden="true" />
      <span className="poker-seat__name">{name}</span>
      <span className="poker-seat__stack" data-testid={`stack-${side}`}>
        <Icon name="chip" size="0.85em" /> {formatCredits(stack)}
      </span>
      {allIn && (
        <span className="poker-seat__allin" data-testid={`allin-${side}`}>
          ALL-IN
        </span>
      )}
      {shown && (
        <span className="poker-seat__shown" data-testid={`shown-${side}`}>
          MOSTROU
        </span>
      )}
    </div>
  );

  /* O MONTANTE deste lado. Mostra o stack VIVO — o que já foi empurrado
     para o meio não está mais aqui, está na aposta da rua. */
  const rack = <ChipRack side={side} stack={stack} instant={instant} />;

  const puck = button && (
    /* O BOTÃO DO DEALER, ao lado da MÃO — que é onde ele fica numa mesa
       de verdade: um disco em cima do pano, na frente de quem o tem, e
       não um selo dentro da plaquinha do nome.
       Ele fica sempre à ESQUERDA de quem o tem, do ponto de vista dele:
       como a mesa é vista de cima e o rival está de cabeça para baixo, a
       esquerda dele cai na direita da tela.
       Aqui ele não diz quem paga blind nenhum — a entrada desta mesa é
       igual dos dois lados. Diz uma coisa só, e ela decide mão: a ORDEM
       DA PALAVRA. Ver docs/dmisterioso.md. */
    <span
      className="dealer-puck"
      data-testid={`dealer-button-${side}`}
      role="img"
      aria-label={`Botão do dealer com ${you ? 'você' : name}: fala por último do flop em diante`}
    >
      <span className="dealer-puck__face" aria-hidden="true">
        D
      </span>
    </span>
  );

  const hand = (
    <div className="poker-seat__cards" data-testid={`hole-${side}`}>
      {cards.map((card, index) => {
        const lit =
          card !== null &&
          (highlight?.some((held) => held.rank === card.rank && held.suit === card.suit) ?? false);
        return (
          <span
            key={index}
            className={`poker-seat__card ${lit ? 'poker-seat__card--lit' : ''}`}
            data-testid={`hole-${side}-card-${index + 1}`}
            style={{ '--card-size': cardSize } as CSSProperties}
          >
            <Card3D
              card={card}
              size={cardSize}
              compact={!you}
              faceDown={card === null}
              dealDelayMs={dealDelayFor(index)}
              label={`${you ? 'Sua carta' : `Carta de ${name}`} ${index + 1}`}
            />
          </span>
        );
      })}
    </div>
  );

  /* A aposta da rua entra e sai com as fichas: ela nasce quando alguém
     aposta e some quando a mesa recolhe o pote no fim da rua. */
  const bet = (
    <AnimatePresence>
      {committed > 0 && (
        <motion.span
          className="street-bet"
          data-testid={`bet-${side}`}
          initial={instant ? false : { opacity: 0, y: you ? 14 : -14, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24 }}
        >
          <span className="street-bet__chip" aria-hidden="true" />
          {formatCredits(committed)}
        </motion.span>
      )}
    </AnimatePresence>
  );

  return (
    <section
      className={`poker-seat poker-seat--${side}`}
      data-testid={`hand-${side}`}
      aria-label={you ? 'Sua mão' : `Mão de ${name}`}
    >
      {/* O rival tem a placa em CIMA das cartas e você embaixo: as duas
          identidades ficam nas bordas do feltro e as cartas, viradas
          para o centro — a mesa lê como uma mesa vista de cima. */}
      {!you && identity}

      {/* A LINHA DA MÃO em três colunas: vão · cartas · vão.
          Os dois vãos são `1fr`, e é isso que centra o disco e o montante
          EXATAMENTE no espaço que sobra de cada lado — sem número mágico
          nenhum. Antes as duas peças pendiam da borda das cartas e
          ficavam coladas nelas, com todo o vão sobrando do lado de fora.
          Quem tem o disco fica com ele à sua esquerda (a da direita da
          tela, no caso do rival, que está de cabeça para baixo) e o
          montante do outro lado. */}
      <div className="poker-seat__line">
        <span className="poker-seat__gutter">{you ? puck : rack}</span>
        {hand}
        <span className="poker-seat__gutter">{you ? rack : puck}</span>
      </div>
      {reading && (
        <span className="hand-reading" data-testid="hand-reading">
          {reading}
        </span>
      )}
      {you && identity}
      {bet}
    </section>
  );
}
