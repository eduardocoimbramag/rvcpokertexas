import { z } from 'zod';

/**
 * Tipos de domínio comuns a QUALQUER mesa desta casa, validados com Zod:
 * a carta, os dois lados do feltro, o oponente e a partida.
 *
 * Este arquivo já foi o domínio inteiro do duelo de 21 — mão, ação de
 * jogador (`hit`/`stand`), fase da rodada, lance de mesa e o estado da
 * rodada de blackjack moravam aqui. Aquele jogo saiu do projeto
 * (docs/limpeza.md), e o que ficou é o que o poker também usa: nada
 * daqui fala de pontuação, porque pontuar é regra de jogo, e cada jogo
 * tem a sua (o Hold'em pontua em `poker/handRank.ts`).
 *
 * O domínio próprio do poker — mão, rua, resultado, histórico — vive em
 * `engine/poker/types.ts`, que importa a carta e o duelista daqui.
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

/** Os dois lados da mesa. */
export const duelistSchema = z.enum(['player', 'opponent']);
export type Duelist = z.infer<typeof duelistSchema>;

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
