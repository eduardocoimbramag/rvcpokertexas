import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TableTools } from '../components/table/TableTools';
import { handLog } from '../components/table/handLog';
import { CHIP_DENOMINATIONS } from '../components/table/pot';
import type { SessionHand } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';

/**
 * AS DUAS FERRAMENTAS DA MESA: o valor das fichas e o extrato da sessão.
 *
 * O extrato da sessão sai da LISTA VIVA da mesa em cena (`tableHands`),
 * e não mais do histórico persistido da casa — que passou a guardar uma
 * linha por MESA, e por isso não tem de onde tirar as mãos de nenhuma.
 * A troca conserta de graça o defeito que a derivação tinha: o histórico
 * tem teto, então uma sessão longa perdia as próprias mãos mais antigas
 * para as mesas anteriores.
 */

const initialGame = useGameStore.getInitialState();

/** Uma mão da sessão. */
function mao(netChange: number, folded = false): SessionHand {
  return { netChange, folded };
}

beforeEach(() => {
  useGameStore.setState({ ...initialGame, balance: 5000 }, true);
});

afterEach(() => {
  useGameStore.setState(initialGame, true);
});

describe('o extrato da sessão é a lista viva da mesa', () => {
  it('numera da PRIMEIRA para a última e soma o que a sessão deu', () => {
    /* Quem lê o extrato procura "como cheguei até aqui", e essa leitura
       começa na primeira mão. O número é a POSIÇÃO na lista — não um
       campo gravado, que um dia mentiria. */
    const log = handLog([mao(-80), mao(-20, true), mao(300)]);

    expect(log.rows.map((r) => r.no)).toEqual([1, 2, 3]);
    expect(log.rows.map((r) => r.delta)).toEqual([-80, -20, 300]);
    expect(log.net).toBe(200);
  });

  it('quem CORREU fica marcado', () => {
    /* Uma mão largada e uma perdida no showdown custam as duas fichas e
       não contam a mesma história. */
    expect(handLog([mao(-20, true)]).rows[0]?.folded).toBe(true);
    expect(handLog([mao(-80)]).rows[0]?.folded).toBe(false);
  });

  it('mesa sem mão nenhuma dá extrato vazio e saldo zero', () => {
    expect(handLog([])).toEqual({ rows: [], net: 0 });
  });
});

describe('as ferramentas ficam nos dois cantos', () => {
  it('o valor das fichas abre com as SETE da casa', async () => {
    const user = userEvent.setup();
    render(<TableTools />);

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
    useGameStore.setState({ tableHands: [mao(-80, true), mao(300)] });
    render(<TableTools />);

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
    render(<TableTools />);

    await user.click(screen.getByTestId('table-history'));
    expect(await screen.findByTestId('hand-log-empty')).toHaveTextContent('ainda está na mesa');
    expect(screen.queryByTestId('hand-log')).toBeNull();
  });
});
