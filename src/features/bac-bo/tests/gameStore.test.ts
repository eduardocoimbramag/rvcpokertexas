import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { createId } from '@/shared/lib/ids';
import { SeededRng } from '@/shared/lib/random';

import { COUNTDOWN_START, PROPOSAL_COOLDOWN_SECONDS, TIMINGS } from '../animations/timings';
import type {
  BeginRoundParams,
  CommitParams,
  FindMatchParams,
  GameEngine,
  ResolveTurnParams,
  SetStakeParams,
} from '../engine/GameEngine';
import { LocalBlackjackGameEngine } from '../engine/LocalBlackjackGameEngine';
import {
  handValue,
  isBust,
  isNaturalBlackjack,
  netChangeFor,
  payoutFor,
  visibleCards,
} from '../engine/rules';
import type { BlackjackRoundState, Card, Match, RoundOutcome, RoundResult } from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type { PersistedState } from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import { TURN_SECONDS, canTransition, createGameStore } from '../store/gameStore';
import type { Negotiator } from '../store/negotiation';
import { BOT_OPENING_MAX_MS, BOT_REPLY_MAX_MS } from '../store/negotiation';

function card(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { rank, suit };
}

/**
 * Mãos roteirizadas por resultado do duelo direto (sem casa para bater):
 * vence quem chegar mais perto de 21. As mãos são TUPLAS de propósito —
 * o TS sabe que as duas cartas iniciais sempre existem, e é delas que sai
 * a carta oculta do rival.
 */
const CARDS_FOR_OUTCOME: Record<RoundOutcome, { player: [Card, Card]; opponent: [Card, Card] }> = {
  // 19 contra 17: o jogador leva a mesa.
  win: {
    player: [card('10'), card('9', 'hearts')],
    opponent: [card('10', 'clubs'), card('7', 'diamonds')],
  },
  // Espelho: 17 contra 19.
  lose: {
    player: [card('10'), card('7', 'hearts')],
    opponent: [card('10', 'clubs'), card('9', 'diamonds')],
  },
  // Mesmo total: empate devolve a aposta.
  tie: {
    player: [card('10'), card('9', 'hearts')],
    opponent: [card('10', 'clubs'), card('9', 'diamonds')],
  },
};

/** Blackjack natural do jogador (21 em duas cartas). */
const NATURAL_CARDS: { player: [Card, Card]; opponent: [Card, Card] } = {
  player: [card('A'), card('K', 'hearts')],
  opponent: [card('10', 'clubs'), card('7', 'diamonds')],
};

/**
 * Engine determinística instantânea. Recebe um resultado fixo ou uma
 * SEQUÊNCIA (um por partida, já que agora a rodada é única); o último da
 * fila se repete.
 *
 * O roteiro é o mais curto que respeita o contrato: a rodada abre uma
 * janela de escolha (com a mão do rival mostrando só a primeira carta),
 * o `commit` trava a escolha sem mexer na mesa e o `resolveTurn` fecha a
 * rodada no resultado roteirizado. Com `natural: true` a mão do jogador
 * já nasce fechada e a janela abre sem escolha nenhuma para ele.
 */
class StubEngine implements GameEngine {
  private readonly queue: RoundOutcome[];
  private lastStake = 0;
  private readonly natural: boolean;

  constructor(
    outcomes: RoundOutcome | readonly RoundOutcome[],
    options: { natural?: boolean } = {},
  ) {
    this.queue = typeof outcomes === 'string' ? [outcomes] : [...outcomes];
    this.natural = options.natural ?? false;
  }

  private currentOutcome: RoundOutcome = 'win';
  private choice: 'hit' | 'stand' | undefined;

  findMatch(params: FindMatchParams): Promise<Match> {
    this.lastStake = params.stake ?? 10;
    return Promise.resolve({
      id: 'match-1',
      opponent: { id: 'opp-1', name: 'Stub', avatar: 'S', rating: 1000 },
      stake: this.lastStake,
      createdAt: 0,
    });
  }

  setStake(params: SetStakeParams): Promise<Match> {
    this.lastStake = params.stake;
    return Promise.resolve({
      id: params.matchId,
      opponent: { id: 'opp-1', name: 'Stub', avatar: 'S', rating: 1000 },
      stake: params.stake,
      createdAt: 0,
    });
  }

  beginRound(params: BeginRoundParams): Promise<BlackjackRoundState> {
    // Consome a fila partida a partida; o último resultado se repete.
    const outcome = (this.queue.length > 1 ? this.queue.shift() : this.queue[0]) ?? 'win';
    this.currentOutcome = outcome;

    this.choice = undefined;
    const cards = this.natural ? NATURAL_CARDS : CARDS_FOR_OUTCOME[outcome];
    return Promise.resolve({
      matchId: params.matchId,
      phase: 'choosing',
      playerHand: [...cards.player],
      // A regra da mesa: a última carta do rival é segredo dele.
      opponentVisible: visibleCards(cards.opponent),
      opponentHidden: 1,
      // Natural já fecha a sua mão: não sobra escolha nenhuma para você.
      legalActions: this.natural ? [] : ['hit', 'stand'],
      playerClosed: this.natural,
      opponentClosed: false,
    });
  }

  commit(params: CommitParams): Promise<BlackjackRoundState> {
    // Trava a escolha SEM mexer na mesa — como manda o contrato.
    this.choice = params.action;
    const cards = this.natural ? NATURAL_CARDS : CARDS_FOR_OUTCOME[this.currentOutcome];
    return Promise.resolve({
      matchId: params.matchId,
      phase: 'choosing',
      playerHand: [...cards.player],
      opponentVisible: visibleCards(cards.opponent),
      opponentHidden: 1,
      legalActions: [],
      playerChoice: params.action,
      playerClosed: false,
      opponentClosed: false,
    });
  }

  resolveTurn(params: ResolveTurnParams): Promise<BlackjackRoundState> {
    // A primeira vez que fecha já resolve a rodada no roteiro do stub.
    return Promise.resolve(this.settledState(params.matchId, this.currentOutcome, this.natural));
  }

  private settledState(
    matchId: string,
    outcome: RoundOutcome,
    natural: boolean,
  ): BlackjackRoundState {
    const cards = natural ? NATURAL_CARDS : CARDS_FOR_OUTCOME[outcome];
    const playerHand: Card[] = [...cards.player];
    const opponentHand: Card[] = [...cards.opponent];
    const result: RoundResult = {
      id: createId(),
      matchId,
      playerHand,
      opponentHand,
      playerTotal: handValue(playerHand).total,
      opponentTotal: handValue(opponentHand).total,
      playerBust: isBust(playerHand),
      opponentBust: isBust(opponentHand),
      playerNatural: isNaturalBlackjack(playerHand),
      opponentNatural: isNaturalBlackjack(opponentHand),
      outcome,
      stake: this.lastStake,
      payout: payoutFor(outcome, this.lastStake),
      netChange: netChangeFor(outcome, this.lastStake),
      completedAt: 0,
    };
    return {
      matchId,
      phase: 'settled',
      playerHand,
      // Showdown: a mão do rival vira inteira, nada mais escondido.
      opponentVisible: opponentHand,
      opponentHidden: 0,
      legalActions: [],
      lastTurn: {
        player: {
          by: 'player',
          action: this.choice ?? 'stand',
          closed: true,
          bust: false,
          timedOut: this.choice === undefined,
        },
        opponent: { by: 'opponent', action: 'stand', closed: true, bust: false, timedOut: false },
      },
      playerClosed: true,
      opponentClosed: true,
      result,
    };
  }
}

/** Negociador-stub que aceita qualquer lance (fluxo determinístico). */
function acceptAllNegotiator(): Negotiator {
  return {
    opening: () => ({ greeting: 'E aí!', amount: 40 }),
    respond: () => ({ action: 'accept', quip: 'Fechado' }),
  };
}

/** Negociador-stub que sempre contrapropõe +10 (mantém a mesa aberta). */
function counterAllNegotiator(): Negotiator {
  return {
    opening: () => ({ greeting: 'E aí!', amount: 40 }),
    respond: (amount) => ({ action: 'counter', amount: amount + 10, quip: 'Sobe mais' }),
  };
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
  outcomes: RoundOutcome | readonly RoundOutcome[],
  storage = createMemoryStorage(),
  rng: () => number = () => 0.25,
  createNegotiator: () => Negotiator = acceptAllNegotiator,
) {
  return createGameStore({
    engine: new StubEngine(outcomes),
    storage: new GameStorageService(storage),
    initialBalance: 500,
    rng,
    createNegotiator,
  });
}

type TestStore = ReturnType<typeof createTestStore>;

/** Showdown completo: as ocultas viram, o quadro respira, veredito. */
const SHOWDOWN_MS = TIMINGS.revealMs + TIMINGS.settleMs;

/** Da Home até a mesa de negociação (busca + splash + confirmação dupla). */
async function reachNegotiation(store: TestStore) {
  void store.getState().startSearch();
  await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
  expect(store.getState().phase).toBe('confirm');

  store.getState().confirmMatch();
  await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
  expect(store.getState().phase).toBe('negotiate');
}

/** Fecha o acordo no valor dado (stub aceita) e inicia a partida. */
async function agreeAndStart(store: TestStore, stake: number) {
  store.getState().sendProposal(stake);
  await vi.advanceTimersByTimeAsync(BOT_REPLY_MAX_MS);
  expect(store.getState().negotiation?.agreedStake).toBe(stake);

  store.getState().startDuel();
  // setStake resolve num microtask; o beat de início vem em seguida.
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(TIMINGS.negotiationStartMs);
  expect(store.getState().phase).toBe('countdown');
}

/** Countdown falado → distribuição → mesa pronta para a decisão. */
async function passDealing(store: TestStore) {
  await vi.advanceTimersByTimeAsync(TIMINGS.countdownTickMs * COUNTDOWN_START);
  expect(store.getState().phase).toBe('dealing');
  // A distribuição não tem lance a anunciar: a primeira vez abre logo
  // depois das cartas assentarem.
  await vi.advanceTimersByTimeAsync(TIMINGS.dealMs);
}

/**
 * Para na primeira oportunidade e atravessa a vez até o desfecho: você
 * trava a escolha, o rival bate o martelo dele, a vez fecha revelando os
 * dois lances e a mesa vai ao showdown.
 */
async function standAndSettle(store: TestStore) {
  expect(store.getState().phase).toBe('turn');
  store.getState().stand();
  await vi.advanceTimersByTimeAsync(0); // engine.commit resolve num microtask
  // A vez fecha quando o martelo do rival também cair — que pode já ter
  // caído (se ele decidiu antes) ou ainda estar por vir.
  await closeTurn(store);
  await passTurn(store);
  expect(store.getState().phase).toBe('settle');

  await vi.advanceTimersByTimeAsync(SHOWDOWN_MS);
}

/**
 * Espera o rival bater o martelo e a vez fechar na engine. Avança em
 * passos curtos e PARA no instante em que a rodada muda: assim o helper
 * não atropela os beats que vêm depois (revelação, showdown).
 */
async function closeTurn(store: TestStore) {
  const before = store.getState().round;
  for (let step = 0; step < 100; step += 1) {
    const current = store.getState().round;
    // Já mudou (ou a vez nem estava aberta): não há o que esperar.
    if (current !== before || current?.phase === 'settled') break;
    await vi.advanceTimersByTimeAsync(250);
  }
  await vi.advanceTimersByTimeAsync(0); // engine.resolveTurn num microtask
  return store;
}

/** O beat da revelação, ao fim do qual a vez seguinte (ou o showdown) abre. */
async function passTurn(store: TestStore) {
  await vi.advanceTimersByTimeAsync(TIMINGS.turnRevealMs);
  return store;
}

/**
 * Percorre o duelo inteiro (negociação, countdown, rodada única) até o
 * desfecho da partida. A rodada é ÚNICA: não há série a fechar.
 */
async function playUntilCompleted(store: TestStore, stake: number) {
  await reachNegotiation(store);
  await agreeAndStart(store, stake);
  await passDealing(store);
  await standAndSettle(store);
  expect(store.getState().phase).toBe('completed');
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
    expect(canTransition('search', 'found')).toBe(true);
    expect(canTransition('found', 'confirm')).toBe(true);
    expect(canTransition('confirm', 'negotiate')).toBe(true);
    // A mesa de negociação desemboca direto no countdown: não há mais
    // cara-ou-coroa nem escolha de cor entre o acordo e as cartas.
    expect(canTransition('negotiate', 'countdown')).toBe(true);
    expect(canTransition('negotiate', 'idle')).toBe(true);
    expect(canTransition('confirm', 'countdown')).toBe(false);
    expect(canTransition('countdown', 'dealing')).toBe(true);
    // A rodada interativa: distribuição → vez (simultânea, repetindo
    // dentro da própria fase) → showdown. Com os dois naturais na
    // distribuição a mesa vai direto ao showdown.
    expect(canTransition('dealing', 'turn')).toBe(true);
    expect(canTransition('dealing', 'settle')).toBe(true);
    expect(canTransition('turn', 'settle')).toBe(true);
    // A vez se repete DENTRO da fase: não há transição de `turn` para
    // `turn` a declarar.
    expect(canTransition('turn', 'turn')).toBe(false);
    // Rodada única: o showdown só desemboca no fim da partida.
    expect(canTransition('settle', 'completed')).toBe(true);
    expect(canTransition('settle', 'countdown')).toBe(false);
    expect(canTransition('completed', 'search')).toBe(true);
    expect(canTransition('search', 'dealing')).toBe(false);
  });

  it('ações fora de fase são ignoradas', () => {
    const store = createTestStore('win');
    // confirmMatch em idle não faz nada.
    store.getState().confirmMatch();
    expect(store.getState().phase).toBe('idle');
    // Lances e início fora da mesa de negociação não fazem nada.
    store.getState().sendProposal(50);
    store.getState().acceptProposal();
    store.getState().startDuel();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().negotiation).toBeNull();
    // Pedir carta ou parar fora da vez do jogador não faz nada.
    store.getState().hit();
    store.getState().stand();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().round).toBeNull();
    expect(store.getState().actionPending).toBe(false);
  });

  it('sem saldo mínimo, a busca não abre', () => {
    const storage = createMemoryStorage();
    const broke: PersistedState = { balance: 5, history: [], settings: DEFAULT_SETTINGS };
    new GameStorageService(storage).save(broke);

    const store = createTestStore('win', storage);
    void store.getState().startSearch();
    expect(store.getState().phase).toBe('idle');
  });
});

describe('fluxo completo do duelo', () => {
  it('vitória: devolve o stake e credita 90% do ganho uma única vez', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store, 50);

    expect(store.getState().balance).toBe(545);
    expect(store.getState().result?.outcome).toBe('win');
    // Uma partida, UMA entrada no histórico.
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]?.netChange).toBe(45);
    expect(store.getState().history[0]?.opponentName).toBe('Stub');
  });

  it('derrota: o stake negociado é perdido uma única vez', async () => {
    const store = createTestStore('lose');
    await playUntilCompleted(store, 50);

    expect(store.getState().balance).toBe(450);
    expect(store.getState().result?.outcome).toBe('lose');
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]?.netChange).toBe(-50);
  });

  it('empate devolve a aposta e encerra a partida do mesmo jeito', async () => {
    const store = createTestStore('tie');
    await playUntilCompleted(store, 50);

    // Sem re-distribuição: o empate é um desfecho, não um adiamento.
    expect(store.getState().balance).toBe(500);
    expect(store.getState().result?.outcome).toBe('tie');
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]?.netChange).toBe(0);
  });

  it('a distribuição preenche a rodada e abre a vez do jogador', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);
    await agreeAndStart(store, 50);

    await passDealing(store);
    expect(store.getState().phase).toBe('turn');
    const round = store.getState().round;
    expect(round?.playerHand).toHaveLength(2);
    // Do rival só a primeira carta está na mesa; a outra é segredo dele.
    expect(round?.opponentVisible).toHaveLength(1);
    expect(round?.opponentHidden).toBe(1);
    expect(round?.legalActions).toEqual(['hit', 'stand']);
    // Nada de resultado enquanto o jogador não age.
    expect(store.getState().result).toBeNull();
  });

  it('blackjack natural pula a vez do jogador e paga como toda vitória', async () => {
    const store = createGameStore({
      engine: new StubEngine('win', { natural: true }),
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 500,
      rng: () => 0.25,
      createNegotiator: acceptAllNegotiator,
    });
    await reachNegotiation(store);
    await agreeAndStart(store, 50);

    // O natural fecha a sua mão na distribuição: a vez abre sem escolha
    // nenhuma do seu lado, esperando só o martelo do rival.
    await passDealing(store);
    expect(store.getState().phase).toBe('turn');
    expect(store.getState().round?.legalActions).toEqual([]);
    expect(store.getState().turn.seconds).toBe(0);

    await closeTurn(store);
    await passTurn(store);
    expect(store.getState().phase).toBe('settle');
    await vi.advanceTimersByTimeAsync(SHOWDOWN_MS);

    expect(store.getState().phase).toBe('completed');
    expect(store.getState().result?.playerNatural).toBe(true);
    // O natural decide a mão, mas não paga a mais: o pote é fechado.
    // 450 + payout(50) = 450 + 50 + 45 = 545.
    expect(store.getState().balance).toBe(545);
    expect(store.getState().history[0]?.netChange).toBe(45);
  });

  it('o débito só acontece no início da partida, depois do acordo', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);
    expect(store.getState().balance).toBe(500);

    store.getState().sendProposal(100);
    await vi.advanceTimersByTimeAsync(BOT_REPLY_MAX_MS);
    // Acordo fechado, mas nada debitado até o "Iniciar partida".
    expect(store.getState().negotiation?.agreedStake).toBe(100);
    expect(store.getState().balance).toBe(500);

    store.getState().startDuel();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(TIMINGS.negotiationStartMs);
    expect(store.getState().phase).toBe('countdown');
    expect(store.getState().balance).toBe(400);
  });

  it('a distribuição embaralha e a vitória fecha com fanfarra + aplauso', async () => {
    const store = createTestStore('win');
    const played: string[] = [];
    const spy = vi.spyOn(audioManager, 'playSfx').mockImplementation((name) => {
      played.push(name);
    });

    await playUntilCompleted(store, 50);
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
    await playUntilCompleted(losing, 50);
    expect(played).toContain('lose');
    expect(played).not.toContain('applause');

    played.length = 0;
    const tied = createTestStore('tie');
    await playUntilCompleted(tied, 50);
    expect(played).toContain('tie');
    expect(played).not.toContain('applause');
    spy.mockRestore();
  });

  it('o resultado forçado do DevTools vale a rodada e morre com ela', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);
    await agreeAndStart(store, 50);
    // Injetado direto no estado: o setter público é gateado pelo
    // devToolsEnabled, que fica desligado sob teste.
    store.setState({ devForcedOutcome: 'win' });

    await passDealing(store);
    expect(store.getState().devForcedOutcome).toBe('win');

    await standAndSettle(store);
    expect(store.getState().phase).toBe('completed');
    expect(store.getState().devForcedOutcome).toBeNull();
  });

  it('jogar de novo limpa a rodada e abre uma nova busca mantendo o saldo', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store, 50);
    store.getState().playAgain();

    expect(store.getState().phase).toBe('search');
    expect(store.getState().balance).toBe(545);
    expect(store.getState().result).toBeNull();
    expect(store.getState().round).toBeNull();
    expect(store.getState().match).toBeNull();
    expect(store.getState().negotiation).toBeNull();
  });
});

describe('vez do jogador', () => {
  async function reachPlayerTurn(store: TestStore) {
    await reachNegotiation(store);
    await agreeAndStart(store, 50);
    await passDealing(store);
    expect(store.getState().phase).toBe('turn');
  }

  it('parar fecha a mão e a mesa atravessa rival → showdown → desfecho', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);
    await standAndSettle(store);

    expect(store.getState().phase).toBe('completed');
    expect(store.getState().result?.outcome).toBe('win');
    // No showdown a mão do rival está inteira na mesa.
    expect(store.getState().round?.opponentHidden).toBe(0);
  });

  it('travar a escolha não mexe na mesa: a vez só fecha com os dois dentro', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);
    expect(store.getState().turn.seconds).toBe(TURN_SECONDS);

    store.getState().hit();
    await vi.advanceTimersByTimeAsync(0);
    // O martelo caiu do seu lado e a mesa continua parada: sem ações
    // disponíveis, sem revelação, esperando o rival.
    expect(store.getState().round?.playerChoice).toBe('hit');
    expect(store.getState().round?.legalActions).toEqual([]);
    expect(store.getState().reveal).toBeNull();
    expect(store.getState().phase).toBe('turn');

    // Com o martelo dele, a vez fecha e os DOIS lances são revelados.
    await closeTurn(store);
    expect(store.getState().reveal).toMatchObject({
      player: { by: 'player', action: 'hit' },
      opponent: { by: 'opponent' },
    });
  });

  it('o relógio zerado para a sua mão pela mesa (e ninguém estoura por isso)', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);

    // Deixa os 20 s correrem inteiros sem escolher nada.
    await vi.advanceTimersByTimeAsync(TURN_SECONDS * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().reveal?.player).toMatchObject({
      action: 'stand',
      timedOut: true,
      bust: false,
    });
  });

  it('a escolha em trânsito trava os botões (actionPending)', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);
    expect(store.getState().actionPending).toBe(false);

    store.getState().stand();
    // Antes do microtask da engine, a trava está de pé.
    expect(store.getState().actionPending).toBe(true);
    // Uma segunda ação no meio do trânsito não chega à engine.
    store.getState().hit();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().actionPending).toBe(false);
  });

  it('o resultado não vaza antes do showdown: settle é quem exibe', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);

    store.getState().stand();
    await vi.advanceTimersByTimeAsync(0);
    // Travar a escolha não resolve nada: o resultado ainda nem existe.
    expect(store.getState().result).toBeNull();

    await closeTurn(store);
    // A vez fechada traz o resultado — mas o veredito ainda espera o
    // beat da revelação para virar as cartas.
    expect(store.getState().result).not.toBeNull();
    expect(store.getState().phase).toBe('turn');
  });
});

describe('cancelamento e recusa', () => {
  it('cancelar a busca volta ao menu sem debitar', async () => {
    const store = createGameStore({
      engine: new LocalBlackjackGameEngine({
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
    void store.getState().startSearch();
    await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
    expect(store.getState().phase).toBe('confirm');

    store.getState().declineMatch();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().balance).toBe(500);
    expect(store.getState().match).toBeNull();
  });
});

describe('confirmação dupla', () => {
  /** Leva o store até a fase confirm. */
  async function reachConfirm(store: TestStore) {
    void store.getState().startSearch();
    await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
    expect(store.getState().phase).toBe('confirm');
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

    // Com os dois prontos, o lock-in abre a mesa de negociação — sem
    // débito nenhum (o valor ainda vai nascer da conversa).
    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
    expect(store.getState().phase).toBe('negotiate');
    expect(store.getState().balance).toBe(500);
    expect(store.getState().negotiation?.agreedStake).toBeNull();
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

describe('dobra da aposta', () => {
  /** Da Home até a sua vez, com o valor da mesa já debitado. */
  async function reachPlayerTurn(store: TestStore, stake: number) {
    await reachNegotiation(store);
    await agreeAndStart(store, stake);
    await passDealing(store);
    expect(store.getState().phase).toBe('turn');
  }

  /** Resposta do rival: a janela dele + o microtask do setStake. */
  async function waitForAnswer() {
    await vi.advanceTimersByTimeAsync(TIMINGS.doubleAnswerMaxMs);
    await vi.advanceTimersByTimeAsync(0);
  }

  it('rival topa: a mesa passa a valer o dobro e a diferença sai do saldo', async () => {
    // rng 0,25 contra a mesa aberta do stub (só o 10♠): ele aceita.
    const store = createTestStore('win', createMemoryStorage(), () => 0.25);
    await reachPlayerTurn(store, 50);
    expect(store.getState().balance).toBe(450);

    store.getState().requestDouble();
    expect(store.getState().doubleBet).toMatchObject({ status: 'pending', amount: 100 });

    // Enquanto a dobra está no ar a mesa não anda: parar agora fecharia a
    // mão por um valor que ainda está sendo decidido.
    store.getState().stand();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().phase).toBe('turn');

    await waitForAnswer();
    expect(store.getState().doubleBet.status).toBe('accepted');
    expect(store.getState().match?.stake).toBe(100);
    expect(store.getState().balance).toBe(400);

    // A nuvem sai de cena, mas o pedido não volta a existir: uma por mão.
    await vi.advanceTimersByTimeAsync(TIMINGS.doubleAnswerHoldMs);
    expect(store.getState().doubleBet.open).toBe(false);
    store.getState().requestDouble();
    expect(store.getState().doubleBet.status).toBe('accepted');

    // O payout deriva do valor dobrado: 400 + 100 + 90.
    await standAndSettle(store);
    expect(store.getState().result?.stake).toBe(100);
    expect(store.getState().balance).toBe(590);
  });

  it('rival recusa: a mesa segue valendo o mesmo e nada é debitado', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.99);
    await reachPlayerTurn(store, 50);

    store.getState().requestDouble();
    await waitForAnswer();

    expect(store.getState().doubleBet.status).toBe('declined');
    expect(store.getState().match?.stake).toBe(50);
    expect(store.getState().balance).toBe(450);

    await standAndSettle(store);
    expect(store.getState().result?.stake).toBe(50);
    expect(store.getState().balance).toBe(545);
  });

  it('sem saldo para cobrir a diferença o pedido nem sai', async () => {
    const store = createGameStore({
      engine: new StubEngine('win'),
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 90,
      rng: () => 0.25,
      createNegotiator: acceptAllNegotiator,
    });
    await reachPlayerTurn(store, 50);
    expect(store.getState().balance).toBe(40);

    store.getState().requestDouble();
    expect(store.getState().doubleBet.status).toBe('idle');
  });

  it('a dobra só existe na sua vez e morre com a partida', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25);
    await reachNegotiation(store);

    // Fora da vez do jogador não há mão para dobrar.
    store.getState().requestDouble();
    expect(store.getState().doubleBet.status).toBe('idle');

    await agreeAndStart(store, 50);
    await passDealing(store);
    store.getState().requestDouble();
    await waitForAnswer();
    expect(store.getState().doubleBet.status).toBe('accepted');

    await standAndSettle(store);
    void store.getState().startSearch();
    expect(store.getState().doubleBet).toEqual({ status: 'idle', amount: 0, open: false });
  });
});

describe('mesa de negociação', () => {
  it('a proposta do jogador entra no chat e o bot pode aceitá-la', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);

    store.getState().sendProposal(80);
    const negotiation = store.getState().negotiation;
    expect(negotiation?.activeProposal).toMatchObject({ from: 'player', amount: 80 });
    expect(
      negotiation?.messages.filter(
        (message) => message.kind === 'proposal' && message.author === 'player',
      ),
    ).toHaveLength(1);

    const beforeReply = store.getState().negotiation?.messages.length ?? 0;
    await vi.advanceTimersByTimeAsync(BOT_REPLY_MAX_MS);
    const settled = store.getState().negotiation;
    expect(settled?.agreedStake).toBe(80);
    expect(settled?.activeProposal).toBeNull();
    // O lance ganha o selo de aceito e MAIS NADA entra no chat — o
    // acordo não vira mensagem.
    expect(settled?.messages.find((message) => message.kind === 'proposal')?.status).toBe(
      'accepted',
    );
    expect(settled?.messages).toHaveLength(beforeReply);
  });

  it('só uma proposta a cada 10 segundos', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, counterAllNegotiator);
    await reachNegotiation(store);

    store.getState().sendProposal(50);
    expect(store.getState().negotiation?.proposalCooldown).toBe(PROPOSAL_COOLDOWN_SECONDS);

    // Dentro do relógio, lances novos são ignorados.
    await vi.advanceTimersByTimeAsync(4000);
    store.getState().sendProposal(70);
    const playerLances = (state = store.getState()) =>
      state.negotiation?.messages.filter(
        (message) => message.kind === 'proposal' && message.author === 'player',
      ) ?? [];
    expect(playerLances()).toHaveLength(1);

    // Zerado o relógio (o bot contrapôs no meio, sem fechar a mesa),
    // o próximo lance entra normalmente.
    await vi.advanceTimersByTimeAsync(PROPOSAL_COOLDOWN_SECONDS * 1000);
    expect(store.getState().negotiation?.proposalCooldown).toBe(0);
    store.getState().sendProposal(70);
    expect(playerLances()).toHaveLength(2);
  });

  it('um lance novo supera o anterior — só existe uma proposta viva', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, counterAllNegotiator);
    await reachNegotiation(store);

    store.getState().sendProposal(50);
    // O bot contrapõe 60: o lance do jogador sai da mesa como "superado".
    await vi.advanceTimersByTimeAsync(BOT_REPLY_MAX_MS);
    const negotiation = store.getState().negotiation;
    expect(negotiation?.activeProposal).toMatchObject({ from: 'opponent', amount: 60 });
    const playerProposal = negotiation?.messages.find(
      (message) => message.kind === 'proposal' && message.author === 'player',
    );
    expect(playerProposal?.status).toBe('superseded');
  });

  it('aceitar a proposta do oponente fecha o acordo', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, counterAllNegotiator);
    await reachNegotiation(store);

    // A abertura do bot (cumprimento + proposta inicial de 40) chega.
    await vi.advanceTimersByTimeAsync(BOT_OPENING_MAX_MS);
    expect(store.getState().negotiation?.activeProposal).toMatchObject({
      from: 'opponent',
      amount: 40,
    });

    const before = store.getState().negotiation?.messages.length ?? 0;
    store.getState().acceptProposal();
    const settled = store.getState().negotiation;
    expect(settled?.agreedStake).toBe(40);
    expect(settled?.messages).toHaveLength(before);
    expect(settled?.messages.at(-1)?.status).toBe('accepted');
  });

  it('propor o valor exato da proposta viva do oponente é um aceite', async () => {
    const store = createTestStore('win', createMemoryStorage(), () => 0.25, counterAllNegotiator);
    await reachNegotiation(store);
    await vi.advanceTimersByTimeAsync(BOT_OPENING_MAX_MS);

    store.getState().sendProposal(40);
    expect(store.getState().negotiation?.agreedStake).toBe(40);
  });

  it('lances inválidos são ignorados (abaixo do mínimo, acima do saldo, quebrado)', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);

    store.getState().sendProposal(5);
    store.getState().sendProposal(10_000);
    store.getState().sendProposal(50.5);
    expect(
      store.getState().negotiation?.messages.filter((message) => message.kind === 'proposal'),
    ).toHaveLength(0);
    expect(store.getState().negotiation?.activeProposal).toBeNull();
  });

  it('iniciar sem acordo é ignorado; desistir volta ao menu sem rastro', async () => {
    const store = createTestStore('win');
    await reachNegotiation(store);

    store.getState().startDuel();
    expect(store.getState().phase).toBe('negotiate');
    expect(store.getState().balance).toBe(500);

    store.getState().abandonNegotiation();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().negotiation).toBeNull();
    expect(store.getState().match).toBeNull();

    // Nenhum timer residual (resposta do bot, cooldown) ressuscita a mesa.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().balance).toBe(500);
  });
});

describe('persistência', () => {
  it('salva saldo e histórico após a partida e hidrata um novo store', async () => {
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);
    await playUntilCompleted(store, 50);

    const rehydrated = createTestStore('win', storage);
    expect(rehydrated.getState().balance).toBe(545);
    expect(rehydrated.getState().history).toHaveLength(1);
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
    const broke: PersistedState = { balance: 5, history: [], settings: DEFAULT_SETTINGS };
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
