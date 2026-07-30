import { describe, expect, it } from 'vitest';

import type { Card, CardRank, CardSuit } from '../engine/types';
import {
  awardTableWins,
  bestTableHands,
  judgeTableRound,
  tableStandingOf,
  tableStandingsOrder,
} from '../tournament/tableRules';
import type { TableStanding } from '../tournament/tableRules';
import { TABLE_TARGET_WINS } from '../tournament/types';

/**
 * Regras da MESA ÚNICA. O que está em jogo aqui:
 * - a melhor mão da mesa leva a rodada (estouro perde, natural manda);
 * - empate dá 1 ponto a TODOS os empatados…
 * - …MENOS quando o ponto coroaria dois de uma vez: aí a mesa joga uma
 *   rodada de desempate só entre eles, e o resto assiste.
 */

const card = (rank: CardRank, suit: CardSuit = 'spades'): Card => ({ rank, suit });

/** Situação de showdown direta, sem precisar montar mão. */
const standing = (
  playerId: string,
  total: number,
  extra: Partial<TableStanding> = {},
): TableStanding => ({ playerId, total, bust: total > 21, natural: false, ...extra });

describe('bestTableHands', () => {
  it('a maior mão viva leva a rodada', () => {
    expect(bestTableHands([standing('a', 20), standing('b', 18), standing('c', 21)])).toEqual(['c']);
  });

  it('estouro perde para qualquer mão viva', () => {
    expect(bestTableHands([standing('a', 24), standing('b', 15)])).toEqual(['b']);
  });

  it('todos estourados: NINGUÉM tem a melhor mão (rodada morta)', () => {
    expect(bestTableHands([standing('a', 24), standing('b', 26), standing('c', 22)])).toEqual([]);
  });

  it('totais iguais empatam — e o empate devolve todos os donos', () => {
    expect(bestTableHands([standing('a', 20), standing('b', 20), standing('c', 19)])).toEqual([
      'a',
      'b',
    ]);
  });

  it('o blackjack natural ganha de um 21 montado em três cartas', () => {
    const winners = bestTableHands([
      standing('a', 21, { natural: true }),
      standing('b', 21),
      standing('c', 20),
    ]);
    expect(winners).toEqual(['a']);
  });

  it('dois naturais empatam entre si e rebaixam o 21 comum', () => {
    const winners = bestTableHands([
      standing('a', 21, { natural: true }),
      standing('b', 21, { natural: true }),
      standing('c', 21),
    ]);
    expect(winners).toEqual(['a', 'b']);
  });
});

describe('tableStandingOf', () => {
  it('lê a mão como situação de showdown (total, estouro e natural)', () => {
    expect(tableStandingOf('a', [card('A'), card('K')])).toEqual({
      playerId: 'a',
      total: 21,
      bust: false,
      natural: true,
    });
    expect(tableStandingOf('b', [card('K'), card('9'), card('2')])).toEqual({
      playerId: 'b',
      total: 21,
      bust: false,
      natural: false, // 21 em três cartas NÃO é natural
    });
    expect(tableStandingOf('c', [card('K'), card('9'), card('5')])).toMatchObject({
      total: 24,
      bust: true,
    });
  });
});

describe('judgeTableRound', () => {
  it('vencedor único longe do alvo: ponto e a série segue', () => {
    const verdict = judgeTableRound([standing('a', 20), standing('b', 18)], { a: 0, b: 1 });
    expect(verdict).toEqual({ kind: 'points', winners: ['a'], championId: null });
  });

  it('o ponto que fecha a série coroa o campeão', () => {
    const verdict = judgeTableRound([standing('a', 20), standing('b', 18)], { a: 2, b: 1 });
    expect(verdict).toEqual({ kind: 'points', winners: ['a'], championId: 'a' });
  });

  it('empate comum: TODOS os empatados pontuam', () => {
    const verdict = judgeTableRound(
      [standing('a', 20), standing('b', 20), standing('c', 17)],
      { a: 0, b: 1, c: 0 },
    );
    expect(verdict).toEqual({ kind: 'points', winners: ['a', 'b'], championId: null });
  });

  it('NINGUÉM é campeão por empatar a mão que decide: vai a desempate', () => {
    // O líder a um ponto do título EMPATOU a mão. A spec da casa põe a
    // rodada que decide fora da regra do empate — o bolo se ganha
    // vencendo, então a mesa repete a mão entre os empatados.
    const verdict = judgeTableRound([standing('a', 20), standing('b', 20)], { a: 2, b: 0 });
    expect(verdict).toEqual({ kind: 'tiebreak', contenders: ['a', 'b'] });
  });

  it('empate que coroaria DOIS: ninguém pontua, a mesa vai ao desempate', () => {
    const verdict = judgeTableRound(
      [standing('a', 20), standing('b', 20), standing('c', 19)],
      { a: 2, b: 2, c: 0 },
    );
    expect(verdict).toEqual({ kind: 'tiebreak', contenders: ['a', 'b'] });
  });

  it('no desempate entram TODOS os empatados da mão, não só os líderes', () => {
    // Os três dividiram a melhor mão: é entre os três que ela se repete.
    // Quem está longe do título ainda pode levar o ponto (e só o ponto).
    const verdict = judgeTableRound(
      [standing('a', 20), standing('b', 20), standing('c', 20)],
      { a: 2, b: 2, c: 1 },
    );
    expect(verdict).toEqual({ kind: 'tiebreak', contenders: ['a', 'b', 'c'] });
  });

  it('empate LONGE da decisão continua pontuando todo mundo', () => {
    // Nenhum dos empatados fecha a série: aqui a regra do empate vale
    // inteira (é o caso comum das primeiras rodadas).
    const verdict = judgeTableRound(
      [standing('a', 20), standing('b', 20), standing('c', 17)],
      { a: 1, b: 0, c: 0 },
    );
    expect(verdict).toEqual({ kind: 'points', winners: ['a', 'b'], championId: null });
  });

  it('o desempate ganho por quem estava longe do título só rende o ponto', () => {
    // Vencedor único do desempate, mas a 2 pontos do alvo: leva o ponto
    // e a mesa continua — sem campeão.
    const verdict = judgeTableRound([standing('c', 21), standing('a', 18)], { a: 2, c: 1 });
    expect(verdict).toEqual({ kind: 'points', winners: ['c'], championId: null });
  });

  it('o desempate resolvido coroa quem venceu', () => {
    // A rodada de desempate leva só os empatados (ambos com 2).
    const verdict = judgeTableRound([standing('a', 19), standing('b', 17)], { a: 2, b: 2 });
    expect(verdict).toEqual({ kind: 'points', winners: ['a'], championId: 'a' });
  });

  it('desempate que empata de novo gera outro desempate', () => {
    const verdict = judgeTableRound([standing('a', 19), standing('b', 19)], { a: 2, b: 2 });
    expect(verdict).toEqual({ kind: 'tiebreak', contenders: ['a', 'b'] });
  });

  it('rodada em que todos estouram é morta: sem ponto para ninguém', () => {
    const verdict = judgeTableRound([standing('a', 23), standing('b', 25)], { a: 2, b: 2 });
    expect(verdict).toEqual({ kind: 'void' });
  });

  it('o alvo padrão da casa é o melhor de 3', () => {
    expect(TABLE_TARGET_WINS).toBe(3);
    const verdict = judgeTableRound([standing('a', 20)], { a: TABLE_TARGET_WINS - 1 });
    expect(verdict).toMatchObject({ championId: 'a' });
  });
});

describe('awardTableWins', () => {
  it('soma um ponto a cada vencedor, preservando o resto', () => {
    expect(awardTableWins({ a: 1, b: 0, c: 2 }, ['a', 'b'])).toEqual({ a: 2, b: 1, c: 2 });
  });

  it('assento sem registro entra com o primeiro ponto', () => {
    expect(awardTableWins({}, ['novo'])).toEqual({ novo: 1 });
  });
});

describe('tableStandingsOrder', () => {
  it('ordena por vitórias e, empatado, pela ordem de assento', () => {
    const order = tableStandingsOrder(['a', 'b', 'c', 'd'], { a: 1, b: 3, c: 1, d: 0 });
    expect(order).toEqual(['b', 'a', 'c', 'd']);
  });
});
