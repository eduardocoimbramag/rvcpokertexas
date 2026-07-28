import { createId } from '@/shared/lib/ids';
import type { Rng } from '@/shared/lib/random';
import { CryptoRng, pickRandom, randomInt } from '@/shared/lib/random';

import { MIN_STAKE, validateStake } from './credits';
import type {
  BeginRoundParams,
  CommitParams,
  ResolveTurnParams,
  FindMatchParams,
  GameEngine,
  SetStakeParams,
} from './GameEngine';
import { GameEngineError } from './GameEngine';
import {
  DECK_RESHUFFLE_THRESHOLD,
  botAction,
  buildDeck,
  dealInitialHands,
  drawCard,
  forcedDealFor,
  handValue,
  isBust,
  netChangeFor,
  payoutFor,
  resolveOutcome,
  standingOf,
  visibleCards,
} from './rules';
import type {
  BlackjackRoundState,
  Card,
  Duelist,
  Match,
  PlayerAction,
  RoundResult,
  TableMove,
  TableTurn,
  Opponent,
} from './types';
import { blackjackRoundStateSchema, matchSchema } from './types';

/** Perfis de oponentes simulados pelo matchmaking local. O campo
 * `avatar` guarda a INICIAL do monograma (a UI desenha o medalhão a
 * partir do nome — ver AvatarBadge); mantido no schema por
 * compatibilidade de dados. */
const OPPONENT_PROFILES: readonly Omit<Opponent, 'id'>[] = [
  { name: 'Luna', avatar: 'L', rating: 1420 },
  { name: 'Rex', avatar: 'R', rating: 1180 },
  { name: 'Maya', avatar: 'M', rating: 1650 },
  { name: 'Dante', avatar: 'D', rating: 1330 },
  { name: 'Iris', avatar: 'I', rating: 1510 },
  { name: 'Bruno', avatar: 'B', rating: 1240 },
  { name: 'Kira', avatar: 'K', rating: 1770 },
  { name: 'Otto', avatar: 'O', rating: 1090 },
];

/** Rodada em andamento de uma partida (só existe entre begin e settle). */
interface ActiveRound {
  playerHand: Card[];
  opponentHand: Card[];
  /** Mãos que já fecharam: quem fechou fica de fora das vezes seguintes. */
  playerClosed: boolean;
  opponentClosed: boolean;
  /** Escolha travada do jogador para a vez corrente. */
  playerChoice?: PlayerAction;
  /** Os dois lances da última vez fechada. */
  lastTurn?: TableTurn;
  settled: boolean;
}

/**
 * Engine local do duelo de 21: simula matchmaking com delay artificial e
 * resolve rodadas com um baralho honesto de 52 cartas. Toda a lógica do
 * jogo vive aqui — a UI apenas apresenta os estados retornados.
 *
 * O sigilo da última carta é estrutural: o estado que sai daqui só
 * carrega as cartas ABERTAS do adversário. Nem a UI nem o DevTools têm
 * como espiar a oculta antes do showdown, porque ela nunca atravessa a
 * fronteira da engine.
 */
export class LocalBlackjackGameEngine implements GameEngine {
  private readonly rng: Rng;
  private readonly matchmakingDelayMs: readonly [number, number];
  private readonly dealDelayMs: number;
  private readonly allowForcedDeals: boolean;
  private readonly activeMatches = new Map<string, Match>();
  /** Baralho por partida: sobrevive às rodadas, como na mesa real. */
  private readonly decks = new Map<string, Card[]>();
  private readonly activeRounds = new Map<string, ActiveRound>();

  constructor(options: LocalEngineOptions = {}) {
    this.rng = options.rng ?? new CryptoRng();
    this.matchmakingDelayMs = options.matchmakingDelayMs ?? [1200, 2600];
    this.dealDelayMs = options.dealDelayMs ?? 350;
    this.allowForcedDeals = options.allowForcedDeals ?? false;
  }

  async findMatch(params: FindMatchParams): Promise<Match> {
    // Só existe um duelo por vez: abrir uma busca nova descarta qualquer
    // partida anterior.
    this.activeMatches.clear();
    this.decks.clear();
    this.activeRounds.clear();
    // Sem stake (fluxo de negociação), a partida abre com o mínimo da
    // mesa — o valor final chega depois via setStake. O saldo é
    // responsabilidade da camada de créditos; aqui validamos só a forma.
    const stake = params.stake ?? MIN_STAKE;
    const stakeCheck = validateStake(Number.MAX_SAFE_INTEGER, stake);
    if (!stakeCheck.ok) {
      throw new GameEngineError('invalid-stake', `Stake inválido: ${stake}`);
    }

    const [minDelay, maxDelay] = this.matchmakingDelayMs;
    await delay(randomInt(this.rng, minDelay, maxDelay), params.signal);

    const profile = pickRandom(this.rng, OPPONENT_PROFILES);
    const match = matchSchema.parse({
      id: createId(),
      opponent: { ...profile, id: createId() },
      stake,
      createdAt: Date.now(),
    });

    this.activeMatches.set(match.id, match);
    return match;
  }

  async setStake(params: SetStakeParams): Promise<Match> {
    const match = this.activeMatches.get(params.matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${params.matchId}`);
    }

    const stakeCheck = validateStake(Number.MAX_SAFE_INTEGER, params.stake);
    if (!stakeCheck.ok) {
      throw new GameEngineError('invalid-stake', `Stake inválido: ${params.stake}`);
    }

    const updated = matchSchema.parse({ ...match, stake: params.stake });
    this.activeMatches.set(updated.id, updated);
    return updated;
  }

  async beginRound(params: BeginRoundParams): Promise<BlackjackRoundState> {
    const match = this.activeMatches.get(params.matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${params.matchId}`);
    }

    // Uma rodada por vez: distribuir por cima de uma mão em andamento
    // abandonaria silenciosamente uma rodada que nunca produziria
    // `result` — e a aposta dela já foi debitada.
    const inFlight = this.activeRounds.get(match.id);
    if (inFlight && !inFlight.settled) {
      throw new GameEngineError('illegal-action', 'Já há uma rodada em andamento nesta partida.');
    }

    await delay(this.dealDelayMs);

    // O reembaralho por limiar acontece SÓ aqui, entre rodadas — uma
    // rodada em andamento nunca troca de baralho no meio.
    let deck = this.decks.get(match.id);
    if (!deck || deck.length < DECK_RESHUFFLE_THRESHOLD) {
      deck = buildDeck(this.rng);
      this.decks.set(match.id, deck);
    }

    const forced = this.allowForcedDeals ? params.forcedDeal : undefined;
    if (forced) {
      // Empilha as 4 cartas da distribuição no TOPO do baralho (drawCard
      // tira do fim do array, então entram invertidas). As cópias dessas
      // cartas saem do maço antes: sem isso o baralho ficaria com dois
      // Ases de espadas circulando nas rodadas seguintes, e o "baralho
      // único" deixaria de ser verdade. As compras que vierem depois
      // seguem do baralho normal — o desfecho já está garantido pelos
      // naturais (ver forcedDealFor).
      const stacked = forcedDealFor(forced);
      const isStacked = (card: Card) =>
        stacked.some((s) => s.rank === card.rank && s.suit === card.suit);
      const rest = deck.filter((card) => !isStacked(card));
      deck.length = 0;
      deck.push(...rest, ...[...stacked].reverse());
    }

    const { playerHand, opponentHand } = dealInitialHands(deck);
    const round: ActiveRound = {
      playerHand,
      opponentHand,
      /* Um blackjack natural NÃO fecha a mão na distribuição. Fechá-la
         seria o maior tell da mesa: quem tirasse 21 sairia do rodízio na
         hora, sem relógio nem botões, e o outro lado descobriria a mão
         perfeita antes de qualquer carta virar. Aqui quem tem o natural
         joga a vez como todo mundo — pode parar (o normal), pode pedir
         carta e jogar o 21 fora, pode propor dobrar. O blefe continua
         possível dos dois lados. */
      playerClosed: false,
      opponentClosed: false,
      settled: false,
    };
    this.activeRounds.set(match.id, round);

    return this.openTurn(match, round);
  }

  async commit(params: CommitParams): Promise<BlackjackRoundState> {
    const match = this.activeMatches.get(params.matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${params.matchId}`);
    }
    const round = this.activeRounds.get(match.id);
    if (!round || round.settled || round.playerClosed || round.playerChoice) {
      throw new GameEngineError('illegal-action', 'Não há escolha a travar nesta vez.');
    }

    // Travar a escolha é instantâneo de propósito: nada acontece na mesa
    // até a vez fechar, e um delay aqui só atrasaria o martelo do jogador.
    round.playerChoice = params.action;
    return this.turnState(match.id, round);
  }

  async resolveTurn(params: ResolveTurnParams): Promise<BlackjackRoundState> {
    const match = this.activeMatches.get(params.matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${params.matchId}`);
    }
    const round = this.activeRounds.get(match.id);
    if (!round || round.settled) {
      throw new GameEngineError('illegal-action', 'Não há vez aberta para fechar.');
    }

    await delay(this.dealDelayMs);

    /* O que o rival enxerga da sua mão: tudo menos a última carta —
       SALVO quando você estoura. Estouro é público em qualquer mesa (a
       mão vira na hora), e esconder isso abriria uma brecha real: ele
       seguiria pedindo contra um adversário que já perdeu, estouraria
       junto de vez em quando, e o empate devolveria a aposta de quem
       estourou primeiro.

       Ele decide AGORA, com a mesa como estava no início da vez: a sua
       carta desta vez ainda não saiu, e é isso que faz a escolha ser
       simultânea de verdade — nenhum dos dois vê o lance do outro. */
    const playerBusted = isBust(round.playerHand);
    const playerVisibleTotal = playerBusted
      ? handValue(round.playerHand).total
      : handValue(visibleCards(round.playerHand)).total;
    const opponentAction = round.opponentClosed
      ? undefined
      : botAction(round.opponentHand, playerVisibleTotal);

    // Sem escolha travada, a mesa PARA a mão pelo dono dela: é o
    // desfecho seguro de um relógio que zerou — parar nunca estoura.
    const timedOut = !round.playerClosed && round.playerChoice === undefined;
    const playerAction = round.playerClosed ? undefined : (round.playerChoice ?? 'stand');

    const turn: TableTurn = {};
    if (playerAction)
      turn.player = this.applyMove(match.id, round, 'player', playerAction, timedOut);
    if (opponentAction) {
      turn.opponent = this.applyMove(match.id, round, 'opponent', opponentAction, false);
    }

    round.lastTurn = turn;
    round.playerChoice = undefined;
    return this.openTurn(match, round);
  }

  /**
   * Aplica UM lance à mão de um duelista. Uma mão fecha ao parar, ao
   * estourar ou ao cravar 21 — dali em diante ela fica de fora das vezes.
   */
  private applyMove(
    matchId: string,
    round: ActiveRound,
    by: Duelist,
    action: PlayerAction,
    timedOut: boolean,
  ): TableMove {
    const hand = by === 'player' ? round.playerHand : round.opponentHand;
    let bust = false;
    let closed = true;

    if (action === 'hit') {
      hand.push(drawCard(this.deckFor(matchId)));
      const { total } = handValue(hand);
      bust = total > 21;
      closed = total >= 21;
    }

    if (by === 'player') round.playerClosed = closed;
    else round.opponentClosed = closed;
    return { by, action, closed, bust, timedOut };
  }

  /**
   * Abre a vez seguinte (ou a primeira, na distribuição). Com as duas
   * mãos fechadas não há mais o que escolher: a mesa vai ao showdown.
   */
  private openTurn(match: Match, round: ActiveRound): BlackjackRoundState {
    if (round.playerClosed && round.opponentClosed) {
      return this.settleRound(match, round);
    }
    return this.turnState(match.id, round);
  }

  /** Estado da vez corrente, já filtrado pelo POV do jogador. */
  private turnState(matchId: string, round: ActiveRound): BlackjackRoundState {
    const canChoose = !round.playerClosed && round.playerChoice === undefined;
    return blackjackRoundStateSchema.parse({
      matchId,
      phase: 'choosing',
      playerHand: round.playerHand,
      // A última carta do rival não sai daqui: o jogador decide com a
      // mesma informação parcial que o rival tem sobre ele.
      opponentVisible: visibleCards(round.opponentHand),
      opponentHidden: 1,
      legalActions: canChoose ? ['hit', 'stand'] : [],
      playerChoice: round.playerChoice,
      lastTurn: round.lastTurn,
      playerClosed: round.playerClosed,
      opponentClosed: round.opponentClosed,
    });
  }

  /**
   * Showdown: as duas mãos já foram jogadas vez a vez e agora se
   * comparam. É aqui, e só aqui, que tudo vira para cima.
   */
  private settleRound(match: Match, round: ActiveRound): BlackjackRoundState {
    const opponentHand = round.opponentHand;
    const player = standingOf(round.playerHand);
    const opponent = standingOf(opponentHand);
    const outcome = resolveOutcome(player, opponent);

    round.settled = true;

    const result: RoundResult = {
      id: createId(),
      matchId: match.id,
      playerHand: round.playerHand,
      opponentHand,
      playerTotal: player.total,
      opponentTotal: opponent.total,
      playerBust: player.bust,
      opponentBust: opponent.bust,
      playerNatural: player.natural,
      opponentNatural: opponent.natural,
      outcome,
      stake: match.stake,
      payout: payoutFor(outcome, match.stake),
      netChange: netChangeFor(outcome, match.stake),
      completedAt: Date.now(),
    };

    return blackjackRoundStateSchema.parse({
      matchId: match.id,
      phase: 'settled',
      playerHand: round.playerHand,
      opponentVisible: opponentHand,
      opponentHidden: 0,
      legalActions: [],
      lastTurn: round.lastTurn,
      playerClosed: true,
      opponentClosed: true,
      result,
    });
  }

  /** Baralho da partida em andamento (criado sempre em beginRound). */
  private deckFor(matchId: string): Card[] {
    const deck = this.decks.get(matchId);
    if (!deck) {
      throw new GameEngineError('internal', 'Baralho ausente — beginRound não foi chamado.');
    }
    return deck;
  }
}

export interface LocalEngineOptions {
  /** Fonte de aleatoriedade. Default: CryptoRng. */
  rng?: Rng;
  /** Janela [min, max] em ms para o delay simulado de matchmaking. */
  matchmakingDelayMs?: readonly [number, number];
  /** Delay simulado em ms para distribuir cartas e resolver ações. */
  dealDelayMs?: number;
  /** Habilita `forcedDeal` em beginRound (DevTools/testes). */
  allowForcedDeals?: boolean;
}

/** Espera `ms` milissegundos, rejeitando com `aborted` se o sinal disparar. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GameEngineError('aborted', 'Busca cancelada.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GameEngineError('aborted', 'Busca cancelada.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
