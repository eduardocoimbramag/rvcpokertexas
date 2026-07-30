import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { buildDeck, handValue, isBust } from '../engine/rules';
import type { Card, CardRank, CardSuit } from '../engine/types';
import { makeBots, you } from '../tournament/simulation';
import { laneSlices, splitLanes } from '../tournament/tableLayout';
import type { TableSeatHand } from '../tournament/tableRound';
import {
  dealTableRound,
  isSeatWaiting,
  lockTableChoice,
  openTotalOf,
  resolveTableTurn,
} from '../tournament/tableRound';
import type { TableStanding } from '../tournament/tableRules';
import type { TableSeries, TableSeriesSeat } from '../tournament/tournamentStore';
import { tablePrize, tournamentPot, useTournamentStore } from '../tournament/tournamentStore';
import type { TableSize } from '../tournament/types';
import { TABLE_TARGET_WINS } from '../tournament/types';
import { useGameStore } from '../store/gameStore';

/**
 * A SÉRIE da mesa única, de ponta a ponta pelo store: pontos, rodada de
 * desempate com espectadores, e o dinheiro (prêmio de 90% ao campeão,
 * taxa cobrada de quem não levou) mexendo uma única vez.
 */

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

const card = (rank: CardRank, suit: CardSuit = 'spades'): Card => ({ rank, suit });

beforeEach(() => {
  vi.useFakeTimers();
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState(initialGame, true);
});

/** A série corrente (falha o teste em vez de silenciar um `null`). */
function series(): TableSeries {
  const current = useTournamentStore.getState().tableSeries;
  if (!current) throw new Error('A mesa única não está aberta.');
  return current;
}

/** Ids da mesa, na ordem dos assentos. */
function seatIds(): string[] {
  return series().seats.map((seat) => seat.player.id);
}

/** Id do assento na posição pedida. */
function seatId(index: number): string {
  const id = seatIds()[index];
  if (id === undefined) throw new Error(`Não há assento na posição ${index}.`);
  return id;
}

/** Vitórias de um assento. */
function winsOf(playerId: string): number {
  const seat = series().seats.find((s) => s.player.id === playerId);
  if (!seat) throw new Error(`Assento ${playerId} não está na mesa.`);
  return seat.wins;
}

/** Um id de rival qualquer (o primeiro que não é você). */
function anyRival(): string {
  const id = seatIds().find((seatIdValue) => seatIdValue !== 'you');
  if (id === undefined) throw new Error('A mesa não tem rival.');
  return id;
}

/** Reescreve o contador da série (para armar o cenário do desempate). */
function setWins(winsByPlayer: Record<string, number>, patch: Partial<TableSeries> = {}) {
  const current = series();
  const seats: TableSeriesSeat[] = current.seats.map((seat) => ({
    ...seat,
    wins: winsByPlayer[seat.player.id] ?? 0,
  }));
  useTournamentStore.setState({ tableSeries: { ...current, seats, ...patch } });
}

/** Abre uma mesa única de `size` assentos com a taxa dada. */
function openTable(size: TableSize, fee = 100) {
  useTournamentStore.getState().createLobby({
    name: 'Mesa Imperial',
    visibility: 'public',
    format: 'table',
    size,
    fee,
    password: '',
  });
  // Enche a sala e confirma todo mundo (o dono já entra confirmado).
  const bots = makeBots(size - 1);
  useTournamentStore.setState({
    members: [you(), ...bots],
    readyIds: ['you', ...bots.map((bot) => bot.id)],
  });
  useTournamentStore.getState().startTournament();
  return useTournamentStore.getState();
}

/** Situação de showdown direta. */
const standing = (playerId: string, total: number): TableStanding => ({
  playerId,
  total,
  bust: total > 21,
  natural: false,
});

/** A mão de um assento na rodada (falha se ele não estiver na mesa). */
function handOf(state: { hands: TableSeatHand[] }, playerId: string): TableSeatHand {
  const hand = state.hands.find((seat) => seat.playerId === playerId);
  if (!hand) throw new Error(`Assento ${playerId} não recebeu cartas.`);
  return hand;
}

describe('abertura da mesa única', () => {
  it('começa a série com todos sentados, zerados e em jogo', () => {
    const s = openTable(6);
    expect(s.stage).toBe('table');
    expect(s.bracket).toBeNull();
    expect(series().seats).toHaveLength(6);
    expect(series().seats.every((seat) => seat.wins === 0)).toBe(true);
    expect(series().playingIds).toHaveLength(6);
    expect(series().round).toBe(1);
    expect(series().tiebreak).toBe(false);
    expect(series().championId).toBeNull();
    expect(seatIds()).toContain('you');
  });

  it('o chaveamento continua sendo o outro caminho (nada de mesa)', () => {
    useTournamentStore.getState().createLobby({
      name: 'Copa',
      visibility: 'public',
      format: 'bracket',
      size: 4,
      fee: 50,
      password: '',
    });
    const bots = makeBots(3);
    useTournamentStore.setState({
      members: [you(), ...bots],
      readyIds: ['you', ...bots.map((bot) => bot.id)],
    });
    useTournamentStore.getState().startTournament();
    const s = useTournamentStore.getState();
    expect(s.stage).toBe('bracket');
    expect(s.tableSeries).toBeNull();
    expect(s.bracket).not.toBeNull();
  });
});

describe('pontos da série', () => {
  it('a melhor mão pontua e a mesa emenda a rodada seguinte', () => {
    openTable(4);
    const ids = seatIds();
    useTournamentStore
      .getState()
      .settleTableRound([
        standing(seatId(0), 20),
        standing(seatId(1), 18),
        standing(seatId(2), 17),
        standing(seatId(3), 22),
      ]);

    expect(winsOf(seatId(0))).toBe(1);
    expect(winsOf(seatId(1))).toBe(0);
    expect(series().round).toBe(2);
    expect(series().tiebreak).toBe(false);
    // Mesa cheia de novo: ninguém sai por perder uma rodada.
    expect(series().playingIds).toEqual(ids);
  });

  it('empate comum dá ponto a todos os empatados', () => {
    openTable(3);
    useTournamentStore
      .getState()
      .settleTableRound([
        standing(seatId(0), 20),
        standing(seatId(1), 20),
        standing(seatId(2), 15),
      ]);

    expect(winsOf(seatId(0))).toBe(1);
    expect(winsOf(seatId(1))).toBe(1);
    expect(winsOf(seatId(2))).toBe(0);
  });

  it('rodada em que todos estouram é morta: sem ponto para ninguém', () => {
    openTable(3);
    useTournamentStore
      .getState()
      .settleTableRound([
        standing(seatId(0), 23),
        standing(seatId(1), 24),
        standing(seatId(2), 25),
      ]);

    expect(series().seats.every((seat) => seat.wins === 0)).toBe(true);
    expect(series().lastVerdict).toEqual({ kind: 'void' });
    // A mesa redistribui: rodada nova, mesa cheia.
    expect(series().round).toBe(2);
    expect(series().playingIds).toHaveLength(3);
  });
});

describe('rodada de desempate', () => {
  it('empate na decisão manda só os líderes à mesa; o resto assiste', () => {
    openTable(4);
    const [a, b, c, d] = [seatId(0), seatId(1), seatId(2), seatId(3)];
    setWins({ [a]: TABLE_TARGET_WINS - 1, [b]: TABLE_TARGET_WINS - 1 });

    useTournamentStore
      .getState()
      .settleTableRound([standing(a, 20), standing(b, 20), standing(c, 19), standing(d, 18)]);

    expect(series().tiebreak).toBe(true);
    expect(series().playingIds).toEqual([a, b]);
    expect(series().championId).toBeNull();
    // NINGUÉM pontua na rodada empatada: o ponto é do desempate.
    expect(winsOf(a)).toBe(TABLE_TARGET_WINS - 1);
    expect(winsOf(b)).toBe(TABLE_TARGET_WINS - 1);
    // E quem ficou de fora não joga a rodada.
    expect(series().playingIds).not.toContain(c);
    expect(series().playingIds).not.toContain(d);
  });

  it('o desempate resolvido fecha a série no vencedor', () => {
    openTable(3);
    const [a, b] = [seatId(0), seatId(1)];
    setWins(
      { [a]: TABLE_TARGET_WINS - 1, [b]: TABLE_TARGET_WINS - 1 },
      { playingIds: [a, b], tiebreak: true },
    );

    // Só os dois do desempate jogam — e um vence.
    useTournamentStore.getState().settleTableRound([standing(a, 21), standing(b, 19)]);

    expect(series().championId).toBe(a);
    expect(winsOf(a)).toBe(TABLE_TARGET_WINS);
  });

  it('empatar a mão que decide manda a mesa ao desempate (ninguém coroa)', () => {
    openTable(4);
    const [a, b] = [seatId(0), seatId(1)];
    // Só `a` está a um ponto do título — e ele EMPATA a mão com `b`.
    setWins({ [a]: TABLE_TARGET_WINS - 1 });

    useTournamentStore
      .getState()
      .settleTableRound([
        standing(a, 20),
        standing(b, 20),
        standing(seatId(2), 17),
        standing(seatId(3), 16),
      ]);

    expect(series().championId).toBeNull();
    expect(series().tiebreak).toBe(true);
    expect(series().playingIds).toEqual([a, b]);
    // E o placar não se mexeu: o ponto é do desempate.
    expect(winsOf(a)).toBe(TABLE_TARGET_WINS - 1);
    expect(winsOf(b)).toBe(0);
  });

  it('rodada morta DENTRO do desempate mantém o desempate de pé', () => {
    openTable(4);
    const [a, b] = [seatId(0), seatId(1)];
    setWins(
      { [a]: TABLE_TARGET_WINS - 1, [b]: TABLE_TARGET_WINS - 1 },
      { playingIds: [a, b], tiebreak: true },
    );

    // Os dois estouram no desempate: ninguém pontua e a mesa repete o
    // desempate com os MESMOS dois (não volta a mesa cheia).
    useTournamentStore.getState().settleTableRound([standing(a, 23), standing(b, 25)]);

    expect(series().lastVerdict).toEqual({ kind: 'void' });
    expect(series().tiebreak).toBe(true);
    expect(series().playingIds).toEqual([a, b]);
    expect(series().championId).toBeNull();
  });

  it('desempate que empata de novo joga outro desempate', () => {
    openTable(4);
    const [a, b] = [seatId(0), seatId(1)];
    setWins(
      { [a]: TABLE_TARGET_WINS - 1, [b]: TABLE_TARGET_WINS - 1 },
      { playingIds: [a, b], tiebreak: true },
    );

    useTournamentStore.getState().settleTableRound([standing(a, 20), standing(b, 20)]);

    expect(series().championId).toBeNull();
    expect(series().tiebreak).toBe(true);
    expect(series().playingIds).toEqual([a, b]);
  });
});

describe('dinheiro da mesa única', () => {
  it('campeão leva 90% do bolo das taxas, uma vez só', () => {
    const fee = 100;
    openTable(4, fee);
    const before = useGameStore.getState().balance;

    setWins({ you: TABLE_TARGET_WINS - 1 });
    const rivals = seatIds().filter((id) => id !== 'you');
    useTournamentStore
      .getState()
      .settleTableRound([standing('you', 21), ...rivals.map((id) => standing(id, 18))]);

    // Bolo = 3 taxas de 100 = 300; 90% = 270 (a comissão da casa é 10%).
    expect(tournamentPot(fee, 4)).toBe(300);
    const prize = tablePrize(fee, 4);
    expect(prize).toBe(270);
    expect(series().championId).toBe('you');
    expect(useGameStore.getState().balance).toBe(before + prize);
    expect(useTournamentStore.getState().feePaid).toBe(false); // campeão não paga
    expect(useTournamentStore.getState().prizePaid).toBe(true);

    // Um segundo julgamento não pode pagar de novo.
    useTournamentStore.getState().settleTableRound([standing('you', 21)]);
    expect(useGameStore.getState().balance).toBe(before + prize);
  });

  it('quem não leva a mesa paga a taxa — uma vez só', () => {
    const fee = 50;
    openTable(3, fee);
    const before = useGameStore.getState().balance;
    const rival = anyRival();

    setWins({ [rival]: TABLE_TARGET_WINS - 1 });
    useTournamentStore
      .getState()
      .settleTableRound(seatIds().map((id) => standing(id, id === rival ? 21 : 17)));

    expect(series().championId).toBe(rival);
    expect(useGameStore.getState().balance).toBe(before - fee);
    expect(useTournamentStore.getState().feePaid).toBe(true);
  });

  it('a série que não fecha não move saldo nenhum', () => {
    openTable(4, 100);
    const before = useGameStore.getState().balance;
    useTournamentStore
      .getState()
      .settleTableRound(seatIds().map((id, index) => standing(id, 20 - index)));
    expect(useGameStore.getState().balance).toBe(before);
    expect(useTournamentStore.getState().feePaid).toBe(false);
  });

  it('a coroação só abre com a série fechada', () => {
    openTable(3);
    useTournamentStore.getState().showTableChampion();
    expect(useTournamentStore.getState().stage).toBe('table');

    const rival = anyRival();
    useTournamentStore.setState({ tableSeries: { ...series(), championId: rival } });
    useTournamentStore.getState().showTableChampion();
    expect(useTournamentStore.getState().stage).toBe('champion');
  });
});

describe('mecânica da rodada na mesa', () => {
  it('distribui duas cartas por assento em jogo, na ordem da mesa', () => {
    const deck = buildDeck(new SeededRng(7), 2);
    const state = dealTableRound(['a', 'b', 'c'], deck);
    expect(state.hands).toHaveLength(3);
    expect(state.hands.every((hand) => hand.cards.length === 2)).toBe(true);
    expect(state.phase).toBe('choosing');
    // Ninguém entra fechado — nem quem tirou um natural (seria o maior
    // tell da mesa).
    expect(state.hands.every((hand) => !hand.closed)).toBe(true);
    expect(deck.length).toBe(104 - 6);
  });

  it('o total ABERTO esconde a última carta, mas o estouro é público', () => {
    const live: TableSeatHand = {
      playerId: 'a',
      cards: [card('K'), card('9')],
      closed: false,
    };
    expect(openTotalOf(live)).toBe(10); // a segunda carta é segredo
    const busted: TableSeatHand = {
      playerId: 'b',
      cards: [card('K'), card('9'), card('5')],
      closed: true,
    };
    expect(openTotalOf(busted)).toBe(24); // estourou: a mão vira inteira
  });

  it('a vez fecha com todos os lances de uma vez, e parar fecha a mão', () => {
    const deck = buildDeck(new SeededRng(3), 2);
    let state = dealTableRound(['you', 'bot'], deck);
    state = lockTableChoice(state, 'you', 'stand');
    expect(isSeatWaiting(handOf(state, 'you'))).toBe(false);

    const next = resolveTableTurn(state, deck, 'you');
    expect(handOf(next, 'you').closed).toBe(true);
    expect(next.lastMoves?.find((move) => move.playerId === 'you')).toMatchObject({
      action: 'stand',
      closed: true,
      timedOut: false,
    });
    // Cada assento teve exatamente um lance nesta vez.
    expect(next.lastMoves).toHaveLength(2);
  });

  it('sem escolha travada, a mesa PARA a sua mão (e ninguém estoura por isso)', () => {
    const deck = buildDeck(new SeededRng(11), 2);
    const state = dealTableRound(['you', 'bot'], deck);
    const next = resolveTableTurn(state, deck, 'you');
    expect(next.lastMoves?.find((move) => move.playerId === 'you')).toMatchObject({
      action: 'stand',
      timedOut: true,
      bust: false,
    });
  });

  it('pedir carta cresce a mão e o estouro fecha nela', () => {
    const deck = buildDeck(new SeededRng(5), 2);
    let state = dealTableRound(['you', 'bot'], deck);
    for (let i = 0; i < 12 && state.phase === 'choosing'; i += 1) {
      if (!handOf(state, 'you').closed) state = lockTableChoice(state, 'you', 'hit');
      state = resolveTableTurn(state, deck, 'you');
    }
    const yours = handOf(state, 'you');
    expect(yours.cards.length).toBeGreaterThan(2);
    expect(yours.closed).toBe(true);
    expect(handValue(yours.cards).total >= 21 || isBust(yours.cards)).toBe(true);
  });

  it('a rodada fecha (settled) quando todas as mãos fecham', () => {
    const deck = buildDeck(new SeededRng(2), 2);
    let state = dealTableRound(['you', 'bot'], deck);
    for (let i = 0; i < 20 && state.phase === 'choosing'; i += 1) {
      state = lockTableChoice(state, 'you', 'stand');
      state = resolveTableTurn(state, deck, 'you');
    }
    expect(state.phase).toBe('settled');
    expect(state.hands.every((hand) => hand.closed)).toBe(true);
  });
});

describe('faixas de assentos', () => {
  it('até três rivais ficam numa faixa; de quatro em diante abre a segunda', () => {
    expect(splitLanes(2)).toEqual([2]);
    expect(splitLanes(3)).toEqual([3]);
    expect(splitLanes(4)).toEqual([2, 2]);
    expect(splitLanes(5)).toEqual([3, 2]);
  });

  it('as fatias cobrem todos os rivais, sem sobra nem repetição', () => {
    for (const rivals of [2, 3, 4, 5]) {
      const slices = laneSlices(rivals);
      expect(slices.reduce((sum, lane) => sum + lane.count, 0)).toBe(rivals);
      // Cada faixa começa exatamente onde a anterior acabou.
      let cursor = 0;
      for (const lane of slices) {
        expect(lane.start).toBe(cursor);
        cursor += lane.count;
      }
    }
  });
});
