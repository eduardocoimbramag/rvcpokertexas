import type { Rng } from '@/shared/lib/random';

import { ringBotDecision } from '../engine/poker/ringBot';
import type { RaiseRange } from '../engine/poker/betting';
import {
  applyMove,
  beginHand,
  legalFor,
  livesIn,
  minRaiseFor,
  nextSeat,
  raiseRange,
  toCallFor,
} from '../engine/poker/ringHand';
import type { RingHand, SeatId } from '../engine/poker/ringHand';
import type { HoleCards } from '../engine/poker/types';
import { readHand } from '../engine/poker/handRank';
import { settleHand } from '../engine/poker/sidePots';
import type { HandSettlement } from '../engine/poker/sidePots';
import type { PokerAction } from '../engine/poker/types';
import type { CashSeatView, CashTableView } from './cashTable';
import type { TournamentPlayer } from './types';

/**
 * A MESA DE CASH DE 6, ligada.
 *
 * Esta classe é o CORTE DE SIGILO da mesa, e é a razão de ela existir em
 * vez de a mão morar direto no store. A `RingHand` contém as doze cartas
 * fechadas da mesa; o store é lido pelo React, pelo DevTools e por
 * qualquer um que abra o inspetor. Mantendo a mão aqui dentro e
 * publicando só a PROJEÇÃO — que já sai com a mão dos outros de bruços —,
 * as cartas alheias simplesmente não existem do lado de fora.
 *
 * É o mesmo desenho do duelo 1v1 (ver LocalPokerEngine), e ele vale mais
 * ainda aqui: numa mesa de seis são cinco mãos para vazar em vez de uma.
 *
 * O QUE ELA NÃO FAZ é decidir ritmo. Ela expõe "jogue um lance de bot" e
 * "comece a mão seguinte", e quem os chama, e quando, é o store — que é
 * quem tem os timers. No dia do servidor essa mesma fronteira vira a
 * assinatura de eventos: o ritmo passa a ser de lá, e nada acima aqui
 * precisa saber (ver docs/multiplayer.md §4.2).
 */

export interface CashEngineOptions {
  /** Os seis sentados, na ordem das cadeiras. `null` é cadeira vaga. */
  players: readonly (TournamentPlayer | null)[];
  /** Fichas com que cada um sentou. */
  buyIn: number;
  /** O blind GRANDE da sala. */
  bigBlind: number;
  /** A sua cadeira — a única mão que a projeção abre. */
  youSeat: SeatId;
  /** Onde o botão do dealer começa. */
  button: SeatId;
  rng: Rng;
}

/** O que a mesa anuncia quando uma mão fecha. */
export interface CashHandResult {
  settlement: HandSettlement;
  /** O que a mão fez com o SEU stack, com sinal. */
  netChange: number;
  /** Quantas mãos já fecharam nesta mesa. */
  handNo: number;
}

export class CashTableEngine {
  private readonly players: readonly (TournamentPlayer | null)[];
  private readonly youSeat: SeatId;
  private readonly bigBlind: number;
  private readonly smallBlind: number;
  private readonly rng: Rng;

  private stacks: number[];
  private button: SeatId;
  private hand: RingHand | null = null;
  /** Cadeiras que ABRIRAM a mão por escolha, fora do showdown. */
  private revealed = new Set<SeatId>();
  private handNo = 0;
  private lastResult: CashHandResult | null = null;

  constructor({ players, buyIn, bigBlind, youSeat, button, rng }: CashEngineOptions) {
    this.players = players;
    this.youSeat = youSeat;
    this.bigBlind = bigBlind;
    /* A small é metade da grande, arredondada para baixo, e nunca menor
       que 1: com blind 5 a small é 2, e a mesa não fica devendo ficha
       fracionada a ninguém. */
    this.smallBlind = Math.max(1, Math.floor(bigBlind / 2));
    this.rng = rng;
    this.button = button;
    this.stacks = players.map((p) => (p ? buyIn : 0));
  }

  /** Distribui a mão seguinte e move o botão. */
  beginHand(): CashTableView {
    if (this.handNo > 0) this.button = this.nextButton();
    this.revealed.clear();
    this.hand = beginHand({
      stacks: this.stacks,
      button: this.button,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      rng: this.rng,
    });
    this.lastResult = null;
    return this.view();
  }

  /**
   * O botão anda para a esquerda, PULANDO cadeiras sem ficha.
   *
   * Uma cadeira quebrada com o botão paralisaria a rotação dos blinds — e
   * a rotação dos blinds é o que faz o custo da mesa ser o mesmo para
   * todo mundo ao longo da sessão.
   */
  private nextButton(): SeatId {
    const total = this.stacks.length;
    let seat = nextSeat(this.button, total);
    for (let i = 0; i < total; i += 1) {
      if ((this.stacks[seat] ?? 0) > 0) return seat;
      seat = nextSeat(seat, total);
    }
    return this.button;
  }

  /** Quantos ainda têm fichas para jogar a mão seguinte. */
  seatedWithChips(): number {
    return this.stacks.filter((s) => s > 0).length;
  }

  /** A mão corrente acabou (falta só repartir e anunciar). */
  isHandOver(): boolean {
    return this.hand?.done ?? true;
  }

  /** É a sua vez de falar. */
  isYourTurn(): boolean {
    return this.hand?.toAct === this.youSeat;
  }

  legal(): PokerAction[] {
    return this.hand ? legalFor(this.hand) : [];
  }

  range(): RaiseRange {
    return this.hand ? raiseRange(this.hand) : { can: false, min: 0, max: 0, allInOnly: false };
  }

  toCall(): number {
    return this.hand ? toCallFor(this.hand) : 0;
  }

  minRaise(): number {
    return this.hand ? minRaiseFor(this.hand) : 0;
  }

  /** Joga o SEU lance. Lance ilegal levanta (ver `applyMove`). */
  act(action: PokerAction, raiseTo?: number): CashTableView {
    if (!this.hand) throw new Error('Não há mão aberta.');
    if (this.hand.toAct !== this.youSeat) throw new Error('Não é a sua vez.');
    this.hand = applyMove(this.hand, action, raiseTo);
    return this.view();
  }

  /**
   * Joga UM lance de bot, se a vez for de um.
   *
   * Devolve o que ele fez para a mesa poder anunciá-lo — um lance que
   * acontece sem ser dito deixa quem está olhando sem saber por que o
   * pote cresceu. `null` quando a vez é sua ou a mão acabou.
   */
  botMove(): { seat: SeatId; action: PokerAction; to?: number } | null {
    const hand = this.hand;
    if (!hand || hand.toAct === null || hand.toAct === this.youSeat) return null;
    const seat = hand.seats[hand.toAct];
    if (!seat?.cards) return null;

    const vivos = livesIn(hand);
    /* A FAIXA REAL, e não o mínimo teórico da mesa.
       Quando o stack não cobre o aumento mínimo, o único aumento possível
       é o ALL-IN, e a faixa vira um ponto só — `min` desce até o teto do
       stack. Passando `minRaiseFor` aqui, o bot recebia um piso ACIMA do
       próprio teto (mínimo 1114 num stack de 954), grampeava para o
       piso e pedia um aumento que a mesa recusa: a mão levantava
       `IllegalMoveError` e a mesa travava no meio da rua. */
    const faixa = raiseRange(hand);
    const decision = ringBotDecision({
      hole: seat.cards,
      board: hand.board,
      toCall: Math.max(0, hand.maxCommitted - seat.committed),
      pot: hand.seats.reduce((sum, s) => sum + s.committed, hand.pot),
      stack: seat.stack,
      committed: seat.committed,
      minRaiseTo: faixa.min,
      maxRaiseTo: faixa.max,
      legalActions: legalFor(hand),
      opponents: Math.max(1, vivos.length - 1),
      actingAfter: this.seatsAfter(hand, seat.id),
      rng: this.rng,
    });

    this.hand = applyMove(hand, decision.action, decision.to);
    return { seat: seat.id, action: decision.action, to: decision.to };
  }

  /** Quantos ainda falam depois desta cadeira nesta rua. */
  private seatsAfter(hand: RingHand, from: SeatId): number {
    const total = hand.seats.length;
    let n = 0;
    for (let i = 1; i < total; i += 1) {
      const s = hand.seats[(from + i) % total];
      if (s && !s.folded && !s.allIn && s.cards !== null && s.stack > 0) n += 1;
    }
    return n;
  }

  /**
   * FECHA A MÃO: reparte os potes e credita os stacks.
   *
   * Idempotente — chamar duas vezes não paga duas vezes. É o store quem a
   * chama, e ele tem timers: um `settle` que pagasse a cada chamada
   * transformaria um re-render em dinheiro.
   */
  settle(): CashHandResult | null {
    if (!this.hand || !this.hand.done) return null;
    if (this.lastResult) return this.lastResult;

    const antes = this.stacks[this.youSeat] ?? 0;
    const settlement = settleHand(this.hand);
    this.stacks = [...settlement.stacks];
    this.handNo += 1;

    this.lastResult = {
      settlement,
      netChange: (this.stacks[this.youSeat] ?? 0) - antes,
      handNo: this.handNo,
    };
    return this.lastResult;
  }

  /** O resultado da última mão fechada, se já houve. */
  result(): CashHandResult | null {
    return this.lastResult;
  }

  /**
   * ABRE a mão de uma cadeira que ninguém pagou para ver.
   *
   * É a única porta pela qual uma carta alheia sai desta classe fora do
   * showdown, e ela é uma DECISÃO — de quem levou o pote, ou do bot que
   * escolheu contar o que tinha (ver `botShowsHand`). Enquanto a decisão
   * não é tomada, a carta simplesmente não existe do lado de fora.
   */
  revealSeat(seat: SeatId): void {
    this.revealed.add(seat);
  }

  /**
   * As duas fechadas de uma cadeira, PARA A MESA DECIDIR — nunca para a
   * tela.
   *
   * Ela existe para o bot poder avaliar a própria mão antes de escolher
   * se abre. É `readonly` e sai daqui direto para `readHand`, que é
   * cálculo puro: o valor nunca entra no store nem atravessa a
   * projeção.
   */
  holeOf(seat: SeatId): HoleCards | null {
    return this.hand?.seats[seat]?.cards ?? null;
  }

  /** Fichas que você levaria da mesa se se levantasse agora. */
  yourStack(): number {
    const seat = this.hand?.seats[this.youSeat];
    if (this.hand && !this.hand.done && seat) return seat.stack + seat.committed;
    return this.stacks[this.youSeat] ?? 0;
  }

  /**
   * A PROJEÇÃO — o que a mesa mostra.
   *
   * O corte acontece aqui e em nenhum outro lugar: as fechadas só saem da
   * classe quando são as SUAS, ou quando a mão foi ao showdown e a mesa
   * as virou. Fora isso o que atravessa é `null`, que é uma carta de
   * bruços — e não uma carta escondida no CSS.
   */
  view(): CashTableView {
    const hand = this.hand;
    const showdown = (hand?.done ?? false) && (hand ? livesIn(hand).length > 1 : false);
    const mineCards = hand?.seats[this.youSeat]?.cards ?? null;

    const seats: CashSeatView[] = this.players.map((player, seatIndex) => {
      const s = hand?.seats[seatIndex];
      const vago = !player;
      const meu = seatIndex === this.youSeat;
      /* A mão de alguém aparece em três casos, e só nestes: é a SUA, o
         showdown a virou, ou o dono ESCOLHEU abri-la depois de levar o
         pote sem que ninguém pagasse para ver. */
      const abre = meu || (showdown && !(s?.folded ?? true)) || this.revealed.has(seatIndex);

      return {
        seatIndex,
        player: player ?? {
          id: `vaga-${seatIndex}`,
          name: 'Cadeira vazia',
          avatar: '·',
          isYou: false,
        },
        stack: s?.stack ?? this.stacks[seatIndex] ?? 0,
        bet: s?.committed ?? 0,
        cards: vago || !s?.cards ? [] : abre ? [...s.cards] : [null, null],
        folded: vago || (s?.folded ?? false),
        allIn: s?.allIn ?? false,
        shown: this.revealed.has(seatIndex),
      };
    });

    return {
      seats,
      button: hand?.button ?? this.button,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      board: hand ? [...hand.board] : [],
      pot: hand?.pot ?? 0,
      street: hand?.street ?? 'preflop',
      /* A LEITURA DA SUA MÃO, do jeito do duelo: ela sai da SUA própria
         mão e existe desde a distribuição — no pré-flop são as duas
         fechadas, do flop em diante é a melhor de cinco. Só a sua: a dos
         outros sairia das cartas deles, que não atravessam esta
         fronteira (ver `LocalPokerEngine.playerHandLabel`). */
      yourHandLabel: mineCards ? readHand(mineCards, hand?.board ?? []).label : null,
      toAct: hand?.toAct ?? null,
      handNo: this.handNo + (hand && !hand.done ? 1 : 0),
    };
  }
}
