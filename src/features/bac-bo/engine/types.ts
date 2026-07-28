import { z } from 'zod';

/**
 * Tipos de domínio do Blackjack, validados com Zod.
 * Todos os dados que atravessam a fronteira da engine são validados aqui —
 * o mesmo contrato valerá para a futura `ApiBlackjackGameEngine`.
 */

/** Valor de face de uma carta (A, 2–10, J, Q, K). */
export const cardRankSchema = z.enum([
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
]);
export type CardRank = z.infer<typeof cardRankSchema>;

/** Naipe de uma carta. */
export const cardSuitSchema = z.enum(['spades', 'hearts', 'diamonds', 'clubs']);
export type CardSuit = z.infer<typeof cardSuitSchema>;

/** Uma carta do baralho. */
export const cardSchema = z.object({
  rank: cardRankSchema,
  suit: cardSuitSchema,
});
export type Card = z.infer<typeof cardSchema>;

/** Mão completa de um duelista (mínimo: as duas cartas iniciais). */
export const handSchema = z.array(cardSchema).min(2);
export type Hand = z.infer<typeof handSchema>;

/** Ações que o jogador pode tomar na própria vez. */
export const playerActionSchema = z.enum(['hit', 'stand']);
export type PlayerAction = z.infer<typeof playerActionSchema>;

/** Resultado de uma rodada sob a ótica do jogador. */
export const roundOutcomeSchema = z.enum(['win', 'lose', 'tie']);
export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;

/** Oponente simulado retornado pelo matchmaking. */
export const opponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().min(1),
  rating: z.number().int().min(0),
});
export type Opponent = z.infer<typeof opponentSchema>;

/** Partida criada pelo matchmaking. */
export const matchSchema = z.object({
  id: z.string().min(1),
  opponent: opponentSchema,
  stake: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
});
export type Match = z.infer<typeof matchSchema>;

/**
 * Resultado completo de uma rodada, produzido exclusivamente pela engine.
 * É o único lugar em que as duas mãos aparecem INTEIRAS — antes do
 * showdown a última carta de cada duelista é segredo do dono.
 */
export const roundResultSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  playerHand: handSchema,
  opponentHand: handSchema,
  /** Melhor total da mão (4 a 30 — acima de 21 é estouro). */
  playerTotal: z.number().int().min(4).max(30),
  opponentTotal: z.number().int().min(4).max(30),
  playerBust: z.boolean(),
  opponentBust: z.boolean(),
  /** Blackjack natural (21 nas duas primeiras cartas). */
  playerNatural: z.boolean(),
  opponentNatural: z.boolean(),
  outcome: roundOutcomeSchema,
  stake: z.number().int().positive(),
  /** Créditos devolvidos ao jogador (stake + 90% do stake do rival). */
  payout: z.number().int().nonnegative(),
  /** Variação líquida de saldo da rodada (payout − stake). */
  netChange: z.number().int(),
  completedAt: z.number().int().nonnegative(),
});
export type RoundResult = z.infer<typeof roundResultSchema>;

/**
 * Fase de uma rodada em andamento. É de quem a fase, é de quem a VEZ: a
 * mesa alterna um lance de cada vez entre os dois duelistas.
 */
export const roundPhaseSchema = z.enum(['playerTurn', 'opponentTurn', 'settled']);
export type RoundPhase = z.infer<typeof roundPhaseSchema>;

/** Os dois lados da mesa. */
export const duelistSchema = z.enum(['player', 'opponent']);
export type Duelist = z.infer<typeof duelistSchema>;

/**
 * O último lance da mesa, para ela poder ANUNCIAR o que aconteceu. Cada
 * vez produz exatamente um destes — é o que o jogador lê antes de a vez
 * passar para o outro lado.
 */
export const tableMoveSchema = z.object({
  by: duelistSchema,
  action: playerActionSchema,
  /** A mão de quem jogou fechou neste lance (parou, estourou ou fez 21). */
  closed: z.boolean(),
  /** O lance estourou a mão (só acontece pedindo carta). */
  bust: z.boolean(),
});
export type TableMove = z.infer<typeof tableMoveSchema>;

/**
 * Estado de uma rodada interativa, do PONTO DE VISTA DO JOGADOR.
 *
 * A regra da mesa: cada duelista vê a mão do adversário MENOS a última
 * carta dela. Por isso `opponentVisible` traz só as cartas abertas do
 * rival e a oculta nem sai da engine — não há como a UI (nem o DevTools)
 * espiar o que ainda não foi virado. No `settled` o `result` abre tudo.
 *
 * A vez é ALTERNADA: um lance de cada lado, e quem já fechou a mão sai
 * do rodízio (o outro segue sozinho até fechar também).
 */
export const blackjackRoundStateSchema = z
  .object({
    matchId: z.string().min(1),
    phase: roundPhaseSchema,
    /** Sua mão, sempre inteira: o segredo é da última carta ALHEIA. */
    playerHand: handSchema,
    /** Cartas abertas do rival (a última fica de fora até o showdown). */
    opponentVisible: z.array(cardSchema),
    /** Quantas cartas do rival seguem viradas para baixo (0 no showdown). */
    opponentHidden: z.number().int().min(0),
    /** Ações legais do jogador neste momento (vazio fora da vez dele). */
    legalActions: z.array(playerActionSchema),
    /** Lance que acabou de acontecer; ausente na distribuição. */
    lastMove: tableMoveSchema.optional(),
    /** A sua mão já fechou (parou, estourou ou fez 21). */
    playerClosed: z.boolean(),
    /** A mão do rival já fechou. */
    opponentClosed: z.boolean(),
    result: roundResultSchema.optional(),
  })
  .refine((state) => (state.phase === 'settled') === (state.result !== undefined), {
    message: 'result deve existir se — e somente se — a rodada estiver settled',
  })
  .refine((state) => state.legalActions.length > 0 === (state.phase === 'playerTurn'), {
    message: 'só a vez do jogador oferece ações',
  });
export type BlackjackRoundState = z.infer<typeof blackjackRoundStateSchema>;

/** Entrada do histórico persistido (resultado + nome do oponente). */
export const historyEntrySchema = roundResultSchema.extend({
  opponentName: z.string().min(1),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
