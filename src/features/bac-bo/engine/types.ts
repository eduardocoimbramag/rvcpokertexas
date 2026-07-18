import { z } from 'zod';

/**
 * Tipos de domínio do Bac Bo, validados com Zod.
 * Todos os dados que atravessam a fronteira da engine são validados aqui —
 * o mesmo contrato valerá para a futura `ApiBacBoGameEngine`.
 */

/** Valor de uma face de dado (1 a 6). */
export const dieValueSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type DieValue = z.infer<typeof dieValueSchema>;

/** Par de dados de um lado da mesa. */
export const dicePairSchema = z.tuple([dieValueSchema, dieValueSchema]);
export type DicePair = z.infer<typeof dicePairSchema>;

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

/** Resultado completo de uma rodada, produzido exclusivamente pela engine. */
export const roundResultSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  /** Dados azuis (jogador). */
  playerDice: dicePairSchema,
  /** Dados vermelhos (oponente). */
  opponentDice: dicePairSchema,
  playerTotal: z.number().int().min(2).max(12),
  opponentTotal: z.number().int().min(2).max(12),
  outcome: roundOutcomeSchema,
  stake: z.number().int().positive(),
  /** Créditos devolvidos ao jogador (vitória: 2× stake; empate: stake; derrota: 0). */
  payout: z.number().int().nonnegative(),
  /** Variação líquida de saldo da rodada (payout − stake). */
  netChange: z.number().int(),
  completedAt: z.number().int().nonnegative(),
});
export type RoundResult = z.infer<typeof roundResultSchema>;

/** Entrada do histórico persistido (resultado + nome do oponente). */
export const historyEntrySchema = roundResultSchema.extend({
  opponentName: z.string().min(1),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
