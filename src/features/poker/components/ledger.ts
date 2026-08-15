import { formatDay } from '@/shared/lib/format';

import type { TableHistoryEntry } from '../engine/poker/types';
import { tableBalance } from '../engine/poker/types';

/** Um dia do extrato: as mesas daquele dia e o que elas deram. */
export interface LedgerDay {
  /** Chave estável do dia (a meia-noite local, em ms). */
  key: number;
  /** Como se fala do dia: "Hoje", "Ontem", "12 de agosto". */
  label: string;
  /** As mesas, da mais recente para a mais antiga. */
  entries: readonly TableHistoryEntry[];
  /** O balanço do dia inteiro. */
  net: number;
}

/** O extrato da casa, pronto para a folha do histórico. */
export interface Ledger {
  days: readonly LedgerDay[];
  /** O balanço de TODAS as mesas guardadas. */
  net: number;
  /** Quantas mesas o extrato tem. */
  tables: number;
  /** Em quantas delas você saiu no positivo. */
  up: number;
}

/**
 * O EXTRATO DA CASA, LIDO — o histórico cru virando a folha que se abre.
 *
 * Ele agrupa POR DIA, e o dia é o do FECHO da mesa: uma sessão que começa
 * às 23h50 e termina à 0h10 entrou no saldo depois da meia-noite, e o
 * extrato é do saldo. É a data do recibo, não a da chegada.
 *
 * A separação por dia não é enfeite. Enquanto a linha era uma mão, todas
 * elas eram da mesma sessão de vinte minutos e a hora bastava; uma linha
 * por MESA faz a lista atravessar semanas — e "14:32" sem dia é uma hora
 * que não diz quando.
 *
 * O agrupamento é por VIZINHANÇA e não por chave: o histórico já chega
 * ordenado do mais recente para o mais antigo (é assim que ele é
 * gravado), então dias iguais são necessariamente vizinhos. Um `Map` aqui
 * daria o mesmo resultado e esconderia a ordem — que é justamente o que
 * esta lista tem de garantir.
 *
 * `now` é parâmetro para que "Hoje" seja testável: um rótulo relativo que
 * lê o relógio por dentro é um rótulo que muda de resposta à meia-noite e
 * não tem como ser verificado.
 */
export function ledger(history: readonly TableHistoryEntry[], now = Date.now()): Ledger {
  const days: LedgerDay[] = [];

  for (const entry of history) {
    const key = startOfDay(entry.endedAt);
    const balance = tableBalance(entry);
    const last = days[days.length - 1];

    if (last && last.key === key) {
      last.entries = [...last.entries, entry];
      last.net += balance;
      continue;
    }
    days.push({ key, label: formatDay(entry.endedAt, now), entries: [entry], net: balance });
  }

  return {
    days,
    net: history.reduce((soma, entry) => soma + tableBalance(entry), 0),
    tables: history.length,
    up: history.filter((entry) => tableBalance(entry) > 0).length,
  };
}

/** A meia-noite LOCAL do dia de um instante — a régua do agrupamento. */
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
