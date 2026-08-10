import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CashTableScreen } from '../tournament/screens/CashTableScreen';
import type { CashTableView } from '../tournament/cashTable';
import { useTournamentStore } from '../tournament/tournamentStore';
import type { TournamentPlayer } from '../tournament/types';
import { useGameStore } from '../store/gameStore';

/**
 * A MESA DE 6 quando as fichas acabam, e a placa do assento enxuta.
 *
 * Os dois pontos vêm do mesmo lugar — a mesa de seis tem pouco espaço e
 * pouca saída —, e nenhum dos dois aparece num teste de store: um é um
 * botão que precisa EXISTIR em cena, o outro é o que uma placa deixa de
 * mostrar.
 */

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

const player = (id: string, name: string, isYou = false): TournamentPlayer => ({
  id,
  name,
  avatar: name[0] ?? '?',
  isYou,
});

/** Uma mesa montada, com você na cadeira 0 e o stack que se pedir. */
function view(meuStack: number): CashTableView {
  const nomes = ['Você', 'Otto', 'Luna', 'Dante', 'Rex', 'Maya'];
  return {
    seats: nomes.map((nome, seatIndex) => ({
      seatIndex,
      player: player(seatIndex === 0 ? 'you' : `b${seatIndex}`, nome, seatIndex === 0),
      stack: seatIndex === 0 ? meuStack : 1000,
      bet: 0,
      cards: seatIndex === 0 && meuStack > 0 ? [] : [],
      folded: seatIndex === 0 && meuStack === 0,
      allIn: false,
      shown: false,
    })),
    button: 2,
    smallBlind: 10,
    bigBlind: 20,
    board: [],
    pot: 0,
    street: 'preflop',
    toAct: 3,
    handNo: 7,
    yourHandLabel: null,
  };
}

function montaMesa(meuStack: number) {
  useTournamentStore.setState(
    {
      ...initialTournament,
      stage: 'cash',
      lobbyName: 'Salão do Coringa',
      buyIn: 1000,
      blind: 20,
      cashSeat: 0,
      cashTable: view(meuStack),
      cashLegal: [],
      cashBroke: meuStack === 0,
      cashCanLeave: true,
    },
    true,
  );
}

beforeEach(() => {
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState({ ...initialGame, balance: 5000 }, true);
});

afterEach(() => {
  useTournamentStore.setState(initialTournament, true);
});

describe('sem fichas, a saída fica em cena', () => {
  it('com fichas, a espera não oferece saída nenhuma', () => {
    /* Com fichas a saída já existe em dois lugares — a bandeira do
       cabeçalho e o LEVANTAR da barra de lances. Um terceiro botão
       vermelho a cada espera de bot seria alarme sem incêndio. */
    montaMesa(1000);
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-wait')).toHaveTextContent('Aguardando a mesa');
    expect(screen.queryByTestId('cash-leave-broke')).toBeNull();
  });

  it('SEM fichas, a espera diz o que houve e abre a porta', () => {
    /* A armadilha: quebrado você não recebe carta, não tem vez e a barra
       de lances nunca mais abre — e é nela que o LEVANTAR mora. */
    montaMesa(0);
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-wait')).toHaveTextContent('Você ficou sem fichas');
    expect(screen.getByTestId('cash-leave-broke')).toBeVisible();
    expect(screen.getByTestId('cash-leave-broke')).toHaveTextContent('LEVANTAR DA MESA');
  });

  it('o botão abre a mesma confirmação da bandeira do cabeçalho', async () => {
    const user = userEvent.setup();
    montaMesa(0);
    render(<CashTableScreen />);

    await user.click(screen.getByTestId('cash-leave-broke'));
    /* `findBy` + `toBeInTheDocument`, e não `toBeVisible`: o diálogo
       entra por AnimatePresence com `opacity: 0`, então perguntar se ele
       está VISÍVEL logo depois do clique é uma corrida contra o spring —
       o que se afirma aqui é que ele ABRIU. */
    expect(await screen.findByTestId('cash-leave-prompt')).toBeInTheDocument();
  });

  it('a confirmação NÃO promete fichas que não existem', async () => {
    /* "As fichas na sua frente voltam para o saldo" com zero na frente
       soa como reembolso, e não é: o buy-in já virou as fichas que se
       perdeu. */
    const user = userEvent.setup();
    montaMesa(0);
    render(<CashTableScreen />);

    await user.click(screen.getByTestId('cash-leave-broke'));
    expect(await screen.findByTestId('cash-leave-prompt')).toHaveTextContent('não tem mais fichas');
    expect(screen.queryByTestId('cash-leave-take')).toBeNull();
  });

  it('com fichas, a confirmação mostra quanto volta', async () => {
    const user = userEvent.setup();
    montaMesa(1000);
    render(<CashTableScreen />);

    await user.click(screen.getByTestId('cash-leave'));
    expect(await screen.findByTestId('cash-leave-take')).toHaveTextContent('1.000');
  });
});

describe('a placa do assento diz duas coisas: quem e quanto', () => {
  it('o rival mostra NOME e FICHAS, e mais nada', () => {
    /* Numa faixa de três assentos cada placa tem ~79px no aparelho mais
       estreito. Tudo o que entrava nela roubava corpo de fonte das duas
       leituras que se faz vinte vezes por mão. */
    montaMesa(1000);
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-name-1')).toHaveTextContent('Otto');
    expect(screen.getByTestId('cash-stack-1')).toHaveTextContent('1.000');
  });

  it('o SELO DE BLIND saiu da placa — os blinds já estão em cena', () => {
    /* Eles aparecem nas fichas de aposta na frente de quem os pagou e na
       posição relativa ao disco do dealer, que é de onde eles saem. */
    montaMesa(1000);
    const { container } = render(<CashTableScreen />);
    expect(container.querySelector('.cash-seat__flag--blind')).toBeNull();
  });

  it('o MEDALHÃO saiu da placa do rival, e fica na sua', () => {
    /* No rival ele repetia a inicial de um nome escrito ao lado. Na sua
       placa há espaço, e ele é a identidade da casa. */
    montaMesa(1000);
    const { container } = render(<CashTableScreen />);

    const rival = container.querySelector('[data-testid="cash-seat-1"] .seat-plate__crest');
    const meu = container.querySelector('[data-testid="cash-seat-you"] .seat-plate__crest');
    expect(rival).toBeNull();
    expect(meu).not.toBeNull();
  });
});
