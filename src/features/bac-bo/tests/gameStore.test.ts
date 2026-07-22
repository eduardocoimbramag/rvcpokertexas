import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { COUNTDOWN_START, TIMINGS } from '../animations/timings';
import type { FindMatchParams, GameEngine, PlayRoundParams } from '../engine/GameEngine';
import { LocalBacBoGameEngine } from '../engine/LocalBacBoGameEngine';
import { netChangeFor, payoutFor } from '../engine/rules';
import type { DicePair, Match, RoundOutcome, RoundResult } from '../engine/types';
import type { PersistedState } from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import { canTransition, createGameStore } from '../store/gameStore';

const DICE_FOR_OUTCOME: Record<RoundOutcome, { player: DicePair; opponent: DicePair }> = {
  win: { player: [6, 5], opponent: [2, 3] },
  lose: { player: [2, 3], opponent: [6, 5] },
  tie: { player: [3, 4], opponent: [4, 3] },
};

/** Engine determinística instantânea que sempre produz o resultado dado. */
class StubEngine implements GameEngine {
  private outcome: RoundOutcome;
  private lastStake = 0;

  constructor(outcome: RoundOutcome) {
    this.outcome = outcome;
  }

  findMatch(params: FindMatchParams): Promise<Match> {
    this.lastStake = params.stake;
    return Promise.resolve({
      id: 'match-1',
      opponent: { id: 'opp-1', name: 'Stub', avatar: 'S', rating: 1000 },
      stake: params.stake,
      createdAt: 0,
    });
  }

  playRound(params: PlayRoundParams): Promise<RoundResult> {
    const dice = DICE_FOR_OUTCOME[this.outcome];
    return Promise.resolve({
      id: 'round-1',
      matchId: params.matchId,
      playerDice: dice.player,
      opponentDice: dice.opponent,
      playerTotal: dice.player[0] + dice.player[1],
      opponentTotal: dice.opponent[0] + dice.opponent[1],
      outcome: this.outcome,
      stake: this.lastStake,
      payout: payoutFor(this.outcome, this.lastStake),
      netChange: netChangeFor(this.outcome, this.lastStake),
      completedAt: 0,
    });
  }
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

function createTestStore(outcome: RoundOutcome, storage = createMemoryStorage()) {
  return createGameStore({
    engine: new StubEngine(outcome),
    storage: new GameStorageService(storage),
    initialBalance: 500,
  });
}

/** Percorre o fluxo completo até a fase informada. */
async function playUntilCompleted(store: ReturnType<typeof createTestStore>, stake: number) {
  store.getState().goToStake();
  store.getState().selectStake(stake);
  void store.getState().startSearch();
  await vi.advanceTimersByTimeAsync(0); // resolve findMatch
  expect(store.getState().phase).toBe('found');

  await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
  expect(store.getState().phase).toBe('confirm');

  store.getState().confirmMatch();
  expect(store.getState().confirmations.player).toBe(true);

  // Espera o oponente confirmar (delay aleatório ≤ máximo) + beat de lock-in.
  await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
  expect(store.getState().phase).toBe('countdown');

  await vi.advanceTimersByTimeAsync(TIMINGS.countdownTickMs * COUNTDOWN_START);
  expect(store.getState().phase).toBe('rolling');

  await vi.advanceTimersByTimeAsync(TIMINGS.rollingMs);
  expect(store.getState().phase).toBe('reveal');

  await vi.advanceTimersByTimeAsync(TIMINGS.revealMs);
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
    expect(canTransition('idle', 'stake')).toBe(true);
    expect(canTransition('idle', 'rolling')).toBe(false);
    expect(canTransition('stake', 'countdown')).toBe(false);
    expect(canTransition('countdown', 'rolling')).toBe(true);
    expect(canTransition('reveal', 'completed')).toBe(true);
    expect(canTransition('completed', 'search')).toBe(false);
  });

  it('ações fora de fase são ignoradas', () => {
    const store = createTestStore('win');
    // confirmMatch em idle não faz nada.
    store.getState().confirmMatch();
    expect(store.getState().phase).toBe('idle');
    // selectStake em idle não faz nada.
    store.getState().selectStake(50);
    expect(store.getState().selectedStake).toBeNull();
  });

  it('rejeita stake acima do saldo', () => {
    const store = createTestStore('win');
    store.getState().goToStake();
    store.getState().selectStake(10_000);
    expect(store.getState().selectedStake).toBeNull();
  });
});

describe('fluxo completo da rodada', () => {
  it('vitória: debita o stake e credita o dobro (saldo +stake)', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store, 50);

    expect(store.getState().balance).toBe(550);
    expect(store.getState().result?.outcome).toBe('win');
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]?.netChange).toBe(50);
    expect(store.getState().history[0]?.opponentName).toBe('Stub');
  });

  it('derrota: o stake é perdido', async () => {
    const store = createTestStore('lose');
    await playUntilCompleted(store, 50);

    expect(store.getState().balance).toBe(450);
    expect(store.getState().history[0]?.netChange).toBe(-50);
  });

  it('empate: devolve os créditos (saldo inalterado)', async () => {
    const store = createTestStore('tie');
    await playUntilCompleted(store, 50);

    expect(store.getState().balance).toBe(500);
    expect(store.getState().history[0]?.netChange).toBe(0);
  });

  it('o saldo fica debitado durante a rodada (após ambos confirmarem)', async () => {
    const store = createTestStore('win');
    store.getState().goToStake();
    store.getState().selectStake(100);
    void store.getState().startSearch();
    await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
    store.getState().confirmMatch();

    // Só a confirmação do jogador ainda não debita nada.
    expect(store.getState().balance).toBe(500);

    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
    expect(store.getState().balance).toBe(400);
  });

  it('jogar de novo volta para a seleção de stake mantendo o saldo', async () => {
    const store = createTestStore('win');
    await playUntilCompleted(store, 50);
    store.getState().playAgain();

    expect(store.getState().phase).toBe('stake');
    expect(store.getState().balance).toBe(550);
    expect(store.getState().result).toBeNull();
  });
});

describe('cancelamento e recusa', () => {
  it('cancelar a busca volta ao stake sem debitar', async () => {
    const store = createGameStore({
      engine: new LocalBacBoGameEngine({
        rng: new SeededRng(1),
        matchmakingDelayMs: [1000, 1000],
      }),
      storage: new GameStorageService(createMemoryStorage()),
      initialBalance: 500,
    });

    store.getState().goToStake();
    store.getState().selectStake(50);
    void store.getState().startSearch();
    expect(store.getState().phase).toBe('search');

    store.getState().cancelSearch();
    expect(store.getState().phase).toBe('stake');
    expect(store.getState().balance).toBe(500);

    // Mesmo depois do delay original, a busca cancelada não avança.
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().phase).toBe('stake');
  });

  it('recusar a partida volta ao stake sem debitar', async () => {
    const store = createTestStore('win');
    store.getState().goToStake();
    store.getState().selectStake(50);
    void store.getState().startSearch();
    await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
    expect(store.getState().phase).toBe('confirm');

    store.getState().declineMatch();
    expect(store.getState().phase).toBe('stake');
    expect(store.getState().balance).toBe(500);
    expect(store.getState().match).toBeNull();
  });
});

describe('confirmação dupla', () => {
  /** Leva o store até a fase confirm com stake de 50. */
  async function reachConfirm(store: ReturnType<typeof createTestStore>) {
    store.getState().goToStake();
    store.getState().selectStake(50);
    void store.getState().startSearch();
    await vi.advanceTimersByTimeAsync(TIMINGS.foundSplashMs);
    expect(store.getState().phase).toBe('confirm');
    expect(store.getState().confirmations).toEqual({ player: false, opponent: false });
  }

  it('só a confirmação do jogador não inicia o countdown', async () => {
    const store = createTestStore('win');
    await reachConfirm(store);

    store.getState().confirmMatch();
    // Antes do delay mínimo o oponente garantidamente não confirmou.
    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMinMs - 1);
    expect(store.getState().confirmations).toEqual({ player: true, opponent: false });
    expect(store.getState().phase).toBe('confirm');
    expect(store.getState().balance).toBe(500);

    await vi.advanceTimersByTimeAsync(TIMINGS.opponentConfirmMaxMs + TIMINGS.confirmLockInMs);
    expect(store.getState().phase).toBe('countdown');
    expect(store.getState().balance).toBe(450);
  });

  it('o oponente confirmando primeiro não inicia o duelo nem debita', async () => {
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
    expect(store.getState().phase).toBe('stake');
    expect(store.getState().confirmations).toEqual({ player: false, opponent: false });

    // Nenhum timer residual ressuscita o duelo recusado.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getState().phase).toBe('stake');
    expect(store.getState().balance).toBe(500);
  });
});

describe('persistência', () => {
  it('salva saldo e histórico após a rodada e hidrata um novo store', async () => {
    const storage = createMemoryStorage();
    const store = createTestStore('win', storage);
    await playUntilCompleted(store, 50);

    const rehydrated = createTestStore('win', storage);
    expect(rehydrated.getState().balance).toBe(550);
    expect(rehydrated.getState().history).toHaveLength(1);
  });

  it('estado persistido corrompido cai no estado inicial', () => {
    const storage = createMemoryStorage();
    storage.setItem('bacbo-arena:state', 'lixo{');
    const store = createTestStore('win', storage);
    expect(store.getState().balance).toBe(500);
    expect(store.getState().history).toHaveLength(0);
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

  it('estados persistidos anteriores ao cenário ganham o default "high"', () => {
    const storage = createMemoryStorage();
    // Envelope v1 sem a chave `scenery` (formato antigo).
    storage.setItem(
      'bacbo-arena:state',
      JSON.stringify({
        version: 1,
        state: {
          balance: 800,
          history: [],
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
    expect(store.getState().settings.scenery).toBe('high');
  });
});
