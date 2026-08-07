import { render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';

import { Card3D } from '../components/Card3D';
import { ConfirmPanel } from '../components/ConfirmPanel';
import type { HandsArenaProps } from '../components/HandsArena';
import { HandsArena } from '../components/HandsArena';
import { HistorySheet } from '../components/HistorySheet';
import { SessionBanner } from '../components/SessionBanner';
import { ResultStage } from '../components/ResultStage';
import { RoundEndBanner } from '../components/RoundEndBanner';
import { CardVeil, VEIL_TEXT } from '../components/table/CardVeil';
import type { PokerHistoryEntry, PokerResult, PokerSession } from '../engine/poker/types';
import type {
  BlackjackRoundState,
  Card,
  CardRank,
  CardSuit,
  Match,
  RoundResult,
} from '../engine/types';
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
 * inteira e, do rival, NADA — a mesa do duelo é cega, e nem uma carta
 * dele sai da engine (só quantas ele tem, em `opponentHidden`).
 */
const sampleRound: BlackjackRoundState = {
  matchId: 'm1',
  phase: 'choosing',
  playerHand: [card('10', 'spades'), card('9', 'hearts')],
  opponentVisible: [],
  opponentHidden: 2,
  legalActions: ['hit', 'stand'],
  playerClosed: false,
  opponentClosed: false,
};

/**
 * Uma mão de Hold'em resolvida no showdown: par de Ases contra par de
 * Reis, num board seco. Stack de 100, os dois com 50 no pote → vitória
 * paga 50 de volta + 45 (90% do que o rival pôs).
 */
const samplePokerResult: PokerResult = {
  id: 'p1',
  matchId: 'm1',
  playerHole: [card('A', 'spades'), card('A', 'hearts')],
  opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
  board: [
    card('2', 'clubs'),
    card('7', 'diamonds'),
    card('9', 'hearts'),
    card('J', 'spades'),
    card('4', 'hearts'),
  ],
  playerRank: {
    category: 'pair',
    label: 'Par de Ases',
    detail: 'de Ases',
    cards: [
      card('A', 'spades'),
      card('A', 'hearts'),
      card('J', 'spades'),
      card('9', 'hearts'),
      card('7', 'diamonds'),
    ],
  },
  opponentRank: {
    category: 'pair',
    label: 'Par de Reis',
    detail: 'de Reis',
    cards: [
      card('K', 'clubs'),
      card('K', 'diamonds'),
      card('J', 'spades'),
      card('9', 'hearts'),
      card('7', 'diamonds'),
    ],
  },
  showdown: true,
  opponentShown: true,
  outcome: 'win',
  stake: 100,
  committed: { player: 50, opponent: 50 },
  contested: 50,
  pot: 100,
  payout: 145,
  netChange: 45,
  session: {
    matchId: 'm1',
    buyIn: 100,
    stacks: { player: 145, opponent: 55 },
    handsPlayed: 1,
    button: 'opponent' as const,
    over: false,
  },
  completedAt: 1700000000000,
};

const sampleEntry: PokerHistoryEntry = { ...samplePokerResult, opponentName: 'Luna' };

afterEach(() => {
  // Restaura o store singleton entre os testes.
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('ConfirmPanel — pareamento anônimo', () => {
  const match: Match = {
    id: 'm1',
    stake: 25,
    opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
    createdAt: 1700000000000,
  };

  const openConfirm = (confirmations = { player: false, opponent: false }) => {
    useGameStore.setState({ phase: 'confirm', match, confirmations });
  };

  it('o rival é "Oponente": sem nome, sem inicial e sem perfil a abrir', () => {
    openConfirm();
    const { container } = render(<ConfirmPanel />);

    // "?" e não "O": o medalhão diz "não se sabe quem é", não a inicial
    // de um nome que não existe.
    expect(screen.getByTestId('duelist-seat-opponent')).toHaveTextContent('?');
    expect(container.textContent).not.toContain('Luna');
    expect(screen.getByText('Oponente')).toBeInTheDocument();

    // Nada aqui abre o perfil — nem atalho de texto, nem avatar clicável.
    expect(screen.queryByText(/ver perfil/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opponent-profile')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(2); // confirmar + recusar
  });

  it('a espera pelo rival também não o nomeia', () => {
    openConfirm({ player: true, opponent: false });
    render(<ConfirmPanel />);

    const waiting = screen.getByTestId('confirm-waiting');
    expect(waiting).toHaveTextContent(/aguardando oponente/i);
    expect(waiting.textContent).not.toContain('Luna');
  });

  it('os dois assentos são a MESMA peça — nada desnivela os avatares', () => {
    openConfirm();
    render(<ConfirmPanel />);

    const you = screen.getByTestId('duelist-seat-player');
    const rival = screen.getByTestId('duelist-seat-opponent');

    // A simetria não se mede em jsdom (não há layout), então o teste
    // trava o que a PRODUZ: avatares idênticos (só o aro muda de cor),
    // assentos com a mesma pilha de filhos e a fileira alinhada pelo
    // TOPO. Era o `items-center` que desnivelava — a coluna do rival
    // tinha um atalho a mais embaixo ("ver perfil"), e centrar as duas
    // colunas de alturas diferentes subia o avatar dele.
    expect(you.className).toBe(rival.className.replace('border-opponent', 'border-player'));

    const seatYou = you.closest('.flex-col');
    const seatRival = rival.closest('.flex-col');
    expect(seatYou?.className).toBe(seatRival?.className);
    expect(seatYou?.children.length).toBe(seatRival?.children.length);
    expect(seatYou?.parentElement).toHaveClass('items-start');
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
    container.querySelectorAll('[data-testid="felt-pot"] .rvc-chip').length;

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

  it('mesa cega: a sua mão é aberta e a do rival fica INTEIRA de bruços', () => {
    renderArena();

    expect(screen.getByRole('img', { name: 'Sua carta 1: 10 de espadas' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sua carta 2: 9 de copas' })).toBeInTheDocument();

    // Nenhuma carta do rival na mesa — só os versos, e um por carta que
    // ele tem. A engine nem as manda (opponentVisible vem vazio).
    expect(screen.getByRole('img', { name: 'Carta de Luna 1: carta oculta' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: carta oculta' })).toBeInTheDocument();
    expect(screen.getByTestId('hand-opponent-cards').children).toHaveLength(2);
  });

  it('cada carta que o rival pede é mais um VERSO na fileira', () => {
    renderArena({ round: { ...sampleRound, opponentHidden: 3 } });

    expect(screen.getByTestId('hand-opponent-cards').children).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Carta de Luna 3: carta oculta' })).toBeInTheDocument();
    // O total continua sendo o que sempre foi durante a mão: nada.
    expect(screen.getByTestId('opponent-total').textContent).toBe('?');
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

  it('totais ao vivo: o seu corre na mesa, o do rival é um "?"', () => {
    renderArena();

    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    // Não há uma carta dele para somar: um "0" seria informação falsa.
    const total = screen.getByTestId('opponent-total');
    expect(total.textContent).toBe('?');
    expect(total).toHaveAttribute('data-partial', 'true');
    expect(total).toHaveAttribute('data-blind', 'true');
  });

  it('no showdown a mão do rival vira INTEIRA e o total fecha de verdade', () => {
    renderArena({ phase: 'settle', round: null, result: sampleResult });

    const total = screen.getByTestId('opponent-total');
    expect(total).toHaveTextContent('17');
    expect(total).toHaveAttribute('data-partial', 'false');
    expect(total).not.toHaveAttribute('data-blind');
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    // As duas cartas dele, que ninguém tinha visto, abrem juntas.
    expect(screen.getByRole('img', { name: 'Carta de Luna 1: 10 de paus' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Carta de Luna 2: 7 de ouros' })).toBeInTheDocument();
  });

  it('a mesa cega não tem selo de carta velada: não há carta sua a velar', () => {
    // O selo dizia "esta carta o rival não vê". Com a mesa cega ele não
    // vê NENHUMA, e um selo em todas não informa nada. Ele continua vivo
    // na mesa única, que mantém a regra de POV (ver CardVeil).
    renderArena();
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
      expect(pot.querySelectorAll('.rvc-chip').length).toBeGreaterThan(0);
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
      expect(pot.querySelectorAll('.rvc-chip').length).toBeGreaterThan(0);
      view.unmount();
    }
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
    expect(screen.queryByTestId('seat-medallion-player')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('17');
  });

  it('os medalhões ladeiam a crupiê — aro do lado, e nenhum nome embaixo', () => {
    renderArena({ phase: 'completed', round: null, result: sampleResult });

    const you = screen.getByTestId('seat-medallion-player');
    const rival = screen.getByTestId('seat-medallion-opponent');

    expect(you).toHaveClass('seat-medallion--player');
    expect(rival).toHaveClass('seat-medallion--opponent');

    // Só o retrato: o nome está na placa de placar, não no medalhão.
    expect(you).toHaveTextContent('V');
    expect(rival).toHaveTextContent('L');
    expect(you.textContent).not.toContain('Você');
    expect(rival.textContent).not.toContain('Luna');
  });

  it('o medalhão do rival abre o perfil dele — é onde o duelo o revela', async () => {
    const user = userEvent.setup();
    renderArena({ phase: 'completed', round: null, result: sampleResult });

    // O SEU medalhão é retrato, não botão: não há perfil seu a abrir.
    expect(screen.getByTestId('seat-medallion-player').tagName).toBe('SPAN');
    expect(screen.queryByTestId('opponent-profile')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('seat-medallion-opponent'));

    const profile = screen.getByTestId('opponent-profile');
    expect(within(profile).getByText('Luna')).toBeInTheDocument();
    expect(screen.getByTestId('profile-level')).toHaveTextContent(/Nível \d+/);
    expect(profile.querySelectorAll('.profile-badge')).toHaveLength(4);

    // Fecha no X e o placar continua em cena, intacto.
    await user.click(screen.getByTestId('profile-close'));
    await waitForElementToBeRemoved(() => screen.queryByTestId('opponent-profile'));
    expect(screen.getByTestId('score-plate-player')).toBeInTheDocument();
    expect(screen.getByTestId('player-total')).toHaveTextContent('19');
  });
});

/* O selo do olho cortado saiu do duelo (que virou mesa cega) e vive
   agora só na mesa única, onde a regra de POV continua de pé: lá a sua
   última carta segue aberta para você e virada para os rivais. A
   cobertura o acompanha — testar o componente direto é o que mantém o
   comportamento vivo sem depender de qual tela o monta. */
describe('CardVeil — o selo da carta que o rival não vê', () => {
  it('o toque abre e fecha a legenda (no celular não há hover)', async () => {
    const user = userEvent.setup();
    render(<CardVeil />);

    const veil = screen.getByTestId('card-veil');
    expect(veil).toHaveAccessibleName(VEIL_TEXT);
    expect(veil).toHaveAttribute('aria-expanded', 'false');

    await user.click(veil);
    expect(veil).toHaveAttribute('aria-expanded', 'true');
    await user.click(veil);
    expect(veil).toHaveAttribute('aria-expanded', 'false');
  });

  it('aberta por toque, fecha no Esc', async () => {
    const user = userEvent.setup();
    render(<CardVeil />);

    const veil = screen.getByTestId('card-veil');
    await user.click(veil);
    expect(veil).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(veil).toHaveAttribute('aria-expanded', 'false');
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

describe('SessionBanner — o caixa da sessão', () => {
  /* O ResultStage centra o veredito espelhando o que vem ABAIXO dele em
     cópias invisíveis (ver ResultStage) — então o extrato existe duas
     vezes no DOM. Só a de fora do fantasma é a que se lê. */
  const visible = (testId: string) => {
    const found = screen.getAllByTestId(testId).find((el) => !el.closest('.invisible'));
    if (!found) throw new Error(`sem elemento visível para ${testId}`);
    return found;
  };

  const session = (patch: Partial<PokerSession> = {}): PokerSession => ({
    matchId: 'm1',
    buyIn: 1000,
    stacks: { player: 1500, opponent: 500 },
    handsPlayed: 7,
    button: 'player',
    over: true,
    ...patch,
  });

  it('quem sai no LUCRO leva a festa inteira da casa', () => {
    render(<SessionBanner session={session()} opponentName="Luna" />);

    expect(screen.getByTestId('result-title')).toHaveTextContent('VOCÊ LUCROU!');
    expect(screen.getByTestId('result-blaze')).toHaveAttribute('data-outcome', 'victory');
    // As duas escalas da festa convivem: o ouro é o acabamento da
    // palavra, o confete é a sala inteira comemorando.
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });

  it('quem sai no PREJUÍZO recebe um agradecimento, e nada mais', () => {
    /* Perder fichas já é a notícia ruim: carimbá-la com "DERROTA" em
       caixa alta e rubi quebrado cobraria duas vezes pela mesma coisa. */
    render(
      <SessionBanner
        session={session({ stacks: { player: 300, opponent: 1700 } })}
        opponentName="Luna"
      />,
    );

    expect(screen.getByTestId('result-title')).toHaveTextContent('OBRIGADO POR JOGAR');
    expect(screen.queryByTestId('result-blaze')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ember-vignette')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confetti')).not.toBeInTheDocument();
  });

  it('o extrato mostra com quanto sentou, com quanto levantou e a diferença', () => {
    render(<SessionBanner session={session()} opponentName="Luna" />);

    expect(visible('ledger-buyin')).toHaveTextContent('1.000');
    expect(visible('ledger-final')).toHaveTextContent('1.500');
    expect(visible('ledger-profit')).toHaveTextContent('+500');
    // A comissão da casa incide UMA vez, no caixa, e só sobre o lucro.
    expect(visible('ledger-commission')).toHaveTextContent('50');
    expect(visible('ledger-cashed')).toHaveTextContent('1.450');
  });

  it('no prejuízo não há comissão: a casa não cobra de quem já pagou', () => {
    render(
      <SessionBanner
        session={session({ stacks: { player: 300, opponent: 1700 } })}
        opponentName="Luna"
      />,
    );

    expect(screen.queryByTestId('ledger-commission')).not.toBeInTheDocument();
    expect(visible('ledger-profit')).toHaveTextContent('-700');
    expect(visible('ledger-cashed')).toHaveTextContent('300');
  });

  it('diz POR QUE a mesa fechou — a frase muda o sentido do resto', () => {
    const { rerender } = render(
      <SessionBanner session={session({ leftBy: 'player' })} opponentName="Luna" />,
    );
    expect(visible('session-reason')).toHaveTextContent('Você levantou da mesa');
    expect(visible('session-reason')).toHaveTextContent('7 mãos jogadas');

    rerender(<SessionBanner session={session({ bustedBy: 'opponent' })} opponentName="Luna" />);
    expect(visible('session-reason')).toHaveTextContent('Luna ficou sem fichas');

    rerender(<SessionBanner session={session({ bustedBy: 'player' })} opponentName="Luna" />);
    expect(visible('session-reason')).toHaveTextContent('Suas fichas acabaram');
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
  const lines = (container: HTMLElement, selector: string) => [
    ...container.querySelectorAll(selector),
  ];

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
  it('JOGAR vai direto para a mesa — o tutorial não intercepta ninguém', async () => {
    const user = userEvent.setup();
    render(<App />);

    // O logotipo é desenhado letra a letra em dois andares (POKER /
    // ARENA), então quem responde pela marca é o NOME ACESSÍVEL do
    // título, não um nó de texto.
    expect(screen.getByRole('heading', { name: 'Poker Arena' })).toBeInTheDocument();

    /* Mesmo com o tutorial nunca visto, o botão de jogar JOGA. Ele já
       desviava para o tutorial na primeira partida — interceptando um
       toque que dizia "quero jogar" e entregando outra coisa. */
    expect(useGameStore.getState().settings.tutorialSeen).toBe(false);
    await user.click(screen.getByTestId('play-button'));

    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).not.toBeInTheDocument();
    expect(useGameStore.getState().phase).toBe('search');
    expect(await screen.findByText('Procurando oponente…')).toBeInTheDocument();
  });

  it('o COMO JOGAR abre a folha, e ela ensina Texas Hold’em', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /como jogar/i }));
    expect(screen.getByRole('dialog', { name: 'Como jogar' })).toBeInTheDocument();

    // Os passos falam do jogo que se joga: entrada fixa, as duas
    // fechadas, as ruas de aposta e o showdown.
    expect(screen.getByText(/Texas Hold/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/comunitárias/i)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/AUMENTAR/)).toBeInTheDocument();
    await user.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText(/showdown/i)).toBeInTheDocument();

    // Nada de 21 sobrou no texto: o jogo mudou, a folha mudou com ele.
    expect(screen.queryByText(/blackjack/i)).not.toBeInTheDocument();

    /* Fechar devolve o jogador para onde ele estava — a folha é consulta,
       não caminho. Avança até o fim sem contar passos: o número de telas
       muda com o jogo, e um teste que o fixasse quebraria a cada regra
       nova sem ter nada a dizer sobre ela. */
    for (let passo = 0; passo < 10; passo += 1) {
      const proximo = screen.queryByTestId('tutorial-next');
      if (!proximo) break;
      await user.click(proximo);
    }
    expect(useGameStore.getState().phase).toBe('idle');
    expect(useGameStore.getState().settings.tutorialSeen).toBe(true);
  });
});
