import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';

import { Card3D } from '../components/Card3D';
import { ConfirmPanel } from '../components/ConfirmPanel';
import type { HandsArenaProps } from '../components/HandsArena';
import { HandsArena } from '../components/HandsArena';
import { HistorySheet } from '../components/HistorySheet';
import { NegotiationPanel } from '../components/NegotiationPanel';
import { ResultBanner } from '../components/ResultBanner';
import { RoundEndBanner } from '../components/RoundEndBanner';
import type {
  BlackjackRoundState,
  Card,
  CardRank,
  CardSuit,
  HistoryEntry,
  Match,
  RoundResult,
} from '../engine/types';
import type { NegotiationState } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';

const card = (rank: CardRank, suit: CardSuit): Card => ({ rank, suit });

/**
 * Duelo resolvido pela engine: você para em 19 (10♠ 9♥) e bate o rival,
 * que ficou em 17 (10♣ 7♦). Não há casa no meio — é mão contra mão.
 * Vitória comum de stake 50 → payoutFor('win', 50) = 95 (o stake de volta
 * + 90% do lance do rival).
 */
const sampleResult: RoundResult = {
  id: 'r1',
  matchId: 'm1',
  playerHand: [card('10', 'spades'), card('9', 'hearts')],
  opponentHand: [card('10', 'clubs'), card('7', 'diamonds')],
  playerTotal: 19,
  opponentTotal: 17,
  playerBust: false,
  opponentBust: false,
  playerNatural: false,
  opponentNatural: false,
  outcome: 'win',
  stake: 50,
  payout: 95,
  netChange: 45,
  completedAt: 1700000000000,
};

/**
 * A mesma mesa ANTES do showdown, do PONTO DE VISTA do jogador: a sua mão
 * inteira, e do rival só a carta aberta — a última dele fica virada para
 * baixo (a regra de POV da mesa) e nem sai da engine.
 */
const sampleRound: BlackjackRoundState = {
  matchId: 'm1',
  phase: 'choosing',
  playerHand: [card('10', 'spades'), card('9', 'hearts')],
  opponentVisible: [card('10', 'clubs')],
  opponentHidden: 1,
  legalActions: ['hit', 'stand'],
  playerClosed: false,
  opponentClosed: false,
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
      {
        id: 's1',
        author: 'system',
        kind: 'text',
        text: 'Proponham valores e cheguem a um acordo.',
      },
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

describe('HandsArena — o duelo de 21 sobre o feltro', () => {
  const match: Match = {
    id: 'm1',
    stake: 50,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1200 },
    createdAt: 1700000000000,
  };

  /** Showdown com o rival estourado (10♣ 7♦ K♠ = 27). */
  const bustedOpponent: RoundResult = {
    ...sampleResult,
    opponentHand: [card('10', 'clubs'), card('7', 'diamonds'), card('K', 'spades')],
    opponentTotal: 27,
    opponentBust: true,
  };

  /** Showdown com blackjack natural na sua mão (A♠ K♦). */
  const naturalPlayer: RoundResult = {
    ...sampleResult,
    playerHand: [card('A', 'spades'), card('K', 'diamonds')],
    playerTotal: 21,
    playerNatural: true,
    payout: 125,
    netChange: 75,
  };

  const renderArena = (overrides: Partial<HandsArenaProps> = {}) =>
    render(
      <HandsArena
        phase="turn"
        match={match}
        round={sampleRound}
        result={null}
        onHit={() => undefined}
        onStand={() => undefined}
        actionPending={false}
        {...overrides}
      />,
    );

  it('a mesa tem duas mãos e só duas: rival em cima, você embaixo', () => {
    renderArena();

    expect(screen.getByTestId('hand-opponent')).toBeInTheDocument();
    expect(screen.getByTestId('hand-player')).toBeInTheDocument();
    // Sem casa para bater: não existe fileira de dealer nesta mesa.
    expect(screen.queryByTestId('hand-dealer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dealer-total')).not.toBeInTheDocument();

    // Duas cartas de cada lado, com testid por posição no leque.
    expect(screen.getByTestId('hand-player-cards-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('hand-player-cards-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('hand-opponent-cards-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('hand-opponent-cards-card-2')).toBeInTheDocument();
  });

  it('regra de POV: a sua mão é aberta e a última do rival fica oculta', () => {
    renderArena();

    expect(screen.getByRole('img', { name: 'Sua carta 1: 10 de espadas' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sua carta 2: 9 de copas' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Carta de Luna 1: 10 de paus' })).toBeInTheDocument();
    // A última do rival só abre no showdown.
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
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

  it('a barra de ações só existe na sua vez', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    expect(screen.queryByTestId('action-hit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-stand')).not.toBeInTheDocument();
  });

  it('totais ao vivo: o do rival é parcial, com o "+?" da carta oculta', () => {
    renderArena();

    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    // 10♣ aberta + a oculta: nada de somar o que ainda não virou.
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('10+?');
  });

  it('no showdown as ocultas viram e o total do rival fecha de verdade', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    expect(screen.getByTestId('opponent-total')).toHaveTextContent('17');
    expect(screen.getByTestId('opponent-total').textContent).not.toContain('+?');
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: 7 de ouros' })).toBeInTheDocument();
  });

  it('no settle cada mão ganha o seu selo de veredito', () => {
    const { unmount } = renderArena({ phase: 'settle', round: null, result: sampleResult });
    expect(screen.getByTestId('verdict-player')).toHaveTextContent('PAROU');
    expect(screen.getByTestId('verdict-opponent')).toHaveTextContent('PAROU');
    unmount();

    const busted = renderArena({ phase: 'settle', round: null, result: bustedOpponent });
    expect(screen.getByTestId('verdict-opponent')).toHaveTextContent('ESTOUROU');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('27');
    busted.unmount();

    renderArena({ phase: 'settle', round: null, result: naturalPlayer });
    expect(screen.getByTestId('verdict-player')).toHaveTextContent('BLACKJACK!');
  });

  it('antes do showdown não há selo de veredito nenhum', () => {
    renderArena();

    expect(screen.queryByTestId('verdict-player')).not.toBeInTheDocument();
    expect(screen.queryByTestId('verdict-opponent')).not.toBeInTheDocument();
  });

  it('a mesa é espelhada: cada total aponta para o centro do feltro', () => {
    renderArena();

    // Rival na cabeceira de cima: o total dele vem DEPOIS das cartas.
    const opponentCards = screen.getByTestId('hand-opponent-cards');
    const opponentTotal = screen.getByTestId('opponent-total');
    expect(
      opponentCards.compareDocumentPosition(opponentTotal) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Você na de baixo: o seu total vem ANTES das suas cartas.
    const playerCards = screen.getByTestId('hand-player-cards');
    const playerTotal = screen.getByTestId('player-total');
    expect(
      playerCards.compareDocumentPosition(playerTotal) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('as cartas deitam lado a lado, sem uma tampar a outra', () => {
    renderArena();

    // A primeira carta não desloca; as seguintes ganham RESPIRO (margem
    // positiva), nunca sobreposição.
    expect(screen.getByTestId('hand-player-cards-card-1').style.marginLeft).toBe('');
    expect(screen.getByTestId('hand-player-cards-card-2').style.marginLeft).toBe(
      'calc(var(--card-w) * 0.1)',
    );
    expect(screen.getByTestId('hand-opponent-cards-card-2').style.marginLeft).toBe(
      'calc(var(--card-w) * 0.1)',
    );
  });

  it('o botão DOBRAR só existe onde há aposta para dobrar', async () => {
    const user = userEvent.setup();
    const onRequestDouble = vi.fn();

    // Sem `onRequestDouble` (mesa do torneio) o botão nem entra em cena.
    const tournament = renderArena();
    expect(screen.queryByTestId('action-double')).not.toBeInTheDocument();
    tournament.unmount();

    renderArena({ onRequestDouble, canRequestDouble: true });
    await user.click(screen.getByTestId('action-double'));
    expect(onRequestDouble).toHaveBeenCalledTimes(1);
  });

  it('a vez é simultânea: relógio correndo e as duas placas acesas', () => {
    renderArena({ turn: { seconds: 14, opponentReady: false } });

    expect(screen.getByTestId('turn-clock')).toHaveTextContent('14s');
    // Os dois ainda têm de bater o martelo: as duas placas acendem.
    expect(screen.getByTestId('nameplate-player')).toHaveClass('is-turn');
    expect(screen.getByTestId('nameplate-opponent')).toHaveClass('is-turn');
    expect(screen.getByTestId('status-player')).toHaveTextContent('ESCOLHENDO');
    expect(screen.getByTestId('status-opponent')).toHaveTextContent('ESCOLHENDO');
  });

  it('travada a sua escolha, o rodapé passa a esperar o rival', () => {
    renderArena({
      round: { ...sampleRound, playerChoice: 'stand', legalActions: [] },
      turn: { seconds: 9, opponentReady: false },
    });

    // O QUE você escolheu não aparece em lugar nenhum da mesa: só que
    // você já escolheu.
    expect(screen.getByTestId('status-player')).toHaveTextContent('PRONTO');
    expect(screen.getByTestId('nameplate-player')).not.toHaveClass('is-turn');
    expect(screen.getByTestId('turn-wait')).toHaveTextContent('Aguardando Luna');
    expect(screen.queryByTestId('action-hit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('turn-clock')).not.toBeInTheDocument();
  });

  it('a revelação mostra os DOIS lances de uma vez', () => {
    renderArena({
      reveal: {
        id: 'r1',
        player: { by: 'player', action: 'hit', closed: false, bust: false, timedOut: false },
        opponent: { by: 'opponent', action: 'stand', closed: true, bust: false, timedOut: false },
      },
    });

    const call = screen.getByTestId('turn-call');
    expect(call).toHaveTextContent('PEDIU CARTA');
    expect(call).toHaveTextContent('PAROU');
  });

  it('o estouro do RIVAL não é anunciado: só o showdown pode contar', () => {
    renderArena({
      reveal: {
        id: 'r3',
        opponent: { by: 'opponent', action: 'hit', closed: true, bust: true, timedOut: false },
      },
    });

    const call = screen.getByTestId('turn-call');
    // O gesto público dele aparece; o que a carta virada fez, não.
    expect(call).toHaveTextContent('PEDIU CARTA');
    expect(call).not.toHaveTextContent('ESTOUROU');
    expect(call.querySelector('.is-bust')).toBeNull();
  });

  it('o SEU estouro é anunciado: as suas cartas estão todas abertas', () => {
    renderArena({
      reveal: {
        id: 'r4',
        player: { by: 'player', action: 'hit', closed: true, bust: true, timedOut: false },
      },
    });

    expect(screen.getByTestId('turn-call')).toHaveTextContent('ESTOUROU');
  });

  it('a brasa do blackjack é SÓ SUA — a mão do rival nunca acende aqui', () => {
    const natural: RoundResult = {
      ...sampleResult,
      playerHand: [card('A', 'hearts'), card('K', 'spades')],
      playerTotal: 21,
      playerNatural: true,
      opponentNatural: true,
    };
    const naturalRound: BlackjackRoundState = {
      ...sampleRound,
      playerHand: [card('A', 'hearts'), card('K', 'spades')],
    };

    const ablaze = (root: HTMLElement, hand: string) =>
      root.querySelectorAll(`[data-testid^="${hand}-cards-card"] .card-scene--ablaze`).length;

    // A sua queima assim que as cartas assentam: elas estão abertas na
    // sua frente e você já sabe o que tirou.
    const live = renderArena({ round: naturalRound });
    expect(ablaze(live.container, 'hand-player')).toBe(2);
    expect(ablaze(live.container, 'hand-opponent')).toBe(0);
    live.unmount();

    // E a dele não acende NEM no showdown: o efeito é de quem joga, não
    // da mesa — o blackjack do rival queima na tela dele.
    const showdown = renderArena({ phase: 'settle', round: null, result: natural });
    expect(ablaze(showdown.container, 'hand-opponent')).toBe(0);
    expect(screen.getByTestId('verdict-opponent')).toHaveTextContent('BLACKJACK');
  });

  it('o lance perdido no relógio é anunciado como tempo esgotado', () => {
    renderArena({
      reveal: {
        id: 'r2',
        player: { by: 'player', action: 'stand', closed: true, bust: false, timedOut: true },
      },
    });

    expect(screen.getByTestId('turn-call')).toHaveTextContent('TEMPO');
  });

  it('a dobra vira placar: recusada apaga o botão, aceita põe fogo nele', () => {
    const declined = renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'declined', amount: 100, open: false },
    });
    expect(screen.getByTestId('action-double')).toHaveTextContent('DOBRA RECUSADA');
    expect(screen.getByTestId('action-double')).toBeDisabled();
    expect(declined.container.querySelector('.double-cta--declined')).toBeInTheDocument();
    declined.unmount();

    const accepted = renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'accepted', amount: 200, open: false },
    });
    expect(screen.getByTestId('action-double')).toHaveTextContent('APOSTA DOBRADA · 200');
    // O invólucro em brasa é quem desenha o fogo nas bordas.
    expect(accepted.container.querySelector('.double-cta--accepted')).toBeInTheDocument();
  });

  it('com a dobra no ar a mesa inteira espera a resposta do rival', () => {
    renderArena({
      onRequestDouble: () => undefined,
      canRequestDouble: false,
      doubleBet: { status: 'pending', amount: 100, open: true },
    });

    expect(screen.getByTestId('action-hit')).toBeDisabled();
    expect(screen.getByTestId('action-stand')).toBeDisabled();
    expect(screen.getByTestId('action-double')).toBeDisabled();

    const bubble = screen.getByTestId('double-request');
    expect(bubble).toHaveAttribute('data-status', 'pending');
    expect(screen.getByTestId('double-amount')).toHaveTextContent('100');
    expect(bubble).toHaveTextContent('DOBRAR A APOSTA?');
  });

  it('respondida, a nuvem mostra qual das duas o rival escolheu', () => {
    const { unmount } = renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'accepted', amount: 100, open: true },
    });
    let bubble = screen.getByTestId('double-request');
    expect(bubble).toHaveTextContent('DOBRA ACEITA');
    expect(bubble.querySelector('.double-answer--yes')).toHaveClass('is-picked');
    expect(bubble.querySelector('.double-answer--no')).toHaveClass('is-muted');
    unmount();

    renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'declined', amount: 100, open: true },
    });
    bubble = screen.getByTestId('double-request');
    expect(bubble).toHaveTextContent('DOBRA RECUSADA');
    expect(bubble.querySelector('.double-answer--no')).toHaveClass('is-picked');
    expect(bubble.querySelector('.double-answer--yes')).toHaveClass('is-muted');
  });

  it('em completed o placar flanqueia a crupiê e coroa o vencedor', () => {
    renderArena({ phase: 'completed', round: null, result: sampleResult });

    expect(screen.getByTestId('score-plate-player')).toHaveClass('score-plate--winner');
    expect(screen.getByTestId('score-plate-opponent')).not.toHaveClass('score-plate--winner');
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('17');
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

describe('RoundEndBanner — aviso de mão do torneio', () => {
  it('mostra o veredito da mão e MAIS NADA', () => {
    render(<RoundEndBanner result={sampleResult} />);
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('MÃO GANHA');
    // O banner não repete placar nem legendas: só o veredito.
    expect(screen.queryByTestId('round-subtitle')).not.toBeInTheDocument();
  });

  it('mão perdida e empate têm o seu próprio veredito', () => {
    const { unmount } = render(
      <RoundEndBanner
        result={{ ...sampleResult, outcome: 'lose', playerTotal: 16, payout: 0, netChange: -50 }}
      />,
    );
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('MÃO PERDIDA');
    unmount();

    render(
      <RoundEndBanner
        result={{
          ...sampleResult,
          outcome: 'tie',
          playerTotal: 17,
          opponentTotal: 17,
          payout: 50,
          netChange: 0,
        }}
      />,
    );
    expect(screen.getByTestId('round-verdict')).toHaveTextContent('EMPATE');
  });
});

describe('Card3D', () => {
  it('anuncia a carta via aria-label quando aberta', () => {
    render(<Card3D card={card('10', 'spades')} label="Sua carta 1" />);
    expect(screen.getByRole('img', { name: 'Sua carta 1: 10 de espadas' })).toBeInTheDocument();
  });

  it('anuncia "carta oculta" com a face para baixo, mesmo conhecendo a carta', () => {
    render(<Card3D card={card('A', 'hearts')} faceDown label="Carta de Luna 2" />);
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
  });

  it('carta desconhecida (null) também fica oculta', () => {
    render(<Card3D card={null} silent label="Carta de Luna 2" />);
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
  });

  it('baralho único: o verso é o da casa, igual para os dois duelistas', () => {
    // Sem escolha de cor na mesa — nenhuma prop pinta o verso, e o
    // brasão do clube no medalhão é o mesmo dos dois lados.
    const crest = (container: HTMLElement) => container.querySelector('.card3d__crest');
    const oculta = render(<Card3D card={null} silent label="Carta de Luna 2" />);
    expect(crest(oculta.container)).toBeInTheDocument();
    oculta.unmount();

    const virada = render(
      <Card3D card={card('9', 'hearts')} faceDown silent label="Sua carta 2" />,
    );
    expect(crest(virada.container)).toBeInTheDocument();
    // O desenho vem do SVG da marca usado como máscara — nada de texto.
    expect(virada.container.querySelector('.card3d__crest')).toHaveStyle({
      '--crest-src': 'url("/brasaorvc.svg")',
    });
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
