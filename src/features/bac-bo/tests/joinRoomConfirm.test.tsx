import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LobbyBrowseScreen } from '../tournament/screens/LobbyBrowseScreen';
import { useTournamentStore } from '../tournament/tournamentStore';
import type { LobbyListing } from '../tournament/types';
import { useGameStore } from '../store/gameStore';

/**
 * A porta de qualquer sala: entrar é assumir uma taxa, então o toque no
 * cartão só abre a PERGUNTA — quem entra é o "sim". Na sala privada a
 * pergunta vem depois da senha.
 */

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

const publicLobby: LobbyListing = {
  id: 'lobby-pub',
  name: 'Mesa Imperial',
  hostName: 'Otto',
  size: 4,
  filled: 2,
  fee: 25,
  visibility: 'public',
  password: '',
};

const privateLobby: LobbyListing = {
  ...publicLobby,
  id: 'lobby-priv',
  name: 'Salão Royal',
  visibility: 'private',
  password: '4821',
};

beforeEach(() => {
  useTournamentStore.setState(
    { ...initialTournament, stage: 'browse', lobbies: [publicLobby, privateLobby] },
    true,
  );
  useGameStore.setState({ ...initialGame, balance: 1000 }, true);
});

afterEach(() => {
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState(initialGame, true);
});

describe('confirmação de entrada na sala', () => {
  it('sala pública: o toque pergunta antes, e o "não" não entra', async () => {
    const user = userEvent.setup();
    render(<LobbyBrowseScreen onBack={() => undefined} />);

    await user.click(screen.getByTestId(`lobby-${publicLobby.id}`));

    // Ninguém entrou ainda: o que abriu foi a pergunta, com a taxa.
    expect(useTournamentStore.getState().stage).toBe('browse');
    const dialog = screen.getByTestId('join-room-confirm');
    expect(dialog).toHaveTextContent(/Deseja realmente entrar em/i);
    expect(dialog).toHaveTextContent('Mesa Imperial');
    expect(dialog).toHaveTextContent('25');

    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(useTournamentStore.getState().stage).toBe('browse');
  });

  it('sala pública: o "sim" entra na sala escolhida', async () => {
    const user = userEvent.setup();
    render(<LobbyBrowseScreen onBack={() => undefined} />);

    await user.click(screen.getByTestId(`lobby-${publicLobby.id}`));
    await user.click(screen.getByTestId('confirm-dialog-accept'));

    const s = useTournamentStore.getState();
    expect(s.stage).toBe('lobby');
    expect(s.lobbyName).toBe('Mesa Imperial');
    expect(s.entryFee).toBe(25);
  });

  it('sala privada: senha errada não destranca nem pergunta nada', async () => {
    const user = userEvent.setup();
    render(<LobbyBrowseScreen onBack={() => undefined} />);

    await user.click(screen.getByTestId(`lobby-${privateLobby.id}`));
    await user.type(screen.getByTestId('join-password'), '1111');
    await user.click(screen.getByTestId('join-confirm'));

    expect(screen.getByTestId('join-error')).toBeInTheDocument();
    expect(screen.queryByTestId('join-room-confirm')).not.toBeInTheDocument();
    expect(useTournamentStore.getState().stage).toBe('browse');
  });

  it('sala privada: a senha certa destranca e a pergunta vem em seguida', async () => {
    const user = userEvent.setup();
    render(<LobbyBrowseScreen onBack={() => undefined} />);

    await user.click(screen.getByTestId(`lobby-${privateLobby.id}`));
    await user.type(screen.getByTestId('join-password'), '4821');
    await user.click(screen.getByTestId('join-confirm'));

    // Destrancar não é entrar: a sala ainda não é sua.
    expect(useTournamentStore.getState().stage).toBe('browse');
    expect(screen.getByTestId('join-room-confirm')).toHaveTextContent('Salão Royal');

    await user.click(screen.getByTestId('confirm-dialog-accept'));
    const s = useTournamentStore.getState();
    expect(s.stage).toBe('lobby');
    expect(s.lobbyName).toBe('Salão Royal');
    expect(s.visibility).toBe('private');
  });
});
