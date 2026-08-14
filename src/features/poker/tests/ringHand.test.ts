import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  IllegalMoveError,
  applyMove,
  beginHand,
  blindSeatsOf,
  firstToActOn,
  inPlay,
  legalFor,
  livesIn,
  minRaiseFor,
  nextSeat,
  raiseRange,
  toCallFor,
} from '../engine/poker/ringHand';
import type { RingHand } from '../engine/poker/ringHand';

/**
 * F3b/F3c — a máquina de mão indexada por cadeira.
 *
 * A cobrança é em duas frentes. A primeira é a REGRA: quem paga blind,
 * quem fala primeiro, quando a rua fecha, o que é legal. A segunda é a
 * CONSERVAÇÃO — nenhuma ficha nasce nem some no meio de uma mão —, e ela
 * é a que pega os erros que a primeira deixa passar.
 *
 * O duelo 1v1 desta casa NÃO passa por aqui e continua como está. O que
 * se testa com N=2 é que a mesma máquina do anel dá a mesa de dois certa,
 * com a exceção do heads-up (o botão paga a small e fala primeiro).
 */

const SEIS = [1000, 1000, 1000, 1000, 1000, 1000];

function open(stacks: readonly number[] = SEIS, button = 0, seed = 5): RingHand {
  return beginHand({
    stacks,
    button,
    smallBlind: 10,
    bigBlind: 20,
    rng: new SeededRng(seed),
  });
}

/** Fichas totais da mesa: stacks vivos + tudo o que está em jogo. */
function chips(hand: RingHand): number {
  return hand.seats.reduce((sum, s) => sum + s.stack, 0) + inPlay(hand);
}

describe('o anel', () => {
  it('numa mesa de 3 ou mais, o botão NÃO paga blind', () => {
    expect(blindSeatsOf(0, 6)).toEqual({ small: 1, big: 2 });
    expect(blindSeatsOf(5, 6)).toEqual({ small: 0, big: 1 });
  });

  it('no HEADS-UP o botão paga a small — a exceção da mesa de dois', () => {
    expect(blindSeatsOf(0, 2)).toEqual({ small: 0, big: 1 });
  });

  it('no anel, antes do flop fala quem está à esquerda do big', () => {
    // Botão 0 → small 1, big 2 → fala a 3 (o UTG).
    expect(firstToActOn('preflop', 0, 6)).toBe(3);
    // Do flop em diante fala o small, e o botão fala por último.
    expect(firstToActOn('flop', 0, 6)).toBe(1);
    expect(firstToActOn('river', 0, 6)).toBe(1);
  });

  it('no heads-up a ordem INVERTE: o botão fala primeiro antes do flop', () => {
    expect(firstToActOn('preflop', 0, 2)).toBe(0);
    expect(firstToActOn('flop', 0, 2)).toBe(1);
  });

  it('a cadeira seguinte dá a volta', () => {
    expect(nextSeat(5, 6)).toBe(0);
  });
});

describe('abrir a mão', () => {
  it('cobra os dois blinds e distribui duas cartas a cada um', () => {
    const h = open();
    expect(h.seats[1]?.committed).toBe(10);
    expect(h.seats[2]?.committed).toBe(20);
    expect(h.seats.every((s) => s.cards?.length === 2)).toBe(true);
    expect(h.maxCommitted).toBe(20);
  });

  it('as doze cartas são doze cartas diferentes', () => {
    const h = open();
    const todas = h.seats.flatMap((s) => s.cards ?? []).map((c) => `${c.rank}${c.suit}`);
    expect(new Set(todas).size).toBe(12);
  });

  it('a palavra vai para o UTG, não para o botão', () => {
    expect(open(SEIS, 0).toAct).toBe(3);
    expect(open(SEIS, 3).toAct).toBe(0);
  });

  it('quem senta sem ficha fica FORA da mão, mas não perde a cadeira', () => {
    const h = open([1000, 1000, 1000, 0, 1000, 1000]);
    expect(h.seats[3]?.cards).toBeNull();
    expect(h.seats[3]?.folded).toBe(true);
    expect(h.seats).toHaveLength(6);
    expect(livesIn(h)).toHaveLength(5);
  });

  it('a abertura mínima do pré-flop é o DOBRO do big blind', () => {
    expect(minRaiseFor(open())).toBe(40);
  });
});

describe('a rua', () => {
  it('todo mundo paga e o BIG BLIND ainda tem a palavra', () => {
    /* Postar blind não é falar. É por isso que o big ganha a opção de
       aumentar mesmo quando não falta nada a pagar — e é o caso que uma
       máquina ingênua fecha cedo demais. */
    let h = open();
    for (const cadeira of [3, 4, 5, 0]) {
      expect(h.toAct).toBe(cadeira);
      h = applyMove(h, 'call');
    }
    // O small completa.
    expect(h.toAct).toBe(1);
    h = applyMove(h, 'call');

    expect(h.toAct).toBe(2); // o big
    expect(toCallFor(h)).toBe(0);
    expect(legalFor(h)).toContain('check');
    expect(legalFor(h)).toContain('raise');
  });

  it('o check do big fecha o pré-flop e abre o FLOP', () => {
    let h = open();
    for (let i = 0; i < 5; i += 1) h = applyMove(h, 'call');
    h = applyMove(h, 'check');

    expect(h.street).toBe('flop');
    expect(h.board).toHaveLength(3);
    // Recolhido: seis pagando 20.
    expect(h.pot).toBe(120);
    expect(h.seats.every((s) => s.committed === 0)).toBe(true);
    // Do flop em diante fala o small; o botão fala por último.
    expect(h.toAct).toBe(1);
  });

  it('a mesa passa a rua inteira e chega ao turn', () => {
    let h = open();
    for (let i = 0; i < 5; i += 1) h = applyMove(h, 'call');
    h = applyMove(h, 'check');
    for (let i = 0; i < 6; i += 1) h = applyMove(h, 'check');

    expect(h.street).toBe('turn');
    expect(h.board).toHaveLength(4);
  });

  it('um aumento REABRE a palavra para quem já falou', () => {
    let h = open();
    h = applyMove(h, 'call'); // 3
    h = applyMove(h, 'call'); // 4
    h = applyMove(h, 'raise', 60); // 5 aumenta

    /* A palavra volta para o 0 e dá a volta inteira, passando DE NOVO
       por 3 e 4 — que já tinham falado e agora devem 40 a mais. */
    const ordem: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      expect(h.toAct).not.toBeNull();
      ordem.push(h.toAct ?? -1);
      h = applyMove(h, 'call');
    }
    expect(ordem).toEqual([0, 1, 2, 3, 4]);
    // Fechada a volta, a rua fecha: a 5 já pagou o próprio aumento.
    expect(h.street).toBe('flop');
  });

  it('o aumento empurra o mínimo do próximo', () => {
    let h = open();
    h = applyMove(h, 'raise', 60); // aumento de 40 sobre 20
    expect(minRaiseFor(h)).toBe(100);
    h = applyMove(h, 'raise', 140); // aumento de 80
    expect(minRaiseFor(h)).toBe(220);
  });
});

describe('quando a mão acaba', () => {
  it('todo mundo corre e o último leva sem ver carta nenhuma', () => {
    let h = open();
    for (let i = 0; i < 5; i += 1) h = applyMove(h, 'fold');

    expect(h.done).toBe(true);
    expect(h.toAct).toBeNull();
    expect(livesIn(h)).toHaveLength(1);
    expect(livesIn(h)[0]?.id).toBe(2); // o big blind
    // A mesa não abriu carta: não havia o que decidir.
    expect(h.board).toHaveLength(0);
    expect(h.pot).toBe(30);
  });

  it('a mão vai até o showdown quando dois chegam ao fim', () => {
    let h = open();
    for (let i = 0; i < 4; i += 1) h = applyMove(h, 'fold');
    h = applyMove(h, 'call'); // small completa
    h = applyMove(h, 'check'); // big fecha

    // Três ruas de check-check.
    for (let rua = 0; rua < 3; rua += 1) {
      h = applyMove(h, 'check');
      h = applyMove(h, 'check');
    }

    expect(h.street).toBe('showdown');
    expect(h.done).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(livesIn(h)).toHaveLength(2);
  });

  it('com todo mundo all-in a mesa CORRE O BOARD sem pedir palavra', () => {
    /* Não há mais decisão a tomar: pedir uma palavra que ninguém pode dar
       travaria a mesa. */
    let h = open([100, 100, 100, 100, 100, 100]);
    while (h.toAct !== null) {
      h = applyMove(h, legalFor(h).includes('raise') ? 'raise' : 'call', raiseRange(h).max);
    }

    expect(h.done).toBe(true);
    expect(h.street).toBe('showdown');
    expect(h.board).toHaveLength(5);
  });
});

describe('a conservação — nenhuma ficha nasce nem some', () => {
  it('em toda a mão, do primeiro lance ao showdown', () => {
    const total = SEIS.reduce((a, b) => a + b, 0);
    let h = open();
    expect(chips(h)).toBe(total);

    let passos = 0;
    while (h.toAct !== null && passos < 300) {
      const acoes = legalFor(h);
      // Alterna entre pagar e aumentar, para varrer os dois caminhos.
      const acao = passos % 3 === 0 && acoes.includes('raise') ? 'raise' : (acoes[1] ?? 'fold');
      h = applyMove(h, acao);
      expect(chips(h)).toBe(total);
      passos += 1;
    }
    expect(h.done).toBe(true);
    expect(chips(h)).toBe(total);
  });

  it('com stacks desiguais e all-ins de tamanhos diferentes', () => {
    const stacks = [1000, 37, 250, 4, 900, 60];
    const total = stacks.reduce((a, b) => a + b, 0);
    let h = open(stacks, 2);

    let passos = 0;
    while (h.toAct !== null && passos < 300) {
      const acoes = legalFor(h);
      h = applyMove(h, acoes.includes('raise') ? 'raise' : (acoes[1] ?? 'fold'));
      expect(chips(h)).toBe(total);
      passos += 1;
    }
    expect(h.done).toBe(true);
    expect(chips(h)).toBe(total);
  });

  it('a mão SEMPRE termina — nenhuma mesa fica sem quem fale', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      let h = open(SEIS, seed % 6, seed);
      let passos = 0;
      while (h.toAct !== null && passos < 200) {
        const acoes = legalFor(h);
        expect(acoes.length).toBeGreaterThan(0);
        h = applyMove(h, acoes[(seed + passos) % acoes.length] ?? 'fold');
        passos += 1;
      }
      expect(h.done).toBe(true);
    }
  });
});

describe('o lance ilegal', () => {
  it('LEVANTA em vez de ser corrigido em silêncio', () => {
    /* Uma mesa que conserta o lance de quem pediu outra coisa mente
       sobre o que aconteceu — e no dia do servidor essa correção seria a
       diferença entre o que o cliente acha que fez e o que ficou gravado. */
    const h = open();
    expect(() => applyMove(h, 'check')).toThrow(IllegalMoveError);
  });

  it('um aumento fora da faixa é recusado', () => {
    const h = open();
    expect(() => applyMove(h, 'raise', 30)).toThrow(IllegalMoveError);
    expect(() => applyMove(h, 'raise', 99_999)).toThrow(IllegalMoveError);
  });

  it('a mão terminada não aceita mais lance', () => {
    let h = open();
    for (let i = 0; i < 5; i += 1) h = applyMove(h, 'fold');
    expect(() => applyMove(h, 'call')).toThrow(IllegalMoveError);
  });
});

describe('o all-in curto', () => {
  it('não reabre a palavra de quem já falou', () => {
    /* Cadeira 3 abre para 60; a 4 tem 68 e vai all-in — 8 acima, menos
       que o aumento completo de 40. A 3 pode PAGAR, não aumentar. */
    let h = open([1000, 1000, 1000, 1000, 68, 1000]);
    h = applyMove(h, 'raise', 60); // 3
    expect(h.toAct).toBe(4);
    expect(raiseRange(h).allInOnly).toBe(true);
    h = applyMove(h, 'raise', 68); // 4, all-in curto

    // Dá a volta até voltar à 3.
    while (h.toAct !== 3 && h.toAct !== null) h = applyMove(h, 'fold');
    expect(h.toAct).toBe(3);
    expect(legalFor(h)).toContain('call');
    expect(legalFor(h)).not.toContain('raise');
  });
});

describe('a mesa de dois pela mesma máquina', () => {
  it('o botão paga a small e fala primeiro antes do flop', () => {
    const h = beginHand({
      stacks: [500, 500],
      button: 0,
      smallBlind: 10,
      bigBlind: 20,
      rng: new SeededRng(3),
    });
    expect(h.seats[0]?.committed).toBe(10);
    expect(h.seats[1]?.committed).toBe(20);
    expect(h.toAct).toBe(0);
  });

  it('e fala por último do flop em diante', () => {
    let h = beginHand({
      stacks: [500, 500],
      button: 0,
      smallBlind: 10,
      bigBlind: 20,
      rng: new SeededRng(3),
    });
    h = applyMove(h, 'call');
    h = applyMove(h, 'check');
    expect(h.street).toBe('flop');
    expect(h.toAct).toBe(1);
  });
});

describe('a mesa nunca pede um lance que ela mesma recusa', () => {
  it('o bot com stack curto vai ALL-IN em vez de pedir o mínimo impossível', () => {
    /* REGRESSÃO. A engine passava ao bot o mínimo TEÓRICO da mesa
       (`minRaiseFor`) em vez do mínimo POSSÍVEL para aquele stack. Com
       954 fichas e um mínimo de 1114, o bot grampeava para 1114 e pedia
       um aumento que a mesa recusa — `applyMove` levantava e a mesa
       travava no meio da rua. Ver `CashTableEngine.botMove`. */
    for (let seed = 0; seed < 60; seed += 1) {
      let h = beginHand({
        // Stacks desiguais de propósito: é deles que nasce o all-in curto.
        stacks: [1000, 954, 120, 3000, 47, 600],
        button: seed % 6,
        smallBlind: 10,
        bigBlind: 20,
        rng: new SeededRng(seed),
      });

      let passos = 0;
      while (h.toAct !== null && passos < 300) {
        const faixa = raiseRange(h);
        if (faixa.can) {
          // O mínimo da faixa é SEMPRE jogável — é essa a promessa.
          expect(faixa.min).toBeLessThanOrEqual(faixa.max);
          expect(() => applyMove(h, 'raise', faixa.min)).not.toThrow();
          h = applyMove(h, 'raise', faixa.min);
        } else {
          const acoes = legalFor(h);
          h = applyMove(h, acoes[1] ?? 'fold');
        }
        passos += 1;
      }
      expect(h.done).toBe(true);
    }
  });
});
