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

/**
 * Distribuição empilhada pelo DevTools. Além dos três desfechos, o
 * `blackjack` põe um natural na SUA mão sob demanda — é o que acende a
 * brasa nas cartas sem depender da sorte do baralho.
 */
export const forcedDealSchema = z.enum(['win', 'lose', 'tie', 'blackjack']);
export type ForcedDeal = z.infer<typeof forcedDealSchema>;

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
 * Fase de uma rodada em andamento.
 *
 * A vez é SIMULTÂNEA: em `choosing` os dois duelistas decidem ao mesmo
 * tempo, cada um sem saber o que o outro escolheu, e os dois lances são
 * executados juntos quando a vez fecha. Ninguém joga "depois" de
 * ninguém — é um duelo, não um rodízio.
 */
export const roundPhaseSchema = z.enum(['choosing', 'settled']);
export type RoundPhase = z.infer<typeof roundPhaseSchema>;

/** Os dois lados da mesa. */
export const duelistSchema = z.enum(['player', 'opponent']);
export type Duelist = z.infer<typeof duelistSchema>;

/** O lance de um duelista numa vez, já executado. */
export const tableMoveSchema = z.object({
  by: duelistSchema,
  action: playerActionSchema,
  /** A mão de quem jogou fechou neste lance (parou, estourou ou fez 21). */
  closed: z.boolean(),
  /** O lance estourou a mão (só acontece pedindo carta). */
  bust: z.boolean(),
  /** Ninguém escolheu a tempo: a mesa parou a mão pelo dono dela. */
  timedOut: z.boolean(),
});
export type TableMove = z.infer<typeof tableMoveSchema>;

/**
 * Os dois lances de uma vez, revelados JUNTOS — é o que a mesa anuncia.
 * Um lado sai de fora quando a mão dele já estava fechada.
 */
export const tableTurnSchema = z.object({
  player: tableMoveSchema.optional(),
  opponent: tableMoveSchema.optional(),
});
export type TableTurn = z.infer<typeof tableTurnSchema>;

/**
 * Estado de uma rodada interativa, do PONTO DE VISTA DO JOGADOR.
 *
 * A regra da mesa do duelo é a MESA CEGA: nenhuma carta atravessa a
 * mesa, em nenhuma das duas direções. Por isso `opponentVisible` sai
 * daqui VAZIO e nem uma carta do rival chega à UI (nem ao DevTools) —
 * o que atravessa é só quantas ele tem na mesa, em `opponentHidden`. O
 * que se sabe dele é o gesto (pediu carta ou parou), e mais nada; no
 * `settled` o `result` abre tudo de uma vez.
 *
 * O contrato é simétrico: o bot decide sem ver uma carta sua (ver
 * `blindBotAction`). A mesa única do torneio é outra regra — lá cada
 * mão fica aberta menos a última carta (ver `visibleCards`).
 *
 * A vez é SIMULTÂNEA: os dois escolhem ao mesmo tempo e os dois lances
 * saem juntos. A escolha do rival NUNCA atravessa esta fronteira antes
 * da hora — o que sai daqui é só o `lastTurn`, com os dois lances já
 * executados. Quem já fechou a mão fica de fora das vezes seguintes.
 */
export const blackjackRoundStateSchema = z
  .object({
    matchId: z.string().min(1),
    phase: roundPhaseSchema,
    /** Sua mão, sempre inteira: o segredo é da mão ALHEIA. */
    playerHand: handSchema,
    /** Cartas abertas do rival: VAZIO no duelo cego, a mão toda no showdown. */
    opponentVisible: z.array(cardSchema),
    /** Quantas cartas do rival seguem viradas para baixo (0 no showdown). */
    opponentHidden: z.number().int().min(0),
    /** Ações legais agora (vazio depois de você travar a sua escolha). */
    legalActions: z.array(playerActionSchema),
    /** A escolha que você já travou nesta vez; ausente enquanto pensa. */
    playerChoice: playerActionSchema.optional(),
    /** Os dois lances da vez que acabou de fechar. */
    lastTurn: tableTurnSchema.optional(),
    /** A sua mão já fechou (parou, estourou ou fez 21). */
    playerClosed: z.boolean(),
    /** A mão do rival já fechou. */
    opponentClosed: z.boolean(),
    result: roundResultSchema.optional(),
  })
  .refine((state) => (state.phase === 'settled') === (state.result !== undefined), {
    message: 'result deve existir se — e somente se — a rodada estiver settled',
  })
  .refine(
    (state) =>
      state.legalActions.length > 0 ===
      (state.phase === 'choosing' && !state.playerClosed && state.playerChoice === undefined),
    { message: 'só há ações enquanto a sua mão está viva e sem escolha travada' },
  );
export type BlackjackRoundState = z.infer<typeof blackjackRoundStateSchema>;

/** Entrada do histórico persistido (resultado + nome do oponente). */
export const historyEntrySchema = roundResultSchema.extend({
  opponentName: z.string().min(1),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
