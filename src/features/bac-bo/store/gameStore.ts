import { create } from 'zustand';

import { appEnv } from '@/shared/config/env';
import { createId } from '@/shared/lib/ids';

import { COUNTDOWN_START, HISTORY_LIMIT, TIMINGS } from '../animations/timings';
import { GameEngineError } from '../engine/GameEngine';
import { cashOutValue, creditPayout, debitStake, isBroke, tableStackFor } from '../engine/credits';
import type { PokerEngine } from '../engine/poker/PokerEngine';
import { createPokerEngine } from '../engine/poker/createPokerEngine';
import { timeoutAction } from '../engine/poker/rules';
import type {
  ForcedPokerDeal,
  PokerAction,
  PokerHistoryEntry,
  PokerMove,
  PokerOutcome,
  PokerResult,
  PokerRoundState,
  PokerSession,
  Street,
} from '../engine/poker/types';
import type { Match } from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type {
  AudioSettings,
  GameSettings,
  SceneQualitySetting,
} from '../services/GameStorageService';
import { DEFAULT_SETTINGS, GameStorageService } from '../services/GameStorageService';

/**
 * Máquina de estados do fluxo de jogo. Toda mudança de fase passa por
 * `canTransition` — transições fora do mapa são ignoradas, o que torna
 * impossível a UI "pular" etapas.
 *
 * O 1v1 não tem seleção de aposta nem conversa sobre valor: a busca
 * começa direto da Home e a entrada da mesa é fixa (ver `TABLE_ANTE`).
 *
 * O DUELO É UMA SESSÃO DE TEXAS HOLD'EM heads-up, e o valor debitado do
 * saldo é o BUY-IN com que os dois compram fichas: countdown → dealing
 * (duas cartas fechadas para cada um, entrada na mesa) → betting (as
 * apostas correm, rua por rua) → settle (showdown, ou o pote levado por
 * desistência) → handover.
 *
 * `handover` é o BEAT ENTRE AS MÃOS, e é ele que faz da mesa uma sessão:
 * o pote volta para os stacks, a placa do vencedor entra, e dali a mesa
 * DISTRIBUI DE NOVO — a menos que alguém tenha ficado sem fichas para a
 * entrada ou que o jogador tenha se levantado. Só então vem `completed`,
 * que deixou de ser a tela de vitória de uma mão para ser o CAIXA da
 * sessão inteira.
 *
 * A fase `betting` se REPETE do começo ao fim da mão: o que muda a cada
 * volta é a rua e de quem é a vez, não a fase. Quem conduz a mesa entre
 * um lance e outro é o `handOff` — a mesa anda sozinha (o rival joga, o
 * flop abre) e para quando a palavra é sua.
 */
export type GamePhase =
  | 'idle'
  | 'search'
  | 'confirm'
  /** Apresentação de duelo — depois do acordo, com o rival revelado. */
  | 'found'
  | 'countdown'
  | 'dealing'
  | 'betting'
  | 'settle'
  /** Entre as mãos: o pote assenta nos stacks e a mesa se prepara. */
  | 'handover'
  /** O caixa da sessão: o balanço do que se levou da mesa. */
  | 'completed'
  | 'error';

/**
 * A ORDEM DAS CENAS de abertura, e por que ela é esta:
 *
 *   busca → confirmação → APRESENTAÇÃO → countdown
 *
 * A apresentação (`found`, o "VOCÊ vs FULANO" de tela de matchup) vem
 * DEPOIS da confirmação por causa do sigilo do adversário (ver
 * opponentIdentity.ts): enquanto o duelo não está travado, o rival não
 * tem nome nem cara, e uma apresentação anônima não apresenta ninguém.
 * Dada a palavra pelos dois lados, a placa dele entra por extenso — o
 * único lugar do fluxo onde a revelação vale como momento.
 */
export const PHASE_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  idle: ['search'],
  search: ['confirm', 'idle', 'error'],
  confirm: ['found', 'idle'],
  found: ['countdown', 'error'],
  countdown: ['dealing', 'error'],
  // Distribuídas as fechadas, o pré-flop abre: no Hold'em sempre há uma
  // rua de aposta antes de qualquer carta comunitária.
  dealing: ['betting', 'error'],
  // A fase `betting` se repete (rua após rua, lance após lance) sem sair
  // dela: o que muda a cada volta é o estado da mão, não a fase.
  betting: ['settle', 'error'],
  settle: ['handover'],
  // A mesa continua: do beat entre as mãos sai OUTRA distribuição, ou o
  // caixa quando a sessão acabou.
  handover: ['dealing', 'completed', 'error'],
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
 * O último lance da mesa, posto no alto-falante por um beat. O `id` é o
 * que faz dois lances idênticos entrarem em cena duas vezes: sem ele a
 * animação não teria como saber que houve um anúncio novo.
 */
export interface MoveAnnounce extends PokerMove {
  id: string;
}

/** Segundos que o jogador tem para decidir o lance dele. */
export const ACTION_SECONDS = 20;

/**
 * O relógio da vez. No poker a vez é de UM por vez — não há escolha
 * simultânea a esconder —, então o relógio só corre quando a palavra é
 * sua. Zerado, a mesa joga por você o lance seguro (ver `timeoutAction`):
 * passar se for de graça, desistir se houver aposta na frente.
 */
export interface ActionClock {
  /**
   * A JANELA DE DECISÃO está aberta. Não é o mesmo que `seconds > 0`, e a
   * diferença importa: entre a engine devolver a mesa com a palavra sua e
   * o beat do anúncio vencer, `toAct` já é 'player' e o relógio ainda não
   * começou. Sem esta flag a barra de lances entrava em cena com o
   * relógio marcando 0s — que se lê como "seu tempo acabou" no exato
   * instante em que ele ia começar.
   */
  open: boolean;
  /** Segundos restantes (ACTION_SECONDS → 0); 0 fora de uma vez sua. */
  seconds: number;
}

const NO_ACTION_CLOCK: ActionClock = { open: false, seconds: 0 };

/** Segundos para decidir se mostra as cartas a quem correu. */
export const SHOW_CARDS_SECONDS = 5;

/**
 * O INTERVALO ENTRE AS MÃOS, em segundos.
 *
 * É o tempo de ler quem levou o pote e de decidir se ainda se quer
 * jogar. Zerado, a mesa distribui sozinha: uma sessão que exigisse um
 * toque a cada mão para continuar seria uma sessão que se joga com o
 * dedo, não com a cabeça. O relógio é o que transforma a porta de saída
 * numa escolha de verdade — sem ele, sair dependeria de acertar um beat.
 */
export const HANDOVER_SECONDS = 10;

/**
 * O CONVITE PARA MOSTRAR AS CARTAS, com o relógio dele.
 *
 * Ele traz a leitura da mão que se tinha no instante em que o rival
 * correu (`handLabel`), porque é ela que informa a decisão: mostrar um
 * par de Ases diz uma coisa ao rival, mostrar carta alta diz outra bem
 * diferente — e é essa segunda que faz o blefe render na mão seguinte.
 */
export interface ShowPrompt {
  seconds: number;
  /** A leitura da sua mão quando o pote foi levado ("Par de Ases"). */
  handLabel: string;
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
  /** Mão de poker corrente (a mesa como você a vê); `null` fora dela. */
  round: PokerRoundState | null;
  /**
   * A MESA ENTRE AS MÃOS: stacks que sobrevivem, botão da próxima, quantas
   * já correram. É o que faz a sessão existir para a tela — o botão de
   * sair só aparece a partir da segunda mão, e o caixa precisa saber com
   * quanto se sentou.
   */
  session: PokerSession | null;
  /**
   * O convite para MOSTRAR AS CARTAS depois de um pote levado sem
   * showdown. `null` fora do beat; enquanto está aqui, o relógio corre.
   *
   * Existe porque no poker mostrar um blefe é jogada, não vaidade: quem
   * levou o pote sem ser pago escolhe se abre a mão, e essa escolha vale
   * dinheiro nas mãos seguintes.
   */
  showPrompt: ShowPrompt | null;
  /**
   * Você ABRIU a mão para o rival depois de levar o pote sem showdown.
   * Vale pela mão corrente e some na distribuição seguinte — mostrar é um
   * gesto daquele pote, não um estado da mesa.
   */
  cardsShown: boolean;
  /**
   * Segundos que faltam para a mesa distribuir a próxima mão. Só corre na
   * fase `handover`; 0 fora dela.
   */
  handoverSeconds: number;
  /** Lance do jogador em trânsito na engine — trava a barra de ações. */
  actionPending: boolean;
  result: PokerResult | null;
  /** Estado da confirmação dupla — a negociação só nasce com os dois `true`. */
  confirmations: MatchConfirmations;
  /** Relógio da sua vez; zerado quando a palavra não é sua. */
  actionClock: ActionClock;
  /** O lance que a mesa está anunciando; `null` entre um lance e outro. */
  announce: MoveAnnounce | null;
  /**
   * A RUA que a mesa está anunciando em letreiro — o mesmo carimbo de
   * ouro da HORA DO DUELO. `null` fora do beat de abertura.
   *
   * Ele existe no store, e não num efeito da tela, porque quem sabe que
   * uma rua abriu é quem conduz a mesa: derivar isso de uma mudança de
   * prop faria a tela adivinhar um acontecimento que o store já tem na
   * mão.
   */
  streetAnnounce: Street | null;
  history: PokerHistoryEntry[];
  /**
   * Segundo beat da fase `found`: a apresentação já passou e o letreiro
   * HORA DO DUELO está no feltro. É o que separa as duas cenas de uma
   * fase só — a placa do rival e o carimbo que abre o duelo.
   */
  duelAnnounce: boolean;
  /** Valor corrente do countdown (COUNTDOWN_START → 1). */
  countdown: number;
  /** Mensagem de erro amigável quando phase === 'error'. */
  error: string | null;
  settings: GameSettings;
  /** Mão empilhada para o showdown (apenas DevTools). */
  devForcedDeal: ForcedPokerDeal | null;

  /** Busca direta do 1v1 (Home, jogar de novo e tentar de novo). */
  startSearch: () => Promise<void>;
  goHome: () => void;
  cancelSearch: () => void;
  confirmMatch: () => void;
  declineMatch: () => void;
  /** Joga a mão fora e entrega o pote ao rival. */
  fold: () => void;
  /** Passa a vez sem pôr ficha nenhuma (só quando não há o que pagar). */
  check: () => void;
  /** Cobre a aposta do rival e segue na mão. */
  call: () => void;
  /** Aumenta até `to` — o TOTAL comprometido nesta rua, não o incremento. */
  raise: (to: number) => void;
  playAgain: () => void;
  dismissError: () => void;
  /** Levanta da mesa e abre o caixa da sessão (a partir da 2ª mão). */
  leaveTable: () => void;
  /** Responde ao convite de mostrar as cartas ao rival que correu. */
  answerShowCards: (show: boolean) => void;
  /** Recarrega créditos quando o saldo não cobre o menor stake. */
  refillCredits: () => void;
  /** Ajusta o saldo por um delta (débito/crédito) e persiste — usado pelo
      buy-in e pelo prêmio do modo Torneio. */
  applyBalanceDelta: (delta: number) => void;
  markTutorialSeen: () => void;
  updateAudioSettings: (patch: Partial<AudioSettings>) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setSceneryQuality: (scenery: SceneQualitySetting) => void;
  devSetForcedDeal: (deal: ForcedPokerDeal | null) => void;
  devAddCredits: (amount: number) => void;
  devResetAll: () => void;
}

export interface GameStoreDeps {
  engine?: PokerEngine;
  storage?: GameStorageService;
  initialBalance?: number;
  /** Fonte de aleatoriedade dos ritmos da mesa (determinística nos testes). */
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
    createPokerEngine({ mode: 'local', local: { allowForcedDeals: appEnv.devToolsEnabled } });
  const storage = deps.storage ?? new GameStorageService();
  const initialBalance = deps.initialBalance ?? appEnv.initialBalance;

  const persisted = storage.load();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let searchAbort: AbortController | null = null;
  const rng = deps.rng ?? Math.random;
  /**
   * Geração do PASSO corrente da mão. Cada estado novo que a engine
   * devolve incrementa a sequência, e tudo o que ficou agendado pelo
   * passo anterior — o relógio da vez, a próxima jogada da mesa — morre
   * no guard sem efeito.
   *
   * É o que impede o acidente clássico desta mesa: um relógio de 20 s
   * que continua correndo depois de o jogador já ter apostado e fecha a
   * vez seguinte por ele.
   */
  let stepSeq = 0;

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
     * Com os dois lados prontos, o duelo abre. É a cena mais curta do
     * fluxo e a mais direta: um beat para a animação de "duelo
     * confirmado" respirar, a apresentação do rival e a HORA DO DUELO.
     *
     * AQUI MORAVA A RODADA DE NEGOCIAÇÃO, e a ausência dela é a decisão:
     * o valor da mesa era combinado numa conversa de propostas antes das
     * cartas, e isso fazia do duelo duas partidas — uma de dinheiro e
     * uma de poker. A entrada agora é FIXA (ver `TABLE_ANTE`): toda mão
     * começa igual, e o que varia é o que se aposta dentro dela, que é
     * onde o poker mora.
     *
     * Chamado após CADA confirmação; só age na segunda.
     */
    const startWhenBothConfirmed = (): void => {
      const { confirmations, match } = get();
      if (!confirmations.player || !confirmations.opponent || !match) return;

      audioManager.playSfx('locked');
      vibrate([30, 40, 60]);
      schedule(() => {
        if (get().phase !== 'confirm') return;
        presentDuel();
      }, TIMINGS.confirmLockInMs);
    };

    /**
     * OS DOIS ÚLTIMOS BEATS ANTES DAS CARTAS:
     *
     * 1. a APRESENTAÇÃO entra — "VOCÊ vs FULANO", agora com o nome e o
     *    medalhão do rival por extenso: é aqui que ele deixa de ser
     *    "Oponente" (ver opponentIdentity.ts);
     * 2. a HORA DO DUELO carimba o feltro, o stack é debitado e o
     *    countdown assume.
     *
     * Cada beat revalida a fase: uma partida abandonada no meio não
     * arrasta timer nenhum para a próxima.
     */
    const presentDuel = (): void => {
      if (!transitionTo('found')) return;
      audioManager.playSfx('found');
      vibrate(60);
      schedule(() => {
        if (get().phase !== 'found') return;
        set({ duelAnnounce: true });
        schedule(startDuel, TIMINGS.duelAnnounceMs);
      }, TIMINGS.foundSplashMs);
    };

    /**
     * O letreiro sai, o STACK é debitado e o duelo começa.
     *
     * O débito é do stack inteiro, e o que não for apostado volta no fim
     * da mão (ver `completeHand`): é o mesmo contrato de qualquer mesa,
     * onde se compra fichas para sentar e se troca de volta o que sobra.
     */
    const startDuel = (): void => {
      const { phase, match, balance: currentBalance } = get();
      if (phase !== 'found' || !match) return;
      let nextBalance: number;
      try {
        nextBalance = debitStake(currentBalance, match.stake);
      } catch {
        failWith('Saldo insuficiente para sentar nesta mesa.');
        return;
      }
      if (!transitionTo('countdown')) return;
      set({ balance: nextBalance, duelAnnounce: false });
      persist();
      runCountdown(COUNTDOWN_START);
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
        session: null,
        showPrompt: null,
        cardsShown: false,
        actionPending: false,
        result: null,
        error: null,
        confirmations: NO_CONFIRMATIONS,
        actionClock: NO_ACTION_CLOCK,
        announce: null,
        streetAnnounce: null,
        duelAnnounce: false,
      });
      audioManager.playSfx('tap');
      audioManager.startMusic();
      searchAbort = new AbortController();
      try {
        /* O STACK com que se senta sai daqui, e não de uma conversa: o
           teto da mesa ou o que o saldo permitir (ver `tableStackFor`).
           Ele vai à engine no ato da busca, então a partida já nasce
           sabendo quanto vale — não há mais um segundo momento em que o
           valor mude. */
        const match = await engine.findMatch({
          stake: tableStackFor(get().balance),
          signal: searchAbort.signal,
        });
        if (get().phase !== 'search') return;
        set({ match, confirmations: NO_CONFIRMATIONS, duelAnnounce: false });
        // A busca entrega direto na confirmação: a apresentação do rival
        // acontece lá na frente, depois do acordo (ver PHASE_TRANSITIONS).
        if (transitionTo('confirm')) {
          audioManager.playSfx('found');
          vibrate(60);
          scheduleOpponentConfirm(match.id);
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
      set({
        match: null,
        round: null,
        session: null,
        showPrompt: null,
        cardsShown: false,
        actionPending: false,
        result: null,
        error: null,
        confirmations: NO_CONFIRMATIONS,
        actionClock: NO_ACTION_CLOCK,
        announce: null,
        streetAnnounce: null,
        duelAnnounce: false,
      });
    };

    /** Countdown recursivo e falado: 5 → 4 → 3 → 2 → 1 → distribuição. */
    const runCountdown = (value: number): void => {
      if (value <= 0) {
        audioManager.playSfx('countdownGo');
        if (transitionTo('dealing')) void dealHand();
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

    /**
     * Põe o último lance no alto-falante da mesa por um beat. É o que
     * transforma um número que mudou no stack numa AÇÃO que aconteceu:
     * "Luna AUMENTOU PARA 240".
     */
    const announceMove = (move: PokerMove | undefined): void => {
      if (!move) return;
      const id = createId();
      set({ announce: { ...move, id } });
      audioManager.playSfx(move.amount > 0 ? 'stake' : 'tap');
      if (move.by === 'opponent') vibrate(move.allIn ? [30, 40, 60] : 20);
      schedule(() => {
        if (get().announce?.id !== id) return;
        set({ announce: null });
      }, TIMINGS.moveHoldMs);
    };

    /**
     * A última rua que o letreiro CARIMBOU — que não é a mesma coisa que
     * a rua do estado anterior da mesa.
     *
     * A distinção existe por causa do PRÉ-FLOP: na distribuição a mesa já
     * é publicada em `round` antes do primeiro `handOff` (as quatro
     * fechadas precisam de um estado para voar), e comparar a rua nova
     * com a do estado anterior comparava o pré-flop consigo mesmo —
     * engolindo justamente o primeiro letreiro da mão. Guardar o que foi
     * ANUNCIADO responde à pergunta certa: "o jogador já viu esta rua ser
     * chamada?".
     */
    let announcedStreet: Street | null = null;

    /**
     * O jogador tocou em LEVANTAR no meio de uma mão. A mesa não pode
     * sair dali — há fichas no meio —, então ela CORRE a mão e cumpre o
     * pedido quando o pote fecha (ver `closeHand`).
     */
    let leaveRequested = false;

    /**
     * Quanto a mesa respira depois de um LANCE. Cada um tem o seu tempo,
     * e é a diferença entre uma mão que se acompanha e uma que passa por
     * cima do jogador:
     *
     * - o lance do RIVAL é uma notícia — dá para ler o que ele fez;
     * - o seu PRÓPRIO lance quase não espera: você já sabe o que fez, e
     *   um atraso aqui só faria a mesa parecer travada.
     *
     * Uma RUA que abre não passa por aqui: ela tem o beat mais longo de
     * todos (`pokerStreetMs`), porque o letreiro carimba o feltro, três
     * cartas voam e o jogador precisa lê-las antes de decidir.
     */
    const moveBeat = (next: PokerRoundState): number => {
      if (!next.lastMove) return 0;
      return next.lastMove.by === 'player' ? TIMINGS.pokerOwnMoveMs : TIMINGS.pokerMoveMs;
    };

    /**
     * Põe o letreiro da rua no feltro por um beat. É o mesmo carimbo de
     * ouro da HORA DO DUELO, e é ele que dá a cada rua o peso de um
     * acontecimento — antes, o que anunciava a virada era uma etiqueta
     * miúda em cima das fichas, que ninguém via mudar.
     */
    const announceStreet = (street: Street): void => {
      announcedStreet = street;
      set({ streetAnnounce: street });
      schedule(() => {
        if (get().streetAnnounce !== street) return;
        set({ streetAnnounce: null });
      }, TIMINGS.streetAnnounceMs);
    };

    /**
     * O CONDUTOR DA MESA. Recebe o estado que a engine devolveu, anuncia
     * o que acabou de acontecer e, passado o beat, dá o passo seguinte —
     * que é sempre um destes três:
     *
     * - a mão acabou → showdown e veredito;
     * - a palavra é sua → o relógio abre e a mesa espera;
     * - a palavra não é sua → a mesa anda sozinha (`advanceTable`): o
     *   rival joga a vez dele, ou uma rua nova se abre.
     *
     * É este vaivém que faz uma mão inteira de Hold'em correr sem que a
     * UI precise saber uma única regra do jogo.
     */
    const handOff = (next: PokerRoundState): void => {
      const seq = ++stepSeq;
      const opened = next.street !== announcedStreet;

      /** Publica a mesa nova e põe no ar o que ela trouxe. */
      const showTable = (): void => {
        set({ round: next, session: next.session, result: next.result ?? null });
        announceMove(next.lastMove);
      };

      set({ actionClock: NO_ACTION_CLOCK });

      if (opened) {
        /* A MESA NÃO MUDA ENQUANTO O LETREIRO ESTÁ NO AR.
           O anúncio de uma rua e as cartas dela são dois acontecimentos,
           e publicar o estado novo junto com o letreiro fazia os dois
           correrem em cima um do outro: o flop virava por trás do
           desfoque, e quando o foco voltava as cartas já estavam lá — a
           virada, que é o acontecimento, acontecia escondida.
           Aqui a ordem é a de uma mesa de verdade: o crupiê anuncia, o
           quadro volta ao foco e SÓ ENTÃO as cartas caem. */
        announceStreet(next.street);
        schedule(() => {
          if (seq !== stepSeq) return;
          showTable();
        }, TIMINGS.streetAnnounceMs + TIMINGS.streetRevealMs);
      } else {
        showTable();
      }

      const open = (): void => {
        if (seq !== stepSeq) return;
        if (next.phase === 'settled') {
          if (!transitionTo('settle')) return;
          /* As duas fechadas viram, o quadro respira e o EMBATE roda —
             o mesmo beat para toda mão que acaba, tenha ela ido ao
             showdown ou morrido numa desistência. A desistência já teve
             um beat curto e próprio, de quando as cartas dela não
             abriam; agora que abrem, cortar o tempo ali seria mostrar o
             que o rival tinha e tirar da tela antes de dar para ler. */
          schedule(closeHand, TIMINGS.revealMs + TIMINGS.settleMs);
          return;
        }
        if (get().phase !== 'betting' && !transitionTo('betting')) return;
        if (next.toAct === 'player') {
          openActionWindow(seq);
          return;
        }
        scheduleTableStep(seq, next);
      };

      const beat = opened ? TIMINGS.pokerStreetMs : moveBeat(next);
      if (beat === 0) open();
      else schedule(open, beat);
    };

    /**
     * A mesa anda sozinha depois de um tempo natural: o rival "pensa"
     * antes de bater o martelo (janela sorteada — um rival que responde
     * sempre no mesmo tempo denuncia que é máquina), e uma rua nova sai
     * do baralho no tempo de um crupiê virar as cartas.
     */
    const scheduleTableStep = (seq: number, state: PokerRoundState): void => {
      const wait =
        state.toAct === 'opponent'
          ? within(TIMINGS.pokerThinkMinMs, TIMINGS.pokerThinkMaxMs)
          : TIMINGS.pokerDealStreetMs;
      schedule(() => {
        void advanceTable(seq);
      }, wait);
    };

    /** Pede à engine o próximo passo da mesa e devolve tudo ao condutor. */
    const advanceTable = async (seq: number): Promise<void> => {
      const { phase, match } = get();
      if (seq !== stepSeq || phase !== 'betting' || !match) return;
      try {
        const next = await engine.advance({ matchId: match.id });
        if (seq !== stepSeq || get().phase !== 'betting' || get().match?.id !== match.id) return;
        handOff(next);
      } catch {
        refundAndFail();
      }
    };

    /**
     * Abre a janela de decisão: os 20 s que o jogador tem para escolher o
     * lance. Zerado o relógio, a mesa joga por ele o lance SEGURO — passa
     * se for de graça, desiste se houver aposta na frente. É o que
     * qualquer sala faz, e é o único desfecho que não gasta ficha de quem
     * não pediu para gastar.
     */
    const openActionWindow = (seq: number): void => {
      set({ actionClock: { open: true, seconds: ACTION_SECONDS } });
      runActionClock(seq, ACTION_SECONDS);
    };

    /** Relógio da vez, um segundo por vez. */
    const runActionClock = (seq: number, value: number): void => {
      if (seq !== stepSeq || get().phase !== 'betting') return;
      set({ actionClock: { open: true, seconds: value } });
      if (value <= 0) {
        const round = get().round;
        if (round) void commitAction(timeoutAction(round.toCall), undefined, true);
        return;
      }
      schedule(() => runActionClock(seq, value - 1), 1000);
    };

    /**
     * O LANCE DO JOGADOR. Sai daqui para a engine e volta como uma mesa
     * nova, que o condutor assume.
     *
     * Os guards não são zelo: a janela pode ter fechado no beat entre o
     * toque e o handler (o relógio zerou, a mesa já andou). Mandar um
     * lance à engine ali seria `illegal-action` — tratada como falha de
     * engine, com estorno e tela de erro no meio de uma mão que está
     * indo bem.
     */
    const commitAction = async (
      action: PokerAction,
      to?: number,
      timedOut = false,
    ): Promise<void> => {
      const { phase, match, round, actionPending } = get();
      if (phase !== 'betting' || !match || !round || actionPending) return;
      if (round.toAct !== 'player' || !round.legalActions.includes(action)) return;

      const seq = stepSeq;
      set({ actionPending: true, actionClock: NO_ACTION_CLOCK });
      audioManager.playSfx(action === 'fold' ? 'tap' : 'stake');
      vibrate(action === 'fold' ? 20 : [20, 30, 40]);
      try {
        const next = await engine.act({ matchId: match.id, action, to, timedOut });
        // A trava sai SEMPRE que a chamada volta — inclusive quando a
        // fase já mudou no meio do caminho. Deixá-la de pé num caminho de
        // saída congelaria a barra de ações sem nada para destravá-la.
        set({ actionPending: false });
        if (seq !== stepSeq || get().phase !== 'betting') return;
        handOff(next);
      } catch {
        set({ actionPending: false });
        refundAndFail();
      }
    };

    /**
     * Distribuição da mão: a engine embaralha, sorteia o botão, dá duas
     * fechadas a cada lado e cobra os blinds. A mesa apresenta as cartas
     * em beats (o som de cada uma é do próprio Card3D, no instante em que
     * ela assenta — não daqui) e só então o pré-flop abre.
     */
    const dealHand = async (): Promise<void> => {
      const { match, devForcedDeal } = get();
      if (!match) {
        // Sem partida não há stake conhecido para devolver — a mensagem
        // não pode prometer um reembolso que ninguém tem como calcular.
        failWith('A partida foi perdida antes da distribuição. Tente novamente.');
        return;
      }
      audioManager.playSfx('shuffle');
      // Mão nova, letreiros zerados: o pré-flop desta mão ainda não foi
      // chamado, por mais que o da anterior tenha sido. E as cartas que
      // se mostrou no pote anterior voltam a ser segredo.
      announcedStreet = null;
      set({ cardsShown: false, showPrompt: null });
      try {
        const round = await engine.beginHand({
          matchId: match.id,
          forcedDeal: devForcedDeal ?? undefined,
        });
        if (get().phase !== 'dealing') return;
        // A mesa chega JUNTO com a mão: é ela que a pílula de saldo segue
        // e é o número de mãos que decide se a porta de saída existe.
        set({ round, session: round.session, result: null });
        schedule(() => {
          if (get().phase !== 'dealing') return;
          handOff(round);
        }, TIMINGS.dealMs);
      } catch {
        refundAndFail();
      }
    };

    /**
     * FIM DA MÃO, não da mesa. O pote já voltou para os stacks dentro da
     * engine; aqui a mão vira histórico e a sessão decide o que vem: outra
     * distribuição, ou o caixa.
     *
     * O SALDO NÃO SE MEXE AQUI, e essa é a diferença que faz a sessão.
     * Numa mesa de mão única o payout era creditado no ato; agora as
     * fichas ficam no feltro entre as mãos, como em qualquer sala — e o
     * caixa só abre quando a pessoa se levanta (ver `cashOut`).
     */
    const closeHand = (): void => {
      const { result, match, history } = get();
      if (!result || !match || !transitionTo('handover')) return;

      const entry: PokerHistoryEntry = { ...result, opponentName: match.opponent.name };
      set({
        session: result.session,
        history: [entry, ...history].slice(0, HISTORY_LIMIT),
        // A mão empilhada do DevTools vale uma mão — e morre com ela.
        devForcedDeal: null,
      });
      persist();

      audioManager.playSfx(result.outcome === 'win' ? 'win' : result.outcome);
      const vibrations: Record<PokerOutcome, number | number[]> = {
        win: [40, 60, 40, 60, 120],
        lose: 220,
        tie: [60, 80, 60],
      };
      vibrate(vibrations[result.outcome]);

      /* O CONVITE DE MOSTRAR AS CARTAS vem antes de qualquer outra coisa,
         e só quando o pote foi levado SEM showdown pelo jogador: mostrar
         só é jogada quando ninguém pagou para ver. Com o convite no ar a
         mesa espera; sem ele, ela já se prepara para a próxima. */
      /* Quem pediu para levantar no meio da mão corre e sai: a mão foi
         dada por perdida, e o caixa abre assim que o pote fecha. */
      if (leaveRequested) {
        leaveRequested = false;
        stepSeq += 1;
        closeTable();
        return;
      }

      if (result.foldedBy === 'opponent' && !result.showdown) {
        openShowPrompt(result);
        return;
      }
      scheduleNextHand();
    };

    /**
     * O beat entre as mãos: o pote assenta, a placa do vencedor entra e a
     * mesa distribui de novo — ou abre o caixa, se acabou.
     */
    const scheduleNextHand = (): void => {
      const seq = ++stepSeq;
      const session = get().session;
      // Mesa fechada não tem próxima mão: o beat aqui é o do caixa.
      if (!session || session.over) {
        set({ handoverSeconds: 0 });
        schedule(() => {
          if (seq !== stepSeq || get().phase !== 'handover') return;
          cashOut();
        }, TIMINGS.handoverCloseMs);
        return;
      }

      const tick = (left: number): void => {
        if (seq !== stepSeq || get().phase !== 'handover') return;
        set({ handoverSeconds: left });
        if (left <= 0) {
          if (transitionTo('dealing')) void dealHand();
          return;
        }
        schedule(() => tick(left - 1), 1000);
      };
      tick(HANDOVER_SECONDS);
    };

    /**
     * O CAIXA DA SESSÃO. As fichas que sobraram viram crédito, e é aqui —
     * e só aqui — que a comissão da casa incide, sobre o lucro (ver
     * `cashOutValue`).
     */
    /** Fecha a mesa na engine e abre o caixa. */
    const closeTable = (): void => {
      const match = get().match;
      if (!match) return;
      void engine
        .leaveTable({ matchId: match.id })
        .then((closed) => {
          set({ session: closed, showPrompt: null, handoverSeconds: 0 });
          cashOut();
        })
        .catch(() => failWith('Não foi possível deixar a mesa.'));
    };

    const cashOut = (): void => {
      const { session, balance } = get();
      if (!session || !transitionTo('completed')) return;
      set({
        balance: creditPayout(balance, cashOutValue(session.buyIn, session.stacks.player)),
        showPrompt: null,
      });
      persist();

      const profited = session.stacks.player > session.buyIn;
      if (profited) {
        // Fanfarra + a plateia de pé: quem saiu no lucro levou a noite.
        audioManager.playSfx('win');
        audioManager.playSfx('applause');
      }
      vibrate(profited ? [40, 60, 40, 60, 120] : 220);
    };

    /**
     * O convite para abrir a mão que ninguém pagou para ver. Cinco
     * segundos — e o silêncio vale por "não mostro", que é o que uma sala
     * de verdade faz com quem não diz nada.
     */
    const openShowPrompt = (result: PokerResult): void => {
      const seq = ++stepSeq;
      set({ showPrompt: { seconds: SHOW_CARDS_SECONDS, handLabel: result.playerRank.label } });
      const tick = (left: number): void => {
        if (seq !== stepSeq || get().phase !== 'handover') return;
        if (left <= 0) {
          set({ showPrompt: null });
          scheduleNextHand();
          return;
        }
        set({ showPrompt: { seconds: left, handLabel: result.playerRank.label } });
        schedule(() => tick(left - 1), 1000);
      };
      schedule(() => tick(SHOW_CARDS_SECONDS - 1), 1000);
    };

    return {
      phase: 'idle',
      balance: persisted?.balance ?? initialBalance,
      match: null,
      round: null,
      session: null,
      showPrompt: null,
      cardsShown: false,
      handoverSeconds: 0,
      actionPending: false,
      result: null,
      confirmations: NO_CONFIRMATIONS,
      actionClock: NO_ACTION_CLOCK,
      announce: null,
      streetAnnounce: null,
      history: persisted?.history ?? [],
      duelAnnounce: false,
      countdown: COUNTDOWN_START,
      error: null,
      settings: persisted?.settings ?? DEFAULT_SETTINGS,
      devForcedDeal: null,

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

      fold: () => {
        void commitAction('fold');
      },

      check: () => {
        void commitAction('check');
      },

      call: () => {
        void commitAction('call');
      },

      raise: (to) => {
        void commitAction('raise', to);
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
          session: null,
          showPrompt: null,
          cardsShown: false,
          actionPending: false,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          actionClock: NO_ACTION_CLOCK,
          announce: null,
          streetAnnounce: null,
          duelAnnounce: false,
        });
        // Sem saldo mínimo a nova busca seria inútil: volta ao menu,
        // onde a recarga de créditos mora.
        if (isBroke(get().balance)) {
          transitionTo('idle');
          return;
        }
        void beginSearch();
      },

      /**
       * LEVANTAR DA MESA — a porta da sessão.
       *
       * Ela abre a partir da SEGUNDA mão: a primeira é o compromisso de
       * quem sentou, e comprar fichas para sair antes de ela fechar não é
       * jogar, é olhar as cartas.
       *
       * NO MEIO DE UMA MÃO ela CORRE A MÃO junto, e é o que uma sala de
       * verdade faz com quem se levanta: a mão é dada por perdida, não
       * desfeita — as fichas que já estão no meio ficaram no meio. O
       * levantar fica marcado e a mesa o cumpre assim que o pote fecha,
       * porque a engine não deixa (com razão) abandonar uma mão viva.
       */
      leaveTable: () => {
        const { phase, match, session } = get();
        if (!match || !session || session.over) return;
        if (session.handsPlayed < 1) return;

        if (phase === 'betting') {
          leaveRequested = true;
          void commitAction('fold');
          return;
        }
        if (phase !== 'handover') return;
        // Mata o beat que já ia distribuir a próxima: a mesa acabou aqui.
        stepSeq += 1;
        closeTable();
      },

      answerShowCards: (show) => {
        const { phase, showPrompt, result } = get();
        if (phase !== 'handover' || !showPrompt || !result) return;
        stepSeq += 1;
        set({ showPrompt: null, cardsShown: show });
        if (show) audioManager.playSfx('cardFlip');
        scheduleNextHand();
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
          match: null,
          round: null,
          session: null,
          showPrompt: null,
          cardsShown: false,
          actionPending: false,
          result: null,
          confirmations: NO_CONFIRMATIONS,
          actionClock: NO_ACTION_CLOCK,
          announce: null,
          streetAnnounce: null,
          duelAnnounce: false,
          history: [],
          countdown: COUNTDOWN_START,
          error: null,
          settings: DEFAULT_SETTINGS,
          devForcedDeal: null,
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
