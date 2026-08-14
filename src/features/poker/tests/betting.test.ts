import { describe, expect, it } from 'vitest';

import {
  legalActionsFor,
  minRaiseTo,
  nextRaiseSize,
  postBlinds,
  raiseRangeFor,
  reopensBetting,
} from '../engine/poker/betting';

/**
 * F3a — a economia de uma rua no no-limit de anel.
 *
 * O duelo 1v1 desta casa NÃO passa por aqui: ele tem entrada igual, sem
 * blind, e aumento mínimo de um crédito, e continua exatamente como
 * está. O que se cobra aqui é a mesa de 6.
 */

describe('cobrar os blinds', () => {
  it('o small e o big saem dos stacks de quem os deve', () => {
    const r = postBlinds({
      stacks: [1000, 1000, 1000, 1000, 1000, 1000],
      small: 1,
      big: 2,
      smallBlind: 10,
      bigBlind: 20,
    });

    expect(r.committed).toEqual([0, 10, 20, 0, 0, 0]);
    expect(r.stacks).toEqual([1000, 990, 980, 1000, 1000, 1000]);
    expect(r.maxCommitted).toBe(20);
  });

  it('ninguém mais paga nada para entrar na mão', () => {
    const r = postBlinds({
      stacks: Array(6).fill(1000),
      small: 4,
      big: 5,
      smallBlind: 10,
      bigBlind: 20,
    });
    expect(r.posts).toHaveLength(2);
    expect(r.committed.filter((c) => c > 0)).toHaveLength(2);
  });

  it('quem não cobre o blind entra ALL-IN pelo que tem, nunca devendo', () => {
    const r = postBlinds({
      stacks: [1000, 6, 12, 1000, 1000, 1000],
      small: 1,
      big: 2,
      smallBlind: 10,
      bigBlind: 20,
    });

    expect(r.committed[1]).toBe(6);
    expect(r.committed[2]).toBe(12);
    expect(r.stacks[1]).toBe(0);
    expect(r.stacks[2]).toBe(0);
    expect(r.posts.every((p) => p.allIn)).toBe(true);
    // A mesa registra o que era DEVIDO, para saber que ficou curto.
    expect(r.posts.map((p) => p.due)).toEqual([10, 20]);
  });

  it('um big blind CURTO não baixa o mínimo da mesa', () => {
    /* O blind é aposta forçada, não aumento voluntário. Um big que só
       conseguiu pagar 12 de 20 não faz de 12 a nova referência: quem
       quiser abrir continua tendo de ir a 40. */
    const r = postBlinds({
      stacks: [1000, 1000, 12, 1000, 1000, 1000],
      small: 1,
      big: 2,
      smallBlind: 10,
      bigBlind: 20,
    });

    expect(r.maxCommitted).toBe(12);
    expect(r.lastRaiseSize).toBe(20);
    expect(minRaiseTo(r.maxCommitted, r.lastRaiseSize)).toBe(32);
  });

  it('a conta fecha: nada é criado nem some ao cobrar', () => {
    const antes = [1000, 300, 45, 1000, 8, 1000];
    const r = postBlinds({
      stacks: antes,
      small: 4,
      big: 5,
      smallBlind: 10,
      bigBlind: 20,
    });
    const depois = r.stacks.reduce((a, b) => a + b, 0) + r.committed.reduce((a, b) => a + b, 0);
    expect(depois).toBe(antes.reduce((a, b) => a + b, 0));
  });
});

describe('o aumento mínimo', () => {
  it('a abertura do pré-flop é o DOBRO do big blind', () => {
    /* Porque o big blind já é uma aposta: a altura é 20, o último
       aumento vale 20, e o mínimo é altura + aumento. */
    expect(minRaiseTo(20, 20)).toBe(40);
  });

  it('cada aumento completo empurra o mínimo seguinte', () => {
    // Abriu para 60 (aumento de 40 sobre 20) → o próximo mínimo é 100.
    expect(nextRaiseSize(60, 20, 20)).toBe(40);
    expect(minRaiseTo(60, 40)).toBe(100);
  });

  it('a faixa vai do mínimo legal até tudo o que se tem', () => {
    const r = raiseRangeFor({
      stack: 1000,
      committed: 20,
      maxCommitted: 60,
      lastRaiseSize: 40,
      rivalHasChips: true,
    });
    expect(r).toEqual({ can: true, min: 100, max: 1020, allInOnly: false });
  });

  it('sem ninguém para cobrir, não há o que aumentar', () => {
    const r = raiseRangeFor({
      stack: 1000,
      committed: 0,
      maxCommitted: 20,
      lastRaiseSize: 20,
      rivalHasChips: false,
    });
    expect(r.can).toBe(false);
    expect(legalActionsFor({ ...arg(), rivalHasChips: false })).not.toContain('raise');
  });

  it('quem não cobre nem o pagamento não aumenta', () => {
    const r = raiseRangeFor({
      stack: 15,
      committed: 0,
      maxCommitted: 60,
      lastRaiseSize: 40,
      rivalHasChips: true,
    });
    expect(r.can).toBe(false);
  });
});

describe('o stack curto', () => {
  it('pode ir ALL-IN por menos que o mínimo — a mesa aceita', () => {
    /* A alternativa seria proibir alguém de aumentar por não ter fichas
       para o lance que queria fazer. Nenhuma sala do mundo faz isso. */
    const r = raiseRangeFor({
      stack: 37,
      committed: 0,
      maxCommitted: 20,
      lastRaiseSize: 20,
      rivalHasChips: true,
    });
    expect(r.can).toBe(true);
    expect(r.allInOnly).toBe(true);
    // O seletor nunca oferece uma faixa invertida.
    expect(r.min).toBe(37);
    expect(r.max).toBe(37);
    expect(r.min).toBeLessThanOrEqual(r.max);
  });

  it('mas o all-in curto NÃO reabre a rodada', () => {
    /* Senão um jogador curto viraria ferramenta para reabrir a palavra
       de graça a favor de quem vem depois dele. */
    expect(reopensBetting(23, 20, 20)).toBe(false);
    expect(reopensBetting(40, 20, 20)).toBe(true);
    expect(reopensBetting(41, 20, 20)).toBe(true);
  });

  it('e NÃO encolhe o mínimo da mesa para os outros', () => {
    // All-in 3 acima de uma altura de 20, com aumento vigente de 20.
    expect(nextRaiseSize(23, 20, 20)).toBe(20);
    expect(minRaiseTo(23, nextRaiseSize(23, 20, 20))).toBe(43);
  });

  it('quem já falou e levou só o all-in curto PAGA, não aumenta', () => {
    const acoes = legalActionsFor({
      stack: 900,
      committed: 20,
      maxCommitted: 23,
      lastRaiseSize: 20,
      rivalHasChips: true,
      canReraise: false,
    });
    expect(acoes).toContain('call');
    expect(acoes).toContain('fold');
    expect(acoes).not.toContain('raise');
  });

  it('mas quem ainda não falou aumenta normalmente', () => {
    const acoes = legalActionsFor({
      stack: 900,
      committed: 0,
      maxCommitted: 23,
      lastRaiseSize: 20,
      rivalHasChips: true,
    });
    expect(acoes).toContain('raise');
  });
});

describe('as ações legais', () => {
  it('sem nada a pagar: correr, passar e apostar', () => {
    expect(
      legalActionsFor({
        stack: 500,
        committed: 0,
        maxCommitted: 0,
        lastRaiseSize: 20,
        rivalHasChips: true,
      }),
    ).toEqual(['fold', 'check', 'raise']);
  });

  it('com aposta na frente: correr, pagar e aumentar', () => {
    expect(legalActionsFor(arg())).toEqual(['fold', 'call', 'raise']);
  });

  it('quem já está sem fichas não tem ação nenhuma', () => {
    expect(legalActionsFor({ ...arg(), stack: 0 })).toEqual([]);
  });

  it('quem paga com a última ficha pode pagar, mas não aumentar', () => {
    const acoes = legalActionsFor({
      stack: 20,
      committed: 0,
      maxCommitted: 20,
      lastRaiseSize: 20,
      rivalHasChips: true,
    });
    expect(acoes).toEqual(['fold', 'call']);
  });
});

function arg() {
  return {
    stack: 500,
    committed: 0,
    maxCommitted: 20,
    lastRaiseSize: 20,
    rivalHasChips: true,
  };
}
