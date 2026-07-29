import { create } from 'zustand';

import { appEnv } from '@/shared/config/env';
import { createId } from '@/shared/lib/ids';

import {
  COUNTDOWN_START,
  HISTORY_LIMIT,
  NEGOTIATION_SECONDS,
  TIMINGS,
} from '../animations/timings';
import type { GameEngine } from '../engine/GameEngine';
import { GameEngineError } from '../engine/GameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import {
  DEFAULT_STAKE,
  MIN_STAKE,
  creditPayout,
  debitStake,
  isBroke,
  validateStake,
} from '../engine/credits';
import { doubleAcceptChance, handValue, visibleCards } from '../engine/rules';
import type {
  BlackjackRoundState,
  HistoryEntry,
  Match,
  PlayerAction,
  ForcedDeal,
  RoundOutcome,
  RoundResult,
  TableTurn,
} from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type {
  AudioSettings,
  GameSettings,
  SceneQualitySetting,
} from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';
import type { Negotiator, NegotiatorReply, ProposalAuthor, ProposalStatus } from './negotiation';
import { BOT_BEATS, createBotNegotiator } from './negotiation';

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
 * turn (os dois escolhem AO MESMO TEMPO, com 20 s no relógio, e os dois
 * lances são revelados juntos quando a vez fecha) → settle (showdown:
 * as ocultas viram e as mãos se comparam) → completed. A fase `turn` se
 * repete enquanto houver mão viva; quem fecha a dele fica de fora das
 * vezes seguintes. Empate devolve a aposta e encerra a partida do mesmo
 * jeito.
 */
export type GamePhase =
  | 'idle'
  | 'search'
  | 'found'
  | 'confirm'
  | 'negotiate'
  | 'countdown'
  | 'dealing'
  | 'turn'
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
  // Com os dois naturais na distribuição não há vez nenhuma a abrir: a
  // mesa vai direto ao showdown.
  dealing: ['turn', 'settle', 'error'],
  // A fase `turn` se repete (uma vez após a outra) sem sair dela: o que
  // muda a cada volta é o estado da rodada, não a fase.
  turn: ['settle', 'error'],
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

/**
 * Um lance na mesa de negociação: o balão de proposta em cena. `open`
 * governa apenas a presença do balão — a resposta (o ✓ ou o ✗ aceso)
 * fica um beat em cena antes de ele sair, como a nuvem da dobra.
 */
export interface NegotiationProposal {
  id: string;
  from: ProposalAuthor;
  amount: number;
  status: ProposalStatus;
  /** O balão do lance está em cena. */
  open: boolean;
}

/**
 * Mesa de negociação (fase `negotiate`) — fichas na mesa, sem chat.
 *
 * A aposta padrão já está no feltro quando a rodada abre; os lados
 * empurram lances (balões de proposta) e o outro cobre ou recusa. Um
 * aceite fecha a mesa no valor coberto; o relógio da rodada zerando
 * fecha no que estiver na mesa. O débito do stake continua acontecendo
 * apenas na virada para o countdown.
 */
export interface NegotiationState {
  /** Valor vivo na mesa (nasce na aposta padrão de 100). */
  tableStake: number;
  /** Segundos restantes da rodada de negociação (20 → 0). */
  secondsLeft: number;
  /** Último lance (vivo ou recém-respondido, enquanto o balão fica). */
  proposal: NegotiationProposal | null;
  /** Valor selado quando a mesa fecha; `null` enquanto se negocia. */
  agreedStake: number | null;
  /** Beat "HORA DO DUELO" em andamento — trava as ações da mesa. */
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
 * Os dois lances de uma vez, revelados JUNTOS pela mesa. O `id` é o que
 * faz duas vezes idênticas entrarem em cena duas vezes: sem ele a
 * animação não teria como saber que houve uma revelação nova.
 */
export interface TurnReveal extends TableTurn {
  id: string;
}

/** Segundos que cada duelista tem para escolher o lance da vez. */
export const TURN_SECONDS = 20;

/**
 * O relógio da vez corrente. Os dois escolhem AO MESMO TEMPO: o que a
 * mesa mostra do outro lado é só se ele já bateu o martelo — nunca o
 * que ele escolheu.
 */
export interface TurnClock {
  /** Segundos restantes (TURN_SECONDS → 0); 0 fora de uma vez sua. */
  seconds: number;
  /** O rival já travou a escolha dele. */
  opponentReady: boolean;
}

const NO_TURN_CLOCK: TurnClock = { seconds: 0, opponentReady: false };

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
  /** Relógio e martelo do rival na vez corrente. */
  turn: TurnClock;
  /** Os dois lances que a mesa está revelando; `null` entre as vezes. */
  reveal: TurnReveal | null;
  history: HistoryEntry[];
  /** Valor corrente do countdown (COUNTDOWN_START → 1). */
  countdown: number;
  /** Mensagem de erro amigável quando phase === 'error'. */
  error: string | null;
  settings: GameSettings;
  /** Distribuição empilhada para a rodada (apenas DevTools). */
  devForcedDeal: ForcedDeal | null;
  /** Oponente aceita qualquer proposta (apenas DevTools; e2e). */
  devNegotiationAutoAccept: boolean;

  /** Busca direta do 1v1 (Home, jogar de novo e tentar de novo). */
  startSearch: () => Promise<void>;
  goHome: () => void;
  cancelSearch: () => void;
  confirmMatch: () => void;
  declineMatch: () => void;
  /** Empurra um lance de créditos ao centro da mesa de negociação. */
  sendProposal: (amount: number) => void;
  /** Cobre o lance vivo do oponente (fecha a mesa no valor dele). */
  acceptProposal: () => void;
  /** Recusa o lance vivo do oponente (a mesa segue valendo o mesmo). */
  declineProposal: () => void;
  /** Abandona a mesa de negociação e volta ao menu. */
  abandonNegotiation: () => void;
  /** Trava "pedir carta" como a sua escolha da vez. */
  hit: () => void;
  /** Trava "parar" como a sua escolha da vez. */
  stand: () => void;
  /** Propõe ao rival dobrar a aposta que está na mesa (antes de escolher). */
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
  devSetForcedDeal: (deal: ForcedDeal | null) => void;
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
    createGameEngine({ mode: 'local', local: { allowForcedDeals: appEnv.devToolsEnabled } });
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
   * Geração da vez corrente: o relógio, o martelo do rival e o
   * fechamento carregam o número da vez em que foram agendados. Uma vez
   * que fecha incrementa a sequência, e tudo o que sobrou dela morre no
   * guard sem efeito — é o que impede um relógio velho de fechar a vez
   * nova.
   */
  let turnSeq = 0;
  /**
   * Geração das jogadas agendadas do bot: cada nova ação do jogador
   * (lance, aceite, recusa, desistência) incrementa a sequência e as
   * jogadas antigas — abertura espontânea, contraproposta a um lance já
   * superado — morrem no guard sem efeito.
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

    /** Delay "humano" sorteado dentro de uma janela [min, max]. Usa o
     * RNG injetado: com ele fixo, o ritmo da mesa fica determinístico e
     * os testes param de depender de sorte. */
    const within = (min: number, max: number): number => min + rng() * (max - min);

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

    /* ---------- Mesa de negociação (fichas na mesa) ---------- */

    /** Ajusta a negociação corrente preservando o resto da mesa. */
    const patchNegotiation = (patch: Partial<NegotiationState>): void => {
      const { negotiation } = get();
      if (!negotiation) return;
      set({ negotiation: { ...negotiation, ...patch } });
    };

    /** A mesa ainda está aberta para esta partida (sem fechar/começar). */
    const negotiationAlive = (matchId: string): boolean => {
      const { phase, match, negotiation } = get();
      return (
        phase === 'negotiate' &&
        match?.id === matchId &&
        negotiation !== null &&
        !negotiation.starting
      );
    };

    /**
     * Fecha a mesa: sela o valor vivo, anuncia a HORA DO DUELO e conduz
     * ao countdown. O valor acordado vira a verdade da engine ANTES do
     * débito (payout e histórico derivam do stake gravado na partida), e
     * o débito só acontece na virada de fase — como sempre foi.
     */
    const finishNegotiation = (matchId: string): void => {
      if (!negotiationAlive(matchId)) return;
      const { negotiation, match } = get();
      if (!negotiation || !match) return;
      const stake = negotiation.tableStake;
      botSeq += 1; // nenhuma jogada pendente do bot sobrevive ao fim da mesa
      set({ negotiation: { ...negotiation, starting: true, agreedStake: stake } });
      audioManager.playSfx('locked');
      vibrate([30, 40, 60]);

      void (async () => {
        try {
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
    };

    /** O balão respondido fica um beat em cena e sai sozinho. */
    const closeProposalLater = (matchId: string, proposalId: string): void => {
      schedule(() => {
        if (!negotiationAlive(matchId)) return;
        const { negotiation } = get();
        const proposal = negotiation?.proposal;
        if (!proposal || proposal.id !== proposalId) return;
        patchNegotiation({ proposal: { ...proposal, open: false } });
      }, TIMINGS.negoAnswerHoldMs);
    };

    /** Um lance novo entra na mesa — o balão abre com as fichas. */
    const openProposal = (from: ProposalAuthor, amount: number): void => {
      const { negotiation } = get();
      if (!negotiation) return;
      set({
        negotiation: {
          ...negotiation,
          proposal: { id: createId(), from, amount, status: 'pending', open: true },
        },
      });
      audioManager.playSfx('stake');
      vibrate(20);
    };

    /**
     * Aperto de mãos: o lance vivo é coberto e vira o valor da mesa —
     * as fichas novas deslizam ao centro. Vale para os dois sentidos (o
     * bot cobrindo o seu lance e você cobrindo o dele). Depois do beat
     * do balão, a mesa fecha sozinha: cobrir É o acordo.
     */
    const settleProposal = (matchId: string): void => {
      const { negotiation } = get();
      const proposal = negotiation?.proposal;
      if (!negotiation || !proposal || proposal.status !== 'pending') return;
      botSeq += 1; // nenhuma jogada pendente do bot sobrevive ao aceite
      set({
        negotiation: {
          ...negotiation,
          tableStake: proposal.amount,
          proposal: { ...proposal, status: 'accepted' },
        },
      });
      audioManager.playSfx('stake');
      vibrate([30, 40, 60]);
      schedule(() => finishNegotiation(matchId), TIMINGS.negoAnswerHoldMs);
    };

    /** Recusa do lance vivo: a mesa segue valendo o que valia. */
    const declineCurrentProposal = (matchId: string): void => {
      const { negotiation } = get();
      const proposal = negotiation?.proposal;
      if (!negotiation || !proposal || proposal.status !== 'pending') return;
      patchNegotiation({ proposal: { ...proposal, status: 'declined' } });
      audioManager.playSfx('tap');
      closeProposalLater(matchId, proposal.id);
    };

    /** Resposta do bot a um lance do jogador (olhar a mesa → decidir). */
    const scheduleBotReply = (matchId: string, amount: number, seq: number): void => {
      // Com o auto-aceite do DevTools o bot cobre na hora — só o beat
      // mínimo para o balão entrar em cena antes do ✓.
      const delay = get().devNegotiationAutoAccept
        ? 350
        : within(BOT_BEATS.replyDelayMinMs, BOT_BEATS.replyDelayMaxMs);
      schedule(() => {
        if (seq !== botSeq || !negotiationAlive(matchId)) return;
        const { negotiation, balance } = get();
        const proposal = negotiation?.proposal;
        if (!proposal || proposal.from !== 'player' || proposal.status !== 'pending') return;

        const reply: NegotiatorReply = get().devNegotiationAutoAccept
          ? { action: 'accept' }
          : (negotiator?.respond(amount, { balance, tableStake: negotiation.tableStake }) ?? {
              action: 'accept',
            });
        if (reply.action === 'accept') {
          settleProposal(matchId);
          return;
        }

        declineCurrentProposal(matchId);
        // A recusa pode vir com uma contraproposta: o lance DELE entra
        // na mesa um beat depois do ✗, virado para você decidir.
        const counter = reply.counter;
        if (counter === null || counter === get().negotiation?.tableStake) return;
        schedule(
          () => {
            if (seq !== botSeq || !negotiationAlive(matchId)) return;
            if (get().negotiation?.proposal?.status === 'pending') return;
            openProposal('opponent', counter);
          },
          within(BOT_BEATS.counterDelayMinMs, BOT_BEATS.counterDelayMaxMs),
        );
      }, delay);
    };

    /**
     * Relógio da rodada de negociação, um segundo por vez. Ele PARA
     * enquanto um lance SEU espera a resposta do rival (o martelo está
     * do outro lado — seria injusto o seu tempo correr). Um lance do
     * RIVAL não pausa nada: decidir sob o relógio é pressão de mesa.
     * Zerou: um lance sem resposta morre recusado e o duelo abre
     * valendo o que estiver na mesa — a garantia de término da fase.
     */
    const runNegotiationClock = (matchId: string, value: number): void => {
      if (!negotiationAlive(matchId)) return;
      const { negotiation } = get();
      const proposal = negotiation?.proposal;
      if (proposal?.from === 'player' && proposal.status === 'pending') {
        schedule(() => runNegotiationClock(matchId, value), 250);
        return;
      }
      patchNegotiation({ secondsLeft: value });
      if (value > 0) {
        schedule(() => runNegotiationClock(matchId, value - 1), 1000);
        return;
      }
      const dying = get().negotiation?.proposal;
      if (dying?.status === 'pending') {
        patchNegotiation({ proposal: { ...dying, status: 'declined', open: false } });
      }
      finishNegotiation(matchId);
    };

    /**
     * Abre a mesa: a aposta padrão já está no feltro (nunca acima do
     * saldo do jogador), o relógio da rodada corre e o bot pode empurrar
     * um lance espontâneo se o alvo dele estiver longe da mesa. Se o
     * jogador propuser antes, a abertura do bot morre no guard.
     */
    const beginNegotiation = (matchId: string): void => {
      negotiator = createNegotiator();
      const seq = ++botSeq;
      const affordable = Math.floor(get().balance / 10) * 10;
      const tableStake = Math.max(MIN_STAKE, Math.min(DEFAULT_STAKE, affordable));
      set({
        negotiation: {
          tableStake,
          secondsLeft: NEGOTIATION_SECONDS,
          proposal: null,
          agreedStake: null,
          starting: false,
        },
      });
      audioManager.playSfx('stake'); // as fichas da aposta padrão assentam
      schedule(() => runNegotiationClock(matchId, NEGOTIATION_SECONDS - 1), 1000);

      // Com o auto-aceite (DevTools/e2e) o bot não abre lance nenhum:
      // a fase atravessa com um único toque do jogador.
      if (get().devNegotiationAutoAccept) return;
      schedule(
        () => {
          if (seq !== botSeq || !negotiationAlive(matchId)) return;
          const current = get().negotiation;
          if (!current || current.proposal !== null) return; // a mesa já tem conversa
          const amount = negotiator?.opening({
            balance: get().balance,
            tableStake: current.tableStake,
          });
          if (amount == null || amount === current.tableStake) return;
          openProposal('opponent', amount);
        },
        within(BOT_BEATS.openDelayMinMs, BOT_BEATS.openDelayMaxMs),
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
        turn: NO_TURN_CLOCK,
        reveal: null,
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
        turn: NO_TURN_CLOCK,
        reveal: null,
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

    /** Põe os dois lances da vez no alto-falante da mesa por um beat. */
    const revealTurn = (turn: TableTurn | undefined): void => {
      if (!turn || (!turn.player && !turn.opponent)) return;
      const id = createId();
      set({ reveal: { ...turn, id } });
      audioManager.playSfx(turn.player?.action === 'hit' ? 'tap' : 'ready');
      schedule(() => {
        if (get().reveal?.id !== id) return;
        set({ reveal: null });
      }, TIMINGS.revealHoldMs);
    };

    /**
     * Recebe o estado que a engine devolveu e conduz a mesa a partir
     * dele: revela os dois lances da vez que fechou e, passado o beat,
     * abre a vez seguinte (ou o showdown).
     */
    const handOff = (next: BlackjackRoundState): void => {
      set({ round: next, result: next.result ?? null });
      revealTurn(next.lastTurn);
      // A vez seguinte só abre DEPOIS da revelação: os dois precisam ler
      // o que acabou de acontecer. Na distribuição não há o que revelar —
      // a primeira vez abre sem espera.
      const beat = next.lastTurn ? TIMINGS.turnRevealMs : 0;

      const open = (): void => {
        if (next.phase === 'settled') {
          if (!transitionTo('settle')) return;
          // Showdown: as duas ocultas viram juntas, o quadro respira e o
          // veredito entra.
          schedule(completeRound, TIMINGS.revealMs + TIMINGS.settleMs);
          return;
        }
        if (get().phase !== 'turn' && !transitionTo('turn')) return;
        openChoiceWindow(next);
      };

      if (beat === 0) open();
      else schedule(open, beat);
    };

    /**
     * Abre a janela de escolha: os dois decidem AO MESMO TEMPO, com o
     * relógio de 20 s correndo. A vez fecha assim que os dois baterem o
     * martelo — ou quando o relógio zera, e aí a mesa PARA a mão de quem
     * não escolheu (parar nunca estoura: é o desfecho seguro).
     */
    const openChoiceWindow = (state: BlackjackRoundState): void => {
      const seq = ++turnSeq;
      const waitingPlayer = !state.playerClosed;
      const waitingOpponent = !state.opponentClosed;

      set({
        turn: {
          seconds: waitingPlayer ? TURN_SECONDS : 0,
          opponentReady: !waitingOpponent,
        },
      });

      // O rival bate o martelo em algum instante da janela — nunca no
      // mesmo tempo, e nunca revelando O QUE escolheu.
      if (waitingOpponent) {
        schedule(
          () => {
            if (seq !== turnSeq) return;
            set({ turn: { ...get().turn, opponentReady: true } });
            audioManager.playSfx('tap');
            maybeCloseTurn(seq);
          },
          Math.min(
            within(TIMINGS.opponentChoiceMinMs, TIMINGS.opponentChoiceMaxMs),
            TURN_SECONDS * 1000 - 1500,
          ),
        );
      }

      if (waitingPlayer) runTurnClock(seq, TURN_SECONDS);
      else maybeCloseTurn(seq);
    };

    /**
     * Relógio da vez, um segundo por vez. Ele PARA enquanto um pedido de
     * dobra estiver no ar: o jogador não pode escolher nesse intervalo, e
     * seria injusto o tempo dele correr por uma pergunta que ele fez.
     */
    const runTurnClock = (seq: number, value: number): void => {
      if (seq !== turnSeq || get().phase !== 'turn') return;
      if (get().doubleBet.status === 'pending') {
        schedule(() => runTurnClock(seq, value), 250);
        return;
      }
      set({ turn: { ...get().turn, seconds: value } });
      if (value <= 0) {
        void closeTurn(seq);
        return;
      }
      schedule(() => runTurnClock(seq, value - 1), 1000);
    };

    /** Fecha a vez assim que os DOIS lados tiverem batido o martelo. */
    const maybeCloseTurn = (seq: number): void => {
      const { round, turn } = get();
      if (seq !== turnSeq || !round) return;
      const playerIn = round.playerClosed || round.playerChoice !== undefined;
      if (!playerIn || !turn.opponentReady) return;
      void closeTurn(seq);
    };

    /** Executa os dois lances da vez e devolve a mesa ao `handOff`. */
    const closeTurn = async (seq: number): Promise<void> => {
      const { phase, match } = get();
      if (seq !== turnSeq || phase !== 'turn' || !match) return;
      turnSeq += 1; // o relógio e o martelo desta vez morrem aqui
      set({ turn: NO_TURN_CLOCK });
      try {
        const next = await engine.resolveTurn({ matchId: match.id });
        if (get().phase !== 'turn' || get().match?.id !== match.id) return;
        handOff(next);
      } catch {
        refundAndFail();
      }
    };

    /**
     * Distribuição da rodada: a engine tira as cartas do baralho e a mesa
     * as apresenta em beats (o som de cada carta é do próprio Card3D, no
     * instante em que ela assenta — não daqui). A primeira vez sai do
     * estado que a engine devolve, e ninguém entra nela fechado: nem
     * quem tirou um blackjack natural.
     */
    const dealRound = async (): Promise<void> => {
      const { match, devForcedDeal } = get();
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
          forcedDeal: devForcedDeal ?? undefined,
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
     * TRAVA a escolha do jogador para a vez corrente. Nada acontece na
     * mesa aqui: a carta só sai quando a vez fechar, com o lance do rival
     * junto — é o que faz a escolha ser simultânea de verdade.
     */
    const commitChoice = async (action: PlayerAction): Promise<void> => {
      const { phase, match, round, actionPending, doubleBet } = get();
      if (phase !== 'turn' || !match || !round || actionPending) return;
      // Com uma dobra no ar a mesa espera: escolher agora fecharia a vez
      // por um valor que ainda está sendo decidido.
      if (doubleBet.status === 'pending') return;
      // A janela pode ter fechado no beat entre o toque e o handler (o
      // relógio zerou, ou a escolha já foi travada). Mandar outra à
      // engine ali seria `illegal-action` — tratada como falha de engine,
      // com estorno e tela de erro numa rodada que está indo bem.
      if (round.phase !== 'choosing' || round.legalActions.length === 0) return;
      const seq = turnSeq;
      set({ actionPending: true });
      audioManager.playSfx('tap');
      vibrate(20);
      try {
        const next = await engine.commit({ matchId: match.id, action });
        // A trava sai SEMPRE que a chamada volta — inclusive quando a
        // fase já mudou no meio do caminho. Deixá-la de pé num caminho de
        // saída congelaria os botões da vez sem nada para destravá-los.
        set({ actionPending: false });
        if (get().phase !== 'turn' || seq !== turnSeq) return;
        set({ round: next });
        maybeCloseTurn(seq);
      } catch {
        set({ actionPending: false });
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
      if (phase !== 'turn' || !round || round.phase !== 'choosing') {
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
        // A distribuição forçada do DevTools vale a rodada — e morre com ela.
        devForcedDeal: null,
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
      turn: NO_TURN_CLOCK,
      reveal: null,
      history: persisted?.history ?? [],
      countdown: COUNTDOWN_START,
      error: null,
      settings: persisted?.settings ?? DEFAULT_SETTINGS,
      devForcedDeal: null,
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
        if (phase !== 'negotiate' || !negotiation || !match || negotiation.starting) return;
        if (!validateStake(balance, amount).ok) return;

        const proposal = negotiation.proposal;
        // O seu lance no ar tem o martelo do rival: espere a resposta.
        if (proposal?.status === 'pending' && proposal.from === 'player') return;

        // Cobrir o lance vivo do rival propondo o MESMO valor é um
        // aperto de mãos, não um lance novo.
        if (
          proposal?.status === 'pending' &&
          proposal.from === 'opponent' &&
          proposal.amount === amount
        ) {
          get().acceptProposal();
          return;
        }

        const seq = ++botSeq; // há lance novo: jogadas antigas do bot caducam

        // Propor o valor que JÁ está na mesa é confirmá-la: o balão
        // entra coberto e a mesa fecha nesse valor.
        if (amount === negotiation.tableStake) {
          openProposal('player', amount);
          settleProposal(match.id);
          return;
        }

        // Um lance seu por cima do lance vivo do rival é a contraproposta:
        // o dele sai da mesa e o balão passa a ser o seu.
        openProposal('player', amount);
        scheduleBotReply(match.id, amount, seq);
      },

      acceptProposal: () => {
        const { phase, negotiation, match, balance } = get();
        if (phase !== 'negotiate' || !negotiation || !match || negotiation.starting) return;
        const proposal = negotiation.proposal;
        if (!proposal || proposal.from !== 'opponent' || proposal.status !== 'pending') return;
        if (!validateStake(balance, proposal.amount).ok) return;
        botSeq += 1;
        settleProposal(match.id);
      },

      declineProposal: () => {
        const { phase, negotiation, match } = get();
        if (phase !== 'negotiate' || !negotiation || !match || negotiation.starting) return;
        const proposal = negotiation.proposal;
        if (!proposal || proposal.from !== 'opponent' || proposal.status !== 'pending') return;
        botSeq += 1;
        declineCurrentProposal(match.id);
      },

      abandonNegotiation: () => {
        const { phase, negotiation } = get();
        if (phase !== 'negotiate' || negotiation?.starting) return;
        audioManager.playSfx('tap');
        resetToIdle();
      },

      hit: () => {
        void commitChoice('hit');
      },

      stand: () => {
        void commitChoice('stand');
      },

      requestDouble: () => {
        const { phase, match, round, balance, doubleBet, actionPending } = get();
        if (phase !== 'turn' || !match || !round || actionPending) return;
        // Só antes de travar a escolha: o valor da mesa se decide antes
        // do lance, não depois de ele já estar no martelo.
        if (round.phase !== 'choosing' || round.legalActions.length === 0) return;
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
          turn: NO_TURN_CLOCK,
          reveal: null,
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

      devSetForcedDeal: (deal) => {
        if (!appEnv.devToolsEnabled) return;
        set({ devForcedDeal: deal });
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
          turn: NO_TURN_CLOCK,
          reveal: null,
          history: [],
          countdown: COUNTDOWN_START,
          error: null,
          settings: DEFAULT_SETTINGS,
          devForcedDeal: null,
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
