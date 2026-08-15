import { describe, expect, it } from 'vitest';

import { formatDay } from '@/shared/lib/format';

import { ledger } from '../components/ledger';
import type { TableHistoryEntry } from '../engine/poker/types';

/**
 * O EXTRATO DA CASA, LIDO: uma linha por MESA, agrupada pelo dia em que a
 * mesa fechou.
 *
 * O que só um teste alcança aqui é o BALANÇO: ele é a diferença entre o
 * que o caixa devolveu e o que a compra custou — e não o placar em
 * fichas. Quem subiu 1.000 no feltro levou 900 para o saldo, e o extrato
 * é do saldo.
 */

/** A meia-noite local de um dia, mais as horas que se quiser. */
const at = (dia: number, hora = 12): number => new Date(2026, 7, dia, hora).getTime();

/** Uma mesa fechada, no mínimo que o extrato precisa. */
function mesa(patch: Partial<TableHistoryEntry> = {}): TableHistoryEntry {
  return {
    id: `t${patch.endedAt ?? 0}`,
    name: '1v1',
    kind: 'duel',
    seats: 2,
    buyIn: 500,
    finalStack: 1000,
    cashedOut: 950,
    hands: 4,
    close: 'left',
    startedAt: at(14, 11),
    endedAt: at(14),
    ...patch,
  };
}

const agora = at(14, 20);

describe('o extrato da casa', () => {
  it('o balanço é o do SALDO, e não o do feltro', () => {
    /* Compra de 500, saída com 1.000 fichas: o feltro diz +500, o caixa
       devolveu 950 e o saldo subiu 450. A comissão da casa é parte do
       que a mesa fez com você. */
    expect(ledger([mesa()], agora).net).toBe(450);
    // Quem quebrou perde a compra inteira, e nada mais.
    expect(ledger([mesa({ finalStack: 0, cashedOut: 0 })], agora).net).toBe(-500);
    // Quem sai empatado não paga nada por ter jogado.
    expect(ledger([mesa({ finalStack: 500, cashedOut: 500 })], agora).net).toBe(0);
  });

  it('agrupa por DIA, na ordem em que o histórico chega', () => {
    /* O histórico é gravado do mais recente para o mais antigo, então
       dias iguais são necessariamente vizinhos — e o agrupamento por
       vizinhança preserva a ordem, que é o que esta lista tem de
       garantir. */
    const extrato = ledger(
      [
        mesa({ id: 'a', endedAt: at(14, 21) }),
        mesa({ id: 'b', endedAt: at(14, 9) }),
        mesa({ id: 'c', endedAt: at(13, 22) }),
      ],
      agora,
    );

    expect(extrato.days.map((d) => d.label)).toEqual(['Hoje', 'Ontem']);
    expect(extrato.days[0]?.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(extrato.days[0]?.net).toBe(900);
    expect(extrato.days[1]?.net).toBe(450);
  });

  it('o dia é o do FECHO da mesa, não o da chegada', () => {
    /* Uma sessão que começa às 23h50 e termina à 0h10 entrou no saldo
       depois da meia-noite. É a data do recibo. */
    const extrato = ledger([mesa({ startedAt: at(13, 23), endedAt: at(14, 0) })], agora);
    expect(extrato.days).toHaveLength(1);
    expect(extrato.days[0]?.label).toBe('Hoje');
  });

  it('conta as mesas e quantas terminaram no positivo', () => {
    const extrato = ledger(
      [mesa({ id: 'a' }), mesa({ id: 'b', finalStack: 0, cashedOut: 0 }), mesa({ id: 'c' })],
      agora,
    );

    expect(extrato.tables).toBe(3);
    expect(extrato.up).toBe(2);
    expect(extrato.net).toBe(400);
  });

  it('extrato vazio não inventa dia nenhum', () => {
    expect(ledger([], agora)).toEqual({ days: [], net: 0, tables: 0, up: 0 });
  });
});

describe('o dia, do jeito que se fala dele', () => {
  it('hoje e ontem têm nome; o resto tem data', () => {
    expect(formatDay(at(14, 1), agora)).toBe('Hoje');
    expect(formatDay(at(13, 23), agora)).toBe('Ontem');
    expect(formatDay(at(9), agora)).toBe('9 de agosto');
  });

  it('a régua é o CALENDÁRIO, e não o relógio', () => {
    /* 23h59 e 0h01 são dias diferentes ainda que separados por dois
       minutos — uma conta em horas chamaria de "hoje" uma mesa de ontem
       à noite. */
    const meiaNoiteEUm = new Date(2026, 7, 14, 0, 1).getTime();
    const onzeCinquentaENove = new Date(2026, 7, 13, 23, 59).getTime();
    expect(formatDay(meiaNoiteEUm, agora)).toBe('Hoje');
    expect(formatDay(onzeCinquentaENove, agora)).toBe('Ontem');
  });

  it('outro ano leva o ano junto', () => {
    expect(formatDay(new Date(2025, 7, 14, 12).getTime(), agora)).toBe('14 de agosto de 2025');
  });
});
