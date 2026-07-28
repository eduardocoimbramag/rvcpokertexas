import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { createId } from '@/shared/lib/ids';
import { SeededRng } from '@/shared/lib/random';

import { COUNTDOWN_START, PROPOSAL_COOLDOWN_SECONDS, TIMINGS } from '../animations/timings';
import type {
  ActParams,
  BeginRoundParams,
  FindMatchParams,
  GameEngine,
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
import { canTransition, createGameStore } from '../store/gameStore';
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

/** Blackjack natural do jogador (21 em duas cartas): paga 3:2. */
const NATURAL_CARDS: { player: [Card, Card]; opponent: [Card, Card] } = {
  player: [card('A'), card('K', 'hearts')],
  opponent: [card('10', 'clubs'), card('7', 'diamonds')],
};

/**
 * Engine determinística instantânea. Recebe um resultado fixo ou uma
 * SEQUÊNCIA (um por partida, já que agora a rodada é única); o último da
 * fila se repete. Por padrão a rodada abre a vez do jogador — com a mão
 * do rival mostrando só a primeira carta — e QUALQUER ação a fecha com o
 * resultado roteirizado. Com `natural: true` a rodada volta resolvida já
 * na distribuição, pulando a vez do jogador.
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

    if (this.natural) {
      return Promise.resolve(this.settledState(params.matchId, outcome, true));
    }

    const cards = CARDS_FOR_OUTCOME[outcome];
    return Promise.resolve({
      matchId: params.matchId,
      phase: 'playerTurn',
      playerHand: [...cards.player],
      // A regra da mesa: a última carta do rival é segredo dele.
      opponentVisible: visibleCards(cards.opponent),
      opponentHidden: 1,
      legalActions: ['hit', 'stand'],
    });
  }

  act(params: ActParams): Promise<BlackjackRoundState> {
    // Qualquer ação fecha a rodada no roteiro do stub.
    return Promise.resolve(this.settledState(params.matchId, this.currentOutcome, false));
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
      payout: payoutFor(outcome, this.lastStake, natural),
      netChange: netChangeFor(outcome, this.lastStake, natural),
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

/** Vez do rival com a mão de 2 cartas do stub: só o piso de "pensar". */
const OPPONENT_TURN_MS = TIMINGS.opponentTurnMinMs;
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
  await vi.advanceTimersByTimeAsync(TIMINGS.dealMs);
}

/** Para na primeira oportunidade e atravessa rival → showdown → desfecho. */
async function standAndSettle(store: TestStore) {
  expect(store.getState().phase).toBe('playerTurn');
  store.getState().stand();
  await vi.advanceTimersByTimeAsync(0); // engine.act resolve num microtask
  await vi.advanceTimersByTimeAsync(TIMINGS.actionResolveMs);
  expect(store.getState().phase).toBe('opponentTurn');

  await vi.advanceTimersByTimeAsync(OPPONENT_TURN_MS);
  expect(store.getState().phase).toBe('settle');

  await vi.advanceTimersByTimeAsync(SHOWDOWN_MS);
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
    // A rodada interativa: distribuição → vez do jogador → vez do rival
    // → showdown; um blackjack natural pula a vez do jogador.
    expect(canTransition('dealing', 'playerTurn')).toBe(true);
    expect(canTransition('dealing', 'opponentTurn')).toBe(true);
    expect(canTransition('playerTurn', 'opponentTurn')).toBe(true);
    expect(canTransition('playerTurn', 'settle')).toBe(false);
    expect(canTransition('opponentTurn', 'settle')).toBe(true);
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
    expect(store.getState().phase).toBe('playerTurn');
    const round = store.getState().round;
    expect(round?.playerHand).toHaveLength(2);
    // Do rival só a primeira carta está na mesa; a outra é segredo dele.
    expect(round?.opponentVisible).toHaveLength(1);
    expect(round?.opponentHidden).toBe(1);
    expect(round?.legalActions).toEqual(['hit', 'stand']);
    // Nada de resultado enquanto o jogador não age.
    expect(store.getState().result).toBeNull();
  });

  it('blackjack natural pula a vez do jogador e paga 3:2', async () => {
    const store = createGameStore({
      engine: new StubEngine('win', { natural: true }),
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 500,
      rng: () => 0.25,
      createNegotiator: acceptAllNegotiator,
    });
    await reachNegotiation(store);
    await agreeAndStart(store, 50);

    // O natural resolve na distribuição: não há decisão a tomar.
    await passDealing(store);
    expect(store.getState().phase).toBe('opponentTurn');
    expect(store.getState().round?.legalActions).toEqual([]);

    await vi.advanceTimersByTimeAsync(OPPONENT_TURN_MS);
    expect(store.getState().phase).toBe('settle');
    await vi.advanceTimersByTimeAsync(SHOWDOWN_MS);

    expect(store.getState().phase).toBe('completed');
    expect(store.getState().result?.playerNatural).toBe(true);
    // 450 + payout(50 natural) = 450 + 50 + 75 = 575.
    expect(store.getState().balance).toBe(575);
    expect(store.getState().history[0]?.netChange).toBe(75);
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
    expect(store.getState().phase).toBe('playerTurn');
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

  it('pedir carta também percorre a engine (o stub fecha a rodada)', async () => {
    const store = createTestStore('win');
    await reachPlayerTurn(store);

    store.getState().hit();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().round?.phase).toBe('settled');
    await vi.advanceTimersByTimeAsync(TIMINGS.actionResolveMs);
    expect(store.getState().phase).toBe('opponentTurn');
  });

  it('a ação em trânsito trava os botões (actionPending)', async () => {
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
    // O resultado já existe no estado (a UI o esconde por fase), mas a
    // mesa ainda percorre os beats do rival antes do veredito.
    expect(store.getState().result).not.toBeNull();
    expect(store.getState().phase).toBe('playerTurn');
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
