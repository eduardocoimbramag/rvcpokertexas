import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import App from '@/App';

import { ConfirmPanel } from '../components/ConfirmPanel';
import { DiceArena } from '../components/DiceArena';
import { Die3D } from '../components/Die3D';
import { HistorySheet } from '../components/HistorySheet';
import { StakeSelector } from '../components/StakeSelector';
import type { HistoryEntry, Match, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';

const sampleResult: RoundResult = {
  id: 'r1',
  matchId: 'm1',
  playerDice: [6, 3],
  opponentDice: [2, 2],
  playerTotal: 9,
  opponentTotal: 4,
  outcome: 'win',
  stake: 50,
  payout: 100,
  netChange: 50,
  completedAt: 1700000000000,
};

const sampleEntry: HistoryEntry = { ...sampleResult, opponentName: 'Luna' };

afterEach(() => {
  // Restaura o store singleton entre os testes.
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('StakeSelector', () => {
  it('desabilita fichas acima do saldo e seleciona ficha válida', async () => {
    const user = userEvent.setup();
    useGameStore.setState({ phase: 'stake', balance: 30, selectedStake: null });
    render(<StakeSelector />);

    expect(screen.getByTestId('stake-50')).toBeDisabled();
    expect(screen.getByTestId('stake-10')).toBeEnabled();
    expect(screen.getByTestId('stake-25')).toBeEnabled();

    await user.click(screen.getByTestId('stake-25'));
    expect(screen.getByTestId('stake-25')).toHaveAttribute('aria-checked', 'true');
    expect(useGameStore.getState().selectedStake).toBe(25);
  });

  it('sem seleção o botão de busca fica desabilitado', () => {
    useGameStore.setState({ phase: 'stake', balance: 100, selectedStake: null });
    render(<StakeSelector />);
    expect(screen.getByTestId('search-button')).toBeDisabled();
  });

  it('sem saldo mínimo oferece recarga de créditos', () => {
    useGameStore.setState({ phase: 'stake', balance: 5, selectedStake: null });
    render(<StakeSelector />);
    expect(screen.getByTestId('refill-button')).toBeInTheDocument();
    expect(screen.queryByTestId('search-button')).not.toBeInTheDocument();
  });
});

describe('ConfirmPanel — perfil do oponente', () => {
  const match: Match = {
    id: 'm1',
    stake: 25,
    opponent: { id: 'o1', name: 'Luna', avatar: '🦊', rating: 1420 },
    createdAt: 1700000000000,
  };

  const openConfirm = () => {
    useGameStore.setState({
      phase: 'confirm',
      match,
      confirmations: { player: false, opponent: false },
    });
  };

  it('o avatar do oponente é clicável e abre o perfil por cima', async () => {
    const user = userEvent.setup();
    openConfirm();
    render(<ConfirmPanel match={match} />);

    // Fechado por padrão.
    expect(screen.queryByTestId('opponent-profile')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('opponent-avatar-button'));

    // Abriu com nome, nível, ações e exatamente 4 selos estampados.
    const profile = screen.getByTestId('opponent-profile');
    expect(profile).toBeInTheDocument();
    expect(within(profile).getByText('Luna')).toBeInTheDocument();
    expect(screen.getByTestId('profile-level')).toHaveTextContent(/Nível \d+/);
    expect(screen.getByTestId('profile-add-friend')).toBeInTheDocument();
    expect(screen.getByTestId('profile-report')).toBeInTheDocument();
    expect(profile.querySelectorAll('.profile-badge')).toHaveLength(4);

    // Enxuto: sem "pts de rating" e sem o bloco/rótulo "Conquistas".
    expect(profile.textContent?.toLowerCase()).not.toContain('rating');
    expect(profile.textContent?.toLowerCase()).not.toContain('conquistas');
  });

  it('fecha no X e a tela de confirmação segue montada e utilizável', async () => {
    const user = userEvent.setup();
    openConfirm();
    render(<ConfirmPanel match={match} />);

    await user.click(screen.getByTestId('opponent-avatar-button'));
    expect(screen.getByTestId('opponent-profile')).toBeInTheDocument();

    await user.click(screen.getByTestId('profile-close'));

    // O perfil sai; os botões de confirmar/recusar continuam disponíveis.
    await waitForElementToBeRemoved(() => screen.queryByTestId('opponent-profile'));
    expect(screen.getByTestId('confirm-match')).toBeInTheDocument();
    expect(screen.getByTestId('decline-match')).toBeInTheDocument();
  });
});

describe('DiceArena — totais sob as colunas', () => {
  const match = {
    id: 'm1',
    stake: 50,
    opponent: { id: 'o1', name: 'Luna', avatar: '🦊', rating: 1200 },
    createdAt: 1700000000000,
  };

  it('esconde os totais antes de completed (revelação escalonada)', () => {
    render(<DiceArena phase="reveal" match={match} result={sampleResult} />);
    // Sem placeholder: antes da revelação só os nomes aparecem.
    expect(screen.queryByTestId('player-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opponent-total')).not.toBeInTheDocument();
  });

  it('exibe os totais calculados pela engine em completed', () => {
    render(<DiceArena phase="completed" match={match} result={sampleResult} />);
    expect(screen.getByTestId('player-total')).toHaveTextContent('9');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('4');
  });

  it('em completed o placar flanqueia a dealer e coroa o vencedor', () => {
    render(<DiceArena phase="completed" match={match} result={sampleResult} />);
    expect(screen.getByTestId('score-plate-player')).toHaveClass('score-plate--winner');
    expect(screen.getByTestId('score-plate-opponent')).not.toHaveClass('score-plate--winner');
  });

  it('antes de completed não há placas ao lado da dealer', () => {
    render(<DiceArena phase="reveal" match={match} result={sampleResult} />);
    expect(screen.queryByTestId('score-plate-player')).not.toBeInTheDocument();
  });

  it('com cenário desligado o placar permanece sob as colunas', () => {
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, scenery: 'off' },
    });
    render(<DiceArena phase="completed" match={match} result={sampleResult} />);
    expect(screen.queryByTestId('score-plate-player')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-total')).toHaveTextContent('9');
  });
});

describe('Die3D', () => {
  it('anuncia o valor via aria-label quando revelado', () => {
    render(<Die3D value={5} side="player" rolling={false} label="Seu dado 1" />);
    expect(screen.getByRole('img', { name: 'Seu dado 1: 5' })).toBeInTheDocument();
  });

  it('anuncia "rolando" enquanto gira', () => {
    render(<Die3D value={null} side="opponent" rolling label="Dado 1 do oponente" />);
    expect(screen.getByRole('img', { name: 'Dado 1 do oponente: rolando' })).toBeInTheDocument();
  });
});

describe('HistorySheet', () => {
  it('mostra estado vazio sem rodadas', () => {
    render(<HistorySheet open onClose={() => undefined} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
  });

  it('lista rodadas persistidas com resultado e variação', () => {
    useGameStore.setState({ history: [sampleEntry] });
    render(<HistorySheet open onClose={() => undefined} />);

    expect(screen.getByTestId('history-list')).toBeInTheDocument();
    expect(screen.getByText(/vs Luna/)).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
  });
});

describe('App (fluxo Home → Tutorial → Stake)', () => {
  it('primeira jogada abre o tutorial e termina na seleção de aposta', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/BAC BO/)).toBeInTheDocument();
    await user.click(screen.getByTestId('play-button'));

    // Tutorial de 3 passos.
    expect(screen.getByRole('dialog', { name: 'Como jogar' })).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    await user.click(screen.getByTestId('tutorial-next'));
    await user.click(screen.getByTestId('tutorial-next'));

    expect(useGameStore.getState().phase).toBe('stake');
    expect(await screen.findByText('Escolha sua aposta')).toBeInTheDocument();
    expect(useGameStore.getState().settings.tutorialSeen).toBe(true);
  });

  it('com tutorial já visto, JOGAR vai direto para a aposta', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, tutorialSeen: true },
    });
    render(<App />);

    await user.click(screen.getByTestId('play-button'));
    expect(useGameStore.getState().phase).toBe('stake');
  });
});
