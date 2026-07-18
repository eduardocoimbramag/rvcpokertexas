/**
 * Fonte de aleatoriedade injetável.
 *
 * A engine nunca chama `Math.random` diretamente: recebe um `Rng`, o que
 * permite testes determinísticos (SeededRng) e aleatoriedade de qualidade
 * em produção (CryptoRng).
 */
export interface Rng {
  /** Retorna um número pseudoaleatório no intervalo [0, 1). */
  next(): number;
}

/** RNG de produção baseado em `crypto.getRandomValues`. */
export class CryptoRng implements Rng {
  next(): number {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 2 ** 32;
  }
}

/**
 * RNG determinístico (algoritmo mulberry32) para testes e replays.
 * A mesma seed produz sempre a mesma sequência.
 */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  }
}

/** Inteiro aleatório no intervalo [min, max], inclusivo nas duas pontas. */
export function randomInt(rng: Rng, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`Intervalo inválido: [${min}, ${max}]`);
  }
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Escolhe um item aleatório de uma lista não vazia. */
export function pickRandom<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('Não é possível escolher item de lista vazia.');
  }
  const item = items[randomInt(rng, 0, items.length - 1)];
  return item as T;
}
