import { z } from 'zod';

import { cashOutValue } from '../engine/credits';
import type { TableClose, TableHistoryEntry } from '../engine/poker/types';
import { DUEL_TABLE_NAME } from '../engine/poker/types';

/**
 * A MIGRAÇÃO v3 → v4: o extrato de MÃOS vira um extrato de MESAS.
 *
 * Ela existe para não repetir o que as duas migrações anteriores fizeram.
 * Da v1 (Bac Bo) para a v2 e da v2 (21) para a v3, o histórico foi
 * DESCARTADO, e estava certo: um "19 × 17" não descreve mão de poker
 * nenhuma, e não havia tradução a fazer. Aqui há. O jogo é o mesmo, as
 * mãos gravadas são as mesmas mãos, e o que mudou foi a UNIDADE do
 * extrato — de mão para mesa. Jogar fora o extrato de quem já jogou por
 * uma mudança de unidade seria apagar dado da pessoa por conveniência de
 * schema, que é exatamente o que a versão anterior se recusou a fazer
 * quando a mesa de 6 chegou.
 *
 * COMO SE TRADUZ: as mãos são agrupadas pela mesa em que aconteceram
 * (`matchId` no duelo, `tableId` no anel) e cada grupo vira um recibo.
 *
 * O QUE É EXATO, e o que não é. O teto do extrato (`HISTORY_LIMIT`) corta
 * as mãos MAIS VELHAS, então a mesa mais antiga da lista pode chegar aqui
 * pela metade. Isso não estraga o recibo do duelo: o buy-in e o stack
 * vêm do RETRATO DA SESSÃO que cada mão carrega (`session`), e o retrato
 * da última mão sabe com quanto se sentou por mais mãos que tenham
 * sumido. A mesa de anel não guardava esse retrato — ali o buy-in é
 * reconstruído do stack de antes da mão mais velha que sobrou, o que é a
 * compra de verdade em toda mesa inteira e uma aproximação honesta na
 * mesa cortada pelo teto.
 *
 * OS SCHEMAS DO FORMATO VELHO MORAM AQUI, e não em `engine/poker/types`.
 * É a única regra que uma migração não pode quebrar: ela lê um formato
 * que não existe mais, então ela não pode depender dos tipos vivos —
 * amarrada a eles, a próxima mudança do domínio reescreveria em silêncio
 * o que ela entende por "o formato antigo", e uma migração que muda de
 * ideia sobre o passado é uma migração que corrompe dado.
 */

/** Os dois lados de uma mesa de duelo, no retrato que a mão carregava. */
const legacySideSchema = z.enum(['player', 'opponent']);

/** O retrato da sessão gravado junto de cada mão de duelo. */
const legacySessionSchema = z.object({
  buyIn: z.number().int(),
  stacks: z.object({ player: z.number().int() }),
  handsPlayed: z.number().int(),
  over: z.boolean(),
  bustedBy: legacySideSchema.optional(),
  leftBy: legacySideSchema.optional(),
});

/**
 * UMA MÃO DE DUELO no formato velho — só os campos que o recibo precisa.
 *
 * `kind` era o discriminante da união, e vinha AUSENTE nas mãos gravadas
 * antes de a mesa de 6 existir: ler `'duel'` como opcional é o que faz as
 * mãos mais antigas do extrato atravessarem em vez de serem descartadas.
 */
const legacyDuelHandSchema = z.object({
  kind: z.literal('duel').optional(),
  matchId: z.string().min(1),
  /** O stack com que os dois entraram NA MÃO. */
  stake: z.number().int(),
  /** O stack do jogador quando a mão fechou. */
  payout: z.number().int(),
  completedAt: z.number().int(),
  session: legacySessionSchema.optional(),
});
type LegacyDuelHand = z.infer<typeof legacyDuelHandSchema>;

/** UMA MÃO DE ANEL no formato velho — idem. */
const legacyRingHandSchema = z.object({
  kind: z.literal('ring'),
  tableId: z.string().min(1),
  tableName: z.string().min(1),
  /** Só o número de cadeiras interessa ao recibo. */
  seats: z.array(z.unknown()).min(2),
  netChange: z.number().int(),
  /** O seu stack depois de a mão fechar. */
  stack: z.number().int(),
  completedAt: z.number().int(),
});
type LegacyRingHand = z.infer<typeof legacyRingHandSchema>;

/** Uma mesa em construção: a mão mais nova, a mais velha e a conta. */
interface Grouped<T> {
  novaMao: T;
  velhaMao: T;
  maos: number;
}

/**
 * O ESTADO INTEIRO da v3 para o da v4 — só o `history` muda de forma.
 *
 * Nada aqui levanta exceção: uma linha que não se reconhece é PULADA, e
 * não derruba a migração. O preço de levantar seria o estado inteiro
 * cair no `catch` do `load` e ser apagado — saldo e preferências junto —
 * por causa de uma linha estranha no meio de cinquenta.
 */
export function foldHandsIntoTables(state: unknown): unknown {
  if (typeof state !== 'object' || state === null) return state;
  const record = state as Record<string, unknown>;
  const history = Array.isArray(record.history) ? record.history : [];

  const duelos = new Map<string, Grouped<LegacyDuelHand>>();
  const aneis = new Map<string, Grouped<LegacyRingHand>>();

  /* O extrato é gravado do mais NOVO para o mais velho, então a primeira
     ocorrência de uma mesa é a última mão que se jogou nela — e a última
     ocorrência, a primeira. */
  for (const raw of history) {
    const anel = legacyRingHandSchema.safeParse(raw);
    if (anel.success) {
      acumula(aneis, anel.data.tableId, anel.data);
      continue;
    }
    const duelo = legacyDuelHandSchema.safeParse(raw);
    if (duelo.success) acumula(duelos, duelo.data.matchId, duelo.data);
  }

  const mesas: TableHistoryEntry[] = [
    ...[...duelos.entries()].map(([id, grupo]) => reciboDoDuelo(id, grupo)),
    ...[...aneis.entries()].map(([id, grupo]) => reciboDoAnel(id, grupo)),
  ].sort((a, b) => b.endedAt - a.endedAt);

  return { ...record, history: mesas };
}

function acumula<T>(mapa: Map<string, Grouped<T>>, chave: string, mao: T): void {
  const grupo = mapa.get(chave);
  if (grupo) {
    grupo.velhaMao = mao;
    grupo.maos += 1;
    return;
  }
  mapa.set(chave, { novaMao: mao, velhaMao: mao, maos: 1 });
}

/**
 * O RECIBO DE UMA MESA DE DUELO.
 *
 * O buy-in sai do retrato da sessão da mão mais VELHA e, na falta dele,
 * do stack com que se entrou nela — que é a mesma coisa nas mãos
 * anteriores à sessão, quando cada mesa tinha uma mão só.
 */
function reciboDoDuelo(
  matchId: string,
  { novaMao, velhaMao, maos }: Grouped<LegacyDuelHand>,
): TableHistoryEntry {
  const buyIn = Math.max(0, velhaMao.session?.buyIn ?? velhaMao.stake);
  const finalStack = Math.max(0, novaMao.session?.stacks.player ?? novaMao.payout);
  return recibo(matchId, {
    name: DUEL_TABLE_NAME,
    kind: 'duel',
    seats: 2,
    buyIn,
    finalStack,
    hands: novaMao.session?.handsPlayed ?? maos,
    close: fechamentoDoDuelo(novaMao),
    startedAt: velhaMao.completedAt,
    endedAt: novaMao.completedAt,
  });
}

/**
 * POR QUE AQUELA MESA FECHOU, lido do retrato da última mão.
 *
 * Uma sessão que termina sem porta de saída registrada é uma sessão que
 * nunca fechou: o jogo foi embora com a mesa aberta, e é isso que
 * `abandoned` diz.
 */
function fechamentoDoDuelo(mao: LegacyDuelHand): TableClose {
  const session = mao.session;
  // Antes da sessão, toda mesa era de uma mão e fechava sozinha nela.
  if (!session) return 'closed';
  if (session.bustedBy === 'player') return 'busted';
  if (session.leftBy === 'player') return 'left';
  if (session.over) return 'closed';
  return 'abandoned';
}

/**
 * O RECIBO DE UMA MESA DE ANEL.
 *
 * O registro de anel não guardava com quanto se sentou — a compra é da
 * SALA, e a mão só sabia do stack. Ela é reconstruída de trás para a
 * frente: o stack de antes da mão mais velha que sobrou.
 */
function reciboDoAnel(
  tableId: string,
  { novaMao, velhaMao, maos }: Grouped<LegacyRingHand>,
): TableHistoryEntry {
  const buyIn = Math.max(0, velhaMao.stack - velhaMao.netChange);
  return recibo(tableId, {
    name: novaMao.tableName,
    kind: 'ring',
    seats: novaMao.seats.length,
    buyIn,
    finalStack: Math.max(0, novaMao.stack),
    hands: maos,
    /* A sala não registrava a porta por onde se saiu. `closed` é o que se
       pode afirmar: aquela mesa acabou. */
    close: 'closed',
    startedAt: velhaMao.completedAt,
    endedAt: novaMao.completedAt,
  });
}

/**
 * O que o CAIXA teria pago por aquela mesa — a conta viva, na função
 * viva. A comissão da casa incide uma vez e só sobre o lucro, e é a mesma
 * de sempre: uma cópia dela aqui pagaria valores diferentes pela mesma
 * mesa no dia em que a taxa mudasse.
 */
function recibo(
  chave: string,
  dados: Omit<TableHistoryEntry, 'id' | 'cashedOut'>,
): TableHistoryEntry {
  return {
    ...dados,
    /* O id é DERIVADO da mesa, e não sorteado: migrar duas vezes o mesmo
       estado tem de dar as mesmas linhas. */
    id: `mesa-${chave}`,
    cashedOut: cashOutValue(dados.buyIn, dados.finalStack),
  };
}
