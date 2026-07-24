import { create } from 'zustand';

import { appEnv } from '@/shared/config/env';
import { createId } from '@/shared/lib/ids';

import {
  COIN_PICK_SECONDS,
  COUNTDOWN_START,
  HISTORY_LIMIT,
  PROPOSAL_COOLDOWN_SECONDS,
  TIMINGS,
} from '../animations/timings';
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
import { DEFAULT_DICE_COLORS, assignColors, randomDiceColor } from './diceColors';
import type { NegotiationMessage, Negotiator, NegotiatorReply } from './negotiation';
import { BOT_BEATS, NEGOTIATION_INTRO, createBotNegotiator } from './negotiation';

/**
 * Máquina de estados do fluxo de jogo (seção 12 da especificação).
 * Toda mudança de fase passa por `canTransition` — transições fora do
 * mapa são ignoradas, o que torna impossível a UI "pular" etapas.
 *
 * O 1v1 não tem mais seleção prévia de aposta: a busca começa direto da
 * Home e o valor nasce na mesa de negociação (fase `negotiate`), entre
 * a confirmação do duelo e o cara-ou-coroa.
 */
export type GamePhase =
  | 'idle'
  | 'search'
  | 'found'
  | 'confirm'
  | 'negotiate'
  | 'coinflip'
  | 'countdown'
  | 'rolling'
  | 'reveal'
  | 'completed'
  | 'error';

export const PHASE_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  idle: ['search'],
  search: ['found', 'idle', 'error'],
  found: ['confirm'],
  confirm: ['negotiate', 'idle'],
  negotiate: ['coinflip', 'idle', 'error'],
  coinflip: ['countdown', 'error'],
  countdown: ['rolling', 'error'],
  rolling: ['reveal', 'error'],
  reveal: ['completed'],
  completed: ['search', 'idle'],
  error: ['search', 'idle'],
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

/** Proposta viva na mesa de negociação (a última ainda não superada). */
export interface NegotiationProposalRef {
  messageId: string;
  from: 'player' | 'opponent';
  amount: number;
}

/**
 * Mesa de negociação (fase `negotiate`): os dois lados trocam lances no
 * chat até um aceitar o valor do outro. Só o acordo (`agreedStake`)
 * libera o "Iniciar partida"; o débito do stake continua acontecendo
 * apenas na virada para o cara-ou-coroa.
 */
export interface NegotiationState {
  /** Linha do tempo do chat (avisos, falas, propostas e o aperto de mãos). */
  messages: NegotiationMessage[];
  /** Proposta em aberto; `null` sem lance vivo (ou após o acordo). */
  activeProposal: NegotiationProposalRef | null;
  /** Valor acordado; `null` enquanto não há aperto de mãos. */
  agreedStake: number | null;
  /** Segundos até o jogador poder propor de novo (0 = livre). */
  proposalCooldown: number;
  /** O oponente está "digitando" no chat. */
  opponentTyping: boolean;
  /** Beat de início em andamento — trava as ações da mesa. */
  starting: boolean;
}

/** Face da moeda do sorteio pré-partida. */
export type CoinSide = 'cara' | 'coroa';

/**
 * Beats do cara-ou-coroa, na ordem: `intro` apresenta o lado sorteado
 * para o jogador → `toss` (a moeda voa; o resultado já está decidido,
 * mas a UI só o revela no pouso) → `result` mostra a face sorteada →
 * `verdict` dá a tela inteira ao vencedor do sorteio → `pick` (jogador
 * escolhe a cor, sob relógio) OU `botPick` (oponente anuncia a sua) →
 * `picked` (respiro com a escolha aplicada) → countdown.
 */
export type CoinFlipStage = 'intro' | 'toss' | 'result' | 'verdict' | 'pick' | 'botPick' | 'picked';

export interface CoinFlipState {
  /** Lado que a sorte deu ao jogador antes do lançamento. */
  playerSide: CoinSide;
  /** Face em que a moeda cai; decidida no início do voo. */
  result: CoinSide | null;
  winner: 'player' | 'opponent' | null;
  stage: CoinFlipStage;
  /** Cor escolhida pelo vencedor (para as placas de anúncio). */
  chosenColor: DiceColorId | null;
  /** Segundos restantes da escolha do jogador; `null` fora de `pick`. */
  pickSeconds: number | null;
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
  match: Match | null;
  result: RoundResult | null;
  /** Estado da confirmação dupla — a negociação só nasce com os dois `true`. */
  confirmations: MatchConfirmations;
  /** Mesa de negociação da rodada; `null` fora da fase negotiate. */
  negotiation: NegotiationState | null;
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
  /** Oponente aceita qualquer proposta (apenas DevTools; e2e). */
  devNegotiationAutoAccept: boolean;

  /** Busca direta do 1v1 (Home, jogar de novo e tentar de novo). */
  startSearch: () => Promise<void>;
  goHome: () => void;
  cancelSearch: () => void;
  confirmMatch: () => void;
  declineMatch: () => void;
  /** Envia um lance de créditos na mesa de negociação. */
  sendProposal: (amount: number) => void;
  /** Aceita a proposta viva do oponente (fecha o acordo). */
  acceptProposal: () => void;
  /** Acordo fechado: fixa o stake na engine e abre o cara-ou-coroa. */
  startDuel: () => void;
  /** Abandona a mesa de negociação e volta ao menu. */
  abandonNegotiation: () => void;
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
  devSetNegotiationAutoAccept: (enabled: boolean) => void;
  devAddCredits: (amount: number) => void;
  devResetAll: () => void;
}

export interface GameStoreDeps {
  engine?: GameEngine;
  storage?: GameStorageService;
  initialBalance?: number;
  /** Fonte de aleatoriedade do cara-ou-coroa (determinística nos testes). */
  rng?: () => number;
  /** Fábrica da cabeça do oponente na negociação (stub nos testes). */
  createNegotiator?: () => Negotiator;
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
  const createNegotiator = deps.createNegotiator ?? (() => createBotNegotiator(rng));

  /** Cabeça do oponente na mesa corrente (uma por partida). */
  let negotiator: Negotiator | null = null;
  /**
   * Geração das jogadas agendadas do bot: cada nova ação do jogador
   * (proposta, aceite, desistência) incrementa a sequência e as jogadas
   * antigas — cumprimento, contraproposta a um lance já superado —
   * morrem no guard sem efeito.
   */
  let botSeq = 0;

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

    /** Delay "humano" sorteado dentro de uma janela [min, max]. */
    const within = (min: number, max: number): number => min + Math.random() * (max - min);

    /**
     * O oponente simulado confirma sozinho após um delay natural — antes
     * ou depois do jogador, o que dá vida à espera. Guardas de fase e de
     * matchId impedem que um timer de uma partida antiga vaze para outra.
     */
    const scheduleOpponentConfirm = (matchId: string): void => {
      const { opponentConfirmMinMs, opponentConfirmMaxMs } = TIMINGS;
      const delay = within(opponentConfirmMinMs, opponentConfirmMaxMs);
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
     * de "duelo confirmado" respirar, então abre a mesa de negociação.
     * Nada é debitado aqui — o valor ainda vai nascer da conversa.
     * Chamado após CADA confirmação; só age na segunda.
     */
    const startWhenBothConfirmed = (): void => {
      const { confirmations } = get();
      if (!confirmations.player || !confirmations.opponent) return;

      audioManager.playSfx('locked');
      vibrate([30, 40, 60]);
      schedule(() => {
        const { match, phase } = get();
        if (phase !== 'confirm' || !match) return;
        if (!transitionTo('negotiate')) return;
        beginNegotiation(match.id);
      }, TIMINGS.confirmLockInMs);
    };

    /* ---------- Mesa de negociação ---------- */

    /** Ajusta a negociação corrente sem perder o que já foi conversado. */
    const patchNegotiation = (patch: Partial<NegotiationState>): void => {
      const { negotiation } = get();
      if (!negotiation) return;
      set({ negotiation: { ...negotiation, ...patch } });
    };

    const pushNegotiationMessage = (message: NegotiationMessage): void => {
      const { negotiation } = get();
      if (!negotiation) return;
      set({ negotiation: { ...negotiation, messages: [...negotiation.messages, message] } });
    };

    /**
     * Guard das jogadas agendadas do bot: a jogada só vale se ainda for
     * da geração corrente, na mesma partida, com a mesa aberta e sem
     * acordo fechado.
     */
    const botTurnAlive = (matchId: string, seq: number): boolean => {
      const { phase, match, negotiation } = get();
      return (
        seq === botSeq &&
        phase === 'negotiate' &&
        match?.id === matchId &&
        negotiation !== null &&
        negotiation.agreedStake === null &&
        !negotiation.starting
      );
    };

    /** Um lance novo tira o anterior da mesa (fica no chat como "superada"). */
    const supersedeActiveProposal = (): void => {
      const { negotiation } = get();
      if (!negotiation?.activeProposal) return;
      const { messageId } = negotiation.activeProposal;
      set({
        negotiation: {
          ...negotiation,
          activeProposal: null,
          messages: negotiation.messages.map((message) =>
            message.id === messageId ? { ...message, status: 'superseded' as const } : message,
          ),
        },
      });
    };

    /** Lance do oponente, com fala opcional antes da proposta. */
    const botPropose = (amount: number, quip: string | null): void => {
      supersedeActiveProposal();
      const { negotiation } = get();
      if (!negotiation) return;
      const messageId = createId();
      const messages: NegotiationMessage[] = [...negotiation.messages];
      if (quip) messages.push({ id: createId(), author: 'opponent', kind: 'text', text: quip });
      messages.push({
        id: messageId,
        author: 'opponent',
        kind: 'proposal',
        amount,
        status: 'pending',
      });
      set({
        negotiation: {
          ...negotiation,
          opponentTyping: false,
          messages,
          activeProposal: { messageId, from: 'opponent', amount },
        },
      });
      audioManager.playSfx('stake');
      vibrate(20);
    };

    /**
     * Aperto de mãos: sela a proposta viva como o valor do duelo. Vale
     * para os dois sentidos — o bot aceitando o lance do jogador e o
     * jogador aceitando o lance do bot.
     *
     * O chat NÃO ganha mensagem nova: quem anuncia o acordo é o próprio
     * cartão do lance (que recebe o selo "aceita"), o cabeçalho do vidro
     * e o CTA de início destravando. A conversa fica como estava.
     */
    const settleAgreement = (): void => {
      const { negotiation } = get();
      const proposal = negotiation?.activeProposal;
      if (!negotiation || !proposal) return;
      botSeq += 1; // nenhuma jogada pendente do bot sobrevive ao acordo
      set({
        negotiation: {
          ...negotiation,
          opponentTyping: false,
          proposalCooldown: 0,
          agreedStake: proposal.amount,
          activeProposal: null,
          messages: negotiation.messages.map((message) =>
            message.id === proposal.messageId
              ? { ...message, status: 'accepted' as const }
              : message,
          ),
        },
      });
      audioManager.playSfx('locked');
      vibrate([30, 40, 60]);
    };

    /** Relógio de 10 s entre propostas do jogador (anti-spam de lances). */
    const runProposalCooldown = (matchId: string, value: number): void => {
      const { phase, match, negotiation } = get();
      if (phase !== 'negotiate' || match?.id !== matchId || !negotiation) return;
      patchNegotiation({ proposalCooldown: value });
      if (value <= 0) return;
      schedule(() => runProposalCooldown(matchId, value - 1), 1000);
    };

    /** Resposta do bot a um lance do jogador (ler → digitar → decidir). */
    const scheduleBotReply = (matchId: string, amount: number, seq: number): void => {
      schedule(
        () => {
          if (!botTurnAlive(matchId, seq)) return;
          patchNegotiation({ opponentTyping: true });
          schedule(
            () => {
              if (!botTurnAlive(matchId, seq)) return;
              const reply: NegotiatorReply = get().devNegotiationAutoAccept
                ? { action: 'accept' }
                : (negotiator?.respond(amount, { balance: get().balance }) ?? {
                    action: 'accept',
                  });
              if (reply.action === 'accept') {
                settleAgreement();
              } else {
                botPropose(reply.amount, reply.quip);
              }
            },
            within(BOT_BEATS.replyTypingMinMs, BOT_BEATS.replyTypingMaxMs),
          );
        },
        within(BOT_BEATS.replyDelayMinMs, BOT_BEATS.replyDelayMaxMs),
      );
    };

    /**
     * Abre a mesa: aviso do sistema e a abertura do bot em beats de
     * conversa real (cumprimento digitado, pausa, proposta inicial).
     * Se o jogador propuser antes, a geração muda e a abertura morre —
     * o bot passa a responder ao lance dele.
     */
    const beginNegotiation = (matchId: string): void => {
      negotiator = createNegotiator();
      const seq = ++botSeq;
      set({
        negotiation: {
          messages: [{ id: createId(), author: 'system', kind: 'text', text: NEGOTIATION_INTRO }],
          activeProposal: null,
          agreedStake: null,
          proposalCooldown: 0,
          opponentTyping: false,
          starting: false,
        },
      });

      schedule(
        () => {
          if (!botTurnAlive(matchId, seq)) return;
          patchNegotiation({ opponentTyping: true });
          schedule(
            () => {
              if (!botTurnAlive(matchId, seq)) return;
              const opening = negotiator?.opening({ balance: get().balance });
              if (!opening) return;
              patchNegotiation({ opponentTyping: false });
              pushNegotiationMessage({
                id: createId(),
                author: 'opponent',
                kind: 'text',
                text: opening.greeting,
              });
              audioManager.playSfx('tap');
              schedule(
                () => {
                  if (!botTurnAlive(matchId, seq)) return;
                  patchNegotiation({ opponentTyping: true });
                  schedule(
                    () => {
                      if (!botTurnAlive(matchId, seq)) return;
                      botPropose(opening.amount, null);
                    },
                    within(BOT_BEATS.openTypingMinMs, BOT_BEATS.openTypingMaxMs),
                  );
                },
                within(BOT_BEATS.openDelayMinMs, BOT_BEATS.openDelayMaxMs),
              );
            },
            within(BOT_BEATS.greetTypingMinMs, BOT_BEATS.greetTypingMaxMs),
          );
        },
        within(BOT_BEATS.greetDelayMinMs, BOT_BEATS.greetDelayMaxMs),
      );
    };

    /* ---------- Busca e rodada ---------- */

    /**
     * Busca direta (a Home, o "jogar de novo" e o "tentar novamente"
     * caem aqui): sem seleção prévia de valor — a partida abre no stake
     * mínimo e o valor real nasce na negociação.
     */
    const beginSearch = async (): Promise<void> => {
      if (isBroke(get().balance)) return; // sem saldo mínimo não há mesa
      if (!transitionTo('search')) return;
      set({
        match: null,
        result: null,
        error: null,
        confirmations: NO_CONFIRMATIONS,
        negotiation: null,
        coinFlip: null,
        diceColors: DEFAULT_DICE_COLORS,
      });
      audioManager.playSfx('tap');
      audioManager.startMusic();
      searchAbort = new AbortController();
      try {
        const match = await engine.findMatch({ signal: searchAbort.signal });
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
    };

    /** Volta segura ao menu: mata timers, busca e mesa em andamento. */
    const resetToIdle = (): void => {
      clearTimers();
      searchAbort?.abort();
      botSeq += 1;
      negotiator = null;
      if (transitionTo('idle')) {
        set({
          match: null,
          result: null,
          error: null,
          confirmations: NO_CONFIRMATIONS,
          negotiation: null,
          coinFlip: null,
          diceColors: DEFAULT_DICE_COLORS,
        });
      }
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
     * Aplica a cor do jogador e fecha o sorteio. Vale para os dois
     * caminhos — o toque no CONFIRMAR e o sorteio automático do relógio
     * —, então a rodada segue idêntica tenha o jogador escolhido ou não.
     */
    const applyPlayerPick = (color: DiceColorId): void => {
      const { coinFlip } = get();
      if (!coinFlip) return;
      // Só há duas cores: pegar uma entrega a outra ao adversário.
      set({
        diceColors: assignColors('player', color),
        coinFlip: { ...coinFlip, stage: 'picked', chosenColor: color, pickSeconds: null },
      });
      audioManager.playSfx('ready');
      vibrate(30);
      schedule(startCountdownAfterCoin, TIMINGS.coinPickedMs);
    };

    /**
     * Relógio da escolha (10 → 1), no mesmo padrão anti-AFK do início
     * automático do torneio. Zerado sem decisão, a mesa sorteia a cor
     * pelo jogador — a rodada nunca fica parada esperando quem saiu.
     */
    const runPickCountdown = (value: number): void => {
      const { phase, coinFlip } = get();
      if (phase !== 'coinflip' || coinFlip?.stage !== 'pick') return;
      if (value <= 0) {
        applyPlayerPick(randomDiceColor(rng));
        return;
      }
      patchCoinFlip({ pickSeconds: value });
      schedule(() => runPickCountdown(value - 1), 1000);
    };

    /**
     * Cara-ou-coroa pré-partida: sorteia o lado do jogador, lança a
     * moeda (o resultado é decidido no INÍCIO do voo — a animação
     * precisa saber em que face pousar) e dá ao vencedor a escolha da
     * cor dos dados. O jogador escolhe num painel (fase fica em `pick`
     * até `chooseDiceColor` ou o relógio zerar); o oponente simulado
     * escolhe sozinho.
     */
    const runCoinFlip = (): void => {
      const playerSide: CoinSide = rng() < 0.5 ? 'cara' : 'coroa';
      set({
        coinFlip: {
          playerSide,
          result: null,
          winner: null,
          stage: 'intro',
          chosenColor: null,
          pickSeconds: null,
        },
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

          // O veredito toma a tela sozinho por um beat antes de a
          // escolha entrar — o anúncio não divide espaço com os dados.
          schedule(() => {
            if (get().phase !== 'coinflip') return;
            patchCoinFlip({ stage: 'verdict' });

            schedule(() => {
              if (get().phase !== 'coinflip') return;
              if (winner === 'player') {
                // A vez do jogador: a fase espera o chooseDiceColor —
                // ou o relógio zerar e a mesa sortear por ele.
                patchCoinFlip({ stage: 'pick' });
                runPickCountdown(COIN_PICK_SECONDS);
                return;
              }
              const color = randomDiceColor(rng);
              set({ diceColors: assignColors('opponent', color) });
              patchCoinFlip({ stage: 'botPick', chosenColor: color });
              audioManager.playSfx('stake');
              schedule(startCountdownAfterCoin, TIMINGS.coinBotPickMs);
            }, TIMINGS.coinVerdictMs);
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
        // Falha na engine: devolve o stake debitado no início do duelo.
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
      match: null,
      result: null,
      confirmations: NO_CONFIRMATIONS,
      negotiation: null,
      coinFlip: null,
      diceColors: DEFAULT_DICE_COLORS,
      history: persisted?.history ?? [],
      countdown: COUNTDOWN_START,
      error: null,
      settings: persisted?.settings ?? DEFAULT_SETTINGS,
      devForcedOutcome: null,
      devForcedCoinWinner: null,
      devNegotiationAutoAccept: false,

      startSearch: () => beginSearch(),

      goHome: () => {
        resetToIdle();
      },

      cancelSearch: () => {
        if (get().phase !== 'search') return;
        resetToIdle();
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
        resetToIdle();
      },

      sendProposal: (amount) => {
        const { phase, negotiation, match, balance } = get();
        if (phase !== 'negotiate' || !negotiation || !match) return;
        if (negotiation.agreedStake !== null || negotiation.starting) return;
        if (!validateStake(balance, amount).ok) return;

        // Propor exatamente o valor na mesa do oponente é um aperto de
        // mãos — não conta como lance novo (nem entra no cooldown).
        if (
          negotiation.activeProposal?.from === 'opponent' &&
          negotiation.activeProposal.amount === amount
        ) {
          get().acceptProposal();
          return;
        }

        if (negotiation.proposalCooldown > 0) return;

        const seq = ++botSeq; // há lance novo: jogadas antigas do bot caducam
        supersedeActiveProposal();
        const fresh = get().negotiation;
        if (!fresh) return;
        const messageId = createId();
        set({
          negotiation: {
            ...fresh,
            messages: [
              ...fresh.messages,
              { id: messageId, author: 'player', kind: 'proposal', amount, status: 'pending' },
            ],
            activeProposal: { messageId, from: 'player', amount },
            proposalCooldown: PROPOSAL_COOLDOWN_SECONDS,
          },
        });
        audioManager.playSfx('stake');
        vibrate(20);
        schedule(() => runProposalCooldown(match.id, PROPOSAL_COOLDOWN_SECONDS - 1), 1000);
        scheduleBotReply(match.id, amount, seq);
      },

      acceptProposal: () => {
        const { phase, negotiation, balance } = get();
        if (phase !== 'negotiate' || !negotiation || negotiation.starting) return;
        if (negotiation.agreedStake !== null) return;
        const proposal = negotiation.activeProposal;
        if (!proposal || proposal.from !== 'opponent') return;
        if (!validateStake(balance, proposal.amount).ok) return;
        settleAgreement();
      },

      startDuel: () => {
        const { phase, negotiation, match, balance } = get();
        if (phase !== 'negotiate' || !negotiation || !match) return;
        const stake = negotiation.agreedStake;
        if (stake === null || negotiation.starting) return;
        if (!validateStake(balance, stake).ok) {
          failWith('Saldo insuficiente para esta aposta.');
          return;
        }

        botSeq += 1;
        set({ negotiation: { ...negotiation, starting: true, opponentTyping: false } });
        audioManager.playSfx('ready');
        vibrate(30);

        void (async () => {
          try {
            // O valor acordado vira a verdade da engine ANTES do débito:
            // payout e histórico derivam do stake gravado na partida.
            const updated = await engine.setStake({ matchId: match.id, stake });
            if (get().phase !== 'negotiate' || get().match?.id !== match.id) return;
            set({ match: updated });
            schedule(() => {
              const { phase: current, balance: currentBalance } = get();
              if (current !== 'negotiate') return;
              let nextBalance: number;
              try {
                nextBalance = debitStake(currentBalance, stake);
              } catch {
                failWith('Saldo insuficiente para esta aposta.');
                return;
              }
              if (!transitionTo('coinflip')) return;
              set({ balance: nextBalance });
              persist();
              runCoinFlip();
            }, TIMINGS.negotiationStartMs);
          } catch {
            failWith('Não foi possível iniciar a partida. Tente novamente.');
          }
        })();
      },

      abandonNegotiation: () => {
        const { phase, negotiation } = get();
        if (phase !== 'negotiate' || negotiation?.starting) return;
        audioManager.playSfx('tap');
        resetToIdle();
      },

      chooseDiceColor: (color) => {
        const { phase, coinFlip } = get();
        if (phase !== 'coinflip' || coinFlip?.stage !== 'pick') return;
        applyPlayerPick(color);
      },

      playAgain: () => {
        if (get().phase !== 'completed') return;
        void beginSearch();
      },

      dismissError: () => {
        if (get().phase !== 'error') return;
        set({
          error: null,
          match: null,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          negotiation: null,
          coinFlip: null,
          diceColors: DEFAULT_DICE_COLORS,
        });
        // Sem saldo mínimo a nova busca seria inútil: volta ao menu,
        // onde a recarga de créditos mora.
        if (isBroke(get().balance)) {
          transitionTo('idle');
          return;
        }
        void beginSearch();
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

      devSetNegotiationAutoAccept: (enabled) => {
        if (!appEnv.devToolsEnabled) return;
        set({ devNegotiationAutoAccept: enabled });
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
        botSeq += 1;
        negotiator = null;
        storage.clear();
        set({
          phase: 'idle',
          balance: initialBalance,
          match: null,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          negotiation: null,
          coinFlip: null,
          diceColors: DEFAULT_DICE_COLORS,
          history: [],
          countdown: COUNTDOWN_START,
          error: null,
          settings: DEFAULT_SETTINGS,
          devForcedOutcome: null,
          devForcedCoinWinner: null,
          devNegotiationAutoAccept: false,
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
