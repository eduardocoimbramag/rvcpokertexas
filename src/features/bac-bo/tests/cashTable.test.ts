import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { blindSeats, dealSlots, openCashTable, tableTotal } from '../tournament/cashTable';
import type { TournamentPlayer } from '../tournament/types';
import { CASH_SEATS } from '../tournament/types';

/**
 * F2 — o chassi da mesa de 6.
 *
 * O que se cobra aqui é o RETRATO: quem paga o quê, quanto sobra na
 * frente de cada um, de quem são as cartas que a tela pode ver e quanto
 * há em jogo. Regra de aposta não entra — ela é da engine multiway (F3),
 * e é justamente essa fronteira que estes testes protegem.
 */

const player = (id: string, name: string, isYou = false): TournamentPlayer => ({
  id,
  name,
  avatar: name[0] ?? '?',
  isYou,
});

const YOU = 'you';

function seatSix(): TournamentPlayer[] {
  return [
    player(YOU, 'Você', true),
    player('b1', 'Otto'),
    player('b2', 'Luna'),
    player('b3', 'Dante'),
    player('b4', 'Rex'),
    player('b5', 'Maya'),
  ];
}

function open(seed = 7, blind = 20, buyIn = 1000) {
  return openCashTable({
    seats: seatSix(),
    buyIn,
    blind,
    youId: YOU,
    rng: new SeededRng(seed),
  });
}

describe('quem paga blind', () => {
  it('numa mesa de 3 ou mais o BOTÃO não paga nada', () => {
    /* É a diferença desta mesa para o duelo da casa, onde o botão paga a
       small. Copiar a conta do heads-up cobraria da pessoa errada. */
    const { small, big } = blindSeats(2);
    expect(small).toBe(3);
    expect(big).toBe(4);
    expect(small).not.toBe(2);
    expect(big).not.toBe(2);
  });

  it('os blinds seguem o anel e dão a volta', () => {
    expect(blindSeats(5)).toEqual({ small: 0, big: 1 });
    expect(blindSeats(4)).toEqual({ small: 5, big: 0 });
  });
});

describe('a ordem da distribuição', () => {
  it('começa à esquerda do botão e dá duas voltas', () => {
    const slots = dealSlots(0, CASH_SEATS);
    // A cadeira 1 (esquerda do botão 0) recebe a primeira e a sétima.
    expect(slots[1]).toEqual([0, 6]);
    // O botão recebe por último em cada volta.
    expect(slots[0]).toEqual([5, 11]);
  });

  it('ninguém recebe as duas cartas juntas', () => {
    /* É o que faz a distribuição parecer um crupiê distribuindo em vez
       de a mesa aparecendo pronta. */
    for (const par of dealSlots(3, CASH_SEATS)) {
      expect(par).toHaveLength(2);
      expect(Math.abs((par[1] ?? 0) - (par[0] ?? 0))).toBe(CASH_SEATS);
    }
  });

  it('as doze cartas são doze cartas distintas', () => {
    const todas = dealSlots(4, CASH_SEATS).flat();
    expect(new Set(todas).size).toBe(CASH_SEATS * 2);
  });
});

describe('a mesa aberta', () => {
  it('cobra os dois blinds e nada de ninguém mais', () => {
    const view = open();
    const { small, big } = blindSeats(view.button);

    expect(view.seats[small]?.bet).toBe(10);
    expect(view.seats[big]?.bet).toBe(20);
    for (const seat of view.seats) {
      if (seat.seatIndex === small || seat.seatIndex === big) continue;
      expect(seat.bet).toBe(0);
      expect(seat.stack).toBe(1000);
    }
  });

  it('o blind sai do stack: o que está na frente não está mais no monte', () => {
    const view = open();
    for (const seat of view.seats) {
      expect(seat.stack + seat.bet).toBe(1000);
    }
  });

  it('a small nunca fica fracionada, nem com blind ímpar', () => {
    const view = open(3, 5);
    expect(view.smallBlind).toBe(2);
    expect(Number.isInteger(view.smallBlind)).toBe(true);
    // E nunca zero: uma small de 0 seria um lugar de graça na mesa.
    expect(openCashTable({ ...args(1) }).smallBlind).toBeGreaterThanOrEqual(1);
  });

  it('SÓ AS SUAS CARTAS existem no retrato', () => {
    /* O corte de sigilo acontece na origem. Mandar as cartas dos outros
       e escondê-las no CSS entregaria a mesa a quem abrir o inspetor. */
    const view = open();
    const eu = view.seats.find((seat) => seat.player.isYou);
    expect(eu?.cards.filter(Boolean)).toHaveLength(2);
    for (const seat of view.seats) {
      if (seat.player.isYou) continue;
      expect(seat.cards).toHaveLength(2);
      expect(seat.cards.every((card) => card === null)).toBe(true);
    }
  });

  it('as suas duas cartas não são a mesma carta', () => {
    const eu = open(11).seats.find((seat) => seat.player.isYou);
    const [a, b] = eu?.cards ?? [];
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(`${a?.rank}${a?.suit}`).not.toBe(`${b?.rank}${b?.suit}`);
  });

  it('a mesa começa sem carta comunitária e no pré-flop', () => {
    const view = open();
    expect(view.board).toHaveLength(0);
    expect(view.street).toBe('preflop');
  });

  it('o POTE começa vazio — os blinds ainda estão na frente de quem pagou', () => {
    /* Somar os blinds ao pote agora faria a cifra do meio contar duas
       vezes o que ainda está no feltro dos jogadores. */
    const view = open();
    expect(view.pot).toBe(0);
    expect(tableTotal(view)).toBe(30);
  });

  it('o botão sai sorteado, e o sorteio percorre a mesa', () => {
    /* É a promessa que a tela das cadeiras faz por escrito. Um botão fixo
       faria de quem sentou primeiro o dono da posição — e no poker
       posição é dinheiro. */
    const vistos = new Set<number>();
    for (let seed = 0; seed < 60; seed += 1) {
      vistos.add(open(seed).button);
    }
    expect(vistos.size).toBeGreaterThan(1);
    for (const b of vistos) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(CASH_SEATS);
    }
  });

  it('quem não pode cobrir o blind entra ALL-IN em vez de ficar devendo', () => {
    const view = open(5, 200, 200);
    const { big } = blindSeats(view.button);
    expect(view.seats[big]?.bet).toBe(200);
    expect(view.seats[big]?.stack).toBe(0);
    expect(view.seats[big]?.allIn).toBe(true);
  });
});

function args(blind: number) {
  return {
    seats: seatSix(),
    buyIn: 1000,
    blind,
    youId: YOU,
    rng: new SeededRng(9),
  };
}
