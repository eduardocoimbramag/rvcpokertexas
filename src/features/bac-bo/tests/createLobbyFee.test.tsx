import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BRACKET_ENABLED } from '../tournament/availability';
import { useGameStore } from '../store/gameStore';
import { CreateLobbySheet } from '../tournament/screens/CreateLobbySheet';
import { prizeFor } from '../tournament/tournamentStore';
import { useTournamentStore } from '../tournament/tournamentStore';

/**
 * Taxa de entrada digitável (não há mais fichas de 10/25/50) e a
 * premiação recalculando junto, a cada tecla.
 *
 * SUSPENSOS COM O CHAVEAMENTO. A folha de criação virou uma folha de
 * POKER: pergunta quantas pessoas sentam, não que jogo se joga. O campo
 * de taxa só existia nos modos de blackjack, e sem porta de entrada para
 * eles não há como chegar até ele.
 *
 * Os testes ficam — inteiros, e não comentados — atrás do mesmo booleano
 * que desligou o modo (`BRACKET_ENABLED`). Reativar o chaveamento numa
 * linha reativa a cobertura dele na mesma linha; apagá-los agora seria
 * pagar de novo para escrevê-los depois.
 */

const initialGame = useGameStore.getInitialState();
const initialTournament = useTournamentStore.getInitialState();

beforeEach(() => {
  useGameStore.setState({ ...initialGame, balance: 1000 }, true);
  useTournamentStore.setState(initialTournament, true);
});

afterEach(() => {
  useGameStore.setState(initialGame, true);
  useTournamentStore.setState(initialTournament, true);
});

const openSheet = () => render(<CreateLobbySheet open onClose={() => undefined} />);

/** Abre a folha já no chaveamento, que é onde a taxa existe. */
async function openBracketSheet(user: ReturnType<typeof userEvent.setup>) {
  const view = openSheet();
  await user.click(screen.getByTestId('create-format-bracket'));
  return view;
}

describe.skipIf(!BRACKET_ENABLED)('CreateLobbySheet — taxa de entrada', () => {
  it('não oferece mais fichas de valor fixo', async () => {
    const user = userEvent.setup();
    await openBracketSheet(user);
    expect(screen.queryByTestId('create-fee-10')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-fee-25')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-fee-50')).not.toBeInTheDocument();
    expect(screen.getByTestId('create-fee')).toHaveValue('10');
  });

  it('os atalhos somam sobre o valor digitado', async () => {
    const user = userEvent.setup();
    await openBracketSheet(user);

    await user.click(screen.getByTestId('create-fee-plus-10'));
    expect(screen.getByTestId('create-fee')).toHaveValue('20');

    await user.click(screen.getByTestId('create-fee-plus-100'));
    expect(screen.getByTestId('create-fee')).toHaveValue('120');
  });

  it('a premiação acompanha a taxa em tempo real', async () => {
    const user = userEvent.setup();
    await openBracketSheet(user);

    // Sala de 8 (padrão do chaveamento): o campeão leva 50% do bolo dos 7 derrotados,
    // já sem a comissão da casa.
    const prize = (fee: number) => String(prizeFor(1, fee, 8));
    expect(screen.getByTestId('create-prize')).toHaveTextContent(prize(10));

    const input = screen.getByTestId('create-fee');
    await user.clear(input);
    await user.type(input, '200');
    expect(screen.getByTestId('create-fee')).toHaveValue('200');
    expect(screen.getByTestId('create-prize')).toHaveTextContent(prize(200));

    // E acompanha também a troca do tamanho da mesa.
    await user.click(screen.getByTestId('create-size-4'));
    expect(screen.getByTestId('create-prize')).toHaveTextContent(String(prizeFor(1, 200, 4)));
  });

  it('recusa taxa acima do saldo e abaixo do mínimo', async () => {
    const user = userEvent.setup();
    await openBracketSheet(user);
    const input = screen.getByTestId('create-fee');

    await user.clear(input);
    await user.type(input, '5000');
    await user.click(screen.getByTestId('create-confirm'));
    expect(screen.getByRole('alert')).toHaveTextContent(/caber no saldo/i);
    expect(useTournamentStore.getState().stage).not.toBe('lobby');

    await user.clear(input);
    await user.type(input, '5');
    expect(screen.getByRole('alert')).toHaveTextContent(/taxa mínima/i);
    expect(useTournamentStore.getState().stage).not.toBe('lobby');
  });

  it('cria a sala com a taxa digitada', async () => {
    const user = userEvent.setup();
    await openBracketSheet(user);
    const input = screen.getByTestId('create-fee');

    await user.clear(input);
    await user.type(input, '175');
    await user.click(screen.getByTestId('create-confirm'));

    expect(useTournamentStore.getState().entryFee).toBe(175);
  });
});
