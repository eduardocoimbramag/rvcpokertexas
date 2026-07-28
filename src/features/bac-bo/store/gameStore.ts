import { create } from 'zustand';

import { appEnv } from '@/shared/config/env';
import { createId } from '@/shared/lib/ids';

import {
  COUNTDOWN_START,
  HISTORY_LIMIT,
  PROPOSAL_COOLDOWN_SECONDS,
  TIMINGS,
} from '../animations/timings';
import type { GameEngine } from '../engine/GameEngine';
import { GameEngineError } from '../engine/GameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import { creditPayout, debitStake, isBroke, validateStake } from '../engine/credits';
import { doubleAcceptChance, handValue, visibleCards } from '../engine/rules';
import type {
  BlackjackRoundState,
  HistoryEntry,
  Match,
  PlayerAction,
  RoundOutcome,
  RoundResult,
  TableMove,
} from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type {
  AudioSettings,
  GameSettings,
  SceneQualitySetting,
} from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import type { NegotiationMessage, Negotiator, NegotiatorReply } from './negotiation';
import { BOT_BEATS, NEGOTIATION_INTRO, createBotNegotiator } from './negotiation';

/**
 * Máquina de estados do fluxo de jogo (seção 12 da especificação).
 * Toda mudança de fase passa por `canTransition` — transições fora do
 * mapa são ignoradas, o que torna impossível a UI "pular" etapas.
 *
 * O 1v1 não tem seleção prévia de aposta: a busca começa direto da Home
 * e o valor nasce na mesa de negociação (fase `negotiate`), entre a
 * confirmação do duelo e o countdown.
 *
 * O duelo é uma RODADA ÚNICA de 21 contra o adversário — sem casa para
 * bater e sem série: countdown → dealing (as cartas saem do baralho) →
 * playerTurn ⇄ opponentTurn (a mesa ALTERNA um lance de cada lado, e
 * cada lance é anunciado antes de a vez trocar) → settle (showdown: as
 * ocultas viram e as mãos se comparam) → completed. Quem fecha a mão
 * sai do rodízio e o outro segue sozinho. Empate devolve a aposta e
 * encerra a partida do mesmo jeito.
 */
export type GamePhase =
  | 'idle'
  | 'search'
  | 'found'
  | 'confirm'
  | 'negotiate'
  | 'countdown'
  | 'dealing'
  | 'playerTurn'
  | 'opponentTurn'
  | 'settle'
  | 'completed'
  | 'error';

export const PHASE_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  idle: ['search'],
  search: ['found', 'idle', 'error'],
  found: ['confirm'],
  confirm: ['negotiate', 'idle'],
  negotiate: ['countdown', 'idle', 'error'],
  countdown: ['dealing', 'error'],
  // Um blackjack natural na distribuição pula a vez de quem o recebeu —
  // com os dois naturais a mesa vai direto ao showdown.
  dealing: ['playerTurn', 'opponentTurn', 'settle', 'error'],
  // O rodízio anda nos dois sentidos: cada lado joga um lance por vez
  // até fechar a mão, e quem fecha primeiro devolve a vez ao outro.
  playerTurn: ['opponentTurn', 'settle', 'error'],
  opponentTurn: ['playerTurn', 'settle', 'error'],
  settle: ['completed'],
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
 * apenas na virada para o countdown.
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

/**
 * Pedido de dobra da aposta no meio da mão (só o 1v1 tem).
 *
 * O jogador propõe dobrar o valor que está na mesa; o rival aceita ou
 * recusa — a dobra só existe com os DOIS de acordo, como o stake que
 * nasceu na negociação. Aceita, o novo valor vira a verdade da engine
 * (payout e histórico derivam dele) e a diferença sai do saldo na hora.
 *
 * `status` é o estado do pedido NA RODADA: 'idle' é ninguém tendo
 * pedido ainda — é ele que libera o botão, e por isso a resposta (aceita
 * ou recusada) não volta para 'idle': cada mão admite um pedido só.
 * `open` governa apenas a nuvem em cena, que sai um beat depois.
 */
export type DoubleBetStatus = 'idle' | 'pending' | 'accepted' | 'declined';

export interface DoubleBetState {
  status: DoubleBetStatus;
  /** Valor que a mesa passa a valer se o rival topar (o dobro do stake). */
  amount: number;
  /** A nuvem do pedido está em cena. */
  open: boolean;
}

const NO_DOUBLE_BET: DoubleBetState = { status: 'idle', amount: 0, open: false };

/**
 * O lance que a mesa está ANUNCIANDO. O `id` é o que faz um "pediu
 * carta" seguido de outro igual entrar em cena duas vezes: sem ele a
 * animação não teria como saber que houve um lance novo.
 */
export interface TableAnnouncement extends TableMove {
  id: string;
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
  /** Rodada interativa corrente (mãos visíveis); `null` fora da rodada. */
  round: BlackjackRoundState | null;
  /** Ação do jogador em trânsito na engine — trava os botões da vez. */
  actionPending: boolean;
  result: RoundResult | null;
  /** Estado da confirmação dupla — a negociação só nasce com os dois `true`. */
  confirmations: MatchConfirmations;
  /** Mesa de negociação da partida; `null` fora da fase negotiate. */
  negotiation: NegotiationState | null;
  /** Pedido de dobra da rodada corrente (um por mão). */
  doubleBet: DoubleBetState;
  /** Lance sendo anunciado pela mesa; `null` entre um lance e outro. */
  announcement: TableAnnouncement | null;
  history: HistoryEntry[];
  /** Valor corrente do countdown (COUNTDOWN_START → 1). */
  countdown: number;
  /** Mensagem de erro amigável quando phase === 'error'. */
  error: string | null;
  settings: GameSettings;
  /** Resultado forçado para a rodada (apenas DevTools). */
  devForcedOutcome: RoundOutcome | null;
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
  /** Acordo fechado: fixa o stake na engine e abre o countdown. */
  startDuel: () => void;
  /** Abandona a mesa de negociação e volta ao menu. */
  abandonNegotiation: () => void;
  /** Pede mais uma carta (fase playerTurn). */
  hit: () => void;
  /** Para com a mão atual (fase playerTurn). */
  stand: () => void;
  /** Propõe ao rival dobrar a aposta que está na mesa (fase playerTurn). */
  requestDouble: () => void;
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
  devSetNegotiationAutoAccept: (enabled: boolean) => void;
  devAddCredits: (amount: number) => void;
  devResetAll: () => void;
}

export interface GameStoreDeps {
  engine?: GameEngine;
  storage?: GameStorageService;
  initialBalance?: number;
  /** Fábrica da cabeça do oponente na negociação (stub nos testes). */
  createNegotiator?: () => Negotiator;
  /** Fonte de aleatoriedade da negociação (determinística nos testes). */
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
        round: null,
        actionPending: false,
        result: null,
        error: null,
        confirmations: NO_CONFIRMATIONS,
        negotiation: null,
        doubleBet: NO_DOUBLE_BET,
        announcement: null,
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
      // A transição é validada ANTES de qualquer efeito: chamada fora de
      // hora (ex.: no meio da rodada, quando idle é ilegal) precisa ser
      // um no-op DE VERDADE — matar os timers que movem a fase adiante e
      // depois falhar a transição deixaria o jogo preso para sempre.
      if (!transitionTo('idle')) return;
      clearTimers();
      searchAbort?.abort();
      botSeq += 1;
      negotiator = null;
      set({
        match: null,
        round: null,
        actionPending: false,
        result: null,
        error: null,
        confirmations: NO_CONFIRMATIONS,
        negotiation: null,
        doubleBet: NO_DOUBLE_BET,
        announcement: null,
      });
    };

    /** Countdown recursivo e falado: 5 → 4 → 3 → 2 → 1 → distribuição. */
    const runCountdown = (value: number): void => {
      if (value <= 0) {
        audioManager.playSfx('countdownGo');
        if (transitionTo('dealing')) void dealRound();
        return;
      }
      set({ countdown: value });
      audioManager.playSfx('countdownTick');
      const word = COUNTDOWN_WORDS[value];
      if (word) audioManager.speak(word);
      schedule(() => runCountdown(value - 1), TIMINGS.countdownTickMs);
    };

    /** Falha de engine no meio da rodada: o stake volta antes do erro. */
    const refundAndFail = (): void => {
      const { match } = get();
      if (match) {
        set({ balance: creditPayout(get().balance, match.stake) });
        persist();
      }
      failWith('Não foi possível concluir a rodada. Seu stake foi devolvido.');
    };

    /** Põe o lance no alto-falante da mesa por um beat. */
    const announce = (move: TableMove | undefined): void => {
      if (!move) return;
      const id = createId();
      set({ announcement: { ...move, id } });
      audioManager.playSfx(move.action === 'hit' ? 'tap' : 'ready');
      schedule(() => {
        if (get().announcement?.id !== id) return;
        set({ announcement: null });
      }, TIMINGS.announceHoldMs);
    };

    /**
     * Recebe o estado que a engine devolveu e conduz a mesa a partir
     * dele: anuncia o lance, encaixa a fase e agenda a vez seguinte. É o
     * ÚNICO lugar que decide de quem é a vez — a engine diz de quem é, e
     * daqui sai o ritmo em que isso vira cena.
     */
    const handOff = (next: BlackjackRoundState): void => {
      set({ round: next, result: next.result ?? null });
      announce(next.lastMove);
      // A mesa só troca de lado DEPOIS do anúncio: o jogador lê o que
      // acabou de acontecer antes de a vez virar. Na distribuição não há
      // lance a anunciar — a primeira vez abre sem espera.
      const beat = next.lastMove ? TIMINGS.moveAnnounceMs : 0;

      const openTurn = (): void => {
        if (next.phase === 'settled') {
          if (!transitionTo('settle')) return;
          // Showdown: as duas ocultas viram juntas, o quadro respira e o
          // veredito entra.
          schedule(completeRound, TIMINGS.revealMs + TIMINGS.settleMs);
          return;
        }
        if (next.phase === 'opponentTurn') {
          if (get().phase === 'opponentTurn' || transitionTo('opponentTurn')) {
            schedule(
              () => void runOpponentMove(next.matchId),
              within(TIMINGS.opponentThinkMinMs, TIMINGS.opponentThinkMaxMs),
            );
          }
          return;
        }
        if (get().phase !== 'playerTurn') transitionTo('playerTurn');
      };

      if (beat === 0) openTurn();
      else schedule(openTurn, beat);
    };

    /**
     * Distribuição da rodada: a engine tira as cartas do baralho e a mesa
     * as apresenta em beats (o som de cada carta é do próprio Card3D, no
     * instante em que ela assenta — não daqui). Um blackjack natural já
     * fecha a mão de quem o recebeu, e a primeira vez sai do estado que
     * a engine devolve.
     */
    const dealRound = async (): Promise<void> => {
      const { match, devForcedOutcome } = get();
      if (!match) {
        // Sem partida não há stake conhecido para devolver — a mensagem
        // não pode prometer um reembolso que ninguém tem como calcular.
        failWith('A partida foi perdida antes da distribuição. Tente novamente.');
        return;
      }
      audioManager.playSfx('shuffle');
      try {
        const round = await engine.beginRound({
          matchId: match.id,
          forcedOutcome: devForcedOutcome ?? undefined,
        });
        if (get().phase !== 'dealing') return;
        set({ round, result: round.result ?? null });
        schedule(() => {
          if (get().phase !== 'dealing') return;
          handOff(round);
        }, TIMINGS.dealMs);
      } catch {
        refundAndFail();
      }
    };

    /**
     * UM lance do jogador na vez dele. Cada toque vai à engine e volta
     * como um estado novo; quem conduz a mesa a partir daí é o `handOff`.
     */
    const applyAction = async (action: PlayerAction): Promise<void> => {
      const { phase, match, round, actionPending, doubleBet } = get();
      if (phase !== 'playerTurn' || !match || !round || actionPending) return;
      // Com uma dobra no ar a mesa espera: pedir carta agora resolveria a
      // mão por um valor que ainda está sendo decidido.
      if (doubleBet.status === 'pending') return;
      // A mão pode já ter fechado (parou, estourou ou cravou 21) e a
      // fase ainda estar em `playerTurn` durante o beat de acomodação da
      // última carta. Mandar outra ação à engine ali seria `illegal-
      // action` — tratada como falha de engine, com estorno e tela de
      // erro numa rodada que na verdade terminou bem.
      if (round.phase !== 'playerTurn' || round.legalActions.length === 0) return;
      set({ actionPending: true });
      audioManager.playSfx('tap');
      vibrate(20);
      try {
        const next = await engine.act({ matchId: match.id, action });
        // A trava sai SEMPRE que a ação volta — inclusive quando a fase
        // já mudou no meio do caminho. Deixá-la de pé num caminho de
        // saída congelaria os botões da vez sem nada para destravá-los.
        set({ actionPending: false });
        if (get().phase !== 'playerTurn') return;
        handOff(next);
      } catch {
        set({ actionPending: false });
        refundAndFail();
      }
    };

    /** UM lance do rival na vez dele — o beat que a mesa acabou de abrir. */
    const runOpponentMove = async (matchId: string): Promise<void> => {
      if (get().phase !== 'opponentTurn' || get().match?.id !== matchId) return;
      try {
        const next = await engine.advance({ matchId });
        if (get().phase !== 'opponentTurn' || get().match?.id !== matchId) return;
        handOff(next);
      } catch {
        refundAndFail();
      }
    };

    /* ---------- Dobra da aposta ---------- */

    /**
     * Fecha o pedido de dobra: a resposta acende na nuvem (o ✓ ou o ✗) e
     * ela sai de cena um beat depois. O `status` NÃO volta para 'idle' —
     * cada mão admite um pedido só.
     */
    const closeDouble = (status: 'accepted' | 'declined', amount: number): void => {
      set({ doubleBet: { status, amount, open: true } });
      schedule(() => {
        const current = get().doubleBet;
        if (current.status !== status) return;
        set({ doubleBet: { ...current, open: false } });
      }, TIMINGS.doubleAnswerHoldMs);
    };

    /**
     * Rival topou: o novo valor vira a verdade da engine ANTES do débito
     * (payout e histórico derivam do stake gravado na partida) e só
     * então a diferença sai do saldo — a mesma ordem do início do duelo.
     */
    const acceptDouble = async (matchId: string): Promise<void> => {
      const { match, balance, doubleBet } = get();
      if (!match || match.id !== matchId || doubleBet.status !== 'pending') return;
      // Dobrar custa outro tanto do que já está na mesa. O saldo é
      // reconferido aqui: recusar é o desfecho seguro de um pedido que
      // não tem como ser pago.
      const extra = match.stake;
      if (!validateStake(balance, extra).ok) {
        closeDouble('declined', doubleBet.amount);
        return;
      }
      try {
        const updated = await engine.setStake({ matchId, stake: doubleBet.amount });
        if (get().match?.id !== matchId || get().doubleBet.status !== 'pending') return;
        set({ match: updated, balance: debitStake(get().balance, extra) });
        persist();
        closeDouble('accepted', doubleBet.amount);
        audioManager.playSfx('stake');
        vibrate([30, 40, 60]);
      } catch {
        // A engine não gravou o valor novo: nada foi debitado e a mesa
        // segue valendo o que valia.
        closeDouble('declined', doubleBet.amount);
      }
    };

    /**
     * Resposta do rival ao pedido de dobra. Ele decide com a MESMA
     * informação parcial que tem de você — as suas cartas abertas, nunca
     * a última.
     */
    const answerDouble = (matchId: string): void => {
      const { phase, match, round, doubleBet } = get();
      if (match?.id !== matchId || doubleBet.status !== 'pending') return;

      // A mão pode ter fechado enquanto ele pensava. Sem mão viva não há
      // aposta para dobrar: o pedido morre recusado, sem debitar nada.
      if (phase !== 'playerTurn' || !round || round.phase === 'settled') {
        closeDouble('declined', doubleBet.amount);
        return;
      }

      const visibleTotal = handValue(visibleCards(round.playerHand)).total;
      if (rng() < doubleAcceptChance(visibleTotal)) {
        void acceptDouble(matchId);
        return;
      }
      closeDouble('declined', doubleBet.amount);
      audioManager.playSfx('tap');
    };

    /**
     * Fim do showdown: credita o payout, grava o histórico e celebra. O
     * payout/netChange vêm calculados pela engine sobre o stake gravado
     * na partida (dobra inclusa) — nada é recalculado aqui.
     */
    const completeRound = (): void => {
      const { result, match, balance, history } = get();
      if (!result || !match || !transitionTo('completed')) return;

      const entry: HistoryEntry = { ...result, opponentName: match.opponent.name };
      set({
        balance: creditPayout(balance, result.payout),
        history: [entry, ...history].slice(0, HISTORY_LIMIT),
        // O resultado forçado do DevTools vale a rodada — e morre com ela.
        devForcedOutcome: null,
      });
      persist();

      if (result.outcome === 'win') {
        // Fanfarra + a plateia de pé: o aplauso é um efeito próprio e
        // acompanha toda vitória.
        audioManager.playSfx('win');
        audioManager.playSfx('applause');
      } else {
        audioManager.playSfx(result.outcome);
      }
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
      round: null,
      actionPending: false,
      result: null,
      confirmations: NO_CONFIRMATIONS,
      negotiation: null,
      doubleBet: NO_DOUBLE_BET,
      announcement: null,
      history: persisted?.history ?? [],
      countdown: COUNTDOWN_START,
      error: null,
      settings: persisted?.settings ?? DEFAULT_SETTINGS,
      devForcedOutcome: null,
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
              if (!transitionTo('countdown')) return;
              set({ balance: nextBalance });
              persist();
              runCountdown(COUNTDOWN_START);
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

      hit: () => {
        void applyAction('hit');
      },

      stand: () => {
        void applyAction('stand');
      },

      requestDouble: () => {
        const { phase, match, round, balance, doubleBet, actionPending } = get();
        if (phase !== 'playerTurn' || !match || !round || actionPending) return;
        if (round.phase === 'settled' || round.legalActions.length === 0) return;
        // Uma dobra por mão: pedida (e respondida), o botão não volta.
        if (doubleBet.status !== 'idle') return;
        // Dobrar custa outro tanto do que já está na mesa — sem saldo
        // para cobrir a diferença, o pedido nem sai.
        if (!validateStake(balance, match.stake).ok) return;

        set({ doubleBet: { status: 'pending', amount: match.stake * 2, open: true } });
        audioManager.playSfx('stake');
        vibrate(20);
        schedule(
          () => answerDouble(match.id),
          within(TIMINGS.doubleAnswerMinMs, TIMINGS.doubleAnswerMaxMs),
        );
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
          round: null,
          actionPending: false,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          negotiation: null,
          doubleBet: NO_DOUBLE_BET,
          announcement: null,
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
          round: null,
          actionPending: false,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          negotiation: null,
          doubleBet: NO_DOUBLE_BET,
          announcement: null,
          history: [],
          countdown: COUNTDOWN_START,
          error: null,
          settings: DEFAULT_SETTINGS,
          devForcedOutcome: null,
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
