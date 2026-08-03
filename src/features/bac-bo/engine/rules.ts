import type { Rng } from '@/shared/lib/random';
import { randomInt } from '@/shared/lib/random';

import { afterHouseEdge } from './credits';
import type { Card, CardRank, ForcedDeal, PlayerAction, RoundOutcome } from './types';
import { cardRankSchema, cardSuitSchema } from './types';

/**
 * Regras puras do duelo de 21. Nenhuma função aqui tem efeito colateral
 * escondido: recebem estado + RNG e retornam valores. É a única fonte de
 * verdade sobre resultados — a UI nunca recalcula nada disto.
 *
 * Regra da mesa: NÃO há casa para bater. É você contra o adversário, um
 * baralho único, e vence quem chegar mais perto de 21 sem estourar.
 * Estourou, perdeu; os dois estourados empatam; blackjack natural (21 em
 * duas cartas) ganha de um 21 montado em três ou mais.
 *
 * O QUE CADA UM VÊ do outro depende do modo, e são dois:
 *
 * - duelo 1v1 — mesa CEGA: nenhuma carta atravessa a mesa em nenhuma das
 *   direções. O que se vê do rival é o gesto (pediu carta ou parou) e
 *   nada mais; as cartas todas só viram no showdown. É a regra que o
 *   `blindBotAction` cumpre do lado da máquina.
 * - mesa única do torneio — regra de POV: cada mão fica aberta MENOS a
 *   última carta, o segredo que dorme na mesa até o showdown. É o
 *   `visibleCards` + `botAction`.
 *
 * EXCEÇÃO DE ESTILO: as funções de baralho (`drawCard`, `playBotHand`)
 * consomem o array recebido — o baralho pertence à engine e é passado
 * por referência única, como um maço físico que só existe sobre a mesa.
 */

/**
 * Ganho líquido de uma vitória: 90% do stake do adversário. O próprio
 * stake volta inteiro — quem vence não paga comissão sobre o que já era
 * seu, só sobre o que ganhou.
 *
 * A regra vale para TODA vitória, inclusive a selada com blackjack
 * natural. Não há 3:2 nesta mesa: o duelo é um pote fechado de dois
 * lances iguais, e ninguém pode levar mais do que o adversário pôs —
 * um prêmio de 1,5× criaria crédito que nenhum jogador apostou e ainda
 * deixaria a casa sem a comissão dela. O natural continua decidindo a
 * rodada (ganha de um 21 montado em três cartas); só não paga a mais.
 */
export function winProfit(stake: number): number {
  return afterHouseEdge(stake);
}

/** Um baralho só na mesa (52 cartas), como manda o duelo. */
export const DECK_COUNT = 1;
/**
 * Cartas restantes abaixo das quais o baralho é reembaralhado ANTES de
 * uma nova rodada.
 *
 * O piso não é o consumo TÍPICO (4 a 8 cartas), e sim o pior caso: uma
 * mão de cartas baixas e Áses pode passar de dez cartas antes de fechar,
 * e são duas mãos por rodada. Com 30 o maço nunca seca no meio de uma
 * mão — `drawCard` lançaria RangeError com a rodada em andamento, e o
 * jogador já teria a aposta debitada.
 */
export const DECK_RESHUFFLE_THRESHOLD = 30;

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
 * O que um jogador da MESA ÚNICA enxerga da mão do outro: tudo menos a
 * última carta. É a regra de POV daquela mesa, e vale para os dois
 * lados — o bot decide sem saber a carta oculta do jogador, exatamente
 * como o jogador decide sem saber a dele.
 *
 * O duelo 1v1 não passa por aqui: lá a mesa é cega dos dois lados (ver
 * `blindBotAction`).
 */
export function visibleCards(hand: readonly Card[]): Card[] {
  return hand.slice(0, -1);
}

/**
 * Estratégia do bot na mesa única. Ele conhece a própria mão inteira e
 * só as cartas ABERTAS do rival, então estima a oculta pelo valor médio
 * do baralho e joga contra esse alvo:
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

/**
 * Estratégia do bot no DUELO ÀS CEGAS (1v1): ali nenhuma carta atravessa
 * a mesa — nem as dele para você, nem as suas para ele (ver
 * `blackjackRoundStateSchema`). Sem uma única carta do outro lado à
 * vista não há alvo a perseguir, então ele joga a própria mão pelo
 * melhor que ela pode ser, e nada mais:
 *
 * - mão soft até 17 → pede (um Ás alto não estoura: é de graça);
 * - abaixo de 17 → pede, como em qualquer mesa;
 * - 17 ou mais → para.
 *
 * Ele decide com EXATAMENTE a informação que você tem dele: nenhuma. É
 * isso que faz da mesa cega uma regra em vez de um handicap — enquanto
 * ele lesse as suas cartas abertas e você não visse nenhuma das dele, a
 * mesa penderia para a máquina, e em silêncio.
 *
 * A mesa única do torneio continua no `botAction` acima: lá cada mão
 * guarda só a última carta, e o alvo do rival existe.
 */
export function blindBotAction(hand: readonly Card[]): PlayerAction {
  const { total, soft } = handValue(hand);
  if (total >= 21) return 'stand';
  if (soft && total <= 17) return 'hit';
  return total < 17 ? 'hit' : 'stand';
}

/**
 * Chance de o rival topar dobrar a aposta no meio da mão do duelo cego.
 *
 * É um número FIXO, e é assim de propósito. Ele saía das suas cartas
 * abertas — que na mesa cega não existem mais. Restaria tirá-lo da mão
 * DELE, e aí o aceite viraria um leitor de força: bastaria cruzar
 * "topou dobrar" com o showdown meia dúzia de vezes para ler a mão do
 * rival de graça, que é exatamente o que a mesa cega existe para
 * impedir. Constante, o aceite não conta nada de ninguém — e continua
 * sendo risco de verdade, porque não é 0 nem 1.
 */
export const DOUBLE_ACCEPT_CHANCE = 0.5;

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
 * Créditos devolvidos ao jogador ao final da rodada: a vitória devolve o
 * stake e leva 90% do stake do adversário (os 10% restantes são a
 * comissão da casa); o empate devolve o stake; a derrota perde tudo. O
 * blackjack natural não muda a conta — ver `winProfit`.
 */
export function payoutFor(outcome: RoundOutcome, stake: number): number {
  switch (outcome) {
    case 'win':
      return stake + winProfit(stake);
    case 'tie':
      return stake;
    case 'lose':
      return 0;
  }
}

/** Variação líquida de saldo da rodada (payout − stake). */
export function netChangeFor(outcome: RoundOutcome, stake: number): number {
  return payoutFor(outcome, stake) - stake;
}

/**
 * Cartas empilhadas que garantem o resultado da rodada (uso exclusivo do
 * DevTools/testes), na ordem de distribuição da mesa: jogador, oponente,
 * jogador, oponente.
 *
 * O truque: naturais decidem sozinhos. Um blackjack natural é a melhor
 * mão possível e NENHUMA mão alcança — 'win' dá o natural ao jogador,
 * 'lose' dá ao oponente (nem um 21 de três cartas empata com ele) e
 * 'tie' dá aos dois. 'blackjack' também põe o natural na sua mão, mas
 * deixa o rival com uma mão VIVA (17), para a mesa continuar jogando as
 * vezes dele enquanto a sua brasa arde.
 *
 * A ressalva: o natural decide a rodada de quem o MANTÉM. Como ninguém
 * mais sai do rodízio na distribuição (ver `beginRound`), quem recebe a
 * mão perfeita ainda pode pedir carta e jogá-la fora — o desfecho é
 * garantido para quem para, que é o que os testes fazem.
 */
export function forcedDealFor(deal: ForcedDeal): Card[] {
  const deals: Record<ForcedDeal, Card[]> = {
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
    blackjack: [
      { rank: 'A', suit: 'hearts' },
      { rank: '9', suit: 'clubs' },
      { rank: 'K', suit: 'spades' },
      { rank: '8', suit: 'diamonds' },
    ],
  };
  return deals[deal];
}
