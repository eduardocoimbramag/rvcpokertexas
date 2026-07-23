import type { Rng } from '@/shared/lib/random';
import { randomInt } from '@/shared/lib/random';

import { afterHouseEdge } from './credits';
import type { DicePair, DieValue, RoundOutcome } from './types';

/**
 * Regras puras do Bac Bo. Nenhuma função aqui tem efeito colateral:
 * recebem estado + RNG e retornam valores. É a única fonte de verdade
 * sobre resultados — a UI nunca recalcula nada disto.
 *
 * Regra da mesa: 4 dados (2 azuis do jogador, 2 vermelhos do oponente).
 * A maior soma vence. A vitória leva 90% do que o perdedor pôs na mesa
 * (os 10% restantes são a comissão da casa); o empate devolve o stake;
 * a derrota perde o stake inteiro.
 */

/**
 * Ganho líquido de uma vitória: 90% do stake do adversário. O próprio
 * stake volta inteiro — quem vence não paga comissão sobre o que já era
 * seu, só sobre o que ganhou.
 */
export function winProfit(stake: number): number {
  return afterHouseEdge(stake);
}

/** Rola um único dado honesto de 6 faces. */
export function rollDie(rng: Rng): DieValue {
  return randomInt(rng, 1, 6) as DieValue;
}

/** Rola um par de dados. */
export function rollDicePair(rng: Rng): DicePair {
  return [rollDie(rng), rollDie(rng)];
}

/** Soma de um par de dados (2 a 12). */
export function sumDicePair(pair: DicePair): number {
  return pair[0] + pair[1];
}

/** Resolve o resultado da rodada comparando as somas. */
export function resolveOutcome(playerTotal: number, opponentTotal: number): RoundOutcome {
  if (playerTotal > opponentTotal) return 'win';
  if (playerTotal < opponentTotal) return 'lose';
  return 'tie';
}

/** Créditos devolvidos ao jogador ao final da rodada. */
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

/** Dados de uma rodada completa: par do jogador e par do oponente. */
export interface RolledDice {
  playerDice: DicePair;
  opponentDice: DicePair;
}

/** Rola os 4 dados de uma rodada sem viés. */
export function rollRound(rng: Rng): RolledDice {
  return { playerDice: rollDicePair(rng), opponentDice: rollDicePair(rng) };
}

/**
 * Gera uma rolagem cujo resultado é o desejado (uso exclusivo do DevTools).
 * Usa rejection sampling para manter distribuições naturais dentro do
 * resultado forçado, com fallback determinístico como garantia de término.
 */
export function rollRoundForOutcome(rng: Rng, outcome: RoundOutcome): RolledDice {
  const MAX_ATTEMPTS = 200;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rolled = rollRound(rng);
    if (
      resolveOutcome(sumDicePair(rolled.playerDice), sumDicePair(rolled.opponentDice)) === outcome
    ) {
      return rolled;
    }
  }
  const fallbacks: Record<RoundOutcome, RolledDice> = {
    win: { playerDice: [6, 5], opponentDice: [2, 3] },
    lose: { playerDice: [2, 3], opponentDice: [6, 5] },
    tie: { playerDice: [3, 4], opponentDice: [4, 3] },
  };
  return fallbacks[outcome];
}
