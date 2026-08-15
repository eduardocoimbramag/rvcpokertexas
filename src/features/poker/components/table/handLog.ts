import type { SessionHand } from '../../store/gameStore';

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
 * Ele já foi DERIVADO do histórico da casa: filtrava a lista global pela
 * chave da mesa (`matchId` no duelo, `tableId` no anel) e invertia a
 * ordem. Era o desenho certo enquanto a casa gravava mão a mão, e caiu
 * junto com isso: o extrato da casa passou a guardar MESAS (ver
 * `tableHistoryEntrySchema`), e uma mesa não tem de onde tirar as mãos
 * dela.
 *
 * A fonte agora é a lista viva da sessão (`tableHands`), e a troca
 * conserta de graça o defeito que a derivação tinha: o histórico
 * persistido tem TETO, então uma sessão longa perdia as próprias mãos
 * mais antigas para as mesas anteriores. A lista da sessão é da sessão —
 * ela nasce vazia quando a mesa abre e não disputa espaço com ninguém.
 *
 * A ORDEM É A DE QUEM JOGOU, da primeira mão para a última: quem lê este
 * painel procura "como cheguei até aqui", e essa leitura começa no
 * começo. É por isso que o número da mão é atribuído AQUI, e não gravado
 * junto — ele é a posição na lista, e uma posição que se guarda é uma
 * posição que um dia mente.
 */
export function handLog(hands: readonly SessionHand[]): HandLog {
  const rows = hands.map((hand, index) => ({
    no: index + 1,
    delta: hand.netChange,
    folded: hand.folded,
  }));

  return { rows, net: rows.reduce((soma, row) => soma + row.delta, 0) };
}
