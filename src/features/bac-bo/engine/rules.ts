import type { Rng } from '@/shared/lib/random';
import { randomInt } from '@/shared/lib/random';

import { afterHouseEdge } from './credits';
import type { Card, CardRank, Hand, PlayerAction, RoundOutcome } from './types';
import { cardRankSchema, cardSuitSchema } from './types';

/**
 * Regras puras do duelo de 21. Nenhuma função aqui tem efeito colateral
 * escondido: recebem estado + RNG e retornam valores. É a única fonte de
 * verdade sobre resultados — a UI nunca recalcula nada disto.
 *
 * Regra da mesa: NÃO há casa para bater. É você contra o adversário, um
 * baralho único, e vence quem chegar mais perto de 21 sem estourar.
 * Cada duelista joga sabendo tudo da mão do outro MENOS a última carta
 * dela — o segredo que fica em cima da mesa até o showdown. Estourou,
 * perdeu; os dois estourados empatam; blackjack natural (21 em duas
 * cartas) ganha de um 21 montado em três ou mais.
 *
 * EXCEÇÃO DE ESTILO: as funções de baralho (`drawCard`, `playBotHand`)
 * consomem o array recebido — o baralho pertence à engine e é passado
 * por referência única, como um maço físico que só existe sobre a mesa.
 */

/**
 * Ganho líquido de uma vitória comum: 90% do stake do adversário. O
 * próprio stake volta inteiro — quem vence não paga comissão sobre o que
 * já era seu, só sobre o que ganhou.
 */
export function winProfit(stake: number): number {
  return afterHouseEdge(stake);
}

/**
 * Ganho de uma vitória selada com blackjack natural: paga 3:2, sem
 * comissão — o prêmio clássico da mesa de blackjack.
 */
export function naturalProfit(stake: number): number {
  return Math.floor(stake * 1.5);
}

/** Um baralho só na mesa (52 cartas), como manda o duelo. */
export const DECK_COUNT = 1;
/**
 * Cartas restantes abaixo das quais o baralho é reembaralhado ANTES de
 * uma nova rodada. Uma rodada consome no máximo ~12 cartas, então o
 * maço jamais seca no meio de uma mão.
 */
export const DECK_RESHUFFLE_THRESHOLD = 20;

/**
 * Valor médio de uma carta do baralho (95/13 ≈ 7,3): é o que o bot usa
 * para estimar a carta oculta do adversário. Sem essa estimativa ele
 * jogaria contra um número que não tem como conhecer.
 */
export const AVERAGE_HIDDEN_VALUE = 7;

/** Valor de jogo de uma face (Ás vale 11 aqui; o ajuste é da mão). */
export function rankValue(rank: CardRank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
}

/** Melhor leitura de uma mão: total mais alto que não estoura. */
export interface HandValue {
  /** Total da mão (com cada Ás rebaixado a 1 enquanto estourar). */
  total: number;
  /** Ainda existe um Ás valendo 11 (mão "soft": não estoura ao pedir). */
  soft: boolean;
}

/** Avalia uma mão, rebaixando Áses de 11 para 1 enquanto ela estourar. */
export function handValue(hand: readonly Card[]): HandValue {
  let total = 0;
  let elevenAces = 0;
  for (const card of hand) {
    total += rankValue(card.rank);
    if (card.rank === 'A') elevenAces += 1;
  }
  while (total > 21 && elevenAces > 0) {
    total -= 10;
    elevenAces -= 1;
  }
  return { total, soft: elevenAces > 0 };
}

/** Mão estourada (passou de 21 mesmo com todos os Áses valendo 1). */
export function isBust(hand: readonly Card[]): boolean {
  return handValue(hand).total > 21;
}

/** Blackjack natural: 21 exato nas duas primeiras cartas. */
export function isNaturalBlackjack(hand: readonly Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === 21;
}

/** Monta um baralho já embaralhado (Fisher–Yates). */
export function buildDeck(rng: Rng, decks = DECK_COUNT): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < decks; copy += 1) {
    for (const suit of cardSuitSchema.options) {
      for (const rank of cardRankSchema.options) {
        deck.push({ rank, suit });
      }
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    // O guard é só para o TS (noUncheckedIndexedAccess): i e j são
    // sempre índices válidos do próprio laço.
    const a = deck[i];
    const b = deck[j];
    if (a !== undefined && b !== undefined) {
      deck[i] = b;
      deck[j] = a;
    }
  }
  return deck;
}

/** Tira a carta do topo do baralho (consome o array). */
export function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) {
    throw new RangeError('Baralho vazio — o reembaralho deveria ter acontecido antes.');
  }
  return card;
}

/** As mãos iniciais de uma rodada: 2 cartas para cada duelista.
 * Tuplas de propósito: o TS sabe que as duas cartas sempre existem. */
export interface InitialDeal {
  playerHand: [Card, Card];
  opponentHand: [Card, Card];
}

/**
 * Distribui a rodada na ordem da mesa, uma carta de cada vez: jogador,
 * oponente, jogador, oponente. A SEGUNDA de cada um é a que fica virada
 * para baixo — a última carta é sempre o segredo do dono.
 */
export function dealInitialHands(deck: Card[]): InitialDeal {
  const p1 = drawCard(deck);
  const o1 = drawCard(deck);
  const p2 = drawCard(deck);
  const o2 = drawCard(deck);
  return { playerHand: [p1, p2], opponentHand: [o1, o2] };
}

/**
 * O que um duelista enxerga da mão do outro: tudo menos a última carta.
 * É a regra de POV da mesa, e vale para os DOIS lados — o bot decide
 * sem saber a carta oculta do jogador, exatamente como o jogador decide
 * sem saber a dele.
 */
export function visibleCards(hand: readonly Card[]): Card[] {
  return hand.slice(0, -1);
}

/**
 * Estratégia do bot no duelo. Ele conhece a própria mão inteira e só as
 * cartas ABERTAS do jogador, então estima a oculta pelo valor médio do
 * baralho e joga contra esse alvo:
 *
 * - jogador visivelmente estourado → para na hora (já ganhou; pedir só
 *   arriscaria jogar a vitória fora);
 * - mão soft até 17 → pede (um Ás alto não estoura: é de graça);
 * - abaixo de 17 → pede, como em qualquer mesa;
 * - 17 ou 18 atrás do alvo estimado → pede assim mesmo: parar seria
 *   perder de certeza, e a corrida obriga a arriscar;
 * - 19 ou mais → para (o risco de estourar já não compensa).
 */
export function botAction(hand: readonly Card[], rivalVisibleTotal: number): PlayerAction {
  const { total, soft } = handValue(hand);
  if (total >= 21) return 'stand';
  if (rivalVisibleTotal > 21) return 'stand';

  const target = Math.min(21, rivalVisibleTotal + AVERAGE_HIDDEN_VALUE);
  if (soft && total <= 17) return 'hit';
  if (total < 17) return 'hit';
  if (total <= 18 && total < target) return 'hit';
  return 'stand';
}

/** Joga a mão do bot até ele parar ou estourar; retorna a mão final. */
export function playBotHand(deck: Card[], hand: Hand, rivalVisibleTotal: number): Hand {
  const played = [...hand];
  while (!isBust(played) && botAction(played, rivalVisibleTotal) === 'hit') {
    played.push(drawCard(deck));
  }
  return played;
}

/** Situação final de um duelista, pronta para comparação. */
export interface DuelistStanding {
  total: number;
  bust: boolean;
  natural: boolean;
}

/** Lê uma mão como uma situação de showdown. */
export function standingOf(hand: readonly Card[]): DuelistStanding {
  return {
    total: handValue(hand).total,
    bust: isBust(hand),
    natural: isNaturalBlackjack(hand),
  };
}

/**
 * Showdown: quem chegou mais perto de 21 sem estourar leva a rodada.
 * Estouro perde para qualquer mão viva; dois estouros empatam (ninguém
 * tem mão); o blackjack natural ganha de um 21 montado em três cartas;
 * totais iguais empatam.
 */
export function resolveOutcome(player: DuelistStanding, opponent: DuelistStanding): RoundOutcome {
  if (player.bust && opponent.bust) return 'tie';
  if (player.bust) return 'lose';
  if (opponent.bust) return 'win';
  if (player.natural !== opponent.natural) return player.natural ? 'win' : 'lose';
  if (player.total > opponent.total) return 'win';
  if (player.total < opponent.total) return 'lose';
  return 'tie';
}

/**
 * Créditos devolvidos ao jogador ao final da rodada. Vitória com
 * blackjack natural paga 3:2 (sem comissão); vitória comum paga o ganho
 * com a comissão da casa; empate devolve o stake; derrota perde tudo.
 */
export function payoutFor(outcome: RoundOutcome, stake: number, natural = false): number {
  switch (outcome) {
    case 'win':
      return stake + (natural ? naturalProfit(stake) : winProfit(stake));
    case 'tie':
      return stake;
    case 'lose':
      return 0;
  }
}

/** Variação líquida de saldo da rodada (payout − stake). */
export function netChangeFor(outcome: RoundOutcome, stake: number, natural = false): number {
  return payoutFor(outcome, stake, natural) - stake;
}

/**
 * Cartas empilhadas que garantem o resultado da rodada (uso exclusivo do
 * DevTools/testes), na ordem de distribuição da mesa: jogador, oponente,
 * jogador, oponente.
 *
 * O truque: naturais decidem sozinhos. Um blackjack natural é a melhor
 * mão possível e NENHUMA decisão posterior a alcança — 'win' dá o
 * natural ao jogador (a rodada resolve na distribuição), 'lose' dá ao
 * oponente (o jogador até joga, mas nem um 21 de três cartas empata), e
 * 'tie' dá aos dois.
 */
export function forcedDealFor(outcome: RoundOutcome): Card[] {
  const deals: Record<RoundOutcome, Card[]> = {
    win: [
      { rank: 'A', suit: 'spades' },
      { rank: 'K', suit: 'clubs' },
      { rank: 'K', suit: 'hearts' },
      { rank: 'Q', suit: 'diamonds' },
    ],
    lose: [
      { rank: 'K', suit: 'clubs' },
      { rank: 'A', suit: 'spades' },
      { rank: 'Q', suit: 'diamonds' },
      { rank: 'K', suit: 'hearts' },
    ],
    tie: [
      { rank: 'A', suit: 'spades' },
      { rank: 'A', suit: 'diamonds' },
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'clubs' },
    ],
  };
  return deals[outcome];
}
