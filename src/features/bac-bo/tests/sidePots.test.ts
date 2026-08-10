import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { readHand } from '../engine/poker/handRank';
import type { HandRank } from '../engine/poker/handRank';
import { applyMove, beginHand, legalFor, raiseRange } from '../engine/poker/ringHand';
import type { RingHand, SeatId } from '../engine/poker/ringHand';
import { awardPots, settleHand, splitPots } from '../engine/poker/sidePots';
import type { Card } from '../engine/types';

/**
 * F3d — os potes laterais.
 *
 * A regra desta suíte é uma só, e ela vale para todos os testes: NENHUMA
 * FICHA NASCE NEM SOME. Tudo o que foi posto no meio sai do meio, e sai
 * para alguém que tinha direito a ela. Um bug aqui não é um bug de
 * layout — é dinheiro indo para a pessoa errada, ou sumindo.
 */

const card = (s: string): Card => {
  const rank = s.slice(0, -1) as Card['rank'];
  const suit = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[s.slice(-1)] as Card['suit'];
  return { rank, suit };
};

const hand = (a: string, b: string, board: string[]): HandRank =>
  readHand([card(a), card(b)], board.map(card));

describe('partir o pote em camadas', () => {
  it('sem all-in nenhum, é UM pote só', () => {
    /* Quatro ruas de aposta não fazem quatro potes: a mesa anunciaria
       "principal e três laterais" onde há um pote só. */
    const potes = splitPots({ putIn: [200, 200, 200, 0, 0, 0], folded: [3, 4, 5] });
    expect(potes).toHaveLength(1);
    expect(potes[0]?.amount).toBe(600);
    expect(potes[0]?.eligible).toEqual([0, 1, 2]);
  });

  it('o exemplo da mesa de 6, camada por camada', () => {
    // A=100 B=300 C=300 D=500 E=500 F=50 (correu)
    const potes = splitPots({
      putIn: [100, 300, 300, 500, 500, 50],
      folded: [5],
    });

    /* Cru, o algoritmo produz quatro níveis: 300 (0–50), 250 (50–100),
       800 (100–300) e 400 (300–500). Os dois primeiros têm a MESMA lista
       de elegíveis — a saída da F na camada de baixo não muda quem pode
       ganhar — e por isso viram um pote só de 550. É o que uma mesa de
       verdade anuncia: "principal e dois laterais", não quatro potes. */
    expect(potes.map((p) => p.amount)).toEqual([550, 800, 400]);
    expect(potes[0]?.eligible).toEqual([0, 1, 2, 3, 4]);
    expect(potes[1]?.eligible).toEqual([1, 2, 3, 4]); // a A não cobriu
    expect(potes[2]?.eligible).toEqual([3, 4]);
    // Nada some na fusão: o total continua sendo tudo o que foi posto.
    expect(potes.reduce((a, p) => a + p.amount, 0)).toBe(1750);
    expect(potes.reduce((a, p) => a + p.amount, 0)).toBe(
      [100, 300, 300, 500, 500, 50].reduce((a, b) => a + b, 0),
    );
  });

  it('quem CORREU contribui, mas não é elegível', () => {
    /* As fichas dele ficaram no meio e continuam valendo. O que ele
       perdeu foi o direito de levá-las. */
    const potes = splitPots({ putIn: [100, 100, 100], folded: [2] });
    expect(potes[0]?.amount).toBe(300);
    expect(potes[0]?.eligible).toEqual([0, 1]);
    expect(potes[0]?.contributors).toEqual([0, 1, 2]);
  });

  it('a aposta NÃO PAGA volta sozinha a quem a fez', () => {
    /* Apostou 500, o único rival cobriu 300 e nada mais: as 200 que
       ninguém cobriu não são pote, são dele. Cai da própria conta. */
    const potes = splitPots({ putIn: [500, 300], folded: [] });
    expect(potes[1]?.amount).toBe(200);
    expect(potes[1]?.eligible).toEqual([0]);
  });

  it('cadeira que não pôs nada não entra em camada nenhuma', () => {
    const potes = splitPots({ putIn: [100, 100, 0, 0], folded: [2, 3] });
    expect(potes[0]?.contributors).toEqual([0, 1]);
  });
});

describe('repartir', () => {
  const BOARD = ['2h', '7d', '9c', 'Js', '4s'];

  it('cada camada é decidida à PARTE', () => {
    /* Um jogador pode ganhar o principal e perder o lateral, e isso é o
       normal numa mesa com all-ins de tamanhos diferentes. */
    const potes = splitPots({ putIn: [100, 500, 500], folded: [] });
    const ranks = new Map<SeatId, HandRank>([
      [0, hand('As', 'Ad', BOARD)], // trinca de ases: a melhor
      [1, hand('Kh', 'Kd', BOARD)],
      [2, hand('3h', '3d', BOARD)],
    ]);

    const pago = awardPots({ potes, ranks, button: 0, total: 3 });
    // Principal (300): a 0, com a melhor mão.
    // Lateral (800): a 0 não cobriu — fica entre 1 e 2, e a 1 ganha.
    expect(pago[0]).toBe(300);
    expect(pago[1]).toBe(800);
    expect(pago[2]).toBeUndefined();
  });

  it('empate parte a camada em partes iguais', () => {
    const potes = splitPots({ putIn: [200, 200], folded: [] });
    const ranks = new Map<SeatId, HandRank>([
      [0, hand('As', 'Kh', BOARD)],
      [1, hand('Ad', 'Kc', BOARD)],
    ]);
    const pago = awardPots({ potes, ranks, button: 0, total: 2 });
    expect(pago[0]).toBe(200);
    expect(pago[1]).toBe(200);
  });

  it('A FICHA ÍMPAR vai ao primeiro elegível à ESQUERDA do botão', () => {
    /* 75 dividido por dois dá 37,5, e meia ficha não existe. A regra é
       arbitrária de propósito: o que importa é ser a MESMA sempre. */
    const potes = splitPots({ putIn: [25, 25, 25], folded: [2] });
    expect(potes[0]?.amount).toBe(75);
    const ranks = new Map<SeatId, HandRank>([
      [0, hand('As', 'Kh', BOARD)],
      [1, hand('Ad', 'Kc', BOARD)],
    ]);

    // Botão na 2 → à esquerda vem a 0, que leva a sobra.
    expect(awardPots({ potes, ranks, button: 2, total: 3 })[0]).toBe(38);
    expect(awardPots({ potes, ranks, button: 2, total: 3 })[1]).toBe(37);
    // Botão na 0 → à esquerda vem a 1.
    expect(awardPots({ potes, ranks, button: 0, total: 3 })[1]).toBe(38);
    expect(awardPots({ potes, ranks, button: 0, total: 3 })[0]).toBe(37);
  });

  it('a sobra nunca some: o repartido é sempre o pote inteiro', () => {
    for (let amount = 1; amount <= 40; amount += 1) {
      const potes = [{ amount, eligible: [0, 1, 2], contributors: [0, 1, 2] }];
      const ranks = new Map<SeatId, HandRank>([
        [0, hand('As', 'Kh', BOARD)],
        [1, hand('Ad', 'Kc', BOARD)],
        [2, hand('Ac', 'Kd', BOARD)],
      ]);
      const pago = awardPots({ potes, ranks, button: 1, total: 3 });
      const soma = Object.values(pago).reduce((a, b) => a + b, 0);
      expect(soma).toBe(amount);
    }
  });
});

describe('fechar a mão', () => {
  function play(stacks: number[], button: number, seed: number): RingHand {
    let h = beginHand({ stacks, button, smallBlind: 10, bigBlind: 20, rng: new SeededRng(seed) });
    let passos = 0;
    while (h.toAct !== null && passos < 300) {
      const acoes = legalFor(h);
      const acao = acoes.includes('raise') ? 'raise' : (acoes[1] ?? 'fold');
      h = applyMove(h, acao, acao === 'raise' ? raiseRange(h).max : undefined);
      passos += 1;
    }
    return h;
  }

  it('as fichas da mesa são as mesmas antes e depois', () => {
    /* O teste que vale por todos os outros: se este passa em cinquenta
       mesas diferentes, o algoritmo não cria nem some com nada. */
    for (let seed = 0; seed < 50; seed += 1) {
      const stacks = [1000, 37, 250, 4, 900, 60].map((v, i) => v + ((seed * (i + 3)) % 120));
      const total = stacks.reduce((a, b) => a + b, 0);
      const h = play(stacks, seed % 6, seed);
      const fim = settleHand(h);
      expect(fim.stacks.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('quem correu nunca recebe nada', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const h = play([1000, 600, 250, 90, 400, 60], seed % 6, seed + 100);
      const fim = settleHand(h);
      for (const seat of h.seats) {
        if (!seat.folded) continue;
        expect(fim.payouts[seat.id] ?? 0).toBe(0);
      }
    }
  });

  it('todo mundo corre e o último leva o pote sem MOSTRAR a mão', () => {
    /* Um showdown de um jogador só não é showdown, e fingir que é
       entregaria a mão dele de graça. */
    let h = beginHand({
      stacks: [1000, 1000, 1000, 1000, 1000, 1000],
      button: 0,
      smallBlind: 10,
      bigBlind: 20,
      rng: new SeededRng(9),
    });
    for (let i = 0; i < 5; i += 1) h = applyMove(h, 'fold');

    const fim = settleHand(h);
    expect(fim.showdown).toBe(false);
    expect(fim.ranks.size).toBe(0);
    expect(fim.winners).toEqual([2]);
    expect(fim.payouts[2]).toBe(30);
    // Ele sai com o que tinha mais o pote: 980 + 30.
    expect(fim.stacks[2]).toBe(1010);
  });

  it('o all-in curto ganha só o que cobriu', () => {
    /* A cadeira 3 tem 4 fichas. Se ela ganhar, leva a camada dela — e
       nem uma ficha das camadas que não pôde cobrir. */
    for (let seed = 0; seed < 30; seed += 1) {
      const h = play([1000, 1000, 1000, 4, 1000, 1000], 0, seed + 500);
      const fim = settleHand(h);
      const curto = fim.payouts[3] ?? 0;
      // No máximo 4 de cada um dos seis: a camada dela é 24.
      expect(curto).toBeLessThanOrEqual(24);
    }
  });
});
