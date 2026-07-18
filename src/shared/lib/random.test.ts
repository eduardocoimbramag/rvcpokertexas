import { describe, expect, it } from 'vitest';

import { SeededRng, pickRandom, randomInt } from './random';

describe('SeededRng', () => {
  it('produz a mesma sequência para a mesma seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produz sequências diferentes para seeds diferentes', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('gera valores no intervalo [0, 1)', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('randomInt', () => {
  it('respeita os limites inclusivos', () => {
    const rng = new SeededRng(123);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const value = randomInt(rng, 1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    // Todos os 6 valores aparecem em 2000 amostras.
    expect(seen.size).toBe(6);
  });

  it('lança para intervalos inválidos', () => {
    const rng = new SeededRng(1);
    expect(() => randomInt(rng, 5, 1)).toThrow(RangeError);
    expect(() => randomInt(rng, 0.5, 2)).toThrow(RangeError);
  });
});

describe('pickRandom', () => {
  it('escolhe um item da lista', () => {
    const rng = new SeededRng(9);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(pickRandom(rng, items));
    }
  });

  it('lança para lista vazia', () => {
    expect(() => pickRandom(new SeededRng(1), [])).toThrow(RangeError);
  });
});
