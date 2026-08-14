import type { Rng } from '@/shared/lib/random';

import { buildDeck } from '../deck';
import type { Card } from '../types';
import {
  legalActionsFor,
  minRaiseTo,
  nextRaiseSize,
  postBlinds,
  raiseRangeFor,
  reopensBetting,
} from './betting';
import type { RaiseRange } from './betting';
import { cardsDealtOn, nextStreet } from './rules';
import type { HoleCards, PokerAction, Street } from './types';

/**
 * A MÃO DE ANEL — a máquina de estados de uma mão de Hold'em com N
 * assentos.
 *
 * ---------------------------------------------------------------------
 * POR QUE ELA EXISTE, e por que o duelo 1v1 não passa por aqui
 *
 * O tipo `Duelist = 'player' | 'opponent'` aparece 60 vezes em 18
 * arquivos DESTE projeto — e a armadilha é que ele não é do poker: o modo
 * blackjack também o usa. Generalizá-lo globalmente derrubaria o
 * blackjack junto (ver docs/multiplayer.md §3.3).
 *
 * A saída é esta: um `SeatId` que vive SÓ dentro de `engine/poker/`, numa
 * máquina nova, e o `Duelist` continua onde está. O duelo 1v1 segue
 * inteiro, com a economia dele — entrada igual, sem blind, aumento
 * mínimo de um crédito —, que foi uma decisão de produto e não um
 * acidente. Esta máquina é a mesa de 6, e ela nasce indexada por cadeira.
 *
 * O que as duas COMPARTILHAM é o que valia a pena compartilhar:
 * `handRank.ts`, a leitura de mãos, que é código puro e sobrevive a
 * qualquer arquitetura — o ativo mais valioso do repositório.
 *
 * ---------------------------------------------------------------------
 * O ESTADO É IMUTÁVEL. Toda transição devolve uma mão nova em vez de
 * mexer na que recebeu. Não é preciosismo: quando o servidor entrar, a
 * mesa passa a ser uma sequência de estados que chegam pela rede, e uma
 * máquina que muta o estado no lugar não sabe representar "o servidor
 * discorda de mim". Também é o que torna cada teste daqui uma frase só.
 */

/** Uma cadeira da mesa. Índice REAL — a cadeira 3 é a 3 para todo mundo. */
export type SeatId = number;

/** Um assento dentro de uma mão. */
export interface RingSeat {
  id: SeatId;
  /** Fichas vivas na frente dele. */
  stack: number;
  /** O que ele pôs NESTA rua. Zera a cada rua. */
  committed: number;
  /** O que ele pôs na MÃO inteira. É daqui que saem os potes laterais. */
  putIn: number;
  /** As duas fechadas; `null` para quem não está na mão. */
  cards: HoleCards | null;
  folded: boolean;
  allIn: boolean;
  /**
   * Já falou nesta rua. Postar blind NÃO é falar — é por isso que o big
   * blind ganha a opção de aumentar quando a mesa só paga.
   */
  acted: boolean;
  /**
   * Pode voltar a aumentar. Cai para `false` em quem já falou e foi
   * surpreendido por um all-in CURTO, que não reabre a rodada (ver
   * `reopensBetting`).
   */
  canReraise: boolean;
}

/** Uma mão inteira, num instante. */
export interface RingHand {
  seats: readonly RingSeat[];
  button: SeatId;
  smallBlind: number;
  bigBlind: number;
  street: Street;
  board: readonly Card[];
  /** O baralho, de cabeça para baixo: o topo é o FIM do array. */
  deck: readonly Card[];
  /** O que já foi recolhido das ruas fechadas. */
  pot: number;
  /** A altura da aposta na rua corrente. */
  maxCommitted: number;
  /** O tamanho do último aumento completo — o mínimo do próximo. */
  lastRaiseSize: number;
  /** De quem é a vez; `null` quando a rua fechou ou a mão acabou. */
  toAct: SeatId | null;
  /** A mão terminou: só falta repartir. */
  done: boolean;
}

/* ---------------- O anel ---------------- */

/** A cadeira seguinte no sentido da mesa (à esquerda). */
export function nextSeat(seat: SeatId, total: number): SeatId {
  return (seat + 1) % total;
}

/** Quem ainda está na mão: não desistiu. */
export function livesIn(hand: RingHand): RingSeat[] {
  return hand.seats.filter((s) => !s.folded && s.cards !== null);
}

/** Quem ainda pode APOSTAR: está na mão e tem ficha. */
export function actorsIn(hand: RingHand): RingSeat[] {
  return livesIn(hand).filter((s) => !s.allIn && s.stack > 0);
}

/**
 * QUEM FALA PRIMEIRO na rua.
 *
 * Duas regras, e a segunda é a que confunde quem vem do anel:
 *
 * - **anel (3+)** — no pré-flop fala primeiro quem está à esquerda do big
 *   blind (o UTG); do flop em diante, quem está à esquerda do botão. Em
 *   ambos os casos o botão fala por ÚLTIMO, que é a vantagem dele.
 * - **heads-up (2)** — o botão É o small blind e fala PRIMEIRO no
 *   pré-flop; do flop em diante fala por último. A mesa de dois inverte a
 *   do anel, e é essa exceção que faz esta função existir em vez de uma
 *   linha solta no meio da máquina.
 */
export function firstToActOn(street: Street, button: SeatId, total: number): SeatId {
  if (total === 2) {
    // No heads-up o botão é o small blind: fala primeiro antes do flop.
    return street === 'preflop' ? button : nextSeat(button, total);
  }
  const small = nextSeat(button, total);
  const big = nextSeat(small, total);
  return street === 'preflop' ? nextSeat(big, total) : small;
}

/**
 * As cadeiras dos dois blinds.
 *
 * No heads-up o BOTÃO paga a small — a única mesa em que quem tem o botão
 * paga blind. No anel de 3 ou mais paga quem está à esquerda dele.
 */
export function blindSeatsOf(button: SeatId, total: number): { small: SeatId; big: SeatId } {
  if (total === 2) return { small: button, big: nextSeat(button, total) };
  const small = nextSeat(button, total);
  return { small, big: nextSeat(small, total) };
}

/* ---------------- Abrir a mão ---------------- */

export interface BeginHandOptions {
  /** Stacks por cadeira, na ordem real da mesa. Zero = cadeira fora. */
  stacks: readonly number[];
  button: SeatId;
  smallBlind: number;
  bigBlind: number;
  rng: Rng;
  /** Baralho pronto — para testes determinísticos. O topo é o FIM. */
  deck?: readonly Card[];
}

/**
 * ABRE A MÃO: cobra os blinds, distribui duas cartas a cada um e entrega
 * a palavra a quem fala primeiro.
 *
 * Quem tem stack zero fica FORA da mão (`cards: null`) em vez de ser
 * removido da lista: a cadeira dele continua existindo, e é ela que
 * mantém a geometria da mesa e a rotação do botão estáveis de uma mão
 * para a outra.
 */
export function beginHand({
  stacks,
  button,
  smallBlind,
  bigBlind,
  rng,
  deck: given,
}: BeginHandOptions): RingHand {
  const total = stacks.length;
  const { small, big } = blindSeatsOf(button, total);
  const posted = postBlinds({ stacks, small, big, smallBlind, bigBlind });
  const deck = [...(given ?? buildDeck(rng, 1))];

  const seats: RingSeat[] = stacks.map((_, id) => {
    const stack = posted.stacks[id] ?? 0;
    const committed = posted.committed[id] ?? 0;
    /* Sentado sem ficha nenhuma e sem ter posto blind: está na cadeira,
       fora da mão. Acontece a quem quebrou na mão anterior. */
    const out = stack === 0 && committed === 0;
    return {
      id,
      stack,
      committed,
      putIn: committed,
      cards: out ? null : ([deck.pop(), deck.pop()] as HoleCards),
      folded: out,
      allIn: !out && stack === 0,
      acted: false,
      canReraise: true,
    };
  });

  const hand: RingHand = {
    seats,
    button,
    smallBlind,
    bigBlind,
    street: 'preflop',
    board: [],
    deck,
    pot: 0,
    maxCommitted: posted.maxCommitted,
    lastRaiseSize: posted.lastRaiseSize,
    toAct: null,
    done: false,
  };

  return { ...hand, toAct: openRound(hand, firstToActOn('preflop', button, total)) };
}

/* ---------------- A vez ---------------- */

/** Este assento ainda deve uma palavra nesta rua? */
function owesAction(seat: RingSeat, maxCommitted: number): boolean {
  if (seat.folded || seat.cards === null || seat.allIn || seat.stack <= 0) return false;
  return !seat.acted || seat.committed < maxCommitted;
}

/**
 * A partir de `from` (inclusive), quem é o próximo que deve falar.
 * `null` quando a rua fechou.
 */
function openRound(hand: RingHand, from: SeatId): SeatId | null {
  const total = hand.seats.length;
  // Uma mão com um jogador só não tem rua: ela já acabou.
  if (livesIn(hand).length < 2) return null;
  for (let i = 0; i < total; i += 1) {
    const id = (from + i) % total;
    const seat = hand.seats[id];
    if (seat && owesAction(seat, hand.maxCommitted)) return id;
  }
  return null;
}

/** As ações legais de quem está na vez. Vazio quando não há vez. */
export function legalFor(hand: RingHand): PokerAction[] {
  const seat = hand.toAct === null ? undefined : hand.seats[hand.toAct];
  if (!seat || hand.done) return [];
  return legalActionsFor({
    stack: seat.stack,
    committed: seat.committed,
    maxCommitted: hand.maxCommitted,
    lastRaiseSize: hand.lastRaiseSize,
    rivalHasChips: actorsIn(hand).some((s) => s.id !== seat.id),
    canReraise: seat.canReraise,
  });
}

/**
 * A faixa de aumento de quem está na vez.
 *
 * Ela CONCORDA com `legalFor` por construção, e isso não é redundância:
 * quem já falou e levou só um all-in curto pode pagar mas não aumentar
 * (ver `reopensBetting`), e uma faixa que ignorasse essa trava ofereceria
 * um lance que a mesa recusa — o bot pedia, `applyMove` levantava e a
 * mesa travava no meio da rua.
 */
export function raiseRange(hand: RingHand): RaiseRange {
  const seat = hand.toAct === null ? undefined : hand.seats[hand.toAct];
  if (!seat || !seat.canReraise) {
    return { can: false, min: 0, max: 0, allInOnly: false };
  }
  return raiseRangeFor({
    stack: seat.stack,
    committed: seat.committed,
    maxCommitted: hand.maxCommitted,
    lastRaiseSize: hand.lastRaiseSize,
    rivalHasChips: actorsIn(hand).some((s) => s.id !== seat.id),
  });
}

/** Quanto falta a quem está na vez para igualar a rua. */
export function toCallFor(hand: RingHand): number {
  const seat = hand.toAct === null ? undefined : hand.seats[hand.toAct];
  if (!seat) return 0;
  return Math.max(0, hand.maxCommitted - seat.committed);
}

/* ---------------- Jogar um lance ---------------- */

export class IllegalMoveError extends Error {}

/**
 * APLICA UM LANCE e devolve a mesa depois dele.
 *
 * Lance ilegal LEVANTA em vez de ser corrigido em silêncio. Uma mesa que
 * conserta o lance de quem pediu outra coisa é uma mesa que mente sobre o
 * que aconteceu — e num dia de servidor essa correção silenciosa seria a
 * diferença entre o que o cliente acha que fez e o que o servidor gravou.
 */
export function applyMove(hand: RingHand, action: PokerAction, raiseTo?: number): RingHand {
  if (hand.done || hand.toAct === null) throw new IllegalMoveError('A mão não espera lance.');
  const id = hand.toAct;
  const seat = hand.seats[id];
  if (!seat) throw new IllegalMoveError(`Cadeira ${id} não existe.`);
  if (!legalFor(hand).includes(action)) {
    throw new IllegalMoveError(`${action} não é legal para a cadeira ${id}.`);
  }

  const total = hand.seats.length;
  const toCall = Math.max(0, hand.maxCommitted - seat.committed);
  let next: RingSeat = { ...seat, acted: true };
  let maxCommitted = hand.maxCommitted;
  let lastRaiseSize = hand.lastRaiseSize;
  /* Um aumento COMPLETO devolve a palavra a quem já falou. Um all-in
     curto não devolve — e é essa a diferença que `reopened` carrega. */
  let reopened = false;

  if (action === 'fold') {
    next = { ...next, folded: true };
  } else if (action === 'check') {
    if (toCall > 0) throw new IllegalMoveError('Não se passa com aposta na frente.');
  } else if (action === 'call') {
    const pay = Math.min(toCall, seat.stack);
    next = {
      ...next,
      stack: seat.stack - pay,
      committed: seat.committed + pay,
      putIn: seat.putIn + pay,
      allIn: seat.stack - pay === 0,
    };
  } else {
    const range = raiseRange(hand);
    const alvo = raiseTo ?? range.min;
    if (alvo < range.min || alvo > range.max) {
      throw new IllegalMoveError(`Aumento para ${alvo} fora da faixa ${range.min}–${range.max}.`);
    }
    const pay = alvo - seat.committed;
    reopened = reopensBetting(alvo, maxCommitted, lastRaiseSize);
    lastRaiseSize = nextRaiseSize(alvo, maxCommitted, lastRaiseSize);
    maxCommitted = Math.max(maxCommitted, alvo);
    next = {
      ...next,
      stack: seat.stack - pay,
      committed: alvo,
      putIn: seat.putIn + pay,
      allIn: seat.stack - pay === 0,
    };
  }

  const seats = hand.seats.map((s) => {
    if (s.id === id) return next;
    /* O aumento completo reabre a palavra para todo mundo que já falou;
       o all-in curto só tira o direito de RE-aumentar de quem já falou,
       sem tirar o de pagar. */
    if (action !== 'raise') return s;
    return reopened ? { ...s, acted: false, canReraise: true } : { ...s, canReraise: false };
  });

  const moved: RingHand = { ...hand, seats, maxCommitted, lastRaiseSize };
  return settleTurn(moved, nextSeat(id, total));
}

/**
 * Depois do lance: ou a mão acabou, ou a rua continua, ou a rua fecha e a
 * seguinte abre.
 */
function settleTurn(hand: RingHand, from: SeatId): RingHand {
  // Sobrou um: a mão acabou, e nem o board precisa abrir.
  if (livesIn(hand).length < 2) return { ...collectStreet(hand), toAct: null, done: true };

  const próximo = openRound(hand, from);
  if (próximo !== null) return { ...hand, toAct: próximo };

  return openNextStreet(collectStreet(hand));
}

/**
 * FECHA A RUA: o que estava na frente de cada um vira pote, e a altura
 * da aposta volta a zero.
 *
 * É o crupiê varrendo o feltro. Enquanto a rua está aberta, as fichas
 * ficam na frente de quem as pôs — é assim que se lê quem deve quanto —,
 * e só viram pote quando não há mais o que igualar.
 */
function collectStreet(hand: RingHand): RingHand {
  const recolhido = hand.seats.reduce((sum, s) => sum + s.committed, 0);
  return {
    ...hand,
    seats: hand.seats.map((s) => ({ ...s, committed: 0, acted: false, canReraise: true })),
    pot: hand.pot + recolhido,
    maxCommitted: 0,
    lastRaiseSize: hand.bigBlind,
  };
}

/**
 * ABRE A RUA SEGUINTE — e, se ninguém mais pode apostar, abre TODAS até o
 * showdown de uma vez.
 *
 * Esse segundo caso é o all-in coberto: com um jogador só (ou nenhum)
 * capaz de apostar, não há mais decisão a tomar, e as cartas que faltam
 * são formalidade. A mesa corre o board até o fim em vez de pedir uma
 * palavra que ninguém pode dar.
 */
function openNextStreet(hand: RingHand): RingHand {
  const seguinte = nextStreet(hand.street);
  if (seguinte === null) return { ...hand, toAct: null, done: true };

  const deck = [...hand.deck];
  const abrir = cardsDealtOn(seguinte);
  const board = [...hand.board];
  for (let i = 0; i < abrir; i += 1) {
    const card = deck.pop();
    if (card) board.push(card);
  }

  const aberta: RingHand = { ...hand, street: seguinte, board, deck };
  if (seguinte === 'showdown') return { ...aberta, toAct: null, done: true };

  // Menos de dois com ficha: ninguém tem o que decidir daqui até o fim.
  if (actorsIn(aberta).length < 2) return openNextStreet(aberta);

  const total = aberta.seats.length;
  const primeiro = openRound(aberta, firstToActOn(seguinte, aberta.button, total));
  if (primeiro === null) return openNextStreet(aberta);
  return { ...aberta, toAct: primeiro };
}

/** O menor total a que quem está na vez pode aumentar. */
export function minRaiseFor(hand: RingHand): number {
  return minRaiseTo(hand.maxCommitted, hand.lastRaiseSize);
}

/** Tudo o que há em jogo: o pote recolhido mais o que está no feltro. */
export function inPlay(hand: RingHand): number {
  return hand.seats.reduce((sum, s) => sum + s.committed, hand.pot);
}
