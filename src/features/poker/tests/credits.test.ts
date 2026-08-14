import { describe, expect, it } from 'vitest';

import {
  MIN_STAKE,
  TABLE_ANTE,
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

describe('isBroke', () => {
  it('detecta saldo insuficiente para a ENTRADA da mesa', () => {
    // Sem a entrada não há mão a jogar: é ela que abre o pote.
    expect(isBroke(TABLE_ANTE - 1)).toBe(true);
    expect(isBroke(TABLE_ANTE)).toBe(false);
  });
});
