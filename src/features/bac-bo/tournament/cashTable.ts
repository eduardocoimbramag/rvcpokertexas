import type { Rng } from '@/shared/lib/random';
import { randomInt } from '@/shared/lib/random';

import { TIMINGS } from '../animations/timings';
import { buildDeck } from '../engine/deck';
import type { Street } from '../engine/poker/types';
import type { Card } from '../engine/types';
import { leftOf } from './seatOrder';
import type { TournamentPlayer } from './types';
import { CASH_SEATS } from './types';

/**
 * O MODELO DE VISTA DA MESA DE CASH DE 6.
 *
 * Ele descreve o que se vê num instante da mesa — quem senta onde, com
 * quanto, o que cada um pôs nesta rua, o que a mesa abriu e quanto há no
 * meio — e NÃO decide nada: não sabe de quem é a vez, não valida lance,
 * não conhece regra de aposta. Isso é de propósito, e é a fronteira desta
 * fatia (ver docs/multiplayer.md §5, F2): o chassi da mesa entra antes da
 * engine multiway, e por isso ele precisa ser algo que a engine possa
 * PRODUZIR depois, não algo que ela tenha de substituir.
 *
 * É o mesmo formato que um servidor emitiria como estado da mesa, e é
 * essa a razão de ele existir em vez de a tela ler o store direto: um dia
 * este objeto chega pela rede em vez de sair daqui, e nada acima dele
 * precisa saber a diferença.
 *
 * Vive fora dos componentes porque é lógica pura — dá teste sem montar
 * tela — e porque um arquivo de componente que exporta função quebra o
 * fast refresh do Vite. Mesmo motivo de `tableLayout.ts` e `seatOrder.ts`.
 */

/**
 * O COMPASSO DA DISTRIBUIÇÃO numa mesa de N.
 *
 * O crupiê dá uma carta de cada vez, e o intervalo entre elas é uma
 * fração do compasso da casa (`TIMINGS.dealCardMs`, 430 ms): doze cartas
 * no compasso cheio levariam cinco segundos, que é tempo demais entre
 * uma mão e a seguinte.
 *
 * A FRAÇÃO NÃO É ARBITRÁRIA. Ela foi escolhida para a distribuição de
 * seis durar o MESMO que a do duelo — `TIMINGS.dealMs`, 2770 ms:
 *
 *   11 cartas de intervalo × 430 ms × 0,36 + 550 (assentar) + 500 (respiro)
 *     ≈ 2753 ms   contra   4 × 430 + 550 + 500 = 2770 ms
 *
 * A mesa de seis distribui TRÊS VEZES mais cartas no mesmo tempo, que é
 * o que um crupiê faz numa mesa cheia. Antes a fração era 0,22 e a
 * distribuição inteira corria em 1,6 s: as cartas não voavam, apareciam.
 */
export const DEAL_STAGGER = 0.36;

/**
 * Quanto tempo a mesa leva para distribuir e as cartas assentarem.
 *
 * O número existe para uma coisa só, e ela é de jogo: NINGUÉM FALA ANTES
 * DE AS CARTAS CHEGAREM. Sem esta espera a barra de lances abria com a
 * distribuição ainda no ar — a mesa pedia uma decisão sobre uma mão que
 * o jogador literalmente ainda não tinha na frente dele, e as cartas em
 * voo cruzavam por cima das placas e do board enquanto isso.
 */
export function dealDurationMs(seats: number): number {
  const última = seats * 2 - 1;
  return Math.round(
    última * TIMINGS.dealCardMs * DEAL_STAGGER + TIMINGS.settleCardMs + TIMINGS.dealBreathMs,
  );
}

/** Um lugar da mesa, com tudo o que a mesa mostra dele. */
export interface CashSeatView {
  /** A cadeira, 0 a 5 — a MESMA para todo mundo que olha a mesa. */
  seatIndex: number;
  player: TournamentPlayer;
  /** Fichas vivas na frente dele: o que já foi para o meio não está aqui. */
  stack: number;
  /** O que ele comprometeu NESTA rua e ainda está no feltro à frente. */
  bet: number;
  /**
   * As duas fechadas. `null` no lugar de uma carta é uma carta de bruços
   * — é assim que a mão dos outros chega até o showdown, e é o corte de
   * sigilo que a engine faz na origem (ver docs/multiplayer.md §4.4).
   */
  cards: readonly (Card | null)[];
  /** Largou a mão: continua na cadeira, fora do pote. */
  folded: boolean;
  /** Não sobrou ficha: está com tudo no meio. */
  allIn: boolean;
  /**
   * ABRIU a mão por escolha depois de levar o pote sem showdown.
   *
   * É diferente de uma carta que a mesa virou, e a diferença é toda a
   * graça do gesto: quem olha precisa distinguir uma mão que foi PAGA
   * para ser vista de uma que o dono decidiu contar.
   */
  shown?: boolean;
}

/** A mesa inteira num instante. */
export interface CashTableView {
  /** Os seis lugares, na ORDEM REAL da mesa — o índice é a cadeira. */
  seats: readonly CashSeatView[];
  /** A cadeira que tem o botão do dealer. */
  button: number;
  smallBlind: number;
  bigBlind: number;
  /** As comunitárias já abertas (0, 3, 4 ou 5). */
  board: readonly Card[];
  /** Tudo o que já foi recolhido das ruas anteriores. */
  pot: number;
  street: Street;
  /**
   * De quem a mesa espera o lance; `null` quando a rua fechou, a mão
   * acabou ou a mesa está entre uma mão e outra.
   */
  toAct: number | null;
  /** Quantas mãos esta mesa já viu, contando a que está em jogo. */
  handNo: number;
  /**
   * A LEITURA DA SUA MÃO — "Carta alta: 7", "Dois pares, Reis e 9".
   *
   * Só a SUA, e é regra de poker e não de layout: ela sai das suas duas
   * fechadas com o que a mesa abriu, e as dos outros sairiam de cartas
   * que não atravessam a fronteira da engine.
   */
  yourHandLabel?: string | null;
}

/**
 * A ORDEM DA DISTRIBUIÇÃO numa mesa de N: uma carta de cada vez, a partir
 * da ESQUERDA DO BOTÃO, duas voltas.
 *
 * Não é firula: é de onde sai o atraso de cada carta na coreografia, e
 * uma mesa em que as duas cartas de alguém caem juntas não parece um
 * crupiê distribuindo, parece a mesa aparecendo pronta. É o mesmo
 * princípio do `dealOrder.ts` do duelo, generalizado para o anel.
 *
 * Devolve, para cada cadeira, a posição das suas DUAS cartas na sequência
 * global — `slot[3] = [1, 7]` quer dizer que a cadeira 3 recebeu a segunda
 * e a oitava carta da distribuição.
 */
export function dealSlots(button: number, total: number = CASH_SEATS): number[][] {
  const slots: number[][] = Array.from({ length: total }, () => []);
  let n = 0;
  for (let round = 0; round < 2; round += 1) {
    let seat = leftOf(button, total);
    for (let i = 0; i < total; i += 1) {
      slots[seat]?.push(n);
      n += 1;
      seat = leftOf(seat, total);
    }
  }
  return slots;
}

/**
 * Quem paga o quê. Numa mesa de 3 ou mais o botão não paga blind: paga
 * quem senta à esquerda dele (small) e o seguinte (big). É essa a
 * diferença do heads-up desta casa, onde o botão paga a small — e é por
 * isso que a conta mora aqui em vez de ser copiada da mesa de dois.
 */
export function blindSeats(
  button: number,
  total: number = CASH_SEATS,
): { small: number; big: number } {
  const small = leftOf(button, total);
  return { small, big: leftOf(small, total) };
}

export interface OpenCashTableOptions {
  /** Os seis sentados, na ordem das cadeiras. Um `null` é cadeira vaga. */
  seats: readonly (TournamentPlayer | null)[];
  /** Fichas com que cada um entrou. */
  buyIn: number;
  /** O blind GRANDE da sala — o valor que a criação da mesa definiu. */
  blind: number;
  /** Quem é você, para a mesa saber a única mão que pode abrir. */
  youId: string;
  rng: Rng;
}

/**
 * ABRE A MESA PARADA — o retrato de uma mesa montada que ainda não joga.
 *
 * Ele sobreviveu à chegada da engine porque continua sendo o único jeito
 * de produzir uma mesa de 6 sem máquina de estados nenhuma: é o que a
 * tela consome nos testes de layout, e é o que sobra se a engine falhar
 * ao abrir. A mesa que JOGA vem de `CashTableEngine.view()`.
 *
 * Sorteia o botão, cobra os dois blinds e distribui.
 *
 * O botão é SORTEADO, e essa é a promessa que a tela das cadeiras faz por
 * escrito ("o botão do dealer é sorteado depois que todos sentam"). Sem
 * ela, quem clicasse mais rápido escolheria posição — e no poker posição
 * é dinheiro, o que transformaria uma corrida de reflexo numa vantagem de
 * fichas (ver docs/multiplayer.md §6.1).
 *
 * A small blind é metade da grande, arredondada para baixo, e nunca menor
 * que 1: com blind 5 a small é 2, e a mesa não fica devendo ficha
 * fracionada a ninguém.
 */
export function openCashTable({
  seats,
  buyIn,
  blind,
  youId,
  rng,
}: OpenCashTableOptions): CashTableView {
  const total = seats.length;
  const deck = buildDeck(rng, 1);
  const button = randomInt(rng, 0, total - 1);
  const { small, big } = blindSeats(button, total);
  const smallBlind = Math.max(1, Math.floor(blind / 2));
  const slots = dealSlots(button, total);

  const view: CashSeatView[] = seats.map((player, seatIndex) => {
    if (!player) {
      /* Cadeira vaga não entra na mão. Ela não deveria existir quando a
         mesa abre — a primeira mão só começa com a mesa cheia —, mas o
         formato precisa suportá-la, porque a mesa ABERTA vai ter cadeira
         vazia no meio da sessão assim que alguém levantar. */
      return {
        seatIndex,
        player: { id: `vaga-${seatIndex}`, name: 'Cadeira vazia', avatar: '·', isYou: false },
        stack: 0,
        bet: 0,
        cards: [],
        folded: true,
        allIn: false,
        shown: false,
      };
    }

    const bet =
      seatIndex === big
        ? Math.min(blind, buyIn)
        : seatIndex === small
          ? Math.min(smallBlind, buyIn)
          : 0;
    const mine = player.id === youId;
    /* O CORTE DE SIGILO acontece AQUI, na origem: a mão dos outros nunca
       chega ao objeto que a tela recebe. Enviar as cartas e esconder no
       CSS entregaria a mesa inteira a quem abrir o inspetor. */
    const cards = (slots[seatIndex] ?? []).map((slot) => (mine ? (deck[slot] ?? null) : null));

    return {
      seatIndex,
      player,
      stack: buyIn - bet,
      bet,
      cards,
      folded: false,
      allIn: buyIn - bet === 0,
      shown: false,
    };
  });

  return {
    seats: view,
    button,
    smallBlind,
    bigBlind: blind,
    /* O pote começa VAZIO e os blinds ficam no feltro à frente de quem os
       pagou. É como numa mesa real: só vira pote quando a rua fecha e o
       crupiê varre. Somar os blinds ao pote agora faria a cifra do meio
       contar duas vezes o que ainda está na frente dos jogadores. */
    board: [],
    pot: 0,
    street: 'preflop',
    toAct: null,
    handNo: 0,
    yourHandLabel: null,
  };
}

/** O que há em jogo agora: o pote recolhido mais tudo o que está no feltro. */
export function tableTotal(view: CashTableView): number {
  return view.seats.reduce((sum, seat) => sum + seat.bet, view.pot);
}
