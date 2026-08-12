import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { ringBotDecision, strengthVersus, positionBonus, marginFor } from '../engine/poker/ringBot';
import type { RingBotContext } from '../engine/poker/ringBot';
import type { Card } from '../engine/types';
import type { HoleCards } from '../engine/poker/types';

/**
 * F3e — os rivais recalibrados para a mesa de seis.
 *
 * O que se cobra aqui não é "o bot joga bem" — isso não é testável numa
 * asserção. É que ele joga o JOGO CERTO: mais apertado contra cinco do
 * que contra um, mais solto de posição do que fora dela, e sem blefar
 * contra a mesa cheia, que é o erro que transforma uma mesa de seis num
 * festival de all-in.
 */

const card = (s: string): Card => {
  const rank = s.slice(0, -1) as Card['rank'];
  const suit = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[s.slice(-1)] as Card['suit'];
  return { rank, suit };
};

const hole = (a: string, b: string): HoleCards => [card(a), card(b)];

function ctx(over: Partial<RingBotContext> = {}): RingBotContext {
  return {
    hole: hole('9h', '7d'),
    board: [],
    toCall: 20,
    pot: 30,
    stack: 1000,
    committed: 0,
    minRaiseTo: 40,
    maxRaiseTo: 1000,
    legalActions: ['fold', 'call', 'raise'],
    opponents: 5,
    actingAfter: 2,
    rng: new SeededRng(1),
    ...over,
  };
}

/** Com que frequência o bot toma cada decisão, em 400 sorteios. */
function rates(over: Partial<RingBotContext>): Record<string, number> {
  const conta: Record<string, number> = { fold: 0, check: 0, call: 0, raise: 0 };
  for (let seed = 0; seed < 400; seed += 1) {
    const d = ringBotDecision(ctx({ ...over, rng: new SeededRng(seed) }));
    conta[d.action] = (conta[d.action] ?? 0) + 1;
  }
  return conta;
}

describe('a força contra vários', () => {
  it('contra UM rival ela não muda — é a mesa de dois pela mesma cabeça', () => {
    for (const s of [0.1, 0.42, 0.7, 0.95]) {
      expect(strengthVersus(s, 1)).toBeCloseTo(s, 10);
    }
  });

  it('contra cinco, a MESMA mão vale muito menos', () => {
    expect(strengthVersus(0.7, 5)).toBeLessThan(0.7);
    expect(strengthVersus(0.7, 5)).toBeLessThan(strengthVersus(0.7, 3));
    expect(strengthVersus(0.7, 3)).toBeLessThan(strengthVersus(0.7, 1));
  });

  it('mas a MELHOR mão do baralho continua sendo a melhor', () => {
    /* Com o expoente cheio (n, não amortecido), um par de ases contra
       cinco cairia para perto de 0,3 e o bot largaria a melhor mão que
       existe. A leitura de força é uma escala de 0 a 1, não uma
       probabilidade — elevá-la à quinta potência confunde as duas. */
    expect(strengthVersus(0.98, 5)).toBeGreaterThan(0.85);
  });

  it('nunca sai da escala', () => {
    for (const n of [1, 2, 5, 9]) {
      expect(strengthVersus(0, n)).toBe(0);
      expect(strengthVersus(1, n)).toBe(1);
      expect(strengthVersus(0.5, n)).toBeGreaterThan(0);
      expect(strengthVersus(0.5, n)).toBeLessThan(1);
    }
  });
});

describe('a posição', () => {
  it('vale mais quanto MENOS gente fala depois', () => {
    expect(positionBonus(0, 5)).toBeGreaterThan(positionBonus(3, 5));
    expect(positionBonus(5, 5)).toBe(0);
  });

  it('é um empurrão, não um passe livre', () => {
    /* Posição nenhuma conserta uma mão que perde para tudo. Um bônus
       grande faria o bot do botão pagar all-in com nada. */
    expect(positionBonus(0, 5)).toBeLessThanOrEqual(0.06);
  });
});

describe('a margem sobre as odds', () => {
  it('no pré-flop de mesa cheia ela é POSITIVA', () => {
    /* No duelo ela é negativa: a entrada já está paga dos dois lados e
       desistir entrega metade de um pote que já é seu. Numa mesa de seis
       não há entrada paga — há dois blinds e quatro que não puseram
       nada, e pagar aumento com qualquer duas cartas é doação. */
    expect(marginFor([], 5)).toBeGreaterThan(0);
    expect(marginFor([], 1)).toBeLessThan(marginFor([], 5));
  });

  it('no river ela quase some: não vem mais carta', () => {
    const flop = [card('2h'), card('7d'), card('9c')];
    const river = [...flop, card('Js'), card('4s')];
    expect(marginFor(river, 5)).toBeLessThan(marginFor(flop, 5));
  });
});

describe('o lance', () => {
  it('contra CINCO ele é MAIS APERTADO do que contra um', () => {
    /* A afirmação é sobre o repertório, não sobre uma mão: varrendo um
       leque de mãos medianas com as mesmas odds, a mesa cheia produz
       mais desistências que o duelo. Cravar numa mão só faria o teste
       depender do valor exato da fórmula de Chen para aquele par. */
    const leque = [
      ['Kh', 'Jh'],
      ['Qs', '10s'],
      ['Ad', '7d'],
      ['9h', '9c'],
      ['Js', '10d'],
      ['8h', '8d'],
    ] as const;

    let umRival = 0;
    let cincoRivais = 0;
    for (const [a, b] of leque) {
      const mão = { hole: hole(a, b), toCall: 60, pot: 120, actingAfter: 1 };
      umRival += rates({ ...mão, opponents: 1 }).fold ?? 0;
      cincoRivais += rates({ ...mão, opponents: 5 }).fold ?? 0;
    }
    expect(cincoRivais).toBeGreaterThan(umRival);
  });

  it('de POSIÇÃO ele joga mais mãos do que fora dela', () => {
    const mão = { hole: hole('Jh', '10h'), toCall: 40, pot: 100, opponents: 4 };
    const cedo = rates({ ...mão, actingAfter: 4 });
    const botão = rates({ ...mão, actingAfter: 0 });
    expect(botão.fold ?? 0).toBeLessThanOrEqual(cedo.fold ?? 0);
  });

  it('com a mesa CHEIA ele não blefa', () => {
    /* Um blefe precisa que todo mundo desista, e a chance de cinco
       desistirem é pequena demais para pagar por ela. */
    const lixo = { hole: hole('7h', '2d'), toCall: 0, pot: 120, opponents: 5 };
    expect(rates(lixo).raise).toBe(0);
    expect(rates(lixo).check).toBe(400);
  });

  it('mas contra UM ele blefa de vez em quando', () => {
    const lixo = { hole: hole('7h', '2d'), toCall: 0, pot: 120, opponents: 1 };
    const r = rates(lixo);
    expect(r.raise).toBeGreaterThan(0);
    // Blefe é raro por definição: nunca a maioria dos lances.
    expect(r.raise).toBeLessThan(200);
  });

  it('com mão feita e forte ele aumenta na maioria das vezes', () => {
    const trinca = {
      hole: hole('9s', '9d'),
      board: [card('9h'), card('4c'), card('Kd')],
      toCall: 40,
      pot: 200,
      opponents: 2,
    };
    const r = rates(trinca);
    expect(r.raise).toBeGreaterThan(150);
    // E nunca larga: uma trinca não se joga fora por um lance de 40.
    expect(r.fold).toBe(0);
  });

  it('NUNCA desiste quando passar é de graça', () => {
    /* Jogar a mão fora podendo continuar sem pagar nada não é lance —
       é um bug que devolveria potes de graça à mesa. */
    for (const força of [
      ['7h', '2d'],
      ['As', 'Ad'],
    ] as const) {
      const r = rates({
        hole: hole(força[0], força[1]),
        toCall: 0,
        legalActions: ['check', 'raise'],
      });
      expect(r.fold).toBe(0);
    }
  });

  it('só escolhe lance que a mesa permite', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const legais: readonly PokerActionLike[] = ['fold', 'call'];
      const d = ringBotDecision(
        ctx({ legalActions: legais, rng: new SeededRng(seed), toCall: 200, pot: 60 }),
      );
      expect(legais).toContain(d.action);
    }
  });

  it('o aumento fica sempre dentro da faixa legal', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const d = ringBotDecision(
        ctx({
          hole: hole('As', 'Ad'),
          rng: new SeededRng(seed),
          minRaiseTo: 40,
          maxRaiseTo: 260,
          opponents: 2,
        }),
      );
      if (d.action !== 'raise') continue;
      expect(d.to).toBeGreaterThanOrEqual(40);
      expect(d.to).toBeLessThanOrEqual(260);
    }
  });
});

type PokerActionLike = 'fold' | 'check' | 'call' | 'raise';
