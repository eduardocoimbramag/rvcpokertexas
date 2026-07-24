import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import App from '@/App';

import { CoinFlipOverlay } from '../components/CoinFlipOverlay';
import { ConfirmPanel } from '../components/ConfirmPanel';
import { DiceArena } from '../components/DiceArena';
import { Die3D } from '../components/Die3D';
import { HistorySheet } from '../components/HistorySheet';
import { NegotiationPanel } from '../components/NegotiationPanel';
import { ResultBanner } from '../components/ResultBanner';
import type { HistoryEntry, Match, RoundResult } from '../engine/types';
import type { NegotiationState } from '../store/gameStore';
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

describe('NegotiationPanel — mesa de negociação', () => {
  const match: Match = {
    id: 'm1',
    stake: 10,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
    createdAt: 1700000000000,
  };

  const baseNegotiation: NegotiationState = {
    messages: [
      { id: 's1', author: 'system', kind: 'text', text: 'Proponham valores e cheguem a um acordo.' },
    ],
    activeProposal: null,
    agreedStake: null,
    proposalCooldown: 0,
    opponentTyping: false,
    starting: false,
  };

  const openNegotiation = (patch: Partial<NegotiationState> = {}) => {
    useGameStore.setState({
      phase: 'negotiate',
      match,
      balance: 500,
      negotiation: { ...baseNegotiation, ...patch },
    });
  };

  it('composer: +10/+100 somam ao lance e o enviar exige valor válido', async () => {
    const user = userEvent.setup();
    openNegotiation();
    render(<NegotiationPanel match={match} />);

    // Sem valor digitado, "Enviar proposta" fica bloqueado.
    expect(screen.getByTestId('nego-send')).toBeDisabled();

    await user.click(screen.getByTestId('nego-plus-10'));
    await user.click(screen.getByTestId('nego-plus-100'));
    expect(screen.getByTestId('nego-input')).toHaveValue('110');
    expect(screen.getByTestId('nego-send')).toBeEnabled();
  });

  it('acima do saldo o envio bloqueia e a dica avisa', async () => {
    const user = userEvent.setup();
    openNegotiation();
    render(<NegotiationPanel match={match} />);

    // Em repouso a dica fica calada: nada de lembrete fixo de limites.
    expect(screen.queryByTestId('nego-hint')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('nego-input'), '900');
    expect(screen.getByTestId('nego-send')).toBeDisabled();
    expect(screen.getByTestId('nego-hint')).toHaveTextContent(/saldo insuficiente/i);
  });

  it('abaixo do mínimo o envio bloqueia e a dica nomeia o piso', async () => {
    const user = userEvent.setup();
    openNegotiation();
    render(<NegotiationPanel match={match} />);

    await user.type(screen.getByTestId('nego-input'), '5');
    expect(screen.getByTestId('nego-send')).toBeDisabled();
    expect(screen.getByTestId('nego-hint')).toHaveTextContent(/lance mínimo é 10/i);
  });

  it('durante o relógio de 10 s o envio mostra a contagem e bloqueia', async () => {
    const user = userEvent.setup();
    openNegotiation({ proposalCooldown: 7 });
    render(<NegotiationPanel match={match} />);

    await user.type(screen.getByTestId('nego-input'), '50');
    expect(screen.getByTestId('nego-send')).toBeDisabled();
    expect(screen.getByTestId('nego-cooldown')).toHaveTextContent('7s');
    expect(screen.getByTestId('nego-hint')).toHaveTextContent(/nova proposta em 7s/i);
  });

  it('proposta viva do oponente traz o ACEITAR, que fecha o acordo', async () => {
    const user = userEvent.setup();
    openNegotiation({
      messages: [
        ...baseNegotiation.messages,
        { id: 'p1', author: 'opponent', kind: 'proposal', amount: 60, status: 'pending' },
      ],
      activeProposal: { messageId: 'p1', from: 'opponent', amount: 60 },
    });
    render(<NegotiationPanel match={match} />);

    // Antes do acordo, iniciar fica bloqueado.
    expect(screen.getByTestId('nego-start')).toBeDisabled();

    await user.click(screen.getByTestId('nego-accept'));
    expect(useGameStore.getState().negotiation?.agreedStake).toBe(60);

    // A conversa não ganha mensagem: o cartão do lance recebe o selo e o
    // iniciar destrava. Nada de faixa de "acordo fechado" no chat.
    expect(await screen.findByTestId('nego-accepted')).toBeInTheDocument();
    expect(screen.getByTestId('nego-start')).toBeEnabled();
    expect(screen.getByTestId('nego-chat').textContent).not.toMatch(/acordo fechado/i);
    // Com a mesa selada, o composer sai de cena.
    expect(screen.queryByTestId('nego-send')).not.toBeInTheDocument();
  });

  it('desistir abandona a mesa e volta ao menu', async () => {
    const user = userEvent.setup();
    openNegotiation();
    render(<NegotiationPanel match={match} />);

    await user.click(screen.getByTestId('nego-quit'));
    expect(useGameStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().negotiation).toBeNull();
  });

  it('indicador de digitação aparece com o oponente escrevendo', () => {
    openNegotiation({ opponentTyping: true });
    render(<NegotiationPanel match={match} />);
    expect(screen.getByTestId('nego-typing')).toBeInTheDocument();
  });
});

describe('ConfirmPanel — perfil do oponente', () => {
  const match: Match = {
    id: 'm1',
    stake: 25,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
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

describe('CoinFlipOverlay — cara-ou-coroa', () => {
  const match: Match = {
    id: 'm1',
    stake: 25,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
    createdAt: 1700000000000,
  };

  const baseCoin = {
    playerSide: 'cara',
    result: 'cara',
    winner: 'player',
    chosenColor: null,
    pickSeconds: null,
  } as const;

  it('anuncia a face sorteada quando a moeda pousa', () => {
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: { ...baseCoin, stage: 'result' },
    });
    render(<CoinFlipOverlay />);

    expect(screen.getByTestId('coin-side')).toHaveTextContent('Seu lado · CARA');
    expect(screen.getByTestId('coin-verdict')).toHaveTextContent('Deu CARA!');
    // O veredito do sorteio tem cena própria: aqui ainda não aparece.
    expect(screen.queryByTestId('coin-winner')).not.toBeInTheDocument();
  });

  it('o veredito do sorteio ocupa a tela sozinho antes da escolha', () => {
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: { ...baseCoin, stage: 'verdict' },
    });
    render(<CoinFlipOverlay />);

    expect(screen.getByTestId('coin-winner')).toHaveTextContent('Você venceu o sorteio');
    // Nada mais em cena: nem a moeda, nem os cartões de cor.
    expect(screen.queryByTestId('coin-side')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dice-color-picker')).not.toBeInTheDocument();
  });

  it('perdendo o sorteio, o veredito nomeia o oponente', () => {
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: { ...baseCoin, result: 'coroa', winner: 'opponent', stage: 'verdict' },
    });
    render(<CoinFlipOverlay />);

    expect(screen.getByTestId('coin-winner')).toHaveTextContent('Luna venceu o sorteio');
  });

  it('vencedor só confirma depois de escolher, e a escolha troca os lados', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: { ...baseCoin, stage: 'pick', pickSeconds: 10 },
    });
    render(<CoinFlipOverlay />);

    // A cena do lançamento saiu; ficaram os dois dados e o confirmar.
    expect(screen.queryByTestId('coin-side')).not.toBeInTheDocument();
    expect(screen.getByTestId('coin-headline')).toHaveTextContent('Escolha seus dados');
    // O veredito já teve a sua cena: não se repete aqui.
    expect(screen.queryByTestId('coin-winner')).not.toBeInTheDocument();
    expect(screen.getByTestId('pick-countdown')).toHaveTextContent('Escolha automática em 10s');
    const confirm = screen.getByTestId('confirm-dice-color');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByTestId('dice-color-vermelho'));
    expect(screen.getByTestId('dice-color-vermelho')).toHaveAttribute('aria-checked', 'true');
    // Selecionar ainda não aplica: só o confirmar fecha a escolha.
    expect(useGameStore.getState().coinFlip?.stage).toBe('pick');

    await user.click(confirm);
    expect(useGameStore.getState().diceColors).toEqual({
      player: 'vermelho',
      opponent: 'azul',
    });
    expect(useGameStore.getState().coinFlip?.stage).toBe('picked');
  });

  it('derrota no sorteio: o oponente anuncia a cor e não há confirmar', () => {
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: {
        ...baseCoin,
        result: 'coroa',
        winner: 'opponent',
        stage: 'botPick',
        chosenColor: 'azul',
      },
    });
    render(<CoinFlipOverlay />);

    expect(screen.getByTestId('coin-headline')).toHaveTextContent('Luna escolheu os dados Azuis');
    expect(screen.queryByTestId('confirm-dice-color')).not.toBeInTheDocument();
  });
});

describe('DiceArena — totais sob as colunas', () => {
  const match = {
    id: 'm1',
    stake: 50,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1200 },
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

  it('aplica a cor do cara-ou-coroa via variáveis CSS', () => {
    // O jogador levou os vermelhos no sorteio: as faces seguem a cor
    // escolhida, não a tinta histórica do lado.
    render(<Die3D value={3} side="player" rolling={false} color="vermelho" label="Seu dado 1" />);
    const scene = screen.getByRole('img', { name: 'Seu dado 1: 3' });
    expect(scene.style.getPropertyValue('--die-color-a')).toBe('#f87171');
    expect(scene.querySelector('.die-face--custom')).not.toBeNull();
  });
});

describe('ResultBanner', () => {
  it('mostra o veredito e solta a chuva de confetes na vitória', () => {
    render(<ResultBanner result={sampleResult} />);
    expect(screen.getByTestId('result-title')).toHaveTextContent('VITÓRIA!');
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('não solta confetes na derrota', () => {
    render(
      <ResultBanner result={{ ...sampleResult, outcome: 'lose', payout: 0, netChange: -50 }} />,
    );
    expect(screen.getByTestId('result-title')).toHaveTextContent('DERROTA');
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
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

describe('App (fluxo Home → Tutorial → Busca)', () => {
  it('primeira jogada abre o tutorial e termina na busca por oponente', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/BAC BO/)).toBeInTheDocument();
    await user.click(screen.getByTestId('play-button'));

    // Tutorial de 3 passos.
    expect(screen.getByRole('dialog', { name: 'Como jogar' })).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    await user.click(screen.getByTestId('tutorial-next'));
    await user.click(screen.getByTestId('tutorial-next'));

    // Sem tela de aposta: o 1v1 cai direto na busca (o valor é
    // negociado com o oponente depois da confirmação).
    expect(useGameStore.getState().phase).toBe('search');
    expect(await screen.findByText('Procurando oponente…')).toBeInTheDocument();
    expect(useGameStore.getState().settings.tutorialSeen).toBe(true);
  });

  it('com tutorial já visto, JOGAR vai direto para a busca', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, tutorialSeen: true },
    });
    render(<App />);

    await user.click(screen.getByTestId('play-button'));
    expect(useGameStore.getState().phase).toBe('search');
  });
});
