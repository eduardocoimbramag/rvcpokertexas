import { describe, expect, it } from 'vitest';

import {
  MIN_STAKE,
  STAKE_PRESETS,
  availableStakes,
  creditPayout,
  debitStake,
  isBroke,
  validateStake,
} from '../engine/credits';

describe('validateStake', () => {
  it('aceita stakes válidos dentro do saldo', () => {
    expect(validateStake(100, 50)).toEqual({ ok: true });
    expect(validateStake(50, 50)).toEqual({ ok: true });
  });

  it('rejeita stakes não inteiros ou abaixo do mínimo', () => {
    expect(validateStake(1000, 10.5)).toEqual({ ok: false, reason: 'invalid-stake' });
    expect(validateStake(1000, 0)).toEqual({ ok: false, reason: 'invalid-stake' });
    expect(validateStake(1000, -10)).toEqual({ ok: false, reason: 'invalid-stake' });
    expect(validateStake(1000, MIN_STAKE - 1)).toEqual({ ok: false, reason: 'invalid-stake' });
  });

  it('rejeita stakes acima do saldo', () => {
    expect(validateStake(30, 50)).toEqual({ ok: false, reason: 'insufficient-balance' });
  });
});

describe('debitStake', () => {
  it('debita o stake do saldo', () => {
    expect(debitStake(100, 25)).toBe(75);
  });

  it('lança para apostas inválidas', () => {
    expect(() => debitStake(10, 50)).toThrow(RangeError);
    expect(() => debitStake(100, -5)).toThrow(RangeError);
  });
});

describe('creditPayout', () => {
  it('credita o payout ao saldo', () => {
    expect(creditPayout(50, 100)).toBe(150);
    expect(creditPayout(50, 0)).toBe(50);
  });

  it('lança para payouts inválidos', () => {
    expect(() => creditPayout(50, -1)).toThrow(RangeError);
    expect(() => creditPayout(50, 1.5)).toThrow(RangeError);
  });
});

describe('availableStakes', () => {
  it('filtra fichas pelo saldo', () => {
    expect(availableStakes(0)).toEqual([]);
    expect(availableStakes(60)).toEqual([10, 25, 50]);
    expect(availableStakes(10_000)).toEqual([...STAKE_PRESETS]);
  });
});

describe('isBroke', () => {
  it('detecta saldo insuficiente para o menor stake', () => {
    expect(isBroke(MIN_STAKE - 1)).toBe(true);
    expect(isBroke(MIN_STAKE)).toBe(false);
  });
});
