import type { Rng } from '@/shared/lib/random';
import { randomInt } from '@/shared/lib/random';

import type { Card } from './types';
import { cardRankSchema, cardSuitSchema } from './types';

/**
 * O BARALHO FRANCÊS de 52 cartas — montar e tirar do topo, e nada além
 * disso.
 *
 * Este módulo nasceu de `engine/rules.ts`, que era as regras do duelo de
 * 21 e trazia o baralho junto. Quando o 21 saiu do projeto, foi este o
 * pedaço que ficou de pé: o poker precisa de um maço embaralhado e de
 * uma carta por vez, e não precisa de mais nada do que havia lá.
 *
 * O que NÃO mora aqui, de propósito: **quanto vale uma carta**. Não
 * existe valor universal — no 21 o Ás vale 11, no poker vale 14 (ou 1,
 * na roda A-2-3-4-5). A pontuação é da regra do jogo, não do baralho, e
 * quem responde por ela no poker é `POKER_RANK_VALUE` em
 * `poker/handRank.ts`. Um `rankValue` genérico aqui seria um convite a
 * pontuar Hold'em com Ás de 11.
 *
 * EXCEÇÃO DE ESTILO herdada e mantida: `drawCard` **consome** o array
 * recebido. O baralho pertence à engine e circula por referência única,
 * como um maço físico que só existe sobre a mesa.
 */

/** Um baralho só na mesa (52 cartas). */
export const DECK_COUNT = 1;

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
