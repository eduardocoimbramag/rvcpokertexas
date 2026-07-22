import { create } from 'zustand';

import { appEnv } from '@/shared/config/env';

import { COUNTDOWN_START, HISTORY_LIMIT, TIMINGS } from '../animations/timings';
import type { GameEngine } from '../engine/GameEngine';
import { GameEngineError } from '../engine/GameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import { creditPayout, debitStake, isBroke, validateStake } from '../engine/credits';
import type { HistoryEntry, Match, RoundOutcome, RoundResult } from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type {
  AudioSettings,
  GameSettings,
  SceneQualitySetting,
} from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import type { DiceColorId, DiceColors } from './diceColors';
import { DEFAULT_DICE_COLORS, assignColors, pickOpponentColor } from './diceColors';

/**
 * Máquina de estados do fluxo de jogo (seção 12 da especificação).
 * Toda mudança de fase passa por `canTransition` — transições fora do
 * mapa são ignoradas, o que torna impossível a UI "pular" etapas.
 */
export type GamePhase =
  | 'idle'
  | 'stake'
  | 'search'
  | 'found'
  | 'confirm'
  | 'coinflip'
  | 'countdown'
  | 'rolling'
  | 'reveal'
  | 'completed'
  | 'error';

export const PHASE_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  idle: ['stake'],
  stake: ['search', 'idle'],
  search: ['found', 'stake', 'error'],
  found: ['confirm'],
  confirm: ['coinflip', 'stake'],
  coinflip: ['countdown', 'error'],
  countdown: ['rolling', 'error'],
  rolling: ['reveal', 'error'],
  reveal: ['completed'],
  completed: ['stake', 'idle'],
  error: ['stake', 'idle'],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

/** Quem já confirmou o duelo na fase Confirm (ambos travam o início). */
export interface MatchConfirmations {
  player: boolean;
  opponent: boolean;
}

const NO_CONFIRMATIONS: MatchConfirmations = { player: false, opponent: false };

/** Face da moeda do sorteio pré-partida. */
export type CoinSide = 'cara' | 'coroa';

/**
 * Beats do cara-ou-coroa, na ordem: `intro` apresenta o lado sorteado
 * para o jogador → `toss` (a moeda voa; o resultado já está decidido,
 * mas a UI só o revela no pouso) → `result` anuncia o vencedor →
 * `pick` (jogador escolhe a cor) OU `botPick` (oponente anuncia a sua)
 * → `picked` (respiro com a escolha aplicada) → countdown.
 */
export type CoinFlipStage = 'intro' | 'toss' | 'result' | 'pick' | 'botPick' | 'picked';

export interface CoinFlipState {
  /** Lado que a sorte deu ao jogador antes do lançamento. */
  playerSide: CoinSide;
  /** Face em que a moeda cai; decidida no início do voo. */
  result: CoinSide | null;
  winner: 'player' | 'opponent' | null;
  stage: CoinFlipStage;
  /** Cor escolhida pelo vencedor (para as placas de anúncio). */
  chosenColor: DiceColorId | null;
}

/** Contagem falada da mesa, no inglês clássico de cassino. */
const COUNTDOWN_WORDS: Record<number, string> = {
  5: 'five',
  4: 'four',
  3: 'three',
  2: 'two',
  1: 'one',
};

export interface GameStoreState {
  phase: GamePhase;
  balance: number;
  selectedStake: number | null;
  match: Match | null;
  result: RoundResult | null;
  /** Estado da confirmação dupla — o countdown só nasce com os dois `true`. */
  confirmations: MatchConfirmations;
  /** Sorteio de cara-ou-coroa da rodada; `null` fora da fase coinflip. */
  coinFlip: CoinFlipState | null;
  /** Cor dos dados de cada lado (o vencedor do sorteio muda a sua). */
  diceColors: DiceColors;
  history: HistoryEntry[];
  /** Valor corrente do countdown (COUNTDOWN_START → 1). */
  countdown: number;
  /** Mensagem de erro amigável quando phase === 'error'. */
  error: string | null;
  settings: GameSettings;
  /** Resultado forçado para a próxima rodada (apenas DevTools). */
  devForcedOutcome: RoundOutcome | null;
  /** Vencedor forçado do cara-ou-coroa (apenas DevTools; e2e). */
  devForcedCoinWinner: 'player' | 'opponent' | null;

  goToStake: () => void;
  goHome: () => void;
  selectStake: (stake: number) => void;
  startSearch: () => Promise<void>;
  cancelSearch: () => void;
  confirmMatch: () => void;
  declineMatch: () => void;
  /** Escolha de cor do vencedor do cara-ou-coroa (fase coinflip/pick). */
  chooseDiceColor: (color: DiceColorId) => void;
  playAgain: () => void;
  dismissError: () => void;
  /** Recarrega créditos quando o saldo não cobre o menor stake. */
  refillCredits: () => void;
  /** Ajusta o saldo por um delta (débito/crédito) e persiste — usado pelo
      buy-in e pelo prêmio do modo Torneio. */
  applyBalanceDelta: (delta: number) => void;
  markTutorialSeen: () => void;
  updateAudioSettings: (patch: Partial<AudioSettings>) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setSceneryQuality: (scenery: SceneQualitySetting) => void;
  devSetForcedOutcome: (outcome: RoundOutcome | null) => void;
  devSetForcedCoinWinner: (winner: 'player' | 'opponent' | null) => void;
  devAddCredits: (amount: number) => void;
  devResetAll: () => void;
}

export interface GameStoreDeps {
  engine?: GameEngine;
  storage?: GameStorageService;
  initialBalance?: number;
  /** Fonte de aleatoriedade do cara-ou-coroa (determinística nos testes). */
  rng?: () => number;
}

/**
 * Cria o store do jogo. Em produção existe uma única instância
 * (`useGameStore`); os testes criam instâncias isoladas injetando
 * engine determinística e storage em memória.
 */
export function createGameStore(deps: GameStoreDeps = {}) {
  const engine =
    deps.engine ??
    createGameEngine({ mode: 'local', local: { allowForcedOutcomes: appEnv.devToolsEnabled } });
  const storage = deps.storage ?? new GameStorageService();
  const initialBalance = deps.initialBalance ?? appEnv.initialBalance;

  const persisted = storage.load();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let searchAbort: AbortController | null = null;
  const rng = deps.rng ?? Math.random;

  const store = create<GameStoreState>()((set, get) => {
    const schedule = (fn: () => void, ms: number): void => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
    };

    const clearTimers = (): void => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };

    const transitionTo = (to: GamePhase): boolean => {
      if (!canTransition(get().phase, to)) return false;
      set({ phase: to });
      return true;
    };

    const persist = (): void => {
      const { balance, history, settings } = get();
      storage.save({ balance, history, settings });
    };

    const vibrate = (pattern: number | number[]): void => {
      if (!get().settings.vibrationEnabled) return;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    };

    const failWith = (message: string): void => {
      clearTimers();
      set({ error: message });
      transitionTo('error');
    };

    /**
     * O oponente simulado confirma sozinho após um delay natural — antes
     * ou depois do jogador, o que dá vida à espera. Guardas de fase e de
     * matchId impedem que um timer de uma partida antiga vaze para outra.
     */
    const scheduleOpponentConfirm = (matchId: string): void => {
      const { opponentConfirmMinMs, opponentConfirmMaxMs } = TIMINGS;
      const delay =
        opponentConfirmMinMs + Math.random() * (opponentConfirmMaxMs - opponentConfirmMinMs);
      schedule(() => {
        const { phase, match, confirmations } = get();
        if (phase !== 'confirm' || match?.id !== matchId || confirmations.opponent) return;
        set({ confirmations: { ...confirmations, opponent: true } });
        audioManager.playSfx('ready');
        startWhenBothConfirmed();
      }, delay);
    };

    /**
     * Com os dois lados prontos, trava o duelo: um beat para a animação
     * de "duelo confirmado" respirar, então debita o stake e abre o
     * cara-ou-coroa. Chamado após CADA confirmação; só age na segunda.
     */
    const startWhenBothConfirmed = (): void => {
      const { confirmations } = get();
      if (!confirmations.player || !confirmations.opponent) return;

      audioManager.playSfx('locked');
      vibrate([30, 40, 60]);
      schedule(() => {
        const { match, balance, phase } = get();
        if (phase !== 'confirm' || !match) return;

        let nextBalance: number;
        try {
          nextBalance = debitStake(balance, match.stake);
        } catch {
          failWith('Saldo insuficiente para esta aposta.');
          return;
        }

        if (!transitionTo('coinflip')) return;
        set({ balance: nextBalance });
        persist();
        runCoinFlip();
      }, TIMINGS.confirmLockInMs);
    };

    /** Ajusta o coinFlip corrente sem perder os campos já decididos. */
    const patchCoinFlip = (patch: Partial<CoinFlipState>): void => {
      const { coinFlip } = get();
      if (!coinFlip) return;
      set({ coinFlip: { ...coinFlip, ...patch } });
    };

    /** Sorteio concluído (cor aplicada): abre o countdown da rodada. */
    const startCountdownAfterCoin = (): void => {
      if (get().phase !== 'coinflip') return;
      if (!transitionTo('countdown')) return;
      runCountdown(COUNTDOWN_START);
    };

    /**
     * Cara-ou-coroa pré-partida: sorteia o lado do jogador, lança a
     * moeda (o resultado é decidido no INÍCIO do voo — a animação
     * precisa saber em que face pousar) e dá ao vencedor a escolha da
     * cor dos dados. O jogador escolhe num painel (fase fica em `pick`
     * até `chooseDiceColor`); o oponente simulado escolhe sozinho.
     */
    const runCoinFlip = (): void => {
      const playerSide: CoinSide = rng() < 0.5 ? 'cara' : 'coroa';
      set({
        coinFlip: { playerSide, result: null, winner: null, stage: 'intro', chosenColor: null },
      });

      schedule(() => {
        if (get().phase !== 'coinflip') return;
        const forced = get().devForcedCoinWinner;
        const result: CoinSide = forced
          ? forced === 'player'
            ? playerSide
            : playerSide === 'cara'
              ? 'coroa'
              : 'cara'
          : rng() < 0.5
            ? 'cara'
            : 'coroa';
        patchCoinFlip({ stage: 'toss', result });
        audioManager.playSfx('coinToss');

        schedule(() => {
          if (get().phase !== 'coinflip') return;
          const winner = result === playerSide ? 'player' : 'opponent';
          patchCoinFlip({ stage: 'result', winner });
          audioManager.playSfx('coinLand');
          vibrate(40);

          schedule(() => {
            if (get().phase !== 'coinflip') return;
            if (winner === 'player') {
              // A vez do jogador: a fase espera o chooseDiceColor.
              patchCoinFlip({ stage: 'pick' });
              return;
            }
            const color = pickOpponentColor(rng);
            set({ diceColors: assignColors('opponent', color) });
            patchCoinFlip({ stage: 'botPick', chosenColor: color });
            audioManager.playSfx('stake');
            schedule(startCountdownAfterCoin, TIMINGS.coinBotPickMs);
          }, TIMINGS.coinResultMs);
        }, TIMINGS.coinTossMs);
      }, TIMINGS.coinIntroMs);
    };

    /** Countdown recursivo e falado: 5 → 4 → 3 → 2 → 1 → rolagem. */
    const runCountdown = (value: number): void => {
      if (value <= 0) {
        audioManager.playSfx('countdownGo');
        if (transitionTo('rolling')) void resolveRound();
        return;
      }
      set({ countdown: value });
      audioManager.playSfx('countdownTick');
      const word = COUNTDOWN_WORDS[value];
      if (word) audioManager.speak(word);
      schedule(() => runCountdown(value - 1), TIMINGS.countdownTickMs);
    };

    const resolveRound = async (): Promise<void> => {
      const { match, devForcedOutcome } = get();
      if (!match) {
        failWith('A partida foi perdida. Seu stake foi devolvido.');
        return;
      }
      audioManager.playSfx('roll');
      try {
        const result = await engine.playRound({
          matchId: match.id,
          forcedOutcome: devForcedOutcome ?? undefined,
        });
        if (get().phase !== 'rolling') return;
        set({ result, devForcedOutcome: null });
        schedule(() => {
          if (!transitionTo('reveal')) return;
          // O som da revelação NÃO sai daqui: quem toca é cada copo, no
          // instante em que para (DiceShaker) — senão só o primeiro dado
          // soaria e os outros três assentariam em silêncio.
          schedule(completeRound, TIMINGS.revealMs);
        }, TIMINGS.rollingMs);
      } catch {
        // Falha na engine: devolve o stake debitado na confirmação.
        set({ balance: creditPayout(get().balance, match.stake) });
        persist();
        failWith('Não foi possível concluir a rodada. Seu stake foi devolvido.');
      }
    };

    const completeRound = (): void => {
      const { result, match, balance, history } = get();
      if (!result || !match || !transitionTo('completed')) return;

      const entry: HistoryEntry = { ...result, opponentName: match.opponent.name };
      set({
        balance: creditPayout(balance, result.payout),
        history: [entry, ...history].slice(0, HISTORY_LIMIT),
      });
      persist();

      audioManager.playSfx(result.outcome);
      const vibrations: Record<RoundOutcome, number | number[]> = {
        win: [40, 60, 40, 60, 120],
        lose: 220,
        tie: [60, 80, 60],
      };
      vibrate(vibrations[result.outcome]);
    };

    return {
      phase: 'idle',
      balance: persisted?.balance ?? initialBalance,
      selectedStake: null,
      match: null,
      result: null,
      confirmations: NO_CONFIRMATIONS,
      coinFlip: null,
      diceColors: DEFAULT_DICE_COLORS,
      history: persisted?.history ?? [],
      countdown: COUNTDOWN_START,
      error: null,
      settings: persisted?.settings ?? DEFAULT_SETTINGS,
      devForcedOutcome: null,
      devForcedCoinWinner: null,

      goToStake: () => {
        if (transitionTo('stake')) {
          set({
            match: null,
            result: null,
            error: null,
            confirmations: NO_CONFIRMATIONS,
            coinFlip: null,
            diceColors: DEFAULT_DICE_COLORS,
          });
          audioManager.playSfx('tap');
          audioManager.startMusic();
        }
      },

      goHome: () => {
        clearTimers();
        searchAbort?.abort();
        if (transitionTo('idle')) {
          set({
            match: null,
            result: null,
            selectedStake: null,
            error: null,
            confirmations: NO_CONFIRMATIONS,
            coinFlip: null,
            diceColors: DEFAULT_DICE_COLORS,
          });
        }
      },

      selectStake: (stake) => {
        if (get().phase !== 'stake') return;
        if (!validateStake(get().balance, stake).ok) return;
        set({ selectedStake: stake });
        audioManager.playSfx('stake');
      },

      startSearch: async () => {
        const { balance, selectedStake } = get();
        if (selectedStake === null || !validateStake(balance, selectedStake).ok) return;
        if (!transitionTo('search')) return;

        audioManager.playSfx('tap');
        searchAbort = new AbortController();
        try {
          const match = await engine.findMatch({
            stake: selectedStake,
            signal: searchAbort.signal,
          });
          if (get().phase !== 'search') return;
          set({ match, confirmations: NO_CONFIRMATIONS });
          if (transitionTo('found')) {
            audioManager.playSfx('found');
            vibrate(60);
            schedule(() => {
              if (transitionTo('confirm')) scheduleOpponentConfirm(match.id);
            }, TIMINGS.foundSplashMs);
          }
        } catch (error) {
          if (error instanceof GameEngineError && error.code === 'aborted') return;
          failWith('Falha ao buscar oponente. Tente novamente.');
        }
      },

      cancelSearch: () => {
        if (get().phase !== 'search') return;
        searchAbort?.abort();
        transitionTo('stake');
      },

      confirmMatch: () => {
        const { match, phase, confirmations } = get();
        if (!match || phase !== 'confirm' || confirmations.player) return;

        set({ confirmations: { ...confirmations, player: true } });
        audioManager.playSfx('ready');
        vibrate(30);
        startWhenBothConfirmed();
      },

      declineMatch: () => {
        const { phase, confirmations } = get();
        // Quem confirmou deu a palavra: só dá para recusar antes disso.
        if (phase !== 'confirm' || confirmations.player) return;
        set({ match: null, confirmations: NO_CONFIRMATIONS });
        transitionTo('stake');
      },

      chooseDiceColor: (color) => {
        const { phase, coinFlip } = get();
        if (phase !== 'coinflip' || coinFlip?.stage !== 'pick') return;
        // Só há duas cores: pegar uma entrega a outra ao adversário.
        set({
          diceColors: assignColors('player', color),
          coinFlip: { ...coinFlip, stage: 'picked', chosenColor: color },
        });
        audioManager.playSfx('ready');
        vibrate(30);
        schedule(startCountdownAfterCoin, TIMINGS.coinPickedMs);
      },

      playAgain: () => {
        if (transitionTo('stake')) {
          set({
            match: null,
            result: null,
            confirmations: NO_CONFIRMATIONS,
            coinFlip: null,
            diceColors: DEFAULT_DICE_COLORS,
          });
          audioManager.playSfx('tap');
        }
      },

      dismissError: () => {
        if (get().phase !== 'error') return;
        set({
          error: null,
          match: null,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          coinFlip: null,
          diceColors: DEFAULT_DICE_COLORS,
        });
        transitionTo('stake');
      },

      refillCredits: () => {
        if (!isBroke(get().balance)) return;
        set({ balance: initialBalance });
        persist();
      },

      applyBalanceDelta: (delta) => {
        set({ balance: Math.max(0, get().balance + delta) });
        persist();
      },

      markTutorialSeen: () => {
        set({ settings: { ...get().settings, tutorialSeen: true } });
        persist();
      },

      updateAudioSettings: (patch) => {
        const settings = get().settings;
        const audio = { ...settings.audio, ...patch };
        set({ settings: { ...settings, audio } });
        audioManager.applySettings(audio);
        persist();
      },

      setVibrationEnabled: (enabled) => {
        set({ settings: { ...get().settings, vibrationEnabled: enabled } });
        persist();
      },

      setSceneryQuality: (scenery) => {
        set({ settings: { ...get().settings, scenery } });
        persist();
      },

      devSetForcedOutcome: (outcome) => {
        if (!appEnv.devToolsEnabled) return;
        set({ devForcedOutcome: outcome });
      },

      devSetForcedCoinWinner: (winner) => {
        if (!appEnv.devToolsEnabled) return;
        set({ devForcedCoinWinner: winner });
      },

      devAddCredits: (amount) => {
        if (!appEnv.devToolsEnabled) return;
        set({ balance: Math.max(0, get().balance + amount) });
        persist();
      },

      devResetAll: () => {
        if (!appEnv.devToolsEnabled) return;
        clearTimers();
        searchAbort?.abort();
        storage.clear();
        set({
          phase: 'idle',
          balance: initialBalance,
          selectedStake: null,
          match: null,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          coinFlip: null,
          diceColors: DEFAULT_DICE_COLORS,
          history: [],
          countdown: COUNTDOWN_START,
          error: null,
          settings: DEFAULT_SETTINGS,
          devForcedOutcome: null,
          devForcedCoinWinner: null,
        });
      },
    };
  });

  // Aplica as configurações de áudio persistidas assim que o store nasce.
  audioManager.applySettings(store.getState().settings.audio);

  return store;
}

/** Instância única do store usada pela aplicação. */
export const useGameStore = createGameStore();
