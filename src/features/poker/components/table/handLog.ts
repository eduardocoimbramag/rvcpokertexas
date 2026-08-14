import type { PokerHistoryRecord } from '../../engine/poker/types';
import { isRingEntry } from '../../engine/poker/types';

/** Uma mão da sessão, como o extrato da mesa a mostra. */
export interface HandLogRow {
  /** A ordem em que ela foi jogada, a partir de 1. */
  no: number;
  /** O que ela fez com o seu stack, com sinal. */
  delta: number;
  /** Você largou a mão. */
  folded: boolean;
}

/** O extrato de uma sessão: as mãos e o saldo delas. */
export interface HandLog {
  /** Da PRIMEIRA para a última — a ordem em que se jogou. */
  rows: readonly HandLogRow[];
  /** A soma dos balanços: o que a sessão inteira fez com você. */
  net: number;
}

/**
 * O EXTRATO DA MESA QUE ESTÁ EM CENA — as mãos desta sessão, e só elas.
 *
 * Ele é DERIVADO do histórico que a casa já grava mão a mão, e não uma
 * segunda lista mantida em paralelo. A diferença importa: o histórico é
 * gravado no instante em que o pote fecha, pelas duas mesas, e é ele que
 * sobrevive a um recarregamento da página. Uma lista de sessão à parte
 * seria um segundo lugar para a mesma verdade — e o segundo lugar é
 * sempre o que sai de sincronia.
 *
 * A CHAVE é a mesa: `matchId` no duelo, `tableId` na mesa de anel. É por
 * ela que uma sessão não vê as mãos da anterior.
 *
 * O histórico é gravado da mais NOVA para a mais velha (ver
 * `pushHistory`), e aqui ele é invertido: quem lê o extrato de uma mesa
 * procura "como cheguei até aqui", e essa leitura começa na primeira mão.
 *
 * Ele tem TETO (`HISTORY_LIMIT`), e o teto é da casa inteira: uma sessão
 * mais longa que ele perde as mãos mais antigas. O `no` continua honesto
 * sobre o que a lista TEM — ele numera o que sobrou, e não inventa as que
 * já saíram.
 */
export function handLog(history: readonly PokerHistoryRecord[], table: string): HandLog {
  const rows = history
    .filter((entry) => (isRingEntry(entry) ? entry.tableId === table : entry.matchId === table))
    .slice()
    .reverse()
    .map((entry, index) => ({
      no: index + 1,
      delta: entry.netChange,
      folded: isRingEntry(entry)
        ? (entry.seats.find((seat) => seat.isYou)?.folded ?? false)
        : entry.foldedBy === 'player',
    }));

  return { rows, net: rows.reduce((soma, row) => soma + row.delta, 0) };
}
