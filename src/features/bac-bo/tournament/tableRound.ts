import { botAction, drawCard, handValue, isBust, visibleCards } from '../engine/rules';
import type { Card, PlayerAction } from '../engine/types';

/**
 * Mecânica de UMA rodada da mesa única — a engine do 1v1 estendida a N
 * assentos, com as mesmas convenções da casa:
 *
 * - a vez é SIMULTÂNEA: todos escolhem ao mesmo tempo e os lances saem
 *   juntos quando a vez fecha (os bots decidem com a mesa como ela
 *   estava no início da vez, nunca vendo o lance de ninguém);
 * - uma mão fecha ao parar, ao estourar ou ao cravar 21 — dali em diante
 *   fica de fora das vezes seguintes;
 * - um blackjack natural NÃO fecha a mão na distribuição: fechá-la seria
 *   o maior tell da mesa (quem tirasse 21 sairia do rodízio na hora);
 * - REGRA DE POV: de cada rival você vê a mão menos a ÚLTIMA carta.
 *   Estouro, porém, é público — a mão vira na hora em qualquer mesa.
 *
 * EXCEÇÃO DE ESTILO (a mesma de engine/rules.ts): as funções que compram
 * carta CONSOMEM o baralho recebido — ele é o maço físico da mesa,
 * passado por referência única.
 */

/** A mão de um assento na rodada corrente. */
export interface TableSeatHand {
  playerId: string;
  /** Mão completa; quem enxerga o quê é decidido na apresentação. */
  cards: Card[];
  /** A mão fechou (parou, estourou ou fez 21). */
  closed: boolean;
  /** Escolha travada para a vez corrente (só do jogador local). */
  choice?: PlayerAction;
}

/** Um lance já executado, para a mesa anunciar. */
export interface TableSeatMove {
  playerId: string;
  action: PlayerAction;
  closed: boolean;
  bust: boolean;
  /** Ninguém escolheu a tempo: a mesa parou a mão pelo dono dela. */
  timedOut: boolean;
}

export interface TableRoundState {
  hands: TableSeatHand[];
  phase: 'choosing' | 'settled';
  /** Os lances da vez que acabou de fechar (todos de uma vez). */
  lastMoves?: TableSeatMove[];
}

/** Cartas por assento na distribuição. */
const OPENING_CARDS = 2;

/**
 * Distribui a rodada na ordem da mesa, uma carta de cada vez para cada
 * assento (como um crupiê real: dá a volta na mesa duas vezes). A
 * SEGUNDA de cada um é a que fica virada — a última carta é sempre o
 * segredo do dono.
 */
export function dealTableRound(playerIds: readonly string[], deck: Card[]): TableRoundState {
  const hands: TableSeatHand[] = playerIds.map((playerId) => ({
    playerId,
    cards: [],
    closed: false,
  }));
  for (let pass = 0; pass < OPENING_CARDS; pass += 1) {
    for (const hand of hands) hand.cards.push(drawCard(deck));
  }
  return { hands, phase: 'choosing' };
}

/**
 * O total que a mesa enxerga de uma mão: só as cartas abertas, porque a
 * última é segredo do dono. Estouro é a exceção — a mão estourada vira
 * na hora, então o total dela é público e inteiro.
 */
export function openTotalOf(hand: TableSeatHand): number {
  return isBust(hand.cards)
    ? handValue(hand.cards).total
    : handValue(visibleCards(hand.cards)).total;
}

/**
 * Decide o lance de um bot na mesa. Ele joga contra o RIVAL MAIS FORTE
 * que consegue ler — o maior total aberto entre as mãos que ainda estão
 * vivas. Mãos estouradas saem da conta: não são ameaça nenhuma, e
 * incluí-las faria o bot parar cedo achando que já ganhou.
 *
 * Com todos os rivais estourados ele para: a rodada já é dele, e pedir
 * carta só jogaria a vitória fora.
 */
export function botTableAction(
  hand: TableSeatHand,
  rivals: readonly TableSeatHand[],
): PlayerAction {
  const live = rivals.filter((rival) => !isBust(rival.cards));
  // 22 = "não há ameaça viva": o botAction lê isso como rival estourado.
  const target = live.length === 0 ? 22 : Math.max(...live.map(openTotalOf));
  return botAction(hand.cards, target);
}

/** Trava a escolha de um assento na vez corrente (o jogador local). */
export function lockTableChoice(
  state: TableRoundState,
  playerId: string,
  action: PlayerAction,
): TableRoundState {
  return {
    ...state,
    hands: state.hands.map((hand) =>
      hand.playerId === playerId && !hand.closed && hand.choice === undefined
        ? { ...hand, choice: action }
        : hand,
    ),
  };
}

/** Um assento ainda tem escolha a fazer nesta vez. */
export function isSeatWaiting(hand: TableSeatHand): boolean {
  return !hand.closed && hand.choice === undefined;
}

/**
 * Fecha a vez: executa TODOS os lances de uma só vez.
 *
 * A simultaneidade é estrutural: as decisões dos bots são calculadas
 * sobre um retrato da mesa ANTES de qualquer carta nova sair, então
 * ninguém joga sabendo o lance do vizinho. Quem não travou escolha tem a
 * mão PARADA pela mesa (parar nunca estoura — é o desfecho seguro de um
 * relógio que zerou).
 */
export function resolveTableTurn(
  state: TableRoundState,
  deck: Card[],
  youId: string,
): TableRoundState {
  // Retrato da mesa no início da vez — é sobre ele que todos decidem.
  const snapshot = state.hands.map((hand) => ({ ...hand, cards: [...hand.cards] }));

  const decisions = snapshot.map((hand) => {
    if (hand.closed) return null;
    if (hand.playerId === youId) {
      const timedOut = hand.choice === undefined;
      return { action: hand.choice ?? ('stand' as PlayerAction), timedOut };
    }
    const rivals = snapshot.filter((other) => other.playerId !== hand.playerId);
    return { action: botTableAction(hand, rivals), timedOut: false };
  });

  const moves: TableSeatMove[] = [];
  const hands = state.hands.map((hand, index) => {
    const decision = decisions[index];
    if (!decision) return { ...hand, choice: undefined };

    const cards = [...hand.cards];
    let bust = false;
    let closed = true;
    if (decision.action === 'hit') {
      cards.push(drawCard(deck));
      const { total } = handValue(cards);
      bust = total > 21;
      closed = total >= 21;
    }

    moves.push({
      playerId: hand.playerId,
      action: decision.action,
      closed,
      bust,
      timedOut: decision.timedOut,
    });
    return { playerId: hand.playerId, cards, closed, choice: undefined };
  });

  const settled = hands.every((hand) => hand.closed);
  return { hands, phase: settled ? 'settled' : 'choosing', lastMoves: moves };
}
