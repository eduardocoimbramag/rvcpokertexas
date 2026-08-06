import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PokerArenaProps } from '../components/poker/PokerArena';
import { PokerArena } from '../components/poker/PokerArena';
import { ChipRack } from '../components/poker/ChipRack';
import { RACK_MAX_CHIPS } from '../components/table/pot';
import { ShowCardsPrompt } from '../components/poker/ShowCardsPrompt';
import { StreetAnnounce } from '../components/poker/StreetAnnounce';
import { TABLE_MAX_STACK } from '../engine/credits';
import type { PokerResult, PokerRoundState } from '../engine/poker/types';
import type { Card, CardRank, CardSuit, Match } from '../engine/types';
import { useGameStore } from '../store/gameStore';

const card = (rank: CardRank, suit: CardSuit): Card => ({ rank, suit });

const match: Match = {
  id: 'm1',
  opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1420 },
  stake: 1000,
  createdAt: 0,
};

const BOARD: Card[] = [
  card('2', 'clubs'),
  card('7', 'diamonds'),
  card('9', 'hearts'),
  card('J', 'spades'),
  card('4', 'hearts'),
];

/**
 * A mesa como o jogador a vê no meio de uma mão: a mão dele aberta, a do
 * rival AUSENTE (a engine não a manda antes do showdown) e as
 * comunitárias já abertas até a rua corrente.
 */
function round(patch: Partial<PokerRoundState> = {}): PokerRoundState {
  return {
    matchId: 'm1',
    street: 'flop',
    phase: 'betting',
    button: 'player',
    playerHole: [card('A', 'spades'), card('A', 'hearts')],
    opponentHole: [],
    board: BOARD.slice(0, 3),
    stacks: { player: 900, opponent: 900 },
    committed: { player: 0, opponent: 0 },
    pot: 200,
    toCall: 0,
    // Rua aberta e nada na mesa: o menor lance é um crédito.
    minRaiseTo: 1,
    maxRaiseTo: 900,
    // CORRER está sempre na mesa: numa sessão, largar a mão custa a
    // entrada que já está no meio.
    legalActions: ['fold', 'check', 'raise'],
    toAct: 'player',
    playerHandLabel: 'Par de Ases',
    session: {
      matchId: 'm1',
      buyIn: 1000,
      stacks: { player: 900, opponent: 900 },
      handsPlayed: 1,
      button: 'player',
      over: false,
    },
    ...patch,
  };
}

function result(patch: Partial<PokerResult> = {}): PokerResult {
  return {
    id: 'r1',
    matchId: 'm1',
    playerHole: [card('A', 'spades'), card('A', 'hearts')],
    opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
    board: BOARD,
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
    outcome: 'win',
    stake: 1000,
    committed: { player: 400, opponent: 400 },
    contested: 400,
    pot: 800,
    payout: 1360,
    netChange: 360,
    /* A mesa entre as mãos: é o que faz da mesa uma SESSÃO — os stacks
       não voltam ao buy-in quando a mão fecha. */
    session: {
      matchId: 'm1',
      buyIn: 1000,
      stacks: { player: 1360, opponent: 640 },
      handsPlayed: 1,
      button: 'opponent',
      over: false,
    },
    completedAt: 0,
    ...patch,
  };
}

function renderArena(patch: Partial<PokerArenaProps> = {}) {
  const props: PokerArenaProps = {
    phase: 'betting',
    match,
    round: round(),
    result: null,
    onFold: vi.fn(),
    onCheck: vi.fn(),
    onCall: vi.fn(),
    onRaise: vi.fn(),
    actionPending: false,
    clock: { open: true, seconds: 20 },
    announce: null,
    session: {
      matchId: 'm1',
      buyIn: 1000,
      stacks: { player: 900, opponent: 900 },
      handsPlayed: 1,
      button: 'player',
      over: false,
    },
    showPrompt: null,
    handoverSeconds: 0,
    cardsShown: false,
    onAnswerShowCards: vi.fn(),
    onLeaveTable: vi.fn(),
    ...patch,
  };
  return { ...render(<PokerArena {...props} />), props };
}

afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('PokerArena — o sigilo da mesa', () => {
  it('as duas cartas do rival ficam de bruços enquanto a mão corre', () => {
    renderArena();
    // O que existe do lado dele são dois versos, e mais nada.
    expect(screen.getByLabelText('Carta de Luna 1: carta oculta')).toBeInTheDocument();
    expect(screen.getByLabelText('Carta de Luna 2: carta oculta')).toBeInTheDocument();
    // A sua mão está aberta na sua frente.
    expect(screen.getByLabelText('Sua carta 1: A de espadas')).toBeInTheDocument();
  });

  it('a leitura da mão é SUA: só aparece do seu lado do feltro', () => {
    renderArena();
    expect(screen.getByTestId('hand-reading')).toHaveTextContent('Par de Ases');
    // Uma leitura só na mesa — a do rival não existe.
    expect(screen.getAllByTestId('hand-reading')).toHaveLength(1);
  });

  it('a leitura existe DESDE o pré-flop, sem uma comunitária na mesa', () => {
    renderArena({
      round: round({
        street: 'preflop',
        board: [],
        playerHandLabel: 'Ás-Rei do mesmo naipe',
      }),
    });
    // A decisão mais tomada do Hold'em é a do pré-flop: a placa não pode
    // calar justamente nela.
    expect(screen.getByTestId('hand-reading')).toHaveTextContent('Ás-Rei do mesmo naipe');
  });

  it('no showdown as fechadas do rival viram e a mão vencedora acende', () => {
    renderArena({
      phase: 'settle',
      round: round({
        phase: 'settled',
        street: 'showdown',
        board: BOARD,
        opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
        legalActions: [],
        toAct: null,
        result: result(),
      }),
      result: result(),
    });

    expect(screen.getByLabelText('Carta de Luna 1: K de paus')).toBeInTheDocument();
    // As cinco cartas que decidiram o pote acendem: os dois Ases dele e
    // as três da mesa que entraram na mão.
    expect(screen.getByTestId('hole-player-card-1')).toHaveClass('poker-seat__card--lit');
    expect(screen.getByTestId('board-slot-4')).toHaveClass('board__slot--lit');
    // O 2♣ não entrou na melhor mão de cinco: fica apagado.
    expect(screen.getByTestId('board-slot-1')).not.toHaveClass('board__slot--lit');
  });

  it('acabada a mão, as fechadas do rival abrem — mesmo se ele desistiu', () => {
    const folded = result({ showdown: false, foldedBy: 'opponent', board: BOARD.slice(0, 3) });
    renderArena({
      phase: 'settle',
      round: round({
        phase: 'settled',
        board: BOARD.slice(0, 3),
        opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
        legalActions: [],
        toAct: null,
        result: folded,
      }),
      result: folded,
    });

    // O sigilo que importa é o de DURANTE a mão; depois dela, ver o que
    // o rival tinha é o que ensina a jogar contra ele.
    expect(screen.getByLabelText('Carta de Luna 1: K de paus')).toBeInTheDocument();
  });
});

describe('PokerArena — a mesa', () => {
  it('os cinco lugares da mesa existem desde o primeiro instante', () => {
    renderArena({ round: round({ street: 'preflop', board: [] }) });
    for (let slot = 1; slot <= 5; slot += 1) {
      expect(screen.getByTestId(`board-slot-${slot}`)).toBeInTheDocument();
    }
    // Todos vazios no pré-flop: não há carta comunitária nenhuma ainda.
    expect(screen.getByTestId('board-slot-1')).toHaveClass('board__slot--empty');
  });

  it('o flop preenche três e deixa dois lugares vagos', () => {
    renderArena();
    expect(screen.getByTestId('board-slot-3')).not.toHaveClass('board__slot--empty');
    expect(screen.getByTestId('board-slot-4')).toHaveClass('board__slot--empty');
  });

  it('mostra o pote e o stack dos dois lados', () => {
    renderArena();
    expect(screen.getByTestId('pot-value')).toHaveTextContent('200');
    expect(screen.getByTestId('stack-player')).toHaveTextContent('900');
    expect(screen.getByTestId('stack-opponent')).toHaveTextContent('900');
  });

  it('a etiqueta miúda da rua não existe mais em cima das fichas', () => {
    // Quem anuncia a virada de cena é o LETREIRO, e ele é da tela
    // inteira — não da arena (ver StreetAnnounce).
    renderArena();
    expect(screen.queryByTestId('street-tag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('street-announce')).not.toBeInTheDocument();
  });

  it('o botão do dealer marca UM lado só — quem fala por último', () => {
    renderArena();
    expect(screen.getByTestId('dealer-button-player')).toBeInTheDocument();
    expect(screen.queryByTestId('dealer-button-opponent')).not.toBeInTheDocument();
  });

  it('o botão do dealer é uma peça ao lado da MÃO, não um selo na placa do nome', () => {
    /* Ele já morou dentro da placa de identidade, espremido entre o nome
       e o stack — e ali o `D` lia como abreviação de alguma coisa, e não
       como o disco que é. Numa mesa de verdade ele fica sobre o pano, no
       vão entre a mão e a borda da mesa. */
    renderArena();
    const disco = screen.getByTestId('dealer-button-player');
    expect(disco.closest('.poker-seat__gutter')).not.toBeNull();
    expect(screen.getByTestId('seat-player')).not.toContainElement(disco);
  });

  it('disco e montante ficam em VÃOS opostos, um de cada lado da mão', () => {
    /* Os dois vãos são `1fr` numa grade de três colunas: é isso que centra
       cada peça no espaço que sobra do seu lado, sem número mágico. */
    renderArena();
    const vaos = [...document.querySelectorAll('.poker-seat--player .poker-seat__gutter')];
    expect(vaos).toHaveLength(2);
    expect(vaos[0]?.querySelector('[data-testid="dealer-button-player"]')).not.toBeNull();
    expect(vaos[1]?.querySelector('[data-testid="chip-rack-player"]')).not.toBeNull();
  });

  it('a aposta da rua só aparece quando há fichas empurradas', () => {
    renderArena();
    expect(screen.queryByTestId('bet-player')).not.toBeInTheDocument();

    renderArena({ round: round({ committed: { player: 120, opponent: 40 } }) });
    expect(screen.getByTestId('bet-player')).toHaveTextContent('120');
    expect(screen.getByTestId('bet-opponent')).toHaveTextContent('40');
  });

  it('anuncia o último lance da mesa por extenso', () => {
    renderArena({
      announce: {
        id: 'a1',
        by: 'opponent',
        action: 'raise',
        amount: 240,
        to: 240,
        allIn: false,
        timedOut: false,
      },
    });
    expect(screen.getByTestId('move-call')).toHaveTextContent('Luna');
    expect(screen.getByTestId('move-call')).toHaveTextContent('APOSTOU 240');
  });

  it('o ALL-IN substitui o valor no anúncio: o que importa é não sobrar nada', () => {
    renderArena({
      announce: {
        id: 'a2',
        by: 'player',
        action: 'call',
        amount: 900,
        to: 900,
        allIn: true,
        timedOut: false,
      },
    });
    expect(screen.getByTestId('move-call')).toHaveTextContent('ALL-IN');
  });
});

describe('PokerArena — a barra de apostas', () => {
  it('a fileira tem SEMPRE os quatro lugares, na mesma ordem', () => {
    /* APOSTAR · PASSAR/PAGAR · CORRER · LEVANTAR, do que mais se faz para
       o que menos se faz. Botão que muda de lugar conforme o que é legal
       obriga a LER a barra a cada vez; com o lugar fixo, o polegar
       aprende o caminho e a decisão fica só no valor. */
    renderArena();
    const fileira = document.querySelector('.bet-row');
    const ordem = [...(fileira?.querySelectorAll('[data-testid]') ?? [])].map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(ordem).toEqual(['action-raise', 'action-check', 'action-fold', 'leave-table']);
  });

  it('CORRER está em cena mesmo sem aposta na frente', () => {
    renderArena();
    expect(screen.getByTestId('action-check')).toBeEnabled();
    expect(screen.getByTestId('action-fold')).toBeEnabled();
  });

  it('com aposta na frente: o botão de pagar traz o preço junto', () => {
    renderArena({
      round: round({
        toCall: 240,
        committed: { player: 0, opponent: 240 },
        legalActions: ['fold', 'call', 'raise'],
      }),
    });
    expect(screen.getByTestId('action-fold')).toBeEnabled();
    // O lugar do PASSAR vira o do PAGAR: mesmo lugar, outra decisão.
    expect(screen.getByTestId('action-call')).toHaveTextContent('240');
    expect(screen.queryByTestId('action-check')).not.toBeInTheDocument();
  });

  it('a PORTA fica em cena e apagada na primeira mão', () => {
    /* Esconder um botão que vai aparecer sozinho daqui a uma mão faria a
       fileira mudar de forma no meio do jogo. Apagado, ele ensina duas
       coisas de uma vez: que a saída existe e que ainda não abriu. */
    renderArena({
      session: {
        matchId: 'm1',
        buyIn: 1000,
        stacks: { player: 900, opponent: 900 },
        handsPlayed: 0,
        button: 'player',
        over: false,
      },
    });
    expect(screen.getByTestId('leave-table')).toBeDisabled();
  });

  it('a barra some quando a palavra não é sua', () => {
    renderArena({ round: round({ toAct: 'opponent', legalActions: [] }) });
    expect(screen.queryByTestId('bet-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('turn-wait')).toHaveTextContent('Vez de Luna');
  });

  it('cada botão dispara o lance correspondente', async () => {
    const user = userEvent.setup();
    const { props } = renderArena({
      round: round({
        toCall: 240,
        committed: { player: 0, opponent: 240 },
        legalActions: ['fold', 'call', 'raise'],
      }),
    });

    await user.click(screen.getByTestId('action-call'));
    expect(props.onCall).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('action-fold'));
    expect(props.onFold).toHaveBeenCalledTimes(1);
  });

  it('o painel de aumento cobre a fileira e abre com o campo VAZIO', async () => {
    const user = userEvent.setup();
    renderArena();

    await user.click(screen.getByTestId('action-raise'));
    // O painel COBRE a fileira: as duas coisas não convivem na mesma tela.
    expect(screen.getByTestId('raise-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('action-check')).not.toBeInTheDocument();
    /* E o campo abre VAZIO. Ele já abria com um valor sugerido pela mesa,
       e um campo preenchido antes de a pessoa digitar responde à pergunta
       no lugar dela: quem só queria ver os limites saía tendo apostado o
       que a casa escolheu. */
    expect(screen.getByTestId('raise-input')).toHaveValue('');
    // Sem valor não há o que confirmar.
    expect(screen.getByTestId('raise-confirm')).toBeDisabled();
  });

  it('o painel tem o campo e nada mais: sem atalhos que calculem por quem joga', async () => {
    const user = userEvent.setup();
    renderArena();

    await user.click(screen.getByTestId('action-raise'));
    expect(screen.getByTestId('raise-input')).toBeInTheDocument();
    expect(screen.getByTestId('raise-plus-10')).toBeInTheDocument();
    expect(screen.getByTestId('raise-plus-100')).toBeInTheDocument();
    // Os tamanhos de pote saíram: a única pergunta aqui é "quanto?".
    expect(screen.queryByTestId('raise-size-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('raise-size-allin')).not.toBeInTheDocument();
  });

  it('o all-in continua a um toque: basta digitar o teto, que está em cena', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    // O teto da rua está escrito no painel, ao lado do rótulo.
    expect(screen.getByTestId('raise-hint')).toHaveTextContent('900');
    await user.clear(screen.getByTestId('raise-input'));
    await user.type(screen.getByTestId('raise-input'), '900');
    await user.click(screen.getByTestId('raise-confirm'));
    expect(props.onRaise).toHaveBeenCalledWith(900);
  });

  it('o valor se DIGITA, no campo padrão de créditos da casa', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    const campo = screen.getByTestId('raise-input');
    await user.clear(campo);
    await user.type(campo, '250');
    expect(campo).toHaveValue('250');

    await user.click(screen.getByTestId('raise-confirm'));
    expect(props.onRaise).toHaveBeenCalledWith(250);
  });

  it('os atalhos +10 e +100 somam ao que está no campo', async () => {
    const user = userEvent.setup();
    renderArena();

    await user.click(screen.getByTestId('action-raise'));
    const campo = screen.getByTestId('raise-input');
    await user.clear(campo);
    await user.type(campo, '100');

    await user.click(screen.getByTestId('raise-plus-10'));
    expect(campo).toHaveValue('110');
    await user.click(screen.getByTestId('raise-plus-100'));
    expect(campo).toHaveValue('210');
  });

  it('os atalhos nunca somam além do teto da mesa', async () => {
    const user = userEvent.setup();
    renderArena();

    await user.click(screen.getByTestId('action-raise'));
    const campo = screen.getByTestId('raise-input');
    await user.clear(campo);
    await user.type(campo, '880');
    await user.click(screen.getByTestId('raise-plus-100'));
    // O stack efetivo é 900: o atalho para nele.
    expect(campo).toHaveValue('900');
  });

  it('um valor acima do stack é recusado, e a mesa diz por quê', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    const campo = screen.getByTestId('raise-input');
    await user.clear(campo);
    await user.type(campo, '95000');

    expect(screen.getByTestId('raise-hint')).toHaveTextContent('Máximo');
    expect(screen.getByTestId('raise-confirm')).toBeDisabled();
    await user.click(screen.getByTestId('raise-confirm'));
    expect(props.onRaise).not.toHaveBeenCalled();
  });

  it('uma aposta pequena é um lance legítimo: o piso é um crédito', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    await user.type(screen.getByTestId('raise-input'), '15');

    /* Apostar 15 num pote de 200 era recusado com "aumento mínimo: 100",
       porque o piso da mesa era a própria entrada. O tamanho do lance é a
       decisão que esta barra existe para oferecer. */
    expect(screen.getByTestId('raise-confirm')).toBeEnabled();
    await user.click(screen.getByTestId('raise-confirm'));
    expect(props.onRaise).toHaveBeenCalledWith(15);
  });

  it('o que se digita é o ACRÉSCIMO: a engine recebe o total', async () => {
    const user = userEvent.setup();
    /* Pré-flop: os dois com a entrada de 100 na mesa. Apostar mais 10
       leva o total a 110 — e é 10 que o rival tem de cobrir. */
    const { props } = renderArena({
      round: round({ committed: { player: 100, opponent: 100 }, minRaiseTo: 101 }),
    });

    await user.click(screen.getByTestId('action-raise'));
    await user.type(screen.getByTestId('raise-input'), '10');
    await user.click(screen.getByTestId('raise-confirm'));

    expect(props.onRaise).toHaveBeenCalledWith(110);
  });

  it('com aposta na frente, o botão diz o PREÇO inteiro do lance', async () => {
    const user = userEvent.setup();
    renderArena({
      round: round({ toCall: 240, committed: { player: 0, opponent: 240 }, minRaiseTo: 241 }),
    });

    await user.click(screen.getByTestId('action-raise'));
    await user.type(screen.getByTestId('raise-input'), '50');

    // Sai do stack o pagamento MAIS o acréscimo: 240 + 50.
    expect(screen.getByTestId('raise-confirm')).toHaveTextContent('PAGAR 240 + 50');
  });

  it('o campo vazio não aposta nada', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    await user.clear(screen.getByTestId('raise-input'));
    expect(screen.getByTestId('raise-confirm')).toBeDisabled();
    expect(props.onRaise).not.toHaveBeenCalled();
  });

  it('voltar fecha o painel sem apostar nada', async () => {
    const user = userEvent.setup();
    const { props } = renderArena();

    await user.click(screen.getByTestId('action-raise'));
    await user.click(screen.getByTestId('raise-cancel'));
    expect(screen.queryByTestId('raise-panel')).not.toBeInTheDocument();
    expect(props.onRaise).not.toHaveBeenCalled();
  });

  it('com o lance em trânsito os botões travam', () => {
    renderArena({ actionPending: true });
    expect(screen.getByTestId('action-check')).toBeDisabled();
    expect(screen.getByTestId('action-raise')).toBeDisabled();
  });

  it('a barra espera a janela abrir: nada de entrar com o relógio zerado', () => {
    // A palavra já é sua, mas o beat do anúncio ainda não venceu. Uma
    // barra em cena marcando "0s" leria como tempo esgotado no exato
    // instante em que ele ia começar.
    renderArena({ clock: { open: false, seconds: 0 } });
    expect(screen.queryByTestId('bet-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('turn-clock')).not.toBeInTheDocument();
  });

  it('o relógio da vez corre em cima dos botões', () => {
    renderArena({ clock: { open: true, seconds: 4 } });
    const clock = screen.getByTestId('turn-clock');
    expect(clock).toHaveTextContent('4s');
    // Últimos segundos: a barra vira brasa.
    expect(clock).toHaveClass('is-urgent');
  });
});

describe('PokerArena — o embate do showdown', () => {
  /** A mesa no instante do showdown, com o resultado já na mão. */
  function settled(patch: Partial<PokerResult> = {}) {
    const settledResult = result(patch);
    return renderArena({
      phase: 'settle',
      round: round({
        phase: 'settled',
        street: 'showdown',
        board: BOARD,
        opponentHole: [card('K', 'clubs'), card('K', 'diamonds')],
        legalActions: [],
        toAct: null,
        result: settledResult,
      }),
      result: settledResult,
    });
  }

  it('as duas placas entram, cada uma com a categoria e a força da mão', () => {
    settled();
    const embate = screen.getByTestId('showdown-clash');
    expect(embate).toHaveAttribute('data-outcome', 'win');

    const minha = screen.getByTestId('clash-player');
    const dele = screen.getByTestId('clash-opponent');
    // A categoria é o que a mesa grita; a força é o número que colide.
    expect(minha).toHaveTextContent('Um par');
    expect(minha).toHaveTextContent('de Ases');
    expect(dele).toHaveTextContent('de Reis');
    // Par é a segunda categoria mais fraca: força 2 dos dois lados.
    expect(minha).toHaveTextContent('2');
  });

  it('cada placa carrega a cor do seu lado da mesa', () => {
    settled();
    expect(screen.getByTestId('clash-player')).toHaveClass('clash-plate--player');
    expect(screen.getByTestId('clash-opponent')).toHaveClass('clash-plate--opponent');
  });

  it('quando as duas mãos leem igual, a vencedora diz no que decidiu', () => {
    /* Sem isto a cena é um mistério: as duas placas escrevem "Um par",
       a mesma coisa embaixo, e uma delas ganha a coroa. */
    settled({
      decidedBy: 'Ás',
      opponentRank: {
        category: 'pair',
        label: 'Par de Ases',
        detail: 'de Ases',
        cards: result().playerRank?.cards ?? [],
      },
    });
    expect(screen.getByTestId('clash-player')).toHaveTextContent('decidiu no Ás');
    // Só a vencedora explica: é ela que tem o que explicar.
    expect(screen.getByTestId('clash-opponent')).not.toHaveTextContent('decidiu');
  });

  it('a coroa e o aro de ouro vão para quem levou o pote', () => {
    settled();
    expect(screen.getByTestId('clash-player')).toHaveClass('clash-plate--won');
    expect(screen.getByTestId('clash-opponent')).not.toHaveClass('clash-plate--won');
  });

  it('na derrota é a placa do RIVAL que fica', () => {
    settled({ outcome: 'lose' });
    expect(screen.getByTestId('clash-opponent')).toHaveClass('clash-plate--won');
    expect(screen.getByTestId('clash-player')).not.toHaveClass('clash-plate--won');
  });

  it('o empate não elege vencedor: as duas placas travam e ficam', () => {
    settled({ outcome: 'tie' });
    const minha = screen.getByTestId('clash-player');
    const dele = screen.getByTestId('clash-opponent');
    expect(minha).toHaveClass('clash-plate--tie');
    expect(dele).toHaveClass('clash-plate--tie');
    // Coroar um empate seria mentir sobre o que aconteceu na mesa.
    expect(minha).not.toHaveClass('clash-plate--won');
    expect(dele).not.toHaveClass('clash-plate--won');
  });

  it('a colisão tem clarão e fagulhas', () => {
    settled();
    expect(screen.getByTestId('clash-impact')).toBeInTheDocument();
  });

  it('a desistência TEM embate, e ele mostra o que cada um tinha', () => {
    /* É a leitura mais valiosa do duelo: ver que o rival largou a melhor
       mão, ou que blefou com nada. Ela chega quando a mão já acabou —
       não vaza nada. */
    const folded = result({ showdown: false, foldedBy: 'opponent' });
    renderArena({
      phase: 'settle',
      round: round({ phase: 'settled', legalActions: [], toAct: null, result: folded }),
      result: folded,
    });

    expect(screen.getByTestId('showdown-clash')).toBeInTheDocument();
    expect(screen.getByTestId('clash-player')).toHaveTextContent('Um par');
    // E a placa de quem largou diz que largou.
    expect(screen.getByTestId('clash-opponent')).toHaveTextContent('desistiu');
    expect(screen.getByTestId('clash-player')).not.toHaveTextContent('desistiu');
    // Quem ficou leva o pote, tenha a mão que tiver.
    expect(screen.getByTestId('clash-player')).toHaveClass('clash-plate--won');
  });

  it('o embate é da fase settle — não sobra para a mesa em jogo', () => {
    renderArena();
    expect(screen.queryByTestId('showdown-clash')).not.toBeInTheDocument();
  });
});

describe('PokerArena — o placar do desfecho', () => {
  it('é UMA placa só, na cor de quem levou o pote', () => {
    renderArena({ phase: 'handover', result: result() });
    const placas = screen.getAllByTestId('winner-plate');
    // Duas placas simétricas anunciam uma comparação; o que aconteceu foi
    // um veredito, e veredito tem um dono só.
    expect(placas).toHaveLength(1);
    expect(placas[0]).toHaveClass('winner-plate--player');
    expect(placas[0]).toHaveTextContent('Você');
  });

  it('na derrota a placa veste a cor do rival e traz o nome dele', () => {
    renderArena({ phase: 'handover', result: result({ outcome: 'lose' }) });
    const placa = screen.getByTestId('winner-plate');
    expect(placa).toHaveClass('winner-plate--opponent');
    expect(placa).toHaveTextContent('Luna');
    expect(screen.getByTestId('winner-hand')).toHaveTextContent('Um par');
  });

  it('mostra a COMBINAÇÃO, e não a mão de cinco inteira', () => {
    renderArena({ phase: 'handover', result: result() });
    /* Um par são DUAS cartas. As outras três da mão de cinco são kickers
       que estão ali porque a mão de poker tem cinco cartas, e exibir
       AAJ97 ao lado de "um par de Ases" faz o olho procurar a combinação
       dentro do monte — que é o trabalho que a placa existe para poupar. */
    expect(screen.getByTestId('winner-cards').children).toHaveLength(2);
    expect(screen.getByLabelText(/Carta 1 da mão vencedora: A de espadas/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Carta 2 da mão vencedora: A de copas/)).toBeInTheDocument();
  });

  it('o kicker que decidiu entra ao lado da combinação', () => {
    renderArena({
      phase: 'handover',
      result: result({ decidedBy: '9', decidedCard: card('9', 'hearts') }),
    });
    // Par de Ases decidido no 9: são três cartas, A A 9 — a combinação e
    // a carta que separou as duas mãos. Nem uma a mais.
    expect(screen.getByTestId('winner-cards').children).toHaveLength(3);
    expect(screen.getByLabelText(/Carta 3 da mão vencedora: 9 de copas/)).toBeInTheDocument();
    expect(screen.getByTestId('winner-note')).toHaveTextContent('decidiu no 9');
  });

  it('um flush gasta as cinco: ali as cinco SÃO a combinação', () => {
    const espadas = [
      card('A', 'spades'),
      card('K', 'spades'),
      card('9', 'spades'),
      card('7', 'spades'),
      card('3', 'spades'),
    ];
    renderArena({
      phase: 'handover',
      result: result({
        playerRank: {
          category: 'flush',
          label: 'Flush de espadas',
          detail: 'de espadas',
          cards: espadas,
        },
      }),
    });
    expect(screen.getByTestId('winner-cards').children).toHaveLength(5);
  });

  it('um empate não tem dono: aro neutro e nenhuma coroa', () => {
    renderArena({ phase: 'handover', result: result({ outcome: 'tie' }) });
    const placa = screen.getByTestId('winner-plate');
    expect(placa).toHaveClass('winner-plate--tie');
    expect(placa).toHaveTextContent('Pote dividido');
  });

  it('o desempate ganha LINHA PRÓPRIA, sem traço pendurando no nome da mão', () => {
    renderArena({ phase: 'handover', result: result({ decidedBy: 'Ás' }) });
    const nota = screen.getByTestId('winner-note');
    expect(nota).toHaveTextContent('decidiu no Ás');
    // A frase é dela: o nome da mão não a carrega junto.
    expect(screen.getByTestId('winner-hand')).not.toHaveTextContent('decidiu');
    expect(screen.getByTestId('winner-hand')).not.toHaveTextContent('·');
  });

  it('numa desistência a placa diz quem largou a mão', () => {
    renderArena({
      phase: 'handover',
      result: result({ showdown: false, foldedBy: 'player', outcome: 'lose' }),
    });
    expect(screen.getByTestId('winner-note')).toHaveTextContent('você desistiu');
    // E o pote foi para o rival, com a mão dele em cena.
    expect(screen.getByTestId('winner-plate')).toHaveClass('winner-plate--opponent');
    expect(screen.getByTestId('winner-hand')).toHaveTextContent('Um par');
  });

  it('numa mão morta antes do flop, o placar traz as DUAS fechadas', () => {
    const preflop = result({
      showdown: false,
      foldedBy: 'opponent',
      board: [],
      playerRank: {
        category: 'pair',
        label: 'Par de Ases',
        detail: 'de Ases',
        cards: [card('A', 'spades'), card('A', 'hearts')],
      },
    });
    renderArena({ phase: 'handover', result: preflop });
    // Não havia cinco cartas a montar: o placar mostra o que existia.
    expect(screen.getByTestId('winner-cards').children).toHaveLength(2);
  });
});

describe('StreetAnnounce — o corte de cena entre as ruas', () => {
  it('carimba o nome da rua que abriu', () => {
    render(<StreetAnnounce street="flop" />);
    expect(screen.getByTestId('street-announce')).toHaveTextContent('Flop');
  });

  it('o pré-flop é anunciado como qualquer outra rua', () => {
    render(<StreetAnnounce street="preflop" />);
    expect(screen.getByTestId('street-announce')).toHaveTextContent('Pré-flop');
  });

  it('fora do beat não há letreiro nenhum na tela', () => {
    render(<StreetAnnounce street={null} />);
    expect(screen.queryByTestId('street-announce')).not.toBeInTheDocument();
  });

  it('põe a tela fora de foco enquanto corre, e devolve o foco ao sair', () => {
    /* O desfoque é do CONTEÚDO (um filtro no `#root`), e não de uma
       camada com `backdrop-filter` por cima: a camada obriga o navegador
       a amostrar o fundo de uma superfície montada na hora, e os motores
       discordam sobre qual é — no WebKit o efeito não aparecia, e em
       outros a tela saía DUPLICADA para o lado. */
    const { rerender, unmount } = render(<StreetAnnounce street="flop" />);
    expect(document.body).toHaveClass('is-street-cut');

    rerender(<StreetAnnounce street={null} />);
    expect(document.body).not.toHaveClass('is-street-cut');

    // E sair da mesa no meio do beat não deixa a tela embaçada para trás.
    rerender(<StreetAnnounce street="turn" />);
    expect(document.body).toHaveClass('is-street-cut');
    unmount();
    expect(document.body).not.toHaveClass('is-street-cut');
  });

  it('o letreiro sai do #root: dentro dele seria desfocado com a mesa', () => {
    const { container } = render(<StreetAnnounce street="river" />);
    // O portal não deixa nada no lugar onde o componente foi montado.
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByTestId('street-announce')).toHaveTextContent('River');
  });
});

describe('ChipRack — o montante de cada duelista', () => {
  const fichas = () => [...document.querySelectorAll('.rvc-chip')];
  const valores = () =>
    fichas().map((el) => Number(el.className.match(/rvc-chip--(\d+)/)?.[1] ?? 0));

  it('conta em VALORES, não em unidades: um stack cabe na mesa', () => {
    /* A primeira versão contava fichas de valor único, e 5.000 virava uma
       parede de discos que transbordava a tela. Com as quatro fichas da
       casa o montante deixa de ser contado e passa a ser lido. */
    render(<ChipRack side="player" stack={TABLE_MAX_STACK} instant />);
    expect(valores()).toEqual([1000, 1000, 1000, 1000, 1000]);
  });

  it('reparte da ficha mais alta para a mais baixa', () => {
    render(<ChipRack side="player" stack={1625} instant />);
    expect(valores()).toEqual([1000, 500, 100, 25]);
  });

  it('o montante NUNCA passa do que cabe na faixa ao lado da mão', () => {
    // O arredondamento engrossa sozinho até caber (ver ROUNDING_STEPS).
    for (const stack of [4975, 6789, 9975, 10000]) {
      const { unmount } = render(<ChipRack side="player" stack={stack} instant />);
      expect(fichas().length, `stack ${stack}`).toBeLessThanOrEqual(RACK_MAX_CHIPS);
      unmount();
    }
  });

  it('quem está por um fio ainda tem ficha na mesa', () => {
    /* A diferença entre pouco e nada é a própria sessão: um montante
       vazio diria que a mesa acabou quando ela ainda não acabou. */
    render(<ChipRack side="opponent" stack={40} instant />);
    expect(fichas().length).toBeGreaterThan(0);
  });

  it('sem fichas não há montante nenhum', () => {
    render(<ChipRack side="opponent" stack={0} instant />);
    expect(fichas()).toHaveLength(0);
  });

  it('cada ficha leva o brasão da casa', () => {
    render(<ChipRack side="player" stack={1000} instant />);
    expect(document.querySelectorAll('.rvc-chip__crest')).toHaveLength(1);
  });

  it('o valor é anunciado por extenso a quem usa leitor de tela', () => {
    render(<ChipRack side="player" stack={2350} instant />);
    expect(screen.getByTestId('chip-rack-player')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2.350'),
    );
  });
});

describe('ShowCardsPrompt — abrir a mão a quem correu', () => {
  const prompt = { seconds: 5, handLabel: 'Carta alta: Ás' };

  it('traz a LEITURA da mão: é ela que decide se vale mostrar', () => {
    /* Abrir um par de Ases diz "eu aposto com mão feita"; abrir carta
       alta diz "eu blefo", e é o que faz a aposta seguinte valer o
       dobro. Sem a leitura, o balão cobraria memória em vez de
       estratégia. */
    render(<ShowCardsPrompt prompt={prompt} opponentName="Luna" onAnswer={vi.fn()} instant />);
    expect(screen.getByTestId('show-prompt-hand')).toHaveTextContent('Carta alta: Ás');
    expect(screen.getByTestId('show-prompt')).toHaveTextContent('Luna correu');
  });

  it('as duas respostas chegam a quem conduz a mesa', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<ShowCardsPrompt prompt={prompt} opponentName="Luna" onAnswer={onAnswer} instant />);

    await user.click(screen.getByTestId('show-cards-yes'));
    expect(onAnswer).toHaveBeenCalledWith(true);

    await user.click(screen.getByTestId('show-cards-no'));
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it('o relógio aparece no botão de guardar — o silêncio tem prazo', () => {
    render(
      <ShowCardsPrompt
        prompt={{ ...prompt, seconds: 3 }}
        opponentName="Luna"
        onAnswer={vi.fn()}
        instant
      />,
    );
    expect(screen.getByTestId('show-cards-no')).toHaveTextContent('3s');
  });
});
