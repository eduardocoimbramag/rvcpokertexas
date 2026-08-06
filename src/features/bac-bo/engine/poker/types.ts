import { z } from 'zod';

import { cardSchema, duelistSchema } from '../types';
import { HAND_CATEGORIES } from './handRank';

/**
 * Tipos de domínio do TEXAS HOLD'EM 1v1 (heads-up), validados com Zod.
 * Todo dado que atravessa a fronteira da engine passa por aqui — o mesmo
 * contrato valerá para uma futura `ApiPokerEngine`.
 *
 * O baralho, a carta e os dois lados da mesa são os MESMOS do resto do
 * clube (`../types`): o que muda de um jogo para o outro é o que se faz
 * com as cartas, não o que elas são.
 */

/**
 * As ruas da mão, na ordem em que a mesa as abre. `showdown` não é uma
 * rua de aposta: é o instante em que as mãos fechadas viram.
 */
export const streetSchema = z.enum(['preflop', 'flop', 'turn', 'river', 'showdown']);
export type Street = z.infer<typeof streetSchema>;

/** Quantas cartas comunitárias a mesa tem aberto em cada rua. */
export const BOARD_SIZE: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
  showdown: 5,
};

/**
 * As quatro ações do jogo. O ALL-IN não é uma quinta: é um `raise` no
 * teto do stack (ou um `call` que consome tudo) — a mesa o marca com a
 * flag `allIn` do lance, e é assim que ela o anuncia.
 */
export const pokerActionSchema = z.enum(['fold', 'check', 'call', 'raise']);
export type PokerAction = z.infer<typeof pokerActionSchema>;

/** Resultado de uma mão sob a ótica do jogador. */
export const pokerOutcomeSchema = z.enum(['win', 'lose', 'tie']);
export type PokerOutcome = z.infer<typeof pokerOutcomeSchema>;

/**
 * Distribuição empilhada pelo DevTools/testes: garante o desfecho do
 * SHOWDOWN. Não força ninguém a desistir — quem desiste é quem joga.
 *
 * `flush` existe para ver a MESA, não o desfecho: é a mão que enche o
 * placar do vencedor com cinco cartas do mesmo naipe, e sem ela só se
 * chega a uma testando a sorte até cair.
 */
export const forcedPokerDealSchema = z.enum(['win', 'lose', 'tie', 'flush']);
export type ForcedPokerDeal = z.infer<typeof forcedPokerDealSchema>;

/** As duas cartas fechadas de um duelista. */
export const holeCardsSchema = z.tuple([cardSchema, cardSchema]);
export type HoleCards = z.infer<typeof holeCardsSchema>;

/** A leitura de uma mão, pronta para atravessar a fronteira e ser salva. */
export const handRankSummarySchema = z.object({
  category: z.enum(HAND_CATEGORIES),
  /** Nome da mão em português ("Dois pares, Reis e 9"). */
  label: z.string().min(1),
  /**
   * O que completa a categoria ("Reis e 9"). É o que decide entre duas
   * mãos da MESMA categoria — e por isso atravessa a fronteira em vez de
   * ser extraído do `label` com regex na tela. Vazio no royal flush.
   */
  detail: z.string(),
  /**
   * As cartas que a formaram — as CINCO da melhor mão, ou as DUAS
   * fechadas quando a mão morreu antes do flop e não havia cinco a
   * montar. São elas que a mesa acende no desfecho.
   */
  cards: z.array(cardSchema).min(2).max(5),
});
export type HandRankSummary = z.infer<typeof handRankSummarySchema>;

/** Um lance já executado na mesa. */
export const pokerMoveSchema = z.object({
  by: duelistSchema,
  action: pokerActionSchema,
  /** Fichas que saíram do stack neste lance (0 em check e fold). */
  amount: z.number().int().nonnegative(),
  /** Total comprometido por quem jogou NESTA rua, depois do lance. */
  to: z.number().int().nonnegative(),
  /** O lance consumiu o stack inteiro de quem jogou. */
  allIn: z.boolean(),
  /** Ninguém agiu a tempo: a mesa jogou pelo dono da vez. */
  timedOut: z.boolean(),
});
export type PokerMove = z.infer<typeof pokerMoveSchema>;

/** Fichas de cada lado da mesa. */
const sidesSchema = z.object({
  player: z.number().int().nonnegative(),
  opponent: z.number().int().nonnegative(),
});

/**
 * A MESA ENTRE AS MÃOS — o que sobrevive de uma para a seguinte.
 *
 * É o objeto que transforma o duelo de mão única numa SESSÃO: os stacks
 * não voltam ao buy-in quando a mão acaba, eles continuam de onde
 * pararam, e é por isso que ganhar um pote grande vale alguma coisa na
 * mão seguinte. O botão passa de lado a cada mão, para que a vantagem de
 * posição se reparta.
 *
 * A mesa fecha por uma de duas portas, e as duas estão aqui: alguém ficou
 * sem fichas para a entrada (`bustedBy`) ou o jogador levantou da cadeira
 * (`leftBy`).
 */
export const pokerSessionSchema = z.object({
  matchId: z.string().min(1),
  /** O stack com que cada lado sentou — a régua de todo lucro e prejuízo. */
  buyIn: z.number().int().positive(),
  /** Fichas de cada lado AGORA, entre uma mão e outra. */
  stacks: sidesSchema,
  /** Quantas mãos já fecharam nesta mesa. */
  handsPlayed: z.number().int().nonnegative(),
  /** Quem leva o botão na PRÓXIMA mão. */
  button: duelistSchema,
  /** A mesa acabou: não há mais mão a distribuir. */
  over: z.boolean(),
  /** Quem ficou sem fichas para pagar a entrada. */
  bustedBy: duelistSchema.optional(),
  /** Quem levantou da mesa por vontade própria. */
  leftBy: duelistSchema.optional(),
});
export type PokerSession = z.infer<typeof pokerSessionSchema>;

/**
 * Resultado completo de uma mão, produzido exclusivamente pela engine.
 * É o único lugar em que as DUAS mãos fechadas aparecem juntas.
 *
 * A conta de créditos é a mesma do clube, generalizada: o que se ganha
 * ou se perde é o que foi DISPUTADO (`contested`) — o que sobrou do stack
 * volta inteiro, e uma aposta que ninguém cobriu volta para quem a fez.
 */
export const pokerResultSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  playerHole: holeCardsSchema,
  opponentHole: holeCardsSchema,
  /** As comunitárias abertas até o fim da mão (0 a 5). */
  board: z.array(cardSchema).max(5),
  /**
   * A leitura de cada mão no instante em que a mesa parou — SEMPRE, e
   * inclusive quando alguém desistiu.
   *
   * Abrir as cartas de uma mão desistida é uma escolha desta mesa, e ela
   * é deliberada: numa sala de verdade quem desiste mucha, mas num duelo
   * de uma mão só o que se perde com isso é justamente a informação que
   * faz querer jogar de novo — ver que o rival largou a melhor mão, ou
   * que blefou com nada. É a única leitura que o duelo tem do adversário,
   * e ela chega quando a mão já acabou: não vaza nada.
   */
  playerRank: handRankSummarySchema,
  opponentRank: handRankSummarySchema,
  /** A mão foi ao showdown (as duas mãos se compararam de verdade). */
  showdown: z.boolean(),
  /**
   * A carta que DECIDIU, quando as duas mãos caíram na mesma categoria
   * ("os dois tinham par de Damas — ganhou no Ás"). Ausente quando as
   * categorias já diferem, porque aí o nome das mãos explica sozinho.
   *
   * Ela é calculada com as duas mãos à mesa e guardada aqui porque
   * nenhuma das duas sabe, sozinha, o que a fez ganhar.
   */
  decidedBy: z.string().optional(),
  /**
   * A mesma carta do `decidedBy`, inteira — é a que a placa do desfecho
   * mostra ao lado da combinação, e um nome não se vira em carta deste
   * lado da fronteira. Opcional também no histórico antigo, gravado
   * quando a mesa só guardava o nome.
   */
  decidedCard: cardSchema.optional(),
  /** Quem desistiu, quando ninguém foi ao showdown. */
  foldedBy: duelistSchema.optional(),
  outcome: pokerOutcomeSchema,
  /** Stack com que os dois entraram na mão (ver `tableStackFor`). */
  stake: z.number().int().positive(),
  /** Fichas que cada lado pôs no pote ao longo da mão. */
  committed: sidesSchema,
  /**
   * O que estava REALMENTE em disputa: o menor dos dois compromissos. Uma
   * aposta que o rival não cobriu não é pote — volta para quem a fez.
   */
  contested: z.number().int().nonnegative(),
  /** Pote disputado, os dois lados somados (`contested` × 2). */
  pot: z.number().int().nonnegative(),
  /**
   * O stack do jogador quando a mão fechou — o que ele levaria da mesa se
   * se levantasse ali (antes da comissão do caixa, ver `cashOutValue`).
   *
   * Numa mesa de mão única isto era o crédito que voltava ao saldo no ato.
   * Numa SESSÃO o saldo não se mexe entre as mãos: as fichas ficam no
   * feltro, e o caixa só abre quando a mesa fecha.
   */
  payout: z.number().int().nonnegative(),
  /** O que ESTA mão fez com o seu stack — o balanço da mão, com sinal. */
  netChange: z.number().int(),
  /**
   * A mesa depois desta mão: stacks, botão da próxima e se ela acabou.
   * É por aqui que a UI sabe se distribui outra ou abre o caixa.
   */
  session: pokerSessionSchema,
  completedAt: z.number().int().nonnegative(),
});
export type PokerResult = z.infer<typeof pokerResultSchema>;

/**
 * Estado de uma mão em andamento, do PONTO DE VISTA DO JOGADOR.
 *
 * A regra do sigilo é a do poker, e ela é estrutural: as duas cartas
 * fechadas do rival NUNCA atravessam esta fronteira antes do showdown —
 * `opponentHole` sai daqui VAZIO. Nem a UI nem o DevTools têm como
 * espiá-las, porque elas não estão no objeto. O contrato é simétrico: o
 * bot decide sem ver uma carta sua (ver `botDecision`).
 *
 * O que a mesa mostra dos dois lados é o que uma mesa de verdade mostra:
 * as fichas. Stack, compromisso da rua e pote são públicos — é com eles,
 * e com as comunitárias, que se joga.
 */
export const pokerRoundStateSchema = z
  .object({
    matchId: z.string().min(1),
    street: streetSchema,
    /** `betting` enquanto a mão corre; `settled` quando o pote foi decidido. */
    phase: z.enum(['betting', 'settled']),
    /** Quem tem o botão: no heads-up ele age primeiro no pré-flop — e
        por último em todas as ruas seguintes. */
    button: duelistSchema,
    /** Suas duas cartas, sempre visíveis: o segredo é da mão ALHEIA. */
    playerHole: holeCardsSchema,
    /** Cartas do rival: VAZIO até o showdown, quando as duas viram. */
    opponentHole: z.array(cardSchema).max(2),
    /** As comunitárias já abertas (0, 3, 4 ou 5). */
    board: z.array(cardSchema).max(5),
    /** Fichas restantes de cada lado. */
    stacks: sidesSchema,
    /** Quanto cada lado já pôs NESTA rua. */
    committed: sidesSchema,
    /** Tudo o que está no pote, somadas todas as ruas. */
    pot: z.number().int().nonnegative(),
    /** Quanto falta você pagar para continuar na mão (0 = pode passar). */
    toCall: z.number().int().nonnegative(),
    /** Menor total a que você pode aumentar nesta rua. */
    minRaiseTo: z.number().int().nonnegative(),
    /** Maior total a que você pode aumentar: o seu all-in. */
    maxRaiseTo: z.number().int().nonnegative(),
    /** Ações legais AGORA; vazio quando não é a sua vez. */
    legalActions: z.array(pokerActionSchema),
    /** De quem é a vez; `null` quando a mesa é que tem de agir (abrir uma
        rua ou ir ao showdown). */
    toAct: duelistSchema.nullable(),
    /** O último lance da mesa — o que a UI anuncia. */
    lastMove: pokerMoveSchema.optional(),
    /**
     * O que a SUA mão é AGORA — as duas fechadas no pré-flop ("A-K do
     * mesmo naipe"), a melhor de cinco do flop em diante ("Dois pares,
     * Reis e 9"). Existe desde a distribuição, porque a decisão do
     * pré-flop é a mais tomada do Hold'em e a placa não pode calar
     * justamente nela.
     *
     * É informação SUA: sai das suas próprias cartas, e por isso não tem
     * equivalente do lado do rival.
     */
    playerHandLabel: z.string(),
    /**
     * A MESA em que esta mão está sendo jogada: com quanto se sentou,
     * quantas mãos já correram, de quem é o botão da próxima.
     *
     * Ela atravessa a fronteira junto com a mão porque a tela precisa dela
     * DURANTE a mão, e não só no fim: é o buy-in que a pílula de saldo
     * segue e é o número de mãos que decide se a porta de saída existe.
     * Derivar isso do último resultado deixaria a primeira mão sem mesa.
     */
    session: pokerSessionSchema,
    result: pokerResultSchema.optional(),
  })
  .refine((state) => (state.phase === 'settled') === (state.result !== undefined), {
    message: 'result deve existir se — e somente se — a mão estiver settled',
  })
  .refine((state) => state.legalActions.length > 0 === (state.toAct === 'player'), {
    message: 'só há ações legais quando a vez é do jogador',
  })
  .refine((state) => state.board.length === BOARD_SIZE[state.street] || state.phase === 'settled', {
    message: 'a mesa abre exatamente as comunitárias da rua corrente',
  });
export type PokerRoundState = z.infer<typeof pokerRoundStateSchema>;

/**
 * Entrada do histórico persistido (resultado + nome do rival).
 *
 * O histórico guarda a mão INTEIRA — as duas mãos fechadas e o board —
 * porque é isso que se revisita depois de um duelo: não o número, e sim
 * o que cada um tinha.
 */
export const pokerHistoryEntrySchema = pokerResultSchema.extend({
  opponentName: z.string().min(1),
  /**
   * Ausente nos registros gravados antes de a mesa virar SESSÃO. Não é
   * migração pendente: o retrato da mesa é informação de mesa aberta, e
   * uma mão de 2024 não tem como inventar a sessão que não existia. O
   * histórico mostra a mão, e a mão está toda aqui.
   */
  session: pokerSessionSchema.optional(),
});
export type PokerHistoryEntry = z.infer<typeof pokerHistoryEntrySchema>;
