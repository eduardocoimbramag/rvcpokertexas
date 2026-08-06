import { createId } from '@/shared/lib/ids';
import type { Rng } from '@/shared/lib/random';
import { CryptoRng, pickRandom, randomInt } from '@/shared/lib/random';

import { GameEngineError } from '../GameEngine';
import type { FindMatchParams, SetStakeParams } from '../GameEngine';
import { TABLE_ANTE, TABLE_MIN_BET, validateStake } from '../credits';
import { buildDeck, drawCard } from '../rules';
import type { Card, Duelist, Match, Opponent } from '../types';
import { matchSchema } from '../types';
import type {
  ActParams,
  AdvanceParams,
  BeginHandParams,
  LeaveTableParams,
  PokerEngine,
} from './PokerEngine';
import { compareRanks, decidingCard, rankName, readHand } from './handRank';
import type { HandRank } from './handRank';
import {
  botDecision,
  cardsDealtOn,
  contestedOf,
  firstToAct,
  forcedPokerDealFor,
  legalActionsFor,
  minRaiseTo as minRaiseToOf,
  nextStreet,
  opposite,
  potShareFor,
} from './rules';
import type {
  HandRankSummary,
  HoleCards,
  PokerAction,
  PokerMove,
  PokerOutcome,
  PokerResult,
  PokerRoundState,
  PokerSession,
  Street,
} from './types';
import { pokerRoundStateSchema, pokerSessionSchema } from './types';

/** Perfis de rivais simulados pelo matchmaking local. O campo `avatar`
 * guarda a INICIAL do monograma (a UI desenha o medalhão a partir do
 * nome — ver AvatarBadge); mantido no schema por compatibilidade. */
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

/** Fichas de cada lado da mesa. */
interface Sides {
  player: number;
  opponent: number;
}

/** Mão em andamento (só existe entre `beginHand` e o showdown). */
interface ActiveHand {
  matchId: string;
  stake: number;
  /** O menor lance que esta mesa aceita — e o piso de qualquer aumento. */
  minBet: number;
  button: Duelist;
  deck: Card[];
  playerHole: HoleCards;
  opponentHole: HoleCards;
  board: Card[];
  street: Street;
  /** Fichas restantes de cada lado. */
  stacks: Sides;
  /** Fichas postas NESTA rua. */
  committed: Sides;
  /** Fichas postas nas ruas ANTERIORES. */
  settledIn: Sides;
  /** Os stacks no instante em que a mão abriu, antes da entrada. */
  stacksBefore: Sides;
  /** Este lado já agiu na rua corrente. */
  acted: { player: boolean; opponent: boolean };
  /** De quem é a vez; `null` quando é a MESA que deve agir. */
  toAct: Duelist | null;
  lastMove?: PokerMove;
  foldedBy?: Duelist;
  settled: boolean;
  result?: PokerResult;
}

/**
 * Engine local do TEXAS HOLD'EM heads-up: matchmaking simulado com delay
 * artificial e uma mão honesta, tirada de um baralho de 52 cartas
 * embaralhado a cada mão — como em qualquer mesa de verdade.
 *
 * O SIGILO É ESTRUTURAL, e é a propriedade mais importante desta classe:
 * as duas cartas fechadas do rival nunca saem daqui antes do showdown. O
 * estado que atravessa a fronteira traz `opponentHole` VAZIO — nem a UI
 * nem o DevTools têm como espiá-las, porque elas não estão no objeto. E
 * uma mão que morre por desistência não abre: quem desiste MUCHA, como
 * manda a mesa.
 *
 * O contrato é simétrico: o bot decide sem ver uma carta sua (ver
 * `botDecision`, que recebe apenas a mão dele e o que está aberto).
 */
export class LocalPokerEngine implements PokerEngine {
  private readonly rng: Rng;
  private readonly matchmakingDelayMs: readonly [number, number];
  private readonly dealDelayMs: number;
  private readonly allowForcedDeals: boolean;
  private readonly activeMatches = new Map<string, Match>();
  private readonly hands = new Map<string, ActiveHand>();
  /** A MESA entre as mãos: stacks que sobrevivem, botão que passa. */
  private readonly sessions = new Map<string, PokerSession>();

  constructor(options: LocalPokerEngineOptions = {}) {
    this.rng = options.rng ?? new CryptoRng();
    this.matchmakingDelayMs = options.matchmakingDelayMs ?? [1200, 2600];
    this.dealDelayMs = options.dealDelayMs ?? 250;
    this.allowForcedDeals = options.allowForcedDeals ?? false;
  }

  async findMatch(params: FindMatchParams): Promise<Match> {
    // Só existe um duelo por vez: abrir uma busca nova descarta qualquer
    // partida anterior.
    this.activeMatches.clear();
    this.hands.clear();
    this.sessions.clear();
    // Sem stake informado, a partida abre na entrada da mesa: é o menor
    // stack com que se pode sentar, e o que a casa cobra para abrir o
    // pote.
    const stake = params.stake ?? TABLE_ANTE;
    if (!validateStake(Number.MAX_SAFE_INTEGER, stake).ok) {
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
    const match = this.matchOf(params.matchId);
    if (!validateStake(Number.MAX_SAFE_INTEGER, params.stake).ok) {
      throw new GameEngineError('invalid-stake', `Stake inválido: ${params.stake}`);
    }
    const updated = matchSchema.parse({ ...match, stake: params.stake });
    this.activeMatches.set(updated.id, updated);
    return updated;
  }

  async beginHand(params: BeginHandParams): Promise<PokerRoundState> {
    const match = this.matchOf(params.matchId);

    // Uma mão por vez: distribuir por cima de outra em andamento
    // abandonaria silenciosamente uma mão que nunca produziria `result` —
    // e a aposta dela já foi debitada.
    const inFlight = this.hands.get(match.id);
    if (inFlight && !inFlight.settled) {
      throw new GameEngineError('illegal-action', 'Já há uma mão em andamento nesta partida.');
    }

    await delay(this.dealDelayMs);

    // O baralho é NOVO a cada mão, como numa mesa de verdade: no Hold'em
    // o maço volta inteiro e se embaralha entre uma mão e outra.
    const deck = buildDeck(this.rng);
    const forced = this.allowForcedDeals ? params.forcedDeal : undefined;
    if (forced) stackDeck(deck, forced);

    /* A MESA continua de onde parou. Na primeira mão a sessão nasce com o
       buy-in dos dois lados e o botão sorteado — dá-lo sempre ao jogador
       seria entregar a posição de graça. Da segunda em diante os stacks
       são os que sobraram da anterior e o botão já passou de lado. */
    const session = this.sessions.get(match.id) ?? this.openSession(match);
    if (session.over) {
      throw new GameEngineError('illegal-action', 'Esta mesa já fechou.');
    }
    const button = session.button;

    // Uma carta de cada vez, na ordem da mesa: jogador, rival, jogador, rival.
    const p1 = drawCard(deck);
    const o1 = drawCard(deck);
    const p2 = drawCard(deck);
    const o2 = drawCard(deck);

    /* A ENTRADA da mesa é uma aposta forçada e IGUAL dos dois lados, e é
       cobrada A CADA MÃO: sai do stack antes de qualquer decisão, e é
       dela que nasce o pote que se disputa. Ela nunca passa do stack —
       num stack curto, entrar custa tudo o que se tem, e a mão é decidida
       no all-in que já nasceu feito. */
    const ante: Sides = {
      player: Math.min(TABLE_ANTE, session.stacks.player),
      opponent: Math.min(TABLE_ANTE, session.stacks.opponent),
    };
    const stacks: Sides = {
      player: session.stacks.player - ante.player,
      opponent: session.stacks.opponent - ante.opponent,
    };
    const committed: Sides = { ...ante };

    const hand: ActiveHand = {
      matchId: match.id,
      stake: match.stake,
      /* O stack de cada lado ANTES da entrada: é a régua do balanço da
         mão, e sem ela o `netChange` teria de ser reconstituído somando
         apostas — uma conta que erra na primeira aposta não coberta. */
      stacksBefore: { ...session.stacks },
      minBet: TABLE_MIN_BET,
      button,
      deck,
      playerHole: [p1, p2],
      opponentHole: [o1, o2],
      board: [],
      street: 'preflop',
      stacks,
      committed,
      settledIn: { player: 0, opponent: 0 },
      acted: { player: false, opponent: false },
      toAct: firstToAct('preflop', button),
      settled: false,
    };

    this.hands.set(match.id, hand);
    return this.table(match.id, hand);
  }

  async act(params: ActParams): Promise<PokerRoundState> {
    const match = this.matchOf(params.matchId);
    const hand = this.handOf(match.id);
    if (hand.settled || hand.toAct !== 'player') {
      throw new GameEngineError('illegal-action', 'Não é a vez do jogador.');
    }

    const legal = this.legalFor(hand, 'player');
    if (!legal.includes(params.action)) {
      throw new GameEngineError('illegal-action', `Ação ilegal agora: ${params.action}`);
    }

    this.applyMove(hand, 'player', params.action, params.to, params.timedOut ?? false);
    return this.table(match.id, hand);
  }

  async advance(params: AdvanceParams): Promise<PokerRoundState> {
    const match = this.matchOf(params.matchId);
    const hand = this.handOf(match.id);
    if (hand.settled) {
      throw new GameEngineError('illegal-action', 'A mão já foi decidida.');
    }
    if (hand.toAct === 'player') {
      throw new GameEngineError('illegal-action', 'A mesa não joga pelo jogador.');
    }

    await delay(this.dealDelayMs);

    if (hand.toAct === 'opponent') {
      this.playBot(hand);
    } else {
      this.openNextStreet(hand);
    }
    return this.table(match.id, hand);
  }

  /* ---------------- Mesa ---------------- */

  /** As ações legais de um lado, com o teto do stack já aplicado. */
  private legalFor(hand: ActiveHand, side: Duelist): PokerAction[] {
    const rival = opposite(side);
    return legalActionsFor({
      toCall: this.toCallFor(hand, side),
      stack: hand.stacks[side],
      rivalHasChips: hand.stacks[rival] > 0,
    });
  }

  /** Quanto falta a um lado pagar — nunca mais do que ele tem. */
  private toCallFor(hand: ActiveHand, side: Duelist): number {
    const owed = hand.committed[opposite(side)] - hand.committed[side];
    return Math.max(0, Math.min(owed, hand.stacks[side]));
  }

  /**
   * O TETO de um aumento: o stack efetivo da mesa, não o de quem aposta.
   * Apostar acima do que o rival tem para cobrir só criaria uma aposta
   * que volta sozinha ao dono — a mesa poupa os dois disso.
   */
  private maxRaiseFor(hand: ActiveHand, side: Duelist): number {
    const rival = opposite(side);
    return Math.min(
      hand.committed[side] + hand.stacks[side],
      hand.committed[rival] + hand.stacks[rival],
    );
  }

  /** O piso de um aumento, respeitando o teto do all-in. */
  private minRaiseFor(hand: ActiveHand, side: Duelist): number {
    const maxCommitted = Math.max(hand.committed.player, hand.committed.opponent);
    const floor = minRaiseToOf(maxCommitted, hand.minBet);
    return Math.min(floor, this.maxRaiseFor(hand, side));
  }

  /** Executa UM lance e reabre (ou fecha) a vez. */
  private applyMove(
    hand: ActiveHand,
    side: Duelist,
    action: PokerAction,
    to: number | undefined,
    timedOut: boolean,
  ): void {
    const toCall = this.toCallFor(hand, side);
    let amount = 0;

    if (action === 'fold') {
      hand.foldedBy = side;
    } else if (action === 'call') {
      amount = toCall;
    } else if (action === 'raise') {
      const min = this.minRaiseFor(hand, side);
      const max = this.maxRaiseFor(hand, side);
      const target = to ?? min;
      if (target < min || target > max) {
        throw new GameEngineError(
          'illegal-action',
          `Aumento fora dos limites da rua: ${target} (permitido de ${min} a ${max}).`,
        );
      }
      amount = target - hand.committed[side];
    }

    hand.stacks[side] -= amount;
    hand.committed[side] += amount;
    hand.acted[side] = true;
    hand.lastMove = {
      by: side,
      action,
      amount,
      to: hand.committed[side],
      allIn: action !== 'fold' && hand.stacks[side] === 0,
      timedOut,
    };

    if (action === 'fold') {
      this.settle(hand);
      return;
    }

    // Um aumento reabre a rua: o rival tem de responder de novo.
    if (action === 'raise') hand.acted[opposite(side)] = false;

    hand.toAct = this.bettingClosed(hand) ? null : opposite(side);
  }

  /**
   * A rua fechou: os dois falaram e os compromissos se igualaram — ou o
   * lado que ficou devendo não tem mais ficha para pagar (all-in por
   * menos, cuja diferença volta a quem apostou).
   */
  private bettingClosed(hand: ActiveHand): boolean {
    if (!hand.acted.player || !hand.acted.opponent) return false;
    if (hand.committed.player === hand.committed.opponent) return true;
    const behind = hand.committed.player < hand.committed.opponent ? 'player' : 'opponent';
    return hand.stacks[behind] === 0;
  }

  /** O rival joga a vez dele — sem ver uma carta sua. */
  private playBot(hand: ActiveHand): void {
    const legalActions = this.legalFor(hand, 'opponent');
    const decision = botDecision({
      hole: hand.opponentHole,
      board: hand.board,
      toCall: this.toCallFor(hand, 'opponent'),
      pot: this.potOf(hand),
      stack: hand.stacks.opponent,
      committed: hand.committed.opponent,
      minRaiseTo: this.minRaiseFor(hand, 'opponent'),
      maxRaiseTo: this.maxRaiseFor(hand, 'opponent'),
      legalActions,
      rng: this.rng,
    });

    // A decisão passa pelo mesmo filtro de legalidade do jogador: uma
    // cabeça que devolvesse um lance impossível não pode mexer na mesa.
    const action = legalActions.includes(decision.action)
      ? decision.action
      : legalActions.includes('check')
        ? 'check'
        : 'fold';
    this.applyMove(hand, 'opponent', action, decision.to, false);
  }

  /**
   * A mesa abre a rua seguinte: recolhe as apostas da rua que fechou,
   * vira as comunitárias e devolve a palavra a quem começa.
   *
   * Com alguém ALL-IN não há mais o que apostar: as ruas restantes correm
   * uma a uma até o river, sem vez para ninguém — é o "run it out" de
   * qualquer sala, e é o que dá ao showdown o suspense de ver as cartas
   * caírem uma por uma.
   */
  private openNextStreet(hand: ActiveHand): void {
    hand.settledIn.player += hand.committed.player;
    hand.settledIn.opponent += hand.committed.opponent;
    hand.committed = { player: 0, opponent: 0 };

    const next = nextStreet(hand.street);
    if (next === null || next === 'showdown') {
      hand.street = 'showdown';
      this.settle(hand);
      return;
    }

    hand.street = next;
    for (let index = 0; index < cardsDealtOn(next); index += 1) {
      hand.board.push(drawCard(hand.deck));
    }

    hand.lastMove = undefined;

    const allIn = hand.stacks.player === 0 || hand.stacks.opponent === 0;
    hand.acted = { player: allIn, opponent: allIn };
    hand.toAct = allIn ? null : firstToAct(next, hand.button);
  }

  /** Tudo o que está no pote agora (ruas anteriores + rua corrente). */
  private potOf(hand: ActiveHand): number {
    const { settledIn, committed } = hand;
    return settledIn.player + settledIn.opponent + committed.player + committed.opponent;
  }

  /**
   * O POTE É DECIDIDO. Ou alguém desistiu — e quem ficou leva sem mostrar
   * nada —, ou as duas mãos se comparam no showdown.
   */
  private settle(hand: ActiveHand): void {
    hand.settledIn.player += hand.committed.player;
    hand.settledIn.opponent += hand.committed.opponent;
    hand.committed = { player: 0, opponent: 0 };

    const committed = { ...hand.settledIn };
    const contested = contestedOf(committed.player, committed.opponent);

    /* AS DUAS MÃOS SÃO LIDAS SEMPRE, inclusive numa desistência: é o que
       permite ao duelo mostrar, no fim, o que cada um tinha. Quem decide
       o pote continua sendo outra coisa — a comparação, no showdown, ou
       a desistência, quando ela acontece. */
    const playerRank = readHand(hand.playerHole, hand.board);
    const opponentRank = readHand(hand.opponentHole, hand.board);

    let outcome: PokerOutcome;
    let decided: Card | undefined;
    const showdown = hand.foldedBy === undefined;

    if (hand.foldedBy) {
      outcome = hand.foldedBy === 'player' ? 'lose' : 'win';
    } else {
      const verdict = compareRanks(playerRank, opponentRank);
      outcome = verdict > 0 ? 'win' : verdict < 0 ? 'lose' : 'tie';

      /* A carta que separou as duas mãos, mas SÓ quando elas leem igual
         — mesmo nome, mesmo detalhe, as duas placas escrevendo a mesma
         frase. É essa a pergunta que a mesa provoca: "os dois tinham par
         de Damas, como é que um ganhou?".

         Um par de Ases contra um par de Reis não provoca pergunta
         nenhuma: as placas já dizem coisas diferentes, e escrever
         "decidiu no Ás" embaixo de "um par de Ases" seria repetir o
         nome da mão com outras palavras. */
      if (playerRank.label === opponentRank.label) {
        if (verdict > 0) decided = decidingCard(playerRank, opponentRank);
        else if (verdict < 0) decided = decidingCard(opponentRank, playerRank);
      }
    }

    /* AS FICHAS VOLTAM PARA OS STACKS. É aqui que a mesa vira sessão: o
       pote não é convertido em crédito de saldo, ele é repartido em
       fichas que continuam no feltro para a mão seguinte. O total da
       mesa não muda — as fichas só trocam de lado (ver `potShareFor`). */
    const share = potShareFor(outcome, committed);
    hand.stacks.player += share.player;
    hand.stacks.opponent += share.opponent;

    const session = this.advanceSession(hand);

    hand.settled = true;
    hand.toAct = null;
    hand.result = {
      id: createId(),
      matchId: hand.matchId,
      playerHole: hand.playerHole,
      opponentHole: hand.opponentHole,
      board: [...hand.board],
      playerRank: summarize(playerRank),
      opponentRank: summarize(opponentRank),
      showdown,
      /* A carta que decidiu vai inteira, e não só o nome dela: a placa
         do desfecho mostra a FACE dela ao lado da combinação, e um nome
         não se vira em carta do outro lado da fronteira. O nome sai
         daqui junto porque é a mesma verdade dita para o texto. */
      ...(decided ? { decidedBy: rankName(decided.rank), decidedCard: decided } : {}),
      ...(hand.foldedBy ? { foldedBy: hand.foldedBy } : {}),
      outcome,
      stake: hand.stake,
      committed,
      contested,
      pot: contested * 2,
      payout: hand.stacks.player,
      netChange: hand.stacks.player - hand.stacksBefore.player,
      session,
      completedAt: Date.now(),
    };
  }

  /**
   * A mesa como o JOGADOR a vê. É o único lugar em que o estado sai da
   * engine, e é por isso que o corte do sigilo mora aqui: as fechadas do
   * rival só entram no objeto quando a mão foi ao showdown.
   */
  private table(matchId: string, hand: ActiveHand): PokerRoundState {
    const settled = hand.settled;
    const legalActions = settled || hand.toAct !== 'player' ? [] : this.legalFor(hand, 'player');
    /* As fechadas do rival abrem quando a mão ACABA — por showdown ou
       por desistência. O sigilo que importa é o de DURANTE a mão; depois
       dela, ver o que o outro tinha é o que ensina a jogar contra ele. */
    const revealOpponent = settled;

    return pokerRoundStateSchema.parse({
      matchId,
      street: hand.street,
      phase: settled ? 'settled' : 'betting',
      button: hand.button,
      playerHole: hand.playerHole,
      // As duas cartas do rival NÃO atravessam esta fronteira enquanto a
      // mão corre. Acabada, elas abrem — é o único momento em que
      // mostrá-las não conta nada a ninguém.
      opponentHole: revealOpponent ? hand.opponentHole : [],
      board: hand.board,
      stacks: hand.stacks,
      committed: hand.committed,
      pot: this.potOf(hand),
      toCall: this.toCallFor(hand, 'player'),
      minRaiseTo: this.minRaiseFor(hand, 'player'),
      maxRaiseTo: this.maxRaiseFor(hand, 'player'),
      legalActions,
      toAct: hand.toAct,
      ...(hand.lastMove ? { lastMove: hand.lastMove } : {}),
      // A leitura da SUA mão sai da sua própria mão, e existe desde a
      // distribuição: no pré-flop são as duas fechadas, do flop em
      // diante é a melhor de cinco.
      playerHandLabel: readHand(hand.playerHole, hand.board).label,
      session: this.sessionOf(matchId),
      ...(hand.result ? { result: hand.result } : {}),
    });
  }

  /* ---------------- A sessão ---------------- */

  /**
   * A MESA SE ABRE: os dois compram fichas pelo mesmo buy-in e o botão é
   * sorteado. Acontece uma vez por partida, na primeira distribuição.
   */
  private openSession(match: Match): PokerSession {
    const session = pokerSessionSchema.parse({
      matchId: match.id,
      buyIn: match.stake,
      stacks: { player: match.stake, opponent: match.stake },
      handsPlayed: 0,
      // Sorteado só na abertura; daí em diante ele PASSA (ver
      // `advanceSession`), que é como a posição se reparte numa sessão.
      button: this.rng.next() < 0.5 ? 'player' : 'opponent',
      over: false,
    });
    this.sessions.set(match.id, session);
    return session;
  }

  /**
   * A MESA DEPOIS DA MÃO: guarda os stacks como ficaram, passa o botão
   * para o outro lado e decide se ainda há mesa.
   *
   * A mesa fecha quando alguém não tem mais como pagar a entrada. Não é
   * "ficar sem ficha nenhuma": com 40 fichas e entrada de 100 não há mão
   * a jogar, e insistir só produziria mãos em que um dos lados está
   * all-in antes de ver carta.
   */
  private advanceSession(hand: ActiveHand): PokerSession {
    const previous = this.sessionOf(hand.matchId);
    const stacks: Sides = { ...hand.stacks };
    const busted: Duelist | undefined =
      stacks.player < TABLE_ANTE ? 'player' : stacks.opponent < TABLE_ANTE ? 'opponent' : undefined;

    const session = pokerSessionSchema.parse({
      ...previous,
      stacks,
      handsPlayed: previous.handsPlayed + 1,
      button: opposite(previous.button),
      over: busted !== undefined,
      ...(busted ? { bustedBy: busted } : {}),
    });
    this.sessions.set(hand.matchId, session);
    return session;
  }

  async leaveTable(params: LeaveTableParams): Promise<PokerSession> {
    const match = this.matchOf(params.matchId);
    const session = this.sessionOf(match.id);
    const hand = this.hands.get(match.id);

    /* Levantar da cadeira no meio de uma mão é abandonar as fichas que já
       estão no meio — e é isso que uma sala de verdade faz com quem sai:
       a mão é dada por perdida, não desfeita. */
    if (hand && !hand.settled) {
      throw new GameEngineError('illegal-action', 'Há uma mão em andamento nesta mesa.');
    }
    if (session.over) return session;

    const closed = pokerSessionSchema.parse({ ...session, over: true, leftBy: 'player' });
    this.sessions.set(match.id, closed);
    return closed;
  }

  private sessionOf(matchId: string): PokerSession {
    const session = this.sessions.get(matchId);
    if (!session) {
      throw new GameEngineError('illegal-action', 'Não há mesa aberta nesta partida.');
    }
    return session;
  }

  private matchOf(matchId: string): Match {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${matchId}`);
    }
    return match;
  }

  private handOf(matchId: string): ActiveHand {
    const hand = this.hands.get(matchId);
    if (!hand) {
      throw new GameEngineError('illegal-action', 'Não há mão em andamento nesta partida.');
    }
    return hand;
  }
}

export interface LocalPokerEngineOptions {
  /** Fonte de aleatoriedade. Default: CryptoRng. */
  rng?: Rng;
  /** Janela [min, max] em ms para o delay simulado de matchmaking. */
  matchmakingDelayMs?: readonly [number, number];
  /** Delay simulado em ms para distribuir cartas e para a mesa andar. */
  dealDelayMs?: number;
  /** Habilita `forcedDeal` em beginHand (DevTools/testes). */
  allowForcedDeals?: boolean;
}

/** A leitura de uma mão, reduzida ao que atravessa a fronteira. */
function summarize(rank: HandRank): HandRankSummary {
  return {
    category: rank.category,
    label: rank.label,
    detail: rank.detail,
    cards: [...rank.cards],
  };
}

/**
 * Empilha as nove cartas de uma mão forçada no TOPO do baralho (o topo é
 * o FIM do array — `drawCard` tira de lá, então elas entram invertidas).
 *
 * As cópias dessas cartas saem do maço antes: sem isso o baralho ficaria
 * com dois Ases de espadas circulando, e "um baralho de 52 cartas"
 * deixaria de ser verdade.
 */
function stackDeck(deck: Card[], deal: Parameters<typeof forcedPokerDealFor>[0]): void {
  const { holes, board } = forcedPokerDealFor(deal);
  const sequence = [...holes, ...board];
  const isStacked = (card: Card) =>
    sequence.some((stacked) => stacked.rank === card.rank && stacked.suit === card.suit);
  const rest = deck.filter((card) => !isStacked(card));
  deck.length = 0;
  deck.push(...rest, ...[...sequence].reverse());
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
