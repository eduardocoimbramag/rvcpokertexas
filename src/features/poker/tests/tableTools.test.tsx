import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TableTools } from '../components/table/TableTools';
import { handLog } from '../components/table/handLog';
import { CHIP_DENOMINATIONS } from '../components/table/pot';
import type { PokerHistoryRecord } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';

/**
 * AS DUAS FERRAMENTAS DA MESA: o valor das fichas e o extrato da sessão.
 *
 * O que só um teste alcança aqui é a DERIVAÇÃO: o extrato não é uma lista
 * mantida à parte — ele é montado do histórico que a casa já grava mão a
 * mão, e nele convivem dois formatos (duelo e mesa de anel) gravados do
 * mais novo para o mais velho.
 */

const initialGame = useGameStore.getInitialState();

/** Uma mão de mesa de anel no extrato. */
function ring(id: string, table: string, netChange: number, folded: boolean): PokerHistoryRecord {
  return {
    kind: 'ring',
    id,
    tableId: table,
    tableName: 'Copa da Casa',
    seats: [
      { seat: 0, name: 'Você', isYou: true, putIn: 20, won: 0, folded },
      { seat: 1, name: 'Otto', isYou: false, putIn: 20, won: 40, folded: false },
    ],
    board: [],
    pots: [],
    button: 0,
    yourSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    showdown: !folded,
    netChange,
    stack: 1000,
    completedAt: 0,
  };
}

beforeEach(() => {
  useGameStore.setState({ ...initialGame, balance: 5000 }, true);
});

afterEach(() => {
  useGameStore.setState(initialGame, true);
});

describe('o extrato da sessão sai do histórico da casa', () => {
  it('só as mãos DESTA mesa, e da primeira para a última', () => {
    /* A chave é a mesa: uma sessão não vê as mãos da anterior. E a ordem
       inverte — o histórico é gravado do mais novo para o mais velho, e
       quem lê o extrato procura "como cheguei até aqui". */
    const log = handLog(
      [
        ring('c', 'mesa-1', 300, false),
        ring('x', 'outra', 999, false),
        ring('b', 'mesa-1', -20, true),
        ring('a', 'mesa-1', -80, false),
      ],
      'mesa-1',
    );

    expect(log.rows.map((r) => r.no)).toEqual([1, 2, 3]);
    expect(log.rows.map((r) => r.delta)).toEqual([-80, -20, 300]);
    expect(log.net).toBe(200);
  });

  it('quem CORREU fica marcado, e a marca é a SUA', () => {
    /* Uma mão largada e uma perdida no showdown custam as duas fichas e
       não contam a mesma história. A régua é o assento com `isYou`: o
       rival ter corrido não diz nada sobre você. */
    const log = handLog([ring('a', 'm', -20, true)], 'm');
    expect(log.rows[0]?.folded).toBe(true);

    const outro = handLog([ring('b', 'm', -80, false)], 'm');
    expect(outro.rows[0]?.folded).toBe(false);
  });

  it('mesa sem mão nenhuma dá extrato vazio e saldo zero', () => {
    expect(handLog([], 'm')).toEqual({ rows: [], net: 0 });
  });
});

describe('as ferramentas ficam nos dois cantos', () => {
  it('o valor das fichas abre com as SETE da casa', async () => {
    const user = userEvent.setup();
    render(<TableTools table="mesa-1" />);

    await user.click(screen.getByTestId('table-chips'));
    const tabela = await screen.findByTestId('chip-table');
    /* As fichas TÊM valor fixo, e é por isso que um montante de milhares
       cabe numa faixa de feltro. Quem não sabe a tabela vê um monte
       colorido. */
    for (const value of CHIP_DENOMINATIONS) {
      expect(tabela).toHaveTextContent(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    }
  });

  it('o histórico abre com o saldo em cima e as mãos embaixo', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      history: [ring('b', 'mesa-1', 300, false), ring('a', 'mesa-1', -80, true)],
    });
    render(<TableTools table="mesa-1" />);

    await user.click(screen.getByTestId('table-history'));

    expect(await screen.findByTestId('hand-log-net')).toHaveTextContent('+220');
    expect(screen.getByTestId('hand-log-net')).toHaveTextContent('2 mãos jogadas');
    expect(screen.getByTestId('hand-log-row-1')).toHaveTextContent('correu');
    expect(screen.getByTestId('hand-log-row-2')).toHaveTextContent('+300');
  });

  it('mesa recém-aberta diz que a primeira mão ainda está correndo', async () => {
    /* "Sem registros" responderia à pergunta errada: o que houve não é
       ausência de dado, é que a mão ainda não fechou. */
    const user = userEvent.setup();
    render(<TableTools table="mesa-1" />);

    await user.click(screen.getByTestId('table-history'));
    expect(await screen.findByTestId('hand-log-empty')).toHaveTextContent('ainda está na mesa');
    expect(screen.queryByTestId('hand-log')).toBeNull();
  });
});
