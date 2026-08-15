import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { createId } from '@/shared/lib/ids';
import { SeededRng } from '@/shared/lib/random';

import { COUNTDOWN_START, TIMINGS } from '../animations/timings';
import type { FindMatchParams, SetStakeParams } from '../engine/GameEngine';
import { LocalPokerEngine } from '../engine/poker/LocalPokerEngine';
import type {
  ActParams,
  AdvanceParams,
  BeginHandParams,
  PokerEngine,
} from '../engine/poker/PokerEngine';
import type {
  PokerAction,
  PokerOutcome,
  PokerResult,
  PokerRoundState,
  PokerSession,
  Street,
} from '../engine/poker/types';
import type { Card, Match } from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type { PersistedState } from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import { TABLE_ANTE } from '../engine/credits';
import {
  ACTION_SECONDS,
  FOLD_HANDOVER_SECONDS,
  HANDOVER_SECONDS,
  SHOW_CARDS_SECONDS,
  canTransition,
  createGameStore,
} from '../store/gameStore';

function card(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { rank, suit };
}

/** Mão do jogador e do rival por desfecho roteirizado do showdown. */
const HOLE_FOR_OUTCOME: Record<PokerOutcome, { player: [Card, Card]; opponent: [Card, Card] }> = {
  // Par de Ases contra par de Reis, no board seco abaixo.
  win: {
    player: [card('A'), card('A', 'hearts')],
    opponent: [card('K', 'diamonds'), card('K', 'clubs')],
  },
  lose: {
    player: [card('K', 'diamonds'), card('K', 'clubs')],
    opponent: [card('A'), card('A', 'hearts')],
  },
  // Mesmo par: as duas mãos leem igual e o pote se divide.
  tie: {
    player: [card('A'), card('A', 'hearts')],
    opponent: [card('A', 'diamonds'), card('A', 'clubs')],
  },
};

/** Board seco: não completa sequência nem naipe para ninguém. */
const BOARD: Card[] = [
  card('2', 'clubs'),
  card('7', 'diamonds'),
  card('9', 'hearts'),
  card('J', 'spades'),
  card('4', 'hearts'),
];

/**
 * Engine de poker determinística e instantânea. Recebe um desfecho fixo
 * ou uma SEQUÊNCIA (um por partida); o último da fila se repete.
 *
 * O roteiro é o MAIS CURTO que exercita o contrato inteiro do
 * `PokerEngine`, e é por isso que ele existe: o store tem de conduzir
 * uma mão de Hold'em (`beginHand` → `act` → `advance` → `act` →
 * showdown) sem saber uma única regra de poker, e é exatamente isso que
 * este stub verifica.
 *
 *   pré-flop, palavra do jogador (ele tem o botão e fala primeiro)
 *     → act(fold)   → mão morta: o rival leva o que estava no pote
 *     → act(call)   → palavra do rival
 *   advance() com a palavra do rival → ele vai de ALL-IN, palavra volta
 *   act(call)                        → os dois com tudo no meio
 *   advance() com a rua fechada      → showdown no desfecho roteirizado
 *
 * O all-in é de propósito: com os dois stacks inteiros no pote, o que
 * está em disputa é o stake cheio — e é aí que a conta de créditos do
 * store fica visível nos testes.
 */
class StubPokerEngine implements PokerEngine {
  private readonly queue: PokerOutcome[];
  private stake = 0;
  /** A MESA entre as mãos: fichas de cada lado, mãos jogadas, se acabou. */
  private stacks = { player: 0, opponent: 0 };
  private handsPlayed = 0;
  private button: 'player' | 'opponent' = 'player';
  private over = false;
  private leftBy: 'player' | undefined;
  private bustedBy: 'player' | 'opponent' | undefined;
  private outcome: PokerOutcome = 'win';
  /** Fichas que cada lado pôs na mão (o stub joga uma rua só). */
  private committed = { player: 0, opponent: 0 };
  private toAct: 'player' | 'opponent' | null = 'player';
  private settled = false;
  /** A mão já foi contabilizada nos stacks (ver `state`). */
  private closed = false;
  private lastMove: PokerRoundState['lastMove'];

  /** O rival CORRE em vez de jogar a vez dele (para o convite de mostrar). */
  private readonly opponentFolds: boolean;
  /** O rival GUARDA a mão dele numa desistência (ver `botShowsHand`). */
  opponentHides = false;

  constructor(outcomes: PokerOutcome | readonly PokerOutcome[], opponentFolds = false) {
    this.queue = typeof outcomes === 'string' ? [outcomes] : [...outcomes];
    this.opponentFolds = opponentFolds;
  }

  findMatch(params: FindMatchParams): Promise<Match> {
    this.stake = params.stake ?? 10;
    this.stacks = { player: this.stake, opponent: this.stake };
    this.handsPlayed = 0;
    this.over = false;
    this.leftBy = undefined;
    return Promise.resolve(this.match('match-1'));
  }

  setStake(params: SetStakeParams): Promise<Match> {
    this.stake = params.stake;
    return Promise.resolve(this.match(params.matchId));
  }

  beginHand(params: BeginHandParams): Promise<PokerRoundState> {
    this.outcome = (this.queue.length > 1 ? this.queue.shift() : this.queue[0]) ?? 'win';
    // Entrada igual dos dois lados, cobrada A CADA mão.
    const ante = Math.min(TABLE_ANTE, this.stacks.player, this.stacks.opponent);
    this.stacks = {
      player: this.stacks.player - ante,
      opponent: this.stacks.opponent - ante,
    };
    this.committed = { player: ante, opponent: ante };
    this.toAct = 'player';
    this.settled = false;
    this.closed = false;
    this.lastMove = undefined;
    return Promise.resolve(this.state(params.matchId));
  }

  act(params: ActParams): Promise<PokerRoundState> {
    if (this.toAct !== 'player') {
      return Promise.reject(new Error('Não é a vez do jogador.'));
    }
    this.apply('player', params.action, params.to, params.timedOut ?? false);
    if (params.action === 'fold') {
      this.settled = true;
      this.toAct = null;
    } else if (this.committed.player >= this.stake) {
      // Cobriu o all-in do rival: não sobrou decisão para ninguém.
      this.toAct = null;
    } else {
      this.toAct = 'opponent';
    }
    return Promise.resolve(this.state(params.matchId));
  }

  leaveTable(): Promise<PokerSession> {
    this.over = true;
    this.leftBy = 'player';
    return Promise.resolve(this.session());
  }

  /** A mesa como ela está entre as mãos. */
  private session(): PokerSession {
    return {
      matchId: 'match-1',
      buyIn: this.stake,
      stacks: { ...this.stacks },
      handsPlayed: this.handsPlayed,
      button: this.button,
      over: this.over,
      ...(this.bustedBy ? { bustedBy: this.bustedBy } : {}),
      ...(this.leftBy ? { leftBy: this.leftBy } : {}),
    };
  }

  advance(params: AdvanceParams): Promise<PokerRoundState> {
    if (this.toAct === 'opponent' && this.opponentFolds) {
      // Ele larga a mão: o pote é do jogador SEM showdown, que é a única
      // situação em que mostrar as cartas é jogada.
      this.apply('opponent', 'fold', undefined, false);
      this.settled = true;
      this.toAct = null;
    } else if (this.toAct === 'opponent') {
      // O rival empurra o stack inteiro e devolve a palavra ao jogador.
      this.apply('opponent', 'raise', this.stake, false);
      this.toAct = 'player';
    } else {
      this.settled = true;
    }
    return Promise.resolve(this.state(params.matchId));
  }

  /** Aplica um lance ao compromisso de um lado. */
  private apply(
    by: 'player' | 'opponent',
    action: PokerAction,
    to: number | undefined,
    timedOut: boolean,
  ): void {
    const other = by === 'player' ? 'opponent' : 'player';
    let amount = 0;
    if (action === 'call') amount = Math.max(0, this.committed[other] - this.committed[by]);
    if (action === 'raise') amount = (to ?? this.committed[by]) - this.committed[by];
    this.committed[by] += amount;
    // A ficha apostada SAI DO STACK: sem isto o montante da mesa cresceria
    // a cada aposta, e a sessão inventaria fichas que ninguém comprou.
    this.stacks[by] -= amount;
    this.lastMove = {
      by,
      action,
      amount,
      to: this.committed[by],
      allIn: this.committed[by] >= this.stake,
      timedOut,
    };
  }

  private match(id: string): Match {
    return {
      id,
      opponent: { id: 'opp-1', name: 'Stub', avatar: 'S', rating: 1000 },
      stake: this.stake,
      createdAt: 0,
    };
  }

  private state(matchId: string): PokerRoundState {
    const hole = HOLE_FOR_OUTCOME[this.outcome];
    const ante = Math.min(TABLE_ANTE, this.stake);
    const contested = Math.min(this.committed.player, this.committed.opponent);
    const folded = this.settled && this.lastMove?.action === 'fold';
    const foldedBy = folded ? this.lastMove?.by : undefined;
    const outcome: PokerOutcome = folded ? (foldedBy === 'player' ? 'lose' : 'win') : this.outcome;

    /* O pote volta para os stacks assim que a mão fecha — é o que faz a
       mesa ser uma SESSÃO e não uma sequência de mãos soltas. Só na
       primeira leitura do estado fechado: `state` é chamado mais de uma
       vez para a mesma mão. */
    if (this.settled && !this.closed) {
      this.closed = true;
      this.handsPlayed += 1;
      const back = {
        player: this.committed.player - contested,
        opponent: this.committed.opponent - contested,
      };
      const pot = contested * 2;
      if (outcome === 'win') back.player += pot;
      else if (outcome === 'lose') back.opponent += pot;
      else {
        back.player += contested;
        back.opponent += contested;
      }
      this.stacks = {
        player: this.stacks.player + back.player,
        opponent: this.stacks.opponent + back.opponent,
      };
      this.button = this.button === 'player' ? 'opponent' : 'player';
      this.bustedBy =
        this.stacks.player < TABLE_ANTE
          ? 'player'
          : this.stacks.opponent < TABLE_ANTE
            ? 'opponent'
            : undefined;
      this.over = this.over || this.bustedBy !== undefined;
    }

    const result: PokerResult | undefined = this.settled
      ? {
          id: createId(),
          matchId,
          playerHole: [...hole.player],
          opponentHole: [...hole.opponent],
          board: folded ? [] : [...BOARD],
          // As duas mãos são lidas SEMPRE — inclusive na desistência, que
          // é o que deixa a mesa mostrar o que cada um tinha.
          playerRank: {
            category: 'pair',
            label: 'Par de Ases',
            detail: 'de Ases',
            cards: folded ? [...hole.player] : BOARD.slice(0, 5),
          },
          opponentRank: {
            category: 'pair',
            label: 'Par de Reis',
            detail: 'de Reis',
            cards: folded ? [...hole.opponent] : BOARD.slice(0, 5),
          },
          showdown: !folded,
          // O rival abre a mão dele por padrão nos testes: o que se cobra
          // aqui é o fluxo da mesa, não o sorteio do que ele mostra.
          opponentShown: !this.opponentHides,
          ...(foldedBy ? { foldedBy } : {}),
          outcome,
          stake: this.stake,
          committed: { ...this.committed },
          contested,
          pot: contested * 2,
          payout: 0,
          netChange: 0,
          session: this.session(),
          completedAt: 0,
        }
      : undefined;

    const toCall =
      this.toAct === 'player' ? Math.max(0, this.committed.opponent - this.committed.player) : 0;

    return {
      matchId,
      street: this.settled && !folded ? 'showdown' : 'preflop',
      phase: this.settled ? 'settled' : 'betting',
      // O jogador tem o botão: primeira palavra no pré-flop (ver firstToAct).
      button: 'player',
      playerHole: [...hole.player],
      // As fechadas do rival só atravessam no showdown — nunca antes, e
      // nunca numa mão morta por desistência.
      opponentHole: this.settled && !folded ? [...hole.opponent] : [],
      board: this.settled && !folded ? [...BOARD] : [],
      stacks: {
        player: this.stake - this.committed.player,
        opponent: this.stake - this.committed.opponent,
      },
      committed: { ...this.committed },
      pot: this.committed.player + this.committed.opponent,
      toCall,
      minRaiseTo: this.committed.opponent + ante,
      maxRaiseTo: this.stake,
      legalActions:
        this.toAct === 'player' ? legalFor(toCall, this.committed.opponent < this.stake) : [],
      toAct: this.toAct,
      // A leitura da mão existe desde a distribuição: no pré-flop são as
      // duas fechadas, do flop em diante a melhor de cinco.
      playerHandLabel: 'Par de Ases',
      session: this.session(),
      ...(this.lastMove ? { lastMove: this.lastMove } : {}),
      ...(result ? { result } : {}),
    };
  }
}

/**
 * As ações legais do stub: as mesmas regras de mesa, em miniatura —
 * desistir só com aposta na frente, aumentar só com quem cubra.
 */
function legalFor(toCall: number, rivalHasChips: boolean): PokerAction[] {
  // CORRER está SEMPRE na mesa: numa sessão, largar a mão custa a entrada
  // que já está no meio (ver `legalActionsFor`).
  const actions: PokerAction[] = toCall > 0 ? ['fold', 'call'] : ['fold', 'check'];
  if (rivalHasChips) actions.push('raise');
  return actions;
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Store isolado: engine roteirizada, storage em memória e saldo de 500. */
function createTestStore(
  outcomes: PokerOutcome | readonly PokerOutcome[],
  storage = createMemoryStorage(),
  rng: () => number = () => 0.25,
  opponentFolds = false,
) {
  return createGameStore({
    engine: new StubPokerEngine(outcomes, opponentFolds),
    storage: new GameStorageService(storage),
    initialBalance: 500,
    rng,
  });
}

type TestStore = ReturnType<typeof createTestStore>;

/**
 * Da confirmação até o countdown: o beat do duelo travado, a
 * apresentação do rival e a HORA DO DUELO. Três beats encadeados, uma
 * constante só — assim nenhum teste precisa saber a coreografia de cor.
 */
const CONFIRM_TO_COUNTDOWN_MS =
  TIMINGS.confirmLockInMs + TIMINGS.foundSplashMs + TIMINGS.duelAnnounceMs;

/**
 * Da Home até a confirmação do duelo. O `advanceTimersByTimeAsync(0)` só
 * drena o microtask do findMatch — avançar tempo aqui deixaria o
 * oponente confirmar sozinho antes de o teste olhar.
 */
async function reachConfirmPhase(store: TestStore) {
  void store.getState().startSearch();
  await vi.advanceTimersByTimeAsync(0);
  expect(store.getState().phase).toBe('confirm');
}

/**
 * Da confirmação até o countdown. Confirmado o duelo pelos dois lados, a
 * mesa abre sozinha: não há mais nada a combinar — a entrada é fixa e o
 * stack saiu do saldo no ato da busca.
 */
async function confirmAndStart(store: TestStore) {
  store.getState().confirmMatch();
  await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs);
  await vi.advanceTimersByTimeAsync(CONFIRM_TO_COUNTDOWN_MS);
  expect(store.getState().phase).toBe('countdown');
}

/** Da Home até o countdown, sem escalas. */
async function reachCountdown(store: TestStore) {
  await reachConfirmPhase(store);
  await confirmAndStart(store);
}

/** Countdown falado → distribuição → pré-flop aberto na sua palavra. */
async function passDealing(store: TestStore) {
  await vi.advanceTimersByTimeAsync(TIMINGS.countdownTickMs * COUNTDOWN_START);
  expect(store.getState().phase).toBe('dealing');
  // As quatro fechadas assentam e o LETREIRO DO PRÉ-FLOP carimba o
  // feltro — a primeira rua é anunciada como qualquer outra, e a palavra
  // só volta ao jogador depois do beat dela.
  await vi.advanceTimersByTimeAsync(TIMINGS.dealMs + TIMINGS.pokerStreetMs);
}

/**
 * Deixa a MESA andar sozinha e para no instante em que a palavra volta
 * para o jogador — ou em que a mão acaba.
 *
 * Avança em passos curtos de propósito: assim o helper não atropela os
 * beats que vêm depois (o anúncio do lance, a rua abrindo, o showdown) e
 * os testes não precisam saber a coreografia da mesa de cor. Enquanto a
 * palavra é sua a mesa não anda sozinha — o relógio de 20 s é o único
 * que a move, e nenhum teste daqui chega perto disso.
 */
async function letTableRun(store: TestStore) {
  for (let step = 0; step < 400; step += 1) {
    const { phase, round, actionPending } = store.getState();
    if (phase !== 'dealing' && phase !== 'betting') break;
    if (phase === 'betting' && !actionPending && round?.toAct === 'player') break;
    await vi.advanceTimersByTimeAsync(50);
  }
  await vi.advanceTimersByTimeAsync(0);
  return store;
}

/** Da mão em andamento até o CAIXA da sessão. */
async function runToCompleted(store: TestStore) {
  for (let step = 0; step < 800 && store.getState().phase !== 'completed'; step += 1) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(store.getState().phase).toBe('completed');
}

/** Da mão em andamento até o beat ENTRE AS MÃOS (a mão fechou). */
async function runToHandover(store: TestStore) {
  for (let step = 0; step < 400 && store.getState().phase !== 'handover'; step += 1) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(store.getState().phase).toBe('handover');
}

/**
 * Corre até o CONVITE DE ABRIR A MÃO entrar.
 *
 * Ele não mora mais no intervalo entre as mãos: entra no instante da
 * desistência, com a mesa congelada em `settle` — nada do desfecho
 * aconteceu ainda. Um helper que esperasse `handover` passaria direto por
 * ele, porque o balão sozinho vence os cinco segundos e a mão fecha.
 */
async function runToShowPrompt(store: TestStore) {
  for (let step = 0; step < 400 && store.getState().showPrompt === null; step += 1) {
    await vi.advanceTimersByTimeAsync(50);
  }
  expect(store.getState().showPrompt).not.toBeNull();
}

/**
 * A LINHA MAIS PASSIVA POSSÍVEL até a mão fechar: passa quando é de
 * graça, paga quando não é. Nunca desiste, nunca aumenta — o que garante
 * chegar ao showdown sem que o teste precise saber quantas palavras a
 * mesa vai dar ao jogador.
 *
 * O "passa quando é de graça" não é detalhe: a entrada da mesa é IGUAL
 * dos dois lados, então a primeira palavra do pré-flop nunca tem aposta
 * na frente — e `call` ali seria um lance ilegal, que a mesa recusa.
 */
async function callDown(store: TestStore) {
  for (let guard = 0; guard < 8; guard += 1) {
    await letTableRun(store);
    const { phase, round } = store.getState();
    if (phase !== 'betting' || round?.toAct !== 'player') break;
    if (round.legalActions.includes('check')) store.getState().check();
    else store.getState().call();
    await vi.advanceTimersByTimeAsync(0); // engine.act resolve num microtask
  }
  await runToCompleted(store);
}

/**
 * Percorre o duelo inteiro (busca, confirmação, countdown, mão única)
 * até o desfecho da partida. A mão é ÚNICA: não há série a fechar.
 *
 * O STACK não é parâmetro: ele sai do saldo no ato da busca (ver
 * `tableStackFor`), e não há mais nada a combinar no caminho.
 */
/** Como o `callDown`, mas parando no beat ENTRE AS MÃOS. */
async function callDownToHandover(store: TestStore) {
  for (let guard = 0; guard < 8; guard += 1) {
    await letTableRun(store);
    const { phase, round } = store.getState();
    if (phase !== 'betting' || round?.toAct !== 'player') break;
    if (round.legalActions.includes('check')) store.getState().check();
    else store.getState().call();
    await vi.advanceTimersByTimeAsync(0);
  }
  await runToHandover(store);
}

async function playUntilCompleted(store: TestStore) {
  await reachCountdown(store);
  await passDealing(store);
  await callDown(store);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('máquina de estados', () => {
  it('só permite transições declaradas', () => {
    expect(canTransition('idle', 'search')).toBe(true);
    expect(canTransition('idle', 'dealing')).toBe(false);
    // A ordem das cenas de abertura: busca → confirmação →
    // APRESENTAÇÃO → countdown. O splash do rival vem depois da
    // confirmação (é lá que ele deixa de ser anônimo), e a busca entrega
    // direto na confirmação.
    expect(canTransition('search', 'confirm')).toBe(true);
    expect(canTransition('search', 'found')).toBe(false);
    expect(canTransition('confirm', 'found')).toBe(true);
    expect(canTransition('found', 'countdown')).toBe(true);
    // Nem pular a apresentação, nem voltar a ela pela porta antiga.
    expect(canTransition('confirm', 'countdown')).toBe(false);
    expect(canTransition('found', 'confirm')).toBe(false);
    expect(canTransition('countdown', 'dealing')).toBe(true);
    // A mão de Hold'em: distribuição → apostas (as quatro ruas correm
    // DENTRO da própria fase) → showdown. Não há atalho da distribuição
    // para o showdown: no Hold'em sempre há pré-flop antes de tudo.
    expect(canTransition('dealing', 'betting')).toBe(true);
    expect(canTransition('dealing', 'settle')).toBe(false);
    expect(canTransition('betting', 'settle')).toBe(true);
    // As ruas se repetem DENTRO da fase: não há transição de `betting`
    // para `betting` a declarar.
    expect(canTransition('betting', 'betting')).toBe(false);
    /* A MESA É UMA SESSÃO: o showdown desemboca no beat entre as mãos, e
       é de lá que sai OUTRA distribuição — ou o caixa, quando alguém
       quebrou ou o jogador se levantou. */
    expect(canTransition('settle', 'handover')).toBe(true);
    expect(canTransition('settle', 'completed')).toBe(false);
    expect(canTransition('handover', 'dealing')).toBe(true);
    expect(canTransition('handover', 'completed')).toBe(true);
    expect(canTransition('handover', 'betting')).toBe(false);
    expect(canTransition('completed', 'search')).toBe(true);
    expect(canTransition('search', 'dealing')).toBe(false);
  });

  it('ações fora de fase são ignoradas', () => {
    const store = createTestStore('win');
    // confirmMatch em idle não faz nada.
    store.getState().confirmMatch();
    expect(store.getState().phase).toBe('idle');
    // Lances de poker fora da sua vez não fazem nada.
    store.getState().fold();
    store.getState().check();
    store.getState().call();
    store.getState().raise(100);
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().round).toBeNull();
    expect(store.getState().actionPending).toBe(false);
  });

  it('sem saldo mínimo, a busca não abre', () => {
    const storage = createMemoryStorage();
    const broke: PersistedState = {
      balance: 5,
      history: [],
      settings: DEFAULT_SETTINGS,
      openTable: null,
    };
    new GameStorageService(storage).save(broke);

    const store = createTestStore('win', storage);
    void store.getState().startSearch();
    expect(store.getState().phase).toBe('idle');
  });
});

describe('fluxo completo da sessão', () => {
  /* O saldo de teste é 500, então o buy-in da mesa é 500 (ver
     `tableStackFor`) e o stub leva os dois ao all-in na primeira mão: um
     dos lados zera, a mesa fecha e o caixa abre. */
  it('lucro na mesa: o caixa credita o buy-in mais 90% do lucro', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store);

    /* Sentou com 500 (debitados), levantou com 1.000. Lucro de 500, dos
       quais a casa fica com 10% — 500 + 450 voltam ao saldo. É a ÚNICA
       vez que a comissão incide: dentro da sessão as fichas só trocam de
       lado (ver `potShareFor`). */
    expect(store.getState().session?.stacks.player).toBe(1000);
    expect(store.getState().balance).toBe(950);
    expect(store.getState().result?.outcome).toBe('win');

    /* UMA MESA, UMA LINHA — e ela nasce no caixa, não a cada mão. O
       balanço da linha é o do SALDO (950 de volta sobre uma compra de
       500), e não o do feltro (+500): a comissão da casa é parte do que
       a mesa fez com você. */
    expect(store.getState().history).toHaveLength(1);
    const linha = store.getState().history[0];
    expect(linha?.kind).toBe('duel');
    expect(linha?.name).toBe('1v1');
    expect(linha?.buyIn).toBe(500);
    expect(linha?.finalStack).toBe(1000);
    expect(linha?.cashedOut).toBe(950);
    expect(linha?.hands).toBe(1);
    // O rival ficou sem fichas para a entrada: a mesa acabou por ela.
    expect(linha?.close).toBe('closed');
    expect(linha?.startedAt).toBeGreaterThan(0);
  });

  it('as mãos da sessão ficam no extrato da MESA, não no da casa', async () => {
    /* Os dois extratos respondem a perguntas diferentes: o da casa diz o
       que cada MESA fez com o saldo, o da mesa em cena diz como se
       chegou ao stack que está na frente. Enquanto a mesa corre, só o
       segundo existe. */
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    expect(store.getState().history).toHaveLength(0);
    expect(store.getState().tableHands).toHaveLength(1);
    expect(store.getState().tableHands[0]?.netChange).toBe(0);
  });

  it('LEVANTAR e QUEBRAR deixam linhas diferentes no extrato', async () => {
    const saiu = createTestStore('tie');
    await reachCountdown(saiu);
    await passDealing(saiu);
    await callDownToHandover(saiu);
    saiu.getState().leaveTable();
    await vi.advanceTimersByTimeAsync(0);
    expect(saiu.getState().history[0]?.close).toBe('left');

    const quebrou = createTestStore('lose');
    await playUntilCompleted(quebrou);
    expect(quebrou.getState().history[0]?.close).toBe('busted');
    // Sem fichas na frente, o caixa não devolve nada.
    expect(quebrou.getState().history[0]?.cashedOut).toBe(0);
  });

  it('quebrar na mesa zera o stack, e o caixa não cobra de quem perdeu', async () => {
    const store = createTestStore('lose');
    await playUntilCompleted(store);

    expect(store.getState().session?.stacks.player).toBe(0);
    expect(store.getState().session?.bustedBy).toBe('player');
    expect(store.getState().balance).toBe(0);
    expect(store.getState().result?.outcome).toBe('lose');
  });

  it('a MESA CONTINUA quando ninguém quebra: o empate distribui de novo', async () => {
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    /* No empate cada um recupera o que pôs, e ninguém fica sem fichas
       para a entrada. Numa mesa de mão única isto era um desfecho; numa
       SESSÃO é só uma mão que passou. */
    expect(store.getState().result?.outcome).toBe('tie');
    expect(store.getState().session?.stacks).toEqual({ player: 500, opponent: 500 });
    expect(store.getState().session?.over).toBe(false);
    // O saldo NÃO se mexe entre as mãos: as fichas ficam no feltro.
    expect(store.getState().balance).toBe(0);

    // E a mesa distribui outra em vez de abrir o caixa.
    await vi.advanceTimersByTimeAsync(HANDOVER_SECONDS * 1000 + TIMINGS.dealMs);
    expect(store.getState().phase).not.toBe('completed');
  });

  it('o BOTÃO PASSA de lado a cada mão', async () => {
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    const primeira = store.getState().round?.button;
    await callDownToHandover(store);

    // Quem abriu a primeira não abre a segunda: a posição se reparte.
    expect(store.getState().session?.button).not.toBe(primeira);
  });

  it('LEVANTAR DA MESA fecha a sessão e abre o caixa', async () => {
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    expect(store.getState().session?.handsPlayed).toBe(1);
    store.getState().leaveTable();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().phase).toBe('completed');
    expect(store.getState().session?.leftBy).toBe('player');
    // Empatou a noite inteira: leva de volta exatamente o que trouxe.
    expect(store.getState().balance).toBe(500);
  });

  it('quando o RIVAL corre, a mesa oferece abrir a mão — com 5 s', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, true);
    await reachCountdown(store);
    await passDealing(store);
    // Passa a palavra: o rival larga a mão em vez de responder.
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    /* O pote foi levado SEM showdown: as cartas iriam para o descarte sem
       que o rival soubesse o que havia nelas. Mostrar é jogada — e é das
       poucas do poker que não custa ficha nenhuma. */
    expect(store.getState().result?.foldedBy).toBe('opponent');
    expect(store.getState().showPrompt?.seconds).toBe(SHOW_CARDS_SECONDS);
    expect(store.getState().showPrompt?.foldedBy).toBe('opponent');
    expect(store.getState().cardsShown).toBe(false);
  });

  it('quando VOCÊ corre, a mesa também oferece abrir a mão', async () => {
    /* Faltava o outro lado: a mesa só perguntava a quem ganhava, como se
       largar a mão não fosse também uma história a contar. Abrir um par
       de Reis largado diz "eu solto mão grande quando a mesa pede". */
    const store = createTestStore('lose');
    await reachCountdown(store);
    await passDealing(store);

    for (let passo = 0; passo < 200; passo += 1) {
      const { phase, round } = store.getState();
      if (phase === 'betting' && round?.toAct === 'player') break;
      await vi.advanceTimersByTimeAsync(50);
    }
    store.getState().fold();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    expect(store.getState().result?.foldedBy).toBe('player');
    expect(store.getState().showPrompt?.foldedBy).toBe('player');
    // Mesmo tempo, mesma pausa: a mesa congela até a resposta.
    expect(store.getState().showPrompt?.seconds).toBe(SHOW_CARDS_SECONDS);
    expect(store.getState().phase).toBe('settle');
  });

  it('quem pediu para LEVANTAR não é convidado a mostrar nada', async () => {
    /* Ele já disse que vai embora: uma pergunta sobre a mão que acabou de
       abrir mão seria uma porta no caminho da saída. */
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);
    await vi.advanceTimersByTimeAsync(HANDOVER_SECONDS * 1000 + TIMINGS.dealMs);
    for (let passo = 0; passo < 200; passo += 1) {
      const { phase, round } = store.getState();
      if (phase === 'betting' && round?.toAct === 'player') break;
      await vi.advanceTimersByTimeAsync(50);
    }

    store.getState().leaveTable();
    for (let passo = 0; passo < 400 && store.getState().phase !== 'completed'; passo += 1) {
      await vi.advanceTimersByTimeAsync(50);
      expect(store.getState().showPrompt).toBeNull();
    }
    expect(store.getState().phase).toBe('completed');
  });

  it('a mesa FECHADA não recebe convite: mostrar não informa mais nada', async () => {
    /* Mostrar a mão é jogada para as PRÓXIMAS mãos. Sem próxima mão, a
       pergunta não decide nada — e ainda segurava o extrato por quase dez
       segundos. */
    const engine = new StubPokerEngine('win', true);
    const store = createGameStore({
      engine,
      storage: new GameStorageService(createMemoryStorage()),
      // Buy-in que não cobre nem duas entradas: a mão que fechar quebra a
      // mesa, e a mesa quebrada não tem próxima mão.
      initialBalance: 150,
      rng: () => 0.25,
    });
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);

    for (let passo = 0; passo < 400 && store.getState().phase !== 'completed'; passo += 1) {
      await vi.advanceTimersByTimeAsync(50);
      expect(store.getState().showPrompt).toBeNull();
    }
    expect(store.getState().session?.over).toBe(true);
  });

  it('quem foi corrido pelo RELÓGIO não é convidado a mostrar nada', async () => {
    /* Ele não largou a mão: o relógio largou por ele, e o motivo mais
       provável é que ele não está olhando a tela. A pergunta afirmaria
       uma decisão que ele não tomou. */
    const store = createTestStore('lose');
    await reachCountdown(store);
    await passDealing(store);
    /* A mesa só CORRE por quem não age quando há aposta na frente — de
       graça ela passa (ver `timeoutAction`). Então é preciso deixar o
       rival apostar antes: passa a palavra, ele vai de all-in, e a
       palavra volta com um preço em cima dela. */
    store.getState().check();
    for (let passo = 0; passo < 200; passo += 1) {
      const { phase, round } = store.getState();
      if (phase === 'betting' && round?.toAct === 'player' && round.toCall > 0) break;
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(store.getState().round?.toCall).toBeGreaterThan(0);

    /* Ninguém toca em nada: os 20 s vencem e a mesa corre a mão. A folga
       cobre o beat do lance do rival, que roda antes de a janela abrir. */
    await vi.advanceTimersByTimeAsync((ACTION_SECONDS + 6) * 1000);
    expect(store.getState().result?.foldedBy).toBe('player');
    expect(store.getState().result?.showdown).toBe(false);
    expect(store.getState().showPrompt).toBeNull();
  });

  it('a plaquinha do lance CALA quando o convite vai entrar em cima dela', async () => {
    /* Os dois nasciam no mesmo instante e diziam a mesma coisa — o
       convite (por cima) cobria a plaquinha, que ficava 1,8 s no ar para
       ninguém. */
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, true);
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    expect(store.getState().announce).toBeNull();
  });

  it('a DESISTÊNCIA tem desfecho e intervalo mais curtos que o showdown', async () => {
    /* Ela não teve comparação: quem correu perdeu por ter largado. Dar a
       ela o mesmo cerimonial de um showdown de river fazia uma mão de UM
       lance custar quase vinte segundos de cena. */
    const engine = new StubPokerEngine('win', true);
    engine.opponentHides = true;
    const store = createGameStore({
      engine,
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 500,
      rng: () => 0.25,
    });
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);
    store.getState().answerShowCards(false);

    /* Sem carta a virar (ele guardou) e sem comparação: o desfecho é só o
       embate comprimido, sem a espera da revelação. */
    await vi.advanceTimersByTimeAsync(TIMINGS.foldSettleMs);
    expect(store.getState().phase).toBe('handover');

    // E o intervalo é a metade: não há duas mãos de cinco cartas a ler.
    expect(store.getState().handoverTotal).toBe(FOLD_HANDOVER_SECONDS);
    expect(store.getState().handoverSeconds).toBe(FOLD_HANDOVER_SECONDS);
  });

  it('o SHOWDOWN mantém o cerimonial inteiro', async () => {
    const store = createTestStore('win');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    expect(store.getState().result?.showdown).toBe(true);
    expect(store.getState().handoverTotal).toBe(HANDOVER_SECONDS);
  });

  it('LEVANTAR sem a palavra na mão NÃO deixa pedido pendurado', async () => {
    /* O pedido de sair era marcado ANTES de a mão ser corrida, e correr
       pode falhar em silêncio. Marcado sem a mão ter corrido, o bilhete
       ficava colado — e fechava a mesa no fim de uma mão seguinte que
       ninguém tinha pedido para deixar. */
    // Empate na primeira: os dois seguem com fichas e há segunda mão.
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);
    await vi.advanceTimersByTimeAsync(HANDOVER_SECONDS * 1000 + TIMINGS.dealMs);

    for (let passo = 0; passo < 200; passo += 1) {
      const { phase, round } = store.getState();
      if (phase === 'betting' && round?.toAct === 'player') break;
      await vi.advanceTimersByTimeAsync(50);
    }
    /* Passa a palavra e tenta levantar com ela do lado do RIVAL: aqui
       `leaveTable` não tem como correr a mão, e portanto não pode marcar
       nada. */
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().round?.toAct).toBe('opponent');

    store.getState().leaveTable();
    await vi.advanceTimersByTimeAsync(0);
    // A mesa segue: o pedido não pegou, e é isso que se cobra.
    expect(store.getState().phase).toBe('betting');

    /* E o bilhete NÃO ficou pendurado: a mão corre até o fim e a mesa
       continua de pé, em vez de fechar sozinha no meio do caminho. */
    await callDownToHandover(store);
    expect(store.getState().phase).toBe('handover');
    expect(store.getState().session?.leftBy).toBeUndefined();
  });

  it('o convite vem ANTES do desfecho, com a mesa congelada', async () => {
    /* A ordem é a coisa toda, e ela já esteve invertida: as cartas
       viravam, o embate rodava, o vencedor era coroado — e só então a
       mesa perguntava se você queria mostrar o que tinha. Perguntar
       depois de mostrar não é perguntar. Agora a mão para em `settle`,
       sem nada do desfecho em cena, e só anda depois da resposta. */
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, true);
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    // A mesa parou no desfecho e NÃO seguiu para o intervalo.
    expect(store.getState().phase).toBe('settle');

    /* E fica parada: o beat do embate (revelação + embate) passa inteiro
       sem que a mão feche, porque ele nem começou — quem o dispara é a
       resposta. */
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs + TIMINGS.settleMs);
    expect(store.getState().phase).toBe('settle');

    // Respondido, o desfecho corre e só então a mão fecha.
    store.getState().answerShowCards(false);
    expect(store.getState().phase).toBe('settle');
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs + TIMINGS.settleMs);
    expect(store.getState().phase).toBe('handover');
  });

  it('o SILÊNCIO vale por "não mostro", e a mesa segue sozinha', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, true);
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    // Cinco segundos sem resposta: as cartas vão para o descarte de
    // bruços, que é o que uma sala de verdade faz com quem não diz nada.
    await vi.advanceTimersByTimeAsync(SHOW_CARDS_SECONDS * 1000);
    expect(store.getState().showPrompt).toBeNull();
    expect(store.getState().cardsShown).toBe(false);

    // E o desfecho corre em seguida, sozinho.
    await vi.advanceTimersByTimeAsync(TIMINGS.revealMs + TIMINGS.settleMs);
    expect(store.getState().phase).toBe('handover');
  });

  it('MOSTRAR abre a mão e a mesa distribui a seguinte', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, true);
    await reachCountdown(store);
    await passDealing(store);
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await runToShowPrompt(store);

    store.getState().answerShowCards(true);
    expect(store.getState().cardsShown).toBe(true);
    expect(store.getState().showPrompt).toBeNull();

    // E o gesto vale AQUELE pote: a mão seguinte volta a ser segredo.
    await vi.advanceTimersByTimeAsync(
      TIMINGS.revealMs + TIMINGS.settleMs + HANDOVER_SECONDS * 1000 + TIMINGS.dealMs,
    );
    expect(store.getState().cardsShown).toBe(false);
  });

  it('LEVANTAR no meio da mão CORRE a mão junto', async () => {
    /* É o que uma sala faz com quem se levanta: a mão é dada por
       perdida, não desfeita — as fichas que já estão no meio ficaram no
       meio. A engine (com razão) não deixa abandonar mão viva, então o
       pedido fica marcado e a mesa o cumpre quando o pote fecha. */
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);
    await vi.advanceTimersByTimeAsync(0);

    // Segunda mão em andamento, com a palavra do jogador na mesa.
    await vi.advanceTimersByTimeAsync(HANDOVER_SECONDS * 1000 + TIMINGS.dealMs);
    for (let passo = 0; passo < 200; passo += 1) {
      const { phase, round } = store.getState();
      if (phase === 'betting' && round?.toAct === 'player') break;
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(store.getState().phase).toBe('betting');
    expect(store.getState().round?.toAct).toBe('player');

    store.getState().leaveTable();
    await vi.advanceTimersByTimeAsync(0);
    for (let passo = 0; passo < 400 && store.getState().phase !== 'completed'; passo += 1) {
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(store.getState().phase).toBe('completed');
    expect(store.getState().result?.foldedBy).toBe('player');
    expect(store.getState().session?.leftBy).toBe('player');
  });

  it('o INTERVALO entre as mãos corre em segundos, com a porta aberta', async () => {
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    // O relógio aparece cheio e desce de um em um.
    expect(store.getState().handoverSeconds).toBe(HANDOVER_SECONDS);
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().handoverSeconds).toBe(HANDOVER_SECONDS - 3);

    /* Zerado, a mesa distribui SOZINHA: uma sessão que exigisse um toque
       a cada mão para continuar seria uma sessão que se joga com o dedo,
       não com a cabeça. */
    await vi.advanceTimersByTimeAsync(HANDOVER_SECONDS * 1000);
    expect(store.getState().phase).not.toBe('handover');
  });

  it('a PRIMEIRA mão é compromisso: não se levanta antes de ela fechar', async () => {
    const store = createTestStore('tie');
    await reachCountdown(store);
    await passDealing(store);

    /* Comprar fichas e sair antes de a primeira mão fechar não é jogar, é
       olhar as cartas — e a entrada dos dois já está no meio. */
    store.getState().leaveTable();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().phase).toBe('betting');
  });

  it('a distribuição abre o pré-flop com a entrada na mesa', async () => {
    const store = createTestStore('win');
    await reachCountdown(store);

    await passDealing(store);
    expect(store.getState().phase).toBe('betting');
    const round = store.getState().round;
    expect(round?.street).toBe('preflop');
    expect(round?.playerHole).toHaveLength(2);
    // Nem uma carta do rival na mesa, e nenhuma comunitária ainda.
    expect(round?.opponentHole).toEqual([]);
    expect(round?.board).toEqual([]);
    // A entrada dos DOIS já está no pote antes de qualquer decisão.
    expect(round?.pot).toBe(TABLE_ANTE * 2);
    expect(round?.committed.player).toBe(TABLE_ANTE);
    expect(round?.committed.opponent).toBe(TABLE_ANTE);
    // Nada de resultado enquanto o jogador não age.
    expect(store.getState().result).toBeNull();
  });

  it('o letreiro anuncia o PRÉ-FLOP, e não só as ruas do meio', async () => {
    const store = createTestStore('win');
    await reachCountdown(store);
    await vi.advanceTimersByTimeAsync(TIMINGS.countdownTickMs * COUNTDOWN_START);

    /* A mesa é publicada em `round` antes de as fechadas voarem, e essa
       antecipação já engoliu o letreiro do pré-flop uma vez: o condutor
       comparava a rua nova com a do estado anterior e via a mesma rua
       duas vezes. Quem manda no letreiro é o que foi ANUNCIADO. */
    await vi.advanceTimersByTimeAsync(TIMINGS.dealMs);
    expect(store.getState().streetAnnounce).toBe('preflop');

    // E ele sai do feltro sozinho, sem prender a mão.
    await vi.advanceTimersByTimeAsync(TIMINGS.streetAnnounceMs);
    expect(store.getState().streetAnnounce).toBeNull();
  });

  it('cada rua nova é carimbada uma vez só, do pré-flop ao showdown', async () => {
    const store = createTestStore('win');
    const vistas: string[] = [];
    const parar = store.subscribe((state) => {
      const rua = state.streetAnnounce;
      if (rua && vistas[vistas.length - 1] !== rua) vistas.push(rua);
    });

    await playUntilCompleted(store);
    parar();

    // A ordem é a da mão, e nenhuma rua se repete: um letreiro que
    // piscasse duas vezes na mesma rua diria que algo novo aconteceu.
    expect(vistas).toEqual([...new Set(vistas)]);
    expect(vistas[0]).toBe('preflop');
    expect(vistas.length).toBeGreaterThan(1);
  });

  it('a mesa só muda DEPOIS que o letreiro da rua sai', async () => {
    const store = createTestStore('win');

    /* Fotografa, a cada letreiro que sobe, qual rua a MESA ainda está
       mostrando. Uma assinatura vale mais que um laço aqui: ela não pode
       atravessar o beat de um salto nem depender de quanto tempo cada
       passo do teste avança. */
    const anuncios: { anunciada: Street; mesa: Street }[] = [];
    const parar = store.subscribe((state) => {
      const rua = state.streetAnnounce;
      if (!rua || !state.round) return;
      if (anuncios[anuncios.length - 1]?.anunciada === rua) return;
      anuncios.push({ anunciada: rua, mesa: state.round.street });
    });

    await playUntilCompleted(store);
    parar();

    expect(anuncios.length).toBeGreaterThan(1);
    // O pré-flop é a exceção: a mesa já está nele quando ele é anunciado
    // (as fechadas voaram antes, na distribuição).
    expect(anuncios[0]).toEqual({ anunciada: 'preflop', mesa: 'preflop' });

    /* Em todas as outras, a mesa ainda é a rua ANTERIOR enquanto o
       letreiro está no ar. Virar as cartas aqui as esconderia por trás
       do desfoque — e a virada é o acontecimento que a rua É. */
    for (const anuncio of anuncios.slice(1)) {
      expect(anuncio.mesa).not.toBe(anuncio.anunciada);
    }
  });

  it('desistir entrega o pote e custa só o que já estava na mesa', async () => {
    const store = createTestStore('win');
    await reachCountdown(store);
    await passDealing(store);
    expect(store.getState().phase).toBe('betting');

    // Desistir só existe com aposta na frente: passa a primeira palavra
    // e deixa o rival empurrar.
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await letTableRun(store);

    // A entrada é tudo o que ele pôs: correr não põe mais nenhuma ficha
    // no pote, e o resto do stack fica no feltro para a mão seguinte.
    store.getState().fold();
    await vi.advanceTimersByTimeAsync(0);
    await runToHandover(store);

    expect(store.getState().result?.outcome).toBe('lose');
    expect(store.getState().result?.showdown).toBe(false);
    expect(store.getState().result?.foldedBy).toBe('player');
    expect(store.getState().result?.contested).toBe(TABLE_ANTE);
    /* CORRER custa a entrada e nada mais — e é por isso que ele existe
       numa sessão: largar a mão guarda as outras 400 fichas. A MESA
       CONTINUA: ninguém ficou sem fichas para a entrada seguinte. */
    expect(store.getState().session?.stacks.player).toBe(500 - TABLE_ANTE);
    expect(store.getState().session?.over).toBe(false);
  });

  it('o showdown abre as duas mãos e paga sobre o que foi disputado', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store);

    const result = store.getState().result;
    expect(result?.showdown).toBe(true);
    // Os dois foram com tudo: o disputado é o stack inteiro.
    expect(result?.contested).toBe(500);
    expect(store.getState().round?.opponentHole).toHaveLength(2);
  });

  it('o STACK sai do saldo só na virada para o countdown', async () => {
    const store = createTestStore('win');
    await reachConfirmPhase(store);
    // A partida já nasce sabendo quanto vale — e nada saiu do bolso.
    expect(store.getState().match?.stake).toBe(500);
    expect(store.getState().balance).toBe(500);

    store.getState().confirmMatch();
    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs);
    // Confirmado, mas a apresentação ainda corre: o débito não caiu.
    expect(store.getState().balance).toBe(500);

    await vi.advanceTimersByTimeAsync(CONFIRM_TO_COUNTDOWN_MS);
    expect(store.getState().phase).toBe('countdown');
    // Comprar fichas para sentar custa o stack inteiro; o que não for
    // apostado volta no fim da mão.
    expect(store.getState().balance).toBe(0);
  });

  it('a distribuição embaralha e a vitória fecha com fanfarra + aplauso', async () => {
    const store = createTestStore('win');
    const played: string[] = [];
    const spy = vi.spyOn(audioManager, 'playSfx').mockImplementation((name) => {
      played.push(name);
    });

    await playUntilCompleted(store);
    expect(played).toContain('shuffle');
    // Vitória: fanfarra E a ovação, como efeitos separados.
    expect(played).toContain('win');
    expect(played).toContain('applause');
    spy.mockRestore();
  });

  it('derrota fecha sem aplauso e o empate toca o aviso próprio', async () => {
    const played: string[] = [];
    const spy = vi.spyOn(audioManager, 'playSfx').mockImplementation((name) => {
      played.push(name);
    });

    const losing = createTestStore('lose');
    await playUntilCompleted(losing);
    expect(played).toContain('lose');
    expect(played).not.toContain('applause');

    played.length = 0;
    const tied = createTestStore('tie');
    await reachCountdown(tied);
    await passDealing(tied);
    // O empate não quebra ninguém: a sessão segue, e o aviso é da MÃO.
    await callDownToHandover(tied);
    expect(played).toContain('tie');
    expect(played).not.toContain('applause');
    spy.mockRestore();
  });

  it('o resultado forçado do DevTools vale a rodada e morre com ela', async () => {
    const store = createTestStore('win');
    await reachCountdown(store);
    // Injetado direto no estado: o setter público é gateado pelo
    // devToolsEnabled, que fica desligado sob teste.
    store.setState({ devForcedDeal: 'win' });

    await passDealing(store);
    expect(store.getState().devForcedDeal).toBe('win');

    await callDown(store);
    expect(store.getState().devForcedDeal).toBeNull();
  });

  it('jogar de novo limpa a rodada e abre uma nova busca mantendo o saldo', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store);
    store.getState().playAgain();

    expect(store.getState().phase).toBe('search');
    expect(store.getState().balance).toBe(950);
    expect(store.getState().result).toBeNull();
    expect(store.getState().round).toBeNull();
  });
});

describe('a sua vez de apostar', () => {
  async function reachPlayerTurn(store: TestStore) {
    await reachCountdown(store);
    await passDealing(store);
    expect(store.getState().phase).toBe('betting');
    return store;
  }

  it('passar move a mesa: o rival responde e a palavra volta', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    // A janela abriu e o relógio está correndo.
    expect(store.getState().actionClock.open).toBe(true);
    expect(store.getState().actionClock.seconds).toBeGreaterThan(0);

    // Entrada igual dos dois lados: no pré-flop não há o que pagar, e o
    // lance de graça é passar.
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    // O lance é seu e a mesa o anuncia; o relógio da sua vez morre aqui.
    expect(store.getState().round?.lastMove).toMatchObject({ by: 'player', action: 'check' });
    expect(store.getState().actionClock.seconds).toBe(0);

    // A mesa anda sozinha: o rival joga a vez dele e a palavra volta.
    await letTableRun(store);
    expect(store.getState().round?.lastMove?.by).toBe('opponent');
    expect(store.getState().round?.toAct).toBe('player');
  });

  it('o lance do rival é anunciado por um beat e sai de cena', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await letTableRun(store);

    expect(store.getState().announce).toMatchObject({ by: 'opponent', action: 'raise' });
    await vi.advanceTimersByTimeAsync(TIMINGS.moveHoldMs);
    expect(store.getState().announce).toBeNull();
  });

  it('o relógio zerado joga por você: passa quando o lance é de graça', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    // Deixa os 20 s correrem inteiros sem decidir nada. Sem aposta na
    // frente, o lance seguro é seguir de graça — jogar a mão fora ali
    // seria a mesa jogando fora uma mão que não custava nada manter.
    await vi.advanceTimersByTimeAsync(ACTION_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().round?.lastMove).toMatchObject({
      by: 'player',
      action: 'check',
      timedOut: true,
    });
  });

  it('o relógio zerado DESISTE quando há aposta na frente', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    // Passa a primeira palavra; o rival empurra tudo e a palavra volta
    // com uma aposta na frente. Agora o lance seguro é jogar fora.
    store.getState().check();
    await vi.advanceTimersByTimeAsync(0);
    await letTableRun(store);
    expect(store.getState().round?.toCall).toBeGreaterThan(0);

    /* O relógio só começa quando a JANELA abre, e ela abre um beat depois
       de o lance do rival ser anunciado (ver ActionClock.open). Contar só
       os 20 s a partir daqui pararia o teste um beat antes de o relógio
       zerar. */
    await vi.advanceTimersByTimeAsync(TIMINGS.pokerMoveMs + ACTION_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(0);
    // A mesa jogou por ele, e o lance seguro com aposta na frente é
    // jogar a mão fora.
    expect(store.getState().result?.foldedBy).toBe('player');
  });

  it('o lance em trânsito trava a barra (actionPending)', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    expect(store.getState().actionPending).toBe(false);

    store.getState().check();
    // Antes do microtask da engine, a trava está de pé.
    expect(store.getState().actionPending).toBe(true);
    // Um segundo lance no meio do trânsito não chega à engine.
    store.getState().raise(500);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().actionPending).toBe(false);
    expect(store.getState().round?.lastMove?.action).toBe('check');
  });

  it('um lance ilegal não chega à engine', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    // Sem aposta na frente não há o que pagar. (CORRER, sim: numa sessão
    // largar a mão custa a entrada que já está no meio.)
    expect(store.getState().round?.legalActions).not.toContain('call');

    store.getState().call();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().round?.lastMove).toBeUndefined();
    expect(store.getState().phase).toBe('betting');
  });

  it('aumentar leva o total da rua ao valor pedido', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));
    const target = store.getState().round?.minRaiseTo ?? 0;
    expect(target).toBeGreaterThan(0);

    store.getState().raise(target);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().round?.lastMove).toMatchObject({ action: 'raise', to: target });
    expect(store.getState().round?.committed.player).toBe(target);
  });

  it('o resultado não vaza antes do showdown: settle é quem exibe', async () => {
    const store = await reachPlayerTurn(createTestStore('win'));

    store.getState().call();
    await vi.advanceTimersByTimeAsync(0);
    // O pote ainda está em disputa: não há resultado nenhum a mostrar.
    expect(store.getState().result).toBeNull();
    expect(store.getState().round?.opponentHole).toEqual([]);
  });
});

describe('cancelamento e recusa', () => {
  it('cancelar a busca volta ao menu sem debitar', async () => {
    const store = createGameStore({
      engine: new LocalPokerEngine({
        rng: new SeededRng(1),
        matchmakingDelayMs: [1000, 1000],
      }),
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 500,
    });

    void store.getState().startSearch();
    expect(store.getState().phase).toBe('search');

    store.getState().cancelSearch();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().balance).toBe(500);

    // Mesmo depois do delay original, a busca cancelada não avança.
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().phase).toBe('idle');
  });

  it('recusar a partida volta ao menu sem debitar', async () => {
    const store = createTestStore('win');
    await reachConfirmPhase(store);

    store.getState().declineMatch();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().balance).toBe(500);
    expect(store.getState().match).toBeNull();
  });
});

describe('confirmação dupla', () => {
  /** Leva o store até a fase confirm, com os dois assentos ainda vazios. */
  async function reachConfirm(store: TestStore) {
    await reachConfirmPhase(store);
    expect(store.getState().confirmations).toEqual({ player: false, opponent: false });
  }

  it('só a confirmação do jogador não abre a negociação', async () => {
    const store = createTestStore('win');
    await reachConfirm(store);

    store.getState().confirmMatch();
    // Antes do delay mínimo o oponente garantidamente não confirmou.
    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMinMs - 1);
    expect(store.getState().confirmations).toEqual({ player: true, opponent: false });
    expect(store.getState().phase).toBe('confirm');

    // Com os dois prontos, o lock-in leva à APRESENTAÇÃO do rival — e
    // ainda sem débito nenhum: comprar as fichas é o último ato antes
    // das cartas.
    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
    expect(store.getState().phase).toBe('found');
    expect(store.getState().balance).toBe(500);
  });

  it('o oponente confirmando primeiro não abre a mesa nem debita', async () => {
    const store = createTestStore('win');
    await reachConfirm(store);

    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs);
    expect(store.getState().confirmations).toEqual({ player: false, opponent: true });
    expect(store.getState().phase).toBe('confirm');
    expect(store.getState().balance).toBe(500);
  });

  it('depois de confirmar, o jogador não consegue mais recusar', async () => {
    const store = createTestStore('win');
    await reachConfirm(store);

    store.getState().confirmMatch();
    store.getState().declineMatch();
    expect(store.getState().phase).toBe('confirm');
    expect(store.getState().match).not.toBeNull();
  });

  it('recusar após o oponente confirmar cancela o duelo sem efeitos tardios', async () => {
    const store = createTestStore('win');
    await reachConfirm(store);

    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs);
    store.getState().declineMatch();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().confirmations).toEqual({ player: false, opponent: false });

    // Nenhum timer residual ressuscita o duelo recusado.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().balance).toBe(500);
  });
});

describe('persistência', () => {
  it('salva saldo e histórico após a partida e hidrata um novo store', async () => {
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);
    await playUntilCompleted(store);

    const rehydrated = createTestStore('win', storage);
    expect(rehydrated.getState().balance).toBe(950);
    expect(rehydrated.getState().history).toHaveLength(1);
  });

  it('a mesa ABANDONADA é liquidada no carregamento seguinte', async () => {
    /* O buy-in sai do saldo no instante em que a pessoa senta, e a mesa
       vivia SÓ NA MEMÓRIA: um F5, uma aba descartada pelo sistema, uma
       ligação que bloqueia a tela — e os créditos sumiam. Tinham saído do
       saldo e não voltavam nunca. */
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);
    await reachCountdown(store);
    await passDealing(store);

    // Sentou: o saldo já foi debitado e a mesa está de pé.
    expect(store.getState().balance).toBe(0);
    expect(store.getState().phase).toBe('betting');

    /* O aparelho descarta a aba aqui. Nasce um store novo sobre o mesmo
       armazenamento — que é exatamente o que um F5 faz. */
    const afterReload = createTestStore('win', storage);
    // O dinheiro voltou: a mesa nunca foi fechada, então é liquidada.
    expect(afterReload.getState().balance).toBe(500);

    /* E ELA VIRA LINHA NO EXTRATO. O saldo voltar sem registro nenhum
       deixava um buraco na leitura da noite; a linha diz o que houve —
       `abandoned`, e não "você levantou", que seria a mesa inventando
       uma decisão que ninguém tomou. */
    const linha = afterReload.getState().history[0];
    expect(linha?.close).toBe('abandoned');
    expect(linha?.name).toBe('1v1');
    expect(linha?.buyIn).toBe(500);

    // E o canhoto foi rasgado: recarregar de novo não paga duas vezes.
    const afterSecondReload = createTestStore('win', storage);
    expect(afterSecondReload.getState().balance).toBe(500);
    expect(afterSecondReload.getState().history).toHaveLength(1);
  });

  it('a liquidação paga o ÚLTIMO PLACAR, não o buy-in cheio', async () => {
    /* Devolver o buy-in inteiro pagaria a quem estivesse perdendo para
       recarregar a página: o F5 viraria um botão de desfazer. */
    const storage = createMemoryStorage();
    const store = createTestStore('lose', storage);
    await reachCountdown(store);
    await passDealing(store);
    await callDownToHandover(store);

    // Perdeu a mão: o montante na frente dele encolheu.
    const stack = store.getState().session?.stacks.player ?? -1;
    expect(stack).toBeLessThan(500);

    const afterReload = createTestStore('lose', storage);
    expect(afterReload.getState().balance).toBe(stack);
  });

  it('a mesa fechada pelo caminho normal não deixa canhoto', async () => {
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);
    await playUntilCompleted(store);
    const saldo = store.getState().balance;

    // Nada a liquidar: o caixa já foi feito.
    const afterReload = createTestStore('win', storage);
    expect(afterReload.getState().balance).toBe(saldo);
  });

  it('estado persistido corrompido cai no estado inicial', () => {
    const storage = createMemoryStorage();
    storage.setItem('bacbo-arena:state', 'lixo{');
    const store = createTestStore('win', storage);
    expect(store.getState().balance).toBe(500);
    expect(store.getState().history).toHaveLength(0);
  });

  it('estado v1 (Bac Bo) migra preservando saldo e descartando o histórico de dados', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'bacbo-arena:state',
      JSON.stringify({
        version: 1,
        state: {
          balance: 800,
          history: [
            {
              id: 'r1',
              matchId: 'm1',
              playerDice: [6, 5],
              opponentDice: [2, 3],
              playerTotal: 11,
              opponentTotal: 5,
              outcome: 'win',
              stake: 50,
              payout: 95,
              netChange: 45,
              completedAt: 0,
              opponentName: 'Luna',
            },
          ],
          settings: {
            audio: { muted: false, musicVolume: 0.4, sfxVolume: 0.8 },
            vibrationEnabled: true,
            tutorialSeen: true,
          },
        },
      }),
    );

    const store = createTestStore('win', storage);
    expect(store.getState().balance).toBe(800);
    expect(store.getState().history).toHaveLength(0);
    expect(store.getState().settings.tutorialSeen).toBe(true);
    expect(store.getState().settings.scenery).toBe('high');
  });
});

describe('recarga de créditos', () => {
  it('recarrega apenas quando o saldo não cobre o menor stake', () => {
    const storage = createMemoryStorage();
    const broke: PersistedState = {
      balance: 5,
      history: [],
      settings: DEFAULT_SETTINGS,
      openTable: null,
    };
    new GameStorageService(storage).save(broke);

    const store = createTestStore('win', storage);
    expect(store.getState().balance).toBe(5);

    store.getState().refillCredits();
    expect(store.getState().balance).toBe(500);

    // Com saldo suficiente, a recarga é ignorada.
    store.getState().refillCredits();
    expect(store.getState().balance).toBe(500);
  });
});

describe('configurações', () => {
  it('persiste tutorialSeen, áudio, vibração e cenário', () => {
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);

    store.getState().markTutorialSeen();
    store.getState().updateAudioSettings({ muted: true, sfxVolume: 0.2 });
    store.getState().setVibrationEnabled(false);
    store.getState().setSceneryQuality('low');

    const rehydrated = createTestStore('win', storage);
    const settings = rehydrated.getState().settings;
    expect(settings.tutorialSeen).toBe(true);
    expect(settings.audio.muted).toBe(true);
    expect(settings.audio.sfxVolume).toBe(0.2);
    expect(settings.vibrationEnabled).toBe(false);
    expect(settings.scenery).toBe('low');
  });
});
