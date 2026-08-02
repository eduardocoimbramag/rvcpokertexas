import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';

import { Card3D } from '../components/Card3D';
import { ConfirmPanel } from '../components/ConfirmPanel';
import type { HandsArenaProps } from '../components/HandsArena';
import { HandsArena } from '../components/HandsArena';
import { HistorySheet } from '../components/HistorySheet';
import { NegotiationHud, NegotiationPanel } from '../components/NegotiationPanel';
import { ResultBanner } from '../components/ResultBanner';
import { ResultStage } from '../components/ResultStage';
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
  /* Cada teste abre a mesa com um match de id ÚNICO: os timers REAIS
     que as ações do store agendam (finishNegotiation, o beat do balão)
     carregam o matchId, e um id novo por teste faz qualquer timer
     vazado de um teste anterior morrer nos guards do store em vez de
     corromper o teste corrente. */
  let matchSeq = 0;
  let match: Match;

  const baseNegotiation: NegotiationState = {
    tableStake: 100,
    // O caso comum é a mesa JÁ aberta: o letreiro de abertura é um beat
    // do store, testado à parte.
    announcing: false,
    secondsLeft: 20,
    proposal: null,
    agreedStake: null,
    starting: false,
  };

  const openNegotiation = (patch: Partial<NegotiationState> = {}) => {
    matchSeq += 1;
    match = {
      id: `m-nego-${matchSeq}`,
      stake: 10,
      opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
      createdAt: 1700000000000,
    };
    useGameStore.setState({
      phase: 'negotiate',
      match,
      balance: 500,
      negotiation: { ...baseNegotiation, ...patch },
    });
  };

  it('o título de abertura segura o feltro; as fichas entram quando ele sai', () => {
    openNegotiation({ announcing: true });
    const view = render(<NegotiationPanel match={match} />);

    // Enquanto o letreiro carimba o centro, a mesa não mostra fichas.
    expect(screen.getByTestId('nego-open-announce')).toHaveTextContent(/rodada de negociação/i);
    expect(screen.queryByTestId('nego-table')).not.toBeInTheDocument();

    // Vencido o beat (quem o solta é o store), as fichas assumem o
    // centro. O letreiro ainda pode estar em cena por um quadro: quem o
    // desmonta é a animação de saída, não este render.
    useGameStore.setState({
      negotiation: { ...baseNegotiation, announcing: false },
    });
    view.rerender(<NegotiationPanel match={match} />);
    expect(screen.getByTestId('nego-table-stake')).toHaveTextContent('100');
    expect(screen.getByTestId('nego-clock')).toHaveTextContent('20s');
    expect(screen.getByTestId('nego-send')).toBeDisabled();
  });

  it('a pílula do rival resume a mesa numa linha: nome + situação', () => {
    openNegotiation();
    const view = render(<NegotiationHud match={match} />);
    expect(screen.getByTestId('nego-hud')).toHaveTextContent(/Luna\s*Esperando/i);

    // A pílula é um dado COMPOSTO, e o papel `img` faz o leitor de tela
    // anunciá-la de uma vez: sem ele o rótulo seria descartado e sobraria
    // o conteúdo cru ("L Luna ESPERANDO").
    expect(screen.getByRole('img', { name: /Luna: esperando/i })).toBeInTheDocument();

    // O lance do rival chama a sua resposta na própria pílula.
    useGameStore.setState({
      negotiation: {
        ...baseNegotiation,
        proposal: { id: 'p1', from: 'opponent', amount: 60, status: 'pending', open: true },
      },
    });
    view.rerender(<NegotiationHud match={match} />);
    expect(screen.getByTestId('nego-hud')).toHaveTextContent(/Proposta/i);
    expect(screen.getByTestId('nego-hud')).toHaveAttribute('data-state', 'offer');
  });

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

  it('um lance seu no ar pausa o composer até a resposta do rival', () => {
    openNegotiation({
      proposal: { id: 'p1', from: 'player', amount: 80, status: 'pending', open: true },
    });
    render(<NegotiationPanel match={match} />);

    // O balão do SEU lance mostra o retrato da decisão dele (sem botões).
    const bubble = screen.getByTestId('nego-proposal');
    expect(bubble).toHaveAttribute('data-from', 'player');
    expect(screen.queryByTestId('nego-accept')).not.toBeInTheDocument();

    // E o enviar espera: o martelo está do outro lado da mesa.
    expect(screen.getByTestId('nego-send')).toBeDisabled();
    expect(screen.getByTestId('nego-send')).toHaveTextContent(/aguardando resposta/i);
  });

  it('o lance do rival põe o ✓ e o ✗ na sua mão — cobrir fecha a mesa nele', async () => {
    const user = userEvent.setup();
    openNegotiation({
      proposal: { id: 'p1', from: 'opponent', amount: 60, status: 'pending', open: true },
    });
    render(<NegotiationPanel match={match} />);

    await user.click(screen.getByTestId('nego-accept'));
    expect(useGameStore.getState().negotiation?.proposal?.status).toBe('accepted');
    expect(useGameStore.getState().negotiation?.tableStake).toBe(60);
  });

  it('recusar o lance do rival mantém a mesa valendo o mesmo', async () => {
    const user = userEvent.setup();
    openNegotiation({
      proposal: { id: 'p1', from: 'opponent', amount: 60, status: 'pending', open: true },
    });
    render(<NegotiationPanel match={match} />);

    await user.click(screen.getByTestId('nego-decline'));
    expect(useGameStore.getState().negotiation?.proposal?.status).toBe('declined');
    expect(useGameStore.getState().negotiation?.tableStake).toBe(100);
  });

  it('lance coberto SELA a mesa: composer e saída travam durante o beat do ✓', () => {
    openNegotiation({
      proposal: { id: 'p1', from: 'opponent', amount: 60, status: 'accepted', open: true },
    });
    render(<NegotiationPanel match={match} />);

    // O aperto de mãos vale desde o ✓ — nada de repropor nem desistir.
    expect(screen.getByTestId('nego-send')).toBeDisabled();
    expect(screen.getByTestId('nego-send')).toHaveTextContent(/acordo fechado/i);
    expect(screen.getByTestId('nego-quit')).toBeDisabled();
  });

  it('na HORA DO DUELO o composer sai e o título entra', () => {
    openNegotiation({ starting: true, agreedStake: 100 });
    render(<NegotiationPanel match={match} />);

    expect(screen.getByTestId('nego-duel-announce')).toHaveTextContent(/hora do duelo/i);
    expect(screen.queryByTestId('nego-send')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nego-quit')).not.toBeInTheDocument();
  });

  it('desistir abandona a mesa e volta ao menu', async () => {
    const user = userEvent.setup();
    openNegotiation();
    render(<NegotiationPanel match={match} />);

    await user.click(screen.getByTestId('nego-quit'));
    expect(useGameStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().negotiation).toBeNull();
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

  /** Fichas desenhadas no pote do feltro. */
  const fichasNoPote = (container: HTMLElement) =>
    container.querySelectorAll('[data-testid="felt-pot"] .chip').length;

  it('o pote fica na mesa durante o duelo, com as fichas da aposta', () => {
    // As fichas que a negociação pôs na mesa continuam lá enquanto as
    // cartas correm: antes elas sumiam e o valor em jogo virava um
    // número que ninguém via.
    const { container } = renderArena({ match: { ...match, stake: 100 } });
    expect(screen.getByTestId('felt-pot')).toBeInTheDocument();
    expect(fichasNoPote(container)).toBe(4);
    expect(screen.getByRole('img', { name: /Pote na mesa: 100 créditos/ })).toBeInTheDocument();
  });

  it('a dobra aceita DOBRA as fichas na mesa', () => {
    // A dobra aceita reescreve `match.stake` no store; o pote é derivado
    // dele, então dobrar o valor tem de dobrar o monte — é o retrato do
    // gesto, e o motivo de a contagem ser proporcional (ver pot.ts).
    const simples = renderArena({ match: { ...match, stake: 100 } });
    expect(fichasNoPote(simples.container)).toBe(4);
    simples.unmount();

    const dobrada = renderArena({ match: { ...match, stake: 200 } });
    expect(fichasNoPote(dobrada.container)).toBe(8);
  });

  it('sem valor na mesa não há pote — é o caso do torneio', () => {
    // No torneio a mesa vale a taxa de entrada do chaveamento, que não
    // fica em fichas no feltro: o match entra com stake 0.
    const { container } = renderArena({ match: { ...match, stake: 0 } });
    expect(screen.queryByTestId('felt-pot')).not.toBeInTheDocument();
    expect(fichasNoPote(container)).toBe(0);
  });

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

  it('totais ao vivo: o do rival conta só o que está aberto, sem "+?"', () => {
    renderArena();

    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    // 10♣ aberta + a oculta: nada de somar o que ainda não virou.
    const total = screen.getByTestId('opponent-total');
    expect(total).toHaveTextContent('10');
    // A placa mostra um NÚMERO LIMPO: quem conta que falta carta é a
    // carta virada na mesa, não um sinal colado no total.
    expect(total.textContent).toBe('10');
    expect(total).toHaveAttribute('data-partial', 'true');
  });

  it('no showdown as ocultas viram e o total do rival fecha de verdade', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    const total = screen.getByTestId('opponent-total');
    expect(total).toHaveTextContent('17');
    expect(total).toHaveAttribute('data-partial', 'false');
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: 7 de ouros' })).toBeInTheDocument();
  });

  it('a última carta da SUA mão leva o selo de que o rival não a vê', async () => {
    const user = userEvent.setup();
    renderArena();

    // Uma só: a regra de POV vela exatamente a última da mão.
    expect(screen.getAllByTestId('card-veil')).toHaveLength(1);
    const veil = screen.getByTestId('card-veil');
    expect(veil).toHaveAccessibleName(
      'Essa carta não está sendo visualizada pelo seu oponente',
    );

    // E ela é a da DIREITA — a carta 2, dentro da casa dela na fileira.
    expect(screen.getByTestId('hand-player-cards-card-2')).toContainElement(veil);

    // No celular não há hover: o toque abre e fecha a legenda.
    expect(veil).toHaveAttribute('aria-expanded', 'false');
    await user.click(veil);
    expect(veil).toHaveAttribute('aria-expanded', 'true');
    await user.click(veil);
    expect(veil).toHaveAttribute('aria-expanded', 'false');
  });

  it('no showdown o segredo acaba e o selo sai da mesa', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    expect(screen.queryByTestId('card-veil')).not.toBeInTheDocument();
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
    // O RÓTULO de situação é só do rival: do seu lado o aro aceso já diz
    // que a mesa espera você — escrever "escolhendo" seria contar o que
    // você acabou de fazer.
    expect(screen.getByTestId('status-opponent')).toHaveTextContent('ESCOLHENDO');
    expect(screen.queryByTestId('status-player')).not.toBeInTheDocument();
  });

  it('travada a sua escolha, o rodapé passa a esperar o rival', () => {
    renderArena({
      round: { ...sampleRound, playerChoice: 'stand', legalActions: [] },
      turn: { seconds: 9, opponentReady: false },
    });

    // O QUE você escolheu não aparece em lugar nenhum da mesa — e nem
    // QUE você escolheu: o aro apaga e o rodapé passa a esperar o rival,
    // que é a informação nova.
    expect(screen.queryByTestId('status-player')).not.toBeInTheDocument();
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

  it('a labareda é da MÃO: a sua na hora, a do rival só no showdown', () => {
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
    // A dele NÃO: com a oculta ainda de bruços, uma labareda acesa ali
    // entregaria os 21 dele — o mesmo vazamento que o total parcial e o
    // estouro escondido evitam. É a regra de POV, agora também no fogo.
    expect(ablaze(live.container, 'hand-opponent')).toBe(0);
    live.unmount();

    // Virada a oculta, o segredo acabou e a mão dele acende igual: o
    // efeito é da mão, não de quem está olhando para ela.
    const showdown = renderArena({ phase: 'settle', round: null, result: natural });
    expect(ablaze(showdown.container, 'hand-opponent')).toBe(2);
    expect(screen.getByTestId('verdict-opponent')).toHaveTextContent('BLACKJACK');
  });

  it('showdown sem blackjack do rival não acende mão nenhuma dele', () => {
    const ablaze = (root: HTMLElement) =>
      root.querySelectorAll('[data-testid^="hand-opponent-cards-card"] .card-scene--ablaze').length;

    // `sampleResult` fecha o rival em 17 — sem natural, sem fogo.
    const { container } = renderArena({ phase: 'settle', round: null, result: sampleResult });
    expect(ablaze(container)).toBe(0);
  });

  it('o relógio zerado é anunciado como PAROU, sem falar do tempo', () => {
    renderArena({
      reveal: {
        id: 'r2',
        player: { by: 'player', action: 'stand', closed: true, bust: false, timedOut: true },
      },
    });

    // A mesa anuncia o que ACONTECEU na mesa (a mão parou), não o motivo:
    // quem viu o relógio zerar não precisa da legenda.
    const call = screen.getByTestId('turn-call');
    expect(call).toHaveTextContent('PAROU');
    expect(call).not.toHaveTextContent('TEMPO');
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
    // O invólucro em brasa é quem carrega a coroa de fogo do botão.
    expect(accepted.container.querySelector('.double-cta--accepted')).toBeInTheDocument();
  });

  it('a labareda só existe onde algo aconteceu: no botão, e SÓ nele', () => {
    const burstsIn = (root: HTMLElement, sel: string) =>
      root.querySelectorAll(`${sel} [data-testid="blaze-burst"]`).length;

    // Mesa parada: nenhum fogo em lugar nenhum.
    const calma = renderArena({ onRequestDouble: () => undefined });
    expect(calma.container.querySelectorAll('[data-testid="blaze-burst"]')).toHaveLength(0);
    calma.unmount();

    // Dobra aceita: a coroa acende no botão — e em nenhum outro lugar.
    const dobrou = renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'accepted', amount: 200, open: false },
    });
    expect(burstsIn(dobrou.container, '.double-cta')).toBe(1);
    expect(
      dobrou.container.querySelector('.double-cta [data-testid="blaze-burst"]'),
    ).toHaveAttribute('data-variant', 'double-button');
    // E não contamina as mãos: ninguém tirou blackjack aqui.
    expect(burstsIn(dobrou.container, '[data-testid="hand-player"]')).toBe(0);
  });

  it('o POTE nunca pega fogo — nem com a dobra aceita', () => {
    /* Decisão de direção: nenhum efeito nas fichas. A dobra é
       comunicada exclusivamente pelo botão APOSTA DOBRADA — a poça de
       brasa que já morou no pote virava um bloco amarelo sobre o monte
       e brigava com a mão de blackjack pela atenção. */
    for (const status of ['accepted', 'declined'] as const) {
      const view = renderArena({
        onRequestDouble: () => undefined,
        doubleBet: { status, amount: 200, open: false },
      });
      const pot = screen.getByTestId('felt-pot');
      // Sem canvas de fogo dentro do componente das fichas...
      expect(pot.querySelector('canvas')).toBeNull();
      expect(pot.querySelector('[data-testid="blaze-burst"]')).toBeNull();
      // ...sem a classe de brasa e sem palco de fogo.
      expect(pot.classList.contains('is-ablaze')).toBe(false);
      expect(pot.classList.contains('blaze-stage')).toBe(false);
      // As fichas continuam lá, intactas.
      expect(pot.querySelectorAll('.chip').length).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('o blackjack estoura na mão que o tirou, e em nenhuma outra', () => {
    const natural: BlackjackRoundState = {
      ...sampleRound,
      playerHand: [card('A', 'hearts'), card('K', 'spades')],
    };
    const { container } = renderArena({ round: natural });

    expect(
      container.querySelectorAll('[data-testid="hand-player"] [data-testid="blaze-burst"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="hand-opponent"] [data-testid="blaze-burst"]'),
    ).toHaveLength(0);
  });

  it('durante a distribuição a mão ainda não estoura — as cartas estão no ar', () => {
    const natural: BlackjackRoundState = {
      ...sampleRound,
      playerHand: [card('A', 'hearts'), card('K', 'spades')],
    };
    const { container } = renderArena({ phase: 'dealing', round: natural });
    expect(container.querySelectorAll('[data-testid="blaze-burst"]')).toHaveLength(0);
  });

  it('a labareda só existe onde algo aconteceu: no botão, e SÓ nele', () => {
    const burstsIn = (root: HTMLElement, sel: string) =>
      root.querySelectorAll(`${sel} [data-testid="blaze-burst"]`).length;

    // Mesa parada: nenhum fogo em lugar nenhum.
    const calma = renderArena({ onRequestDouble: () => undefined });
    expect(calma.container.querySelectorAll('[data-testid="blaze-burst"]')).toHaveLength(0);
    calma.unmount();

    // Dobra aceita: a coroa acende no botão — e em nenhum outro lugar.
    const dobrou = renderArena({
      onRequestDouble: () => undefined,
      doubleBet: { status: 'accepted', amount: 200, open: false },
    });
    expect(burstsIn(dobrou.container, '.double-cta')).toBe(1);
    expect(
      dobrou.container.querySelector('.double-cta [data-testid="blaze-burst"]'),
    ).toHaveAttribute('data-variant', 'double-button');
    // E não contamina as mãos: ninguém tirou blackjack aqui.
    expect(burstsIn(dobrou.container, '[data-testid="hand-player"]')).toBe(0);
  });

  it('o POTE nunca pega fogo — nem com a dobra aceita', () => {
    /* Decisão de direção: nenhum efeito nas fichas. A dobra é
       comunicada exclusivamente pelo botão APOSTA DOBRADA — a poça de
       brasa que já morou no pote virava um bloco amarelo sobre o monte
       e brigava com a mão de blackjack pela atenção. */
    for (const status of ['accepted', 'declined'] as const) {
      const view = renderArena({
        onRequestDouble: () => undefined,
        doubleBet: { status, amount: 200, open: false },
      });
      const pot = screen.getByTestId('felt-pot');
      // Sem canvas de fogo dentro do componente das fichas...
      expect(pot.querySelector('canvas')).toBeNull();
      expect(pot.querySelector('[data-testid="blaze-burst"]')).toBeNull();
      // ...sem a classe de brasa e sem palco de fogo.
      expect(pot.classList.contains('is-ablaze')).toBe(false);
      expect(pot.classList.contains('blaze-stage')).toBe(false);
      // As fichas continuam lá, intactas.
      expect(pot.querySelectorAll('.chip').length).toBeGreaterThan(0);
      view.unmount();
    }
  });  it('com a dobra no ar a mesa inteira espera a resposta do rival', () => {
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

describe('ResultStage', () => {
  /**
   * O palco é compartilhado pelos TRÊS desfechos (duelo, partida do
   * torneio, mesa única) e o que ele carrega de precioso é a centragem
   * por espelho: para cada linha abaixo do título entra uma cópia
   * invisível acima. Se as cópias sumirem, nada quebra, nada dá erro — o
   * veredito só passa a cair um pouco alto demais, que é exatamente o
   * tipo de regressão que ninguém percebe até estar publicada.
   */
  const lines = (container: HTMLElement, selector: string) =>
    [...container.querySelectorAll(selector)];

  it('espelha subtítulo, débito e contagem acima do título para centrar o veredito', () => {
    const { container } = render(
      <ResultStage
        surface="felt"
        tone="lose"
        title="DERROTA"
        titleTestId="t"
        subtitle="Fim da sua caminhada"
        note="Taxa de entrada de 10 debitada"
        footer="Retornando em 8s"
      >
        <button type="button">VOLTAR</button>
      </ResultStage>,
    );

    // Cada linha existe DUAS vezes: a que se lê e a que só ocupa altura.
    for (const selector of [
      '.result-stage__subtitle',
      '.result-stage__note',
      '.result-stage__footer',
    ]) {
      const both = lines(container, selector);
      expect(both, selector).toHaveLength(2);
      // A cópia é invisível e fora do fluxo de leitura...
      const ghost = both.find((el) => el.classList.contains('invisible'));
      expect(ghost, selector).toBeDefined();
      expect(ghost).toHaveAttribute('aria-hidden');
      // ...e tem o MESMO texto, senão não teria a mesma altura.
      expect(ghost?.textContent).toBe(both.find((el) => el !== ghost)?.textContent);
    }

    // Quem lê a tela ouve o veredito uma vez só.
    expect(screen.getAllByText('Fim da sua caminhada')).toHaveLength(2);
    expect(screen.getByTestId('t')).toHaveTextContent('DERROTA');
  });

  it('sem subtítulo e sem débito, não inventa cópia nenhuma', () => {
    const { container } = render(
      <ResultStage surface="overlay" tone="win" title="VITÓRIA!" titleTestId="t">
        <button type="button">VER O RESULTADO</button>
      </ResultStage>,
    );
    expect(lines(container, '.result-stage__subtitle')).toHaveLength(0);
    expect(lines(container, '.result-stage__note')).toHaveLength(0);
    expect(lines(container, '.result-stage__footer')).toHaveLength(0);
    // A superfície manda na roupa: a cortina escura da mesa única.
    expect(container.querySelector('.result-stage')).toHaveClass('result-stage--overlay');
  });
});

/**
 * Marcações cujo papel IMPLÍCITO já admite nome acessível. Qualquer outra
 * (span, div, p…) precisa de `role` explícito ao lado do `aria-label`:
 * sem ele a especificação ARIA proíbe o nome e o leitor de tela descarta
 * o rótulo em silêncio.
 */
const NOMEAVEIS = new Set([
  'A',
  'AREA',
  'ASIDE',
  'BUTTON',
  'DIALOG',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'IFRAME',
  'IMG',
  'INPUT',
  'MAIN',
  'METER',
  'NAV',
  'OUTPUT',
  'PROGRESS',
  'SECTION',
  'SELECT',
  'SUMMARY',
  'TABLE',
  'TEXTAREA',
]);

/** Rótulos que o navegador vai jogar fora, com o seletor de cada um. */
function rotulosMudos(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-label]')]
    .filter((el) => !el.hasAttribute('role') && !NOMEAVEIS.has(el.tagName))
    .map((el) => `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`);
}

describe('acessibilidade: nenhum rótulo mudo', () => {
  /**
   * Um `aria-label` em elemento sem papel é a pior classe de bug de
   * acessibilidade: não dá erro, não quebra teste nenhum, não muda um
   * pixel — o código acha que está entregando a informação e ela nunca
   * sai. Esta varredura é o que impede o padrão de voltar.
   */
  it('Home, histórico e tutorial não têm aria-label descartado', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    // Guarda contra a varredura passar por não ter olhado nada: a Home
    // tem saldo, ajustes e o logotipo rotulados.
    expect(container.querySelectorAll('[aria-label]').length).toBeGreaterThanOrEqual(3);
    expect(rotulosMudos(container)).toEqual([]);

    await user.click(screen.getByTestId('play-button'));
    expect(rotulosMudos(container)).toEqual([]);
  });

  it('a folha do histórico não tem, nem vazia nem cheia', () => {
    const vazia = render(<HistorySheet open onClose={() => undefined} />);
    expect(rotulosMudos(vazia.container)).toEqual([]);
    vazia.unmount();

    useGameStore.setState({ history: [sampleEntry] });
    const cheia = render(<HistorySheet open onClose={() => undefined} />);
    expect(rotulosMudos(cheia.container)).toEqual([]);
  });

});

describe('HistorySheet', () => {
  it('mostra estado vazio sem rodadas', () => {
    render(<HistorySheet open onClose={() => undefined} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    // O vazio deixou de ser um beco: tem o brasão da casa e uma saída.
    expect(screen.getByTestId('history-play')).toBeInTheDocument();
  });

  it('do vazio dá para sair jogando: o CTA fecha a folha e procura oponente', async () => {
    const user = userEvent.setup();
    let aberta = true;
    render(<HistorySheet open onClose={() => (aberta = false)} />);

    await user.click(screen.getByTestId('history-play'));
    expect(aberta).toBe(false);
    expect(useGameStore.getState().phase).toBe('search');
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

    // O logotipo é desenhado letra a letra em três andares (BLACK /
    // JACK / ARENA), então quem responde pela marca é o NOME ACESSÍVEL
    // do título, não um nó de texto.
    expect(screen.getByRole('heading', { name: 'Blackjack Arena' })).toBeInTheDocument();
    await user.click(screen.getByTestId('play-button'));

    // Tutorial de 4 passos: oponente → negociação → a mão de 21 → torneio.
    expect(screen.getByRole('dialog', { name: 'Como jogar' })).toBeInTheDocument();
    // A negociação é a mesa de FICHAS: o tutorial não pode voltar a
    // prometer o chat que a fase teve um dia.
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/proposta/i)).toBeInTheDocument();
    expect(screen.queryByText(/chat/i)).not.toBeInTheDocument();
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
