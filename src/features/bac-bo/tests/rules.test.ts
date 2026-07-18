import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  WIN_PAYOUT_MULTIPLIER,
  netChangeFor,
  payoutFor,
  resolveOutcome,
  rollDie,
  rollRound,
  rollRoundForOutcome,
  sumDicePair,
} from '../engine/rules';
import type { RoundOutcome } from '../engine/types';

describe('rollDie', () => {
  it('sempre retorna valores entre 1 e 6', () => {
    const rng = new SeededRng(11);
    for (let i = 0; i < 1000; i += 1) {
      const value = rollDie(rng);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe('sumDicePair', () => {
  it('soma o par corretamente', () => {
    expect(sumDicePair([1, 1])).toBe(2);
    expect(sumDicePair([6, 6])).toBe(12);
    expect(sumDicePair([2, 5])).toBe(7);
  });
});

describe('resolveOutcome', () => {
  it('maior soma vence', () => {
    expect(resolveOutcome(10, 4)).toBe('win');
    expect(resolveOutcome(4, 10)).toBe('lose');
  });

  it('somas iguais empatam', () => {
    expect(resolveOutcome(7, 7)).toBe('tie');
  });
});

describe('payout e variação líquida', () => {
  it('vitória paga 1:1 (payout 2× o stake)', () => {
    expect(payoutFor('win', 50)).toBe(50 * WIN_PAYOUT_MULTIPLIER);
    expect(netChangeFor('win', 50)).toBe(50);
  });

  it('empate devolve exatamente o stake', () => {
    expect(payoutFor('tie', 50)).toBe(50);
    expect(netChangeFor('tie', 50)).toBe(0);
  });

  it('derrota perde o stake', () => {
    expect(payoutFor('lose', 50)).toBe(0);
    expect(netChangeFor('lose', 50)).toBe(-50);
  });
});

describe('rollRound', () => {
  it('gera dois pares válidos', () => {
    const rng = new SeededRng(3);
    const { playerDice, opponentDice } = rollRound(rng);
    for (const value of [...playerDice, ...opponentDice]) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe('rollRoundForOutcome', () => {
  const outcomes: RoundOutcome[] = ['win', 'lose', 'tie'];

  it.each(outcomes)('produz uma rolagem com resultado "%s"', (outcome) => {
    const rng = new SeededRng(99);
    for (let i = 0; i < 20; i += 1) {
      const { playerDice, opponentDice } = rollRoundForOutcome(rng, outcome);
      expect(resolveOutcome(sumDicePair(playerDice), sumDicePair(opponentDice))).toBe(outcome);
    }
  });
});
