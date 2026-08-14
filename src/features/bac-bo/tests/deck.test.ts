import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { DECK_COUNT, buildDeck, drawCard } from '../engine/deck';
import type { Card, CardRank } from '../engine/types';

/**
 * O baralho, sozinho. Estes casos vieram de `tests/rules.test.ts` — a
 * suíte das regras do duelo de 21 —, e são os únicos de lá que
 * sobreviveram à remoção daquele jogo: o baralho ficou, a pontuação de
 * 21 não. Migraram sem alteração de asserção.
 */

/** Atalho para montar cartas nos testes (naipe irrelevante por padrão). */
function card(rank: CardRank, suit: Card['suit'] = 'spades'): Card {
  return { rank, suit };
}

describe('buildDeck / drawCard', () => {
  it('um baralho só na mesa', () => {
    expect(DECK_COUNT).toBe(1);
  });

  it('monta um baralho único de 52 cartas, com 4 Áses e 13 por naipe', () => {
    const deck = buildDeck(new SeededRng(1));
    expect(deck).toHaveLength(52);
    expect(deck.filter((c) => c.rank === 'A')).toHaveLength(4);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
    // Baralho honesto: 52 cartas distintas, nenhuma repetida.
    expect(new Set(deck.map((c) => `${c.rank}-${c.suit}`)).size).toBe(52);
  });

  it('aceita mais de um baralho quando pedido explicitamente', () => {
    expect(buildDeck(new SeededRng(1), 2)).toHaveLength(104);
  });

  it('o embaralhamento é determinístico por seed', () => {
    const a = buildDeck(new SeededRng(42));
    const b = buildDeck(new SeededRng(42));
    expect(a).toEqual(b);
    expect(buildDeck(new SeededRng(43))).not.toEqual(a);
  });

  it('drawCard consome o baralho pelo topo e reclama quando ele seca', () => {
    const deck = [card('A'), card('K')];
    expect(drawCard(deck)).toEqual(card('K'));
    expect(deck).toHaveLength(1);
    expect(drawCard(deck)).toEqual(card('A'));
    expect(() => drawCard(deck)).toThrow(RangeError);
  });
});
