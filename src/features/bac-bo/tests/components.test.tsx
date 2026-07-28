import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';

import { Card3D } from '../components/Card3D';
import { CoinFlipOverlay } from '../components/CoinFlipOverlay';
import { ConfirmPanel } from '../components/ConfirmPanel';
import type { HandsArenaProps } from '../components/HandsArena';
import { HandsArena } from '../components/HandsArena';
import { HistorySheet } from '../components/HistorySheet';
import { NegotiationPanel } from '../components/NegotiationPanel';
import { ResultBanner } from '../components/ResultBanner';
import { RoundEndBanner } from '../components/RoundEndBanner';
import { SeriesDots } from '../components/SeriesDots';
import type {
  BlackjackRoundState,
  Card,
  CardRank,
  CardSuit,
  HistoryEntry,
  Match,
  RoundResult,
} from '../engine/types';
import type { CardColorId } from '../store/cardColors';
import { DEFAULT_CARD_COLORS } from '../store/cardColors';
import type { CoinFlipState, NegotiationState, SeriesState } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';

const card = (rank: CardRank, suit: CardSuit): Card => ({ rank, suit });

/**
 * Rodada resolvida pela engine: o jogador para em 19 e vence o dealer
 * (17); o oponente empata com a casa. Vitória comum de stake 50 →
 * payoutFor('win', 50) = 95 (o stake de volta + 90% do lance rival).
 */
const sampleResult: RoundResult = {
  id: 'r1',
  matchId: 'm1',
  playerHand: [card('10', 'spades'), card('9', 'hearts')],
  opponentHand: [card('10', 'clubs'), card('7', 'diamonds')],
  dealerHand: [card('9', 'hearts'), card('8', 'diamonds')],
  playerTotal: 19,
  opponentTotal: 17,
  dealerTotal: 17,
  playerCategory: 'win',
  opponentCategory: 'push',
  playerNatural: false,
  opponentNatural: false,
  outcome: 'win',
  stake: 50,
  payout: 95,
  netChange: 45,
  completedAt: 1700000000000,
};

/** A mesma mesa ANTES do veredito: a vez do jogador aberta, o dealer só
 * com a carta de cima exposta. */
const sampleRound: BlackjackRoundState = {
  matchId: 'm1',
  phase: 'playerTurn',
  playerHand: [card('10', 'spades'), card('9', 'hearts')],
  opponentHand: [card('10', 'clubs'), card('7', 'diamonds')],
  dealerUpCard: card('9', 'hearts'),
  legalActions: ['hit', 'stand'],
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

  /**
   * A cena é apresentacional: recebe o sorteio pronto por props (do
   * gameStore no 1v1, do useCoinFlip no torneio) e só coreografa.
   */
  const renderCoin = (
    coinFlip: CoinFlipState,
    options: { playerColor?: CardColorId; onChoose?: (color: CardColorId) => void } = {},
  ) =>
    render(
      <CoinFlipOverlay
        coinFlip={coinFlip}
        opponentName="Luna"
        playerColor={options.playerColor ?? 'azul'}
        onChoose={options.onChoose ?? (() => undefined)}
      />,
    );

  it('anuncia a face sorteada quando a moeda pousa', () => {
    renderCoin({ ...baseCoin, stage: 'result' });

    expect(screen.getByTestId('coin-side')).toHaveTextContent('Seu lado · CARA');
    expect(screen.getByTestId('coin-verdict')).toHaveTextContent('Deu CARA!');
    // O veredito do sorteio tem cena própria: aqui ainda não aparece.
    expect(screen.queryByTestId('coin-winner')).not.toBeInTheDocument();
  });

  it('o veredito do sorteio ocupa a tela sozinho antes da escolha', () => {
    renderCoin({ ...baseCoin, stage: 'verdict' });

    expect(screen.getByTestId('coin-winner')).toHaveTextContent('Você venceu o sorteio');
    // Nada mais em cena: nem a moeda, nem os cartões de cor.
    expect(screen.queryByTestId('coin-side')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-color-picker')).not.toBeInTheDocument();
  });

  it('perdendo o sorteio, o veredito nomeia o oponente', () => {
    renderCoin({ ...baseCoin, result: 'coroa', winner: 'opponent', stage: 'verdict' });

    expect(screen.getByTestId('coin-winner')).toHaveTextContent('Luna venceu o sorteio');
  });

  it('vencedor só confirma depois de escolher, e a escolha troca os lados', async () => {
    const user = userEvent.setup();
    // Ligada ao store do 1v1: o clique precisa chegar em chooseCardColor
    // e trocar as cores dos dois lados de verdade.
    useGameStore.setState({
      phase: 'coinflip',
      match,
      coinFlip: { ...baseCoin, stage: 'pick', pickSeconds: 10 },
    });
    renderCoin({ ...baseCoin, stage: 'pick', pickSeconds: 10 }, {
      onChoose: (color) => useGameStore.getState().chooseCardColor(color),
    });

    // A cena do lançamento saiu; ficaram os dois versos e o confirmar.
    expect(screen.queryByTestId('coin-side')).not.toBeInTheDocument();
    expect(screen.getByTestId('coin-headline')).toHaveTextContent('Escolha suas cartas');
    // O veredito já teve a sua cena: não se repete aqui.
    expect(screen.queryByTestId('coin-winner')).not.toBeInTheDocument();
    expect(screen.getByTestId('pick-countdown')).toHaveTextContent('Escolha automática em 10s');
    const confirm = screen.getByTestId('confirm-card-color');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByTestId('card-color-vermelho'));
    expect(screen.getByTestId('card-color-vermelho')).toHaveAttribute('aria-checked', 'true');
    // Selecionar ainda não aplica: só o confirmar fecha a escolha.
    expect(useGameStore.getState().coinFlip?.stage).toBe('pick');

    await user.click(confirm);
    expect(useGameStore.getState().cardColors).toEqual({
      player: 'vermelho',
      opponent: 'azul',
    });
    expect(useGameStore.getState().coinFlip?.stage).toBe('picked');
  });

  it('cartões de escolha anunciam as duas cores da mesa', () => {
    renderCoin({ ...baseCoin, stage: 'pick', pickSeconds: 10 });

    const picker = screen.getByTestId('card-color-picker');
    expect(within(picker).getByTestId('card-color-azul')).toHaveTextContent('Azuis');
    expect(within(picker).getByTestId('card-color-vermelho')).toHaveTextContent('Vermelhas');
  });

  it('após a escolha, o anúncio diz com quais cartas o jogador joga', () => {
    renderCoin(
      { ...baseCoin, stage: 'picked', chosenColor: 'vermelho' },
      { playerColor: 'vermelho' },
    );

    expect(screen.getByTestId('coin-headline')).toHaveTextContent(
      'Você joga com as cartas Vermelhas',
    );
    // A escolha já fechou: não há mais confirmar em cena.
    expect(screen.queryByTestId('confirm-card-color')).not.toBeInTheDocument();
  });

  it('derrota no sorteio: o oponente anuncia a cor e não há confirmar', () => {
    renderCoin({
      ...baseCoin,
      result: 'coroa',
      winner: 'opponent',
      stage: 'botPick',
      chosenColor: 'azul',
    });

    expect(screen.getByTestId('coin-headline')).toHaveTextContent('Luna escolheu as cartas Azuis');
    expect(screen.queryByTestId('confirm-card-color')).not.toBeInTheDocument();
  });
});

describe('HandsArena — a mesa de blackjack', () => {
  const match: Match = {
    id: 'm1',
    stake: 50,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1200 },
    createdAt: 1700000000000,
  };

  const renderArena = (overrides: Partial<HandsArenaProps> = {}) =>
    render(
      <HandsArena
        phase="playerTurn"
        match={match}
        round={sampleRound}
        result={null}
        onHit={() => undefined}
        onStand={() => undefined}
        actionPending={false}
        {...overrides}
      />,
    );

  it('na vez do jogador as três mãos estão na mesa e a fechada do dealer segue fechada', () => {
    renderArena();

    expect(screen.getByTestId('hand-dealer')).toBeInTheDocument();
    expect(screen.getByTestId('hand-player')).toBeInTheDocument();
    expect(screen.getByTestId('hand-opponent')).toBeInTheDocument();
    // A segunda carta do dealer só vira na vez dele.
    expect(
      screen.getByRole('img', { name: 'Carta do dealer 2: carta fechada' }),
    ).toBeInTheDocument();
  });

  it('PEDIR CARTA e PARAR chamam as ações recebidas por props', async () => {
    const user = userEvent.setup();
    const onHit = vi.fn();
    const onStand = vi.fn();
    renderArena({ onHit, onStand });

    await user.click(screen.getByTestId('action-hit'));
    expect(onHit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('action-stand'));
    expect(onStand).toHaveBeenCalledTimes(1);
  });

  it('com uma ação em trânsito na engine os botões travam', () => {
    renderArena({ actionPending: true });

    expect(screen.getByTestId('action-hit')).toBeDisabled();
    expect(screen.getByTestId('action-stand')).toBeDisabled();
  });

  it('totais ao vivo: o dealer só conta a carta aberta antes do settle', () => {
    renderArena();

    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('17');
    // 9♥ aberta + fechada: nada de somar o que ainda não virou.
    expect(screen.getByTestId('dealer-total')).toHaveTextContent('9');
  });

  it('na vez do oponente o total dele se esconde (as cartas entrando são o show)', () => {
    renderArena({ phase: 'opponentTurn', round: null, result: sampleResult });

    expect(screen.queryByTestId('opponent-total')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
  });

  it('no settle as categorias contra o dealer abrem, com o total final da casa', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    expect(screen.getByTestId('category-player')).toHaveTextContent('VENCEU O DEALER');
    expect(screen.getByTestId('category-opponent')).toHaveTextContent('EMPATOU');
    expect(screen.getByTestId('dealer-total')).toHaveTextContent('17');
  });

  it('em completed o placar flanqueia a dealer e coroa o vencedor', () => {
    renderArena({ phase: 'completed', round: null, result: sampleResult });

    expect(screen.getByTestId('score-plate-player')).toHaveClass('score-plate--winner');
    expect(screen.getByTestId('score-plate-opponent')).not.toHaveClass('score-plate--winner');
  });

  it('com cenário desligado o placar permanece na faixa da mesa', () => {
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, scenery: 'off' },
    });
    renderArena({ phase: 'completed', round: null, result: sampleResult });

    expect(screen.queryByTestId('score-plate-player')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('17');
  });
});

describe('SeriesDots / RoundEndBanner — melhor de 3', () => {
  const openSeries: SeriesState = {
    playerWins: 1,
    opponentWins: 0,
    roundWinners: ['player'],
    roundNumber: 2,
    outcome: null,
  };

  it('preenche um círculo por rodada decidida, com o placar da série', () => {
    render(<SeriesDots series={openSeries} cardColors={DEFAULT_CARD_COLORS} />);
    const dots = screen.getByTestId('series-dots');
    expect(dots).toHaveAttribute('data-score', '1-0');
    expect(screen.getByTestId('series-dot-1')).toHaveAttribute('data-winner', 'player');
    expect(screen.getByTestId('series-dot-2')).toHaveAttribute('data-winner', 'empty');
    expect(screen.getByTestId('series-dot-3')).toHaveAttribute('data-winner', 'empty');
  });

  it('o beat de fim de rodada mostra o veredito e MAIS NADA', () => {
    render(<RoundEndBanner result={sampleResult} />);
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('RODADA GANHA');
    // O placar vive só na pílula do topo: o banner não repete círculos
    // nem legendas explicando o que eles já mostram.
    expect(screen.queryByTestId('series-dots')).not.toBeInTheDocument();
    expect(screen.queryByTestId('round-subtitle')).not.toBeInTheDocument();
  });

  it('rodada perdida e empate têm o seu próprio veredito', () => {
    const { unmount } = render(
      <RoundEndBanner
        result={{ ...sampleResult, outcome: 'lose', playerCategory: 'lose', playerTotal: 16 }}
      />,
    );
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('RODADA PERDIDA');
    unmount();

    render(
      <RoundEndBanner
        result={{ ...sampleResult, outcome: 'tie', playerTotal: 17, opponentTotal: 17 }}
      />,
    );
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('EMPATE');
  });
});

describe('Card3D', () => {
  it('anuncia a carta via aria-label quando aberta', () => {
    render(<Card3D card={card('10', 'spades')} back="azul" label="Sua carta 1" />);
    expect(screen.getByRole('img', { name: 'Sua carta 1: 10 de espadas' })).toBeInTheDocument();
  });

  it('anuncia "carta fechada" com a face para baixo, mesmo conhecendo a carta', () => {
    render(<Card3D card={card('A', 'hearts')} faceDown back="house" label="Carta do dealer 2" />);
    expect(
      screen.getByRole('img', { name: 'Carta do dealer 2: carta fechada' }),
    ).toBeInTheDocument();
  });

  it('carta desconhecida (null) também fecha', () => {
    render(<Card3D card={null} back="azul" silent label="Cartas Azuis" />);
    expect(screen.getByRole('img', { name: 'Cartas Azuis: carta fechada' })).toBeInTheDocument();
  });

  it('pinta o verso com a cor do cara-ou-coroa via variáveis CSS', () => {
    // O jogador levou as vermelhas no sorteio: o verso segue a cor
    // escolhida, não a tinta histórica do lado.
    render(<Card3D card={null} back="vermelho" silent label="Cartas Vermelhas" />);
    const scene = screen.getByRole('img', { name: 'Cartas Vermelhas: carta fechada' });
    expect(scene.style.getPropertyValue('--card-back-a')).toBe('#f87171');
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
      <ResultBanner
        result={{
          ...sampleResult,
          outcome: 'lose',
          playerCategory: 'lose',
          playerTotal: 16,
          payout: 0,
          netChange: -50,
        }}
      />,
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
    expect(screen.getByText('+45')).toBeInTheDocument();
  });
});

describe('App (fluxo Home → Tutorial → Busca)', () => {
  it('primeira jogada abre o tutorial e termina na busca por oponente', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/BLACKJACK/)).toBeInTheDocument();
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
