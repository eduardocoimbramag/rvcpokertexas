import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CashTableScreen } from '../tournament/screens/CashTableScreen';
import type { CashTableView } from '../tournament/cashTable';
import type { CashVerdict, TournamentState } from '../tournament/tournamentStore';
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

function montaMesa(meuStack: number, extra: Partial<TournamentState> = {}) {
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
      ...extra,
    },
    true,
  );
}

/** A mesma mesa, com VOCÊ fora da mão — largou e a mesa seguiu. */
function correuNaMao(mesa: CashTableView): CashTableView {
  return {
    ...mesa,
    seats: mesa.seats.map((seat) => (seat.seatIndex === 0 ? { ...seat, folded: true } : seat)),
  };
}

/** O desfecho mínimo que a janela do intervalo precisa para existir. */
const desfecho: CashVerdict = {
  winners: [{ seat: 3, name: 'Dante', won: 240, isYou: false }],
  label: 'Dois pares',
  detail: 'Ases e Reis',
  highlight: [],
  deciding: [],
  showdown: true,
  netChange: -40,
  clash: {
    rivalName: 'Dante',
    yourRank: { category: 'pair', label: 'Par', detail: 'de Reis' },
    rivalRank: { category: 'two-pair', label: 'Dois pares', detail: 'Ases e Reis' },
    outcome: 'lose',
    youFolded: false,
    rivalFolded: false,
    showdown: true,
  },
};

beforeEach(() => {
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState({ ...initialGame, balance: 5000 }, true);
});

afterEach(() => {
  useTournamentStore.setState(initialTournament, true);
});

describe('sem fichas, a saída fica em cena', () => {
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
    /* A porta com fichas na frente vive no INTERVALO entre as mãos: é
       onde não há lance a fazer, e onde ela ocupa a barra inteira. */
    montaMesa(1000, {
      cashPhase: 'handover',
      cashVerdict: desfecho,
      cashHandover: { seconds: 4, total: 5 },
    });
    render(<CashTableScreen />);

    await user.click(screen.getByTestId('cash-leave'));
    expect(await screen.findByTestId('cash-leave-take')).toHaveTextContent('1.000');
  });
});

describe('depois de correr, a saída é a única jogada que sobra', () => {
  /* O defeito que isto fecha: quem corre a mão fica sem lance, sem vez e
     sem nada a fazer até a mesa fechar o pote — e a única decisão que
     ainda existe, levantar, morava numa bandeira de 2rem no canto de
     cima. */
  it('correu: a espera diz o que houve e abre a porta', () => {
    const mesa = correuNaMao(view(1000));
    montaMesa(1000, { cashTable: mesa });
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-wait')).toHaveTextContent('Você correu esta mão');
    expect(screen.getByTestId('cash-leave-broke')).toBeVisible();
  });

  it('na mão viva a espera não oferece saída nenhuma', () => {
    /* Um botão vermelho a cada espera de bot seria alarme sem incêndio:
       com a mão de pé ainda há o que fazer, e a porta volta na sua vez. */
    montaMesa(1000);
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-wait')).toHaveTextContent('Aguardando a mesa');
    expect(screen.queryByTestId('cash-leave-broke')).toBeNull();
  });

  it('na PRIMEIRA mão a porta está em cena e fechada', () => {
    /* Quem senta, joga ao menos uma. A porta aparece apagada em vez de
       não existir: descobre-se que ela existe antes de precisar dela. */
    const mesa = correuNaMao(view(1000));
    montaMesa(1000, { cashTable: mesa, cashCanLeave: false });
    render(<CashTableScreen />);

    expect(screen.getByTestId('cash-leave-broke')).toBeDisabled();
  });
});

describe('a janela do intervalo é a do duelo', () => {
  it('o desfecho, o relógio da próxima e a porta, os três em cena', () => {
    montaMesa(1000, {
      cashPhase: 'handover',
      cashVerdict: desfecho,
      cashHandover: { seconds: 3, total: 5 },
    });
    render(<CashTableScreen />);

    /* A MESMA moldura do duelo: `.winner-plate`, com a cor do desfecho, o
       nome de quem levou e a leitura da mão. */
    const placa = screen.getByTestId('cash-verdict');
    expect(placa).toHaveClass('winner-plate');
    expect(placa).toHaveTextContent('Dante');
    expect(placa).toHaveTextContent('DOIS PARES');
    /* O DETALHE da mão, que é a linha que a placa do duelo sempre teve. */
    expect(placa).toHaveTextContent('Ases e Reis');

    expect(screen.getByTestId('handover-clock')).toHaveTextContent('Próxima mão em 3s');
    expect(screen.getByTestId('cash-leave')).toHaveTextContent('LEVANTAR DA MESA');
  });

  it('o EMBATE roda antes dela, e não junto', () => {
    montaMesa(1000, { cashPhase: 'settle', cashVerdict: desfecho });
    render(<CashTableScreen />);

    expect(screen.getByTestId('showdown-clash')).toHaveAttribute('data-outcome', 'lose');
    /* As duas placas do embate, uma de cada borda. */
    expect(screen.getByTestId('clash-opponent')).toHaveTextContent('Dante');
    expect(screen.getByTestId('clash-player')).toHaveTextContent('Você');
    // A placa do desfecho só entra na batida seguinte.
    expect(screen.queryByTestId('cash-verdict')).toBeNull();
    /* E a barra se cala: a cena ocupa o feltro inteiro, e qualquer coisa
       escrita embaixo disputaria o olho com as duas placas. */
    expect(screen.queryByTestId('cash-wait')).toBeNull();
  });

  it('quando VOCÊ correu, a sua placa mostra o que você largou', () => {
    /* Esconder a própria mão só faz sentido quando esconder foi JOGADA —
       e o convite de guardar só vai a quem levou o pote sem showdown. Na
       mão que você correu não houve escolha a respeitar, e ver o que se
       largou é a leitura que esta cena existe para dar. */
    montaMesa(1000, {
      cashPhase: 'settle',
      cashVerdict: {
        ...desfecho,
        showdown: false,
        clash: { ...desfecho.clash, showdown: false, youFolded: true, outcome: 'lose' },
      },
    });
    render(<CashTableScreen />);

    const minha = screen.getByTestId('clash-player');
    expect(minha).toHaveTextContent('Um par');
    expect(minha).toHaveTextContent('desistiu');
    expect(minha).not.toHaveTextContent('Mão guardada');
  });

  it('mas a mão que você GUARDOU continua guardada', () => {
    montaMesa(1000, {
      cashPhase: 'settle',
      cashShown: false,
      cashVerdict: {
        ...desfecho,
        showdown: false,
        netChange: 240,
        clash: { ...desfecho.clash, showdown: false, outcome: 'win', rivalFolded: true },
      },
    });
    render(<CashTableScreen />);

    expect(screen.getByTestId('clash-player')).toHaveTextContent('Mão guardada');
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

describe('a mesa de seis tira o feltro de foco no intervalo', () => {
  it('o véu entra COM a placa do desfecho', () => {
    montaMesa(1000, {
      cashPhase: 'handover',
      cashVerdict: desfecho,
      cashHandover: { seconds: 5, total: 5 },
    });
    render(<CashTableScreen />);

    expect(screen.getByTestId('table-veil')).toBeInTheDocument();
    expect(screen.getByTestId('cash-verdict')).toBeInTheDocument();
  });

  it('com a mão viva, e no embate, não há véu', () => {
    montaMesa(1000);
    const { unmount } = render(<CashTableScreen />);
    expect(screen.queryByTestId('table-veil')).toBeNull();
    unmount();

    montaMesa(1000, { cashPhase: 'settle', cashVerdict: desfecho });
    render(<CashTableScreen />);
    expect(screen.queryByTestId('table-veil')).toBeNull();
  });
});

describe('a placa do rival abre o perfil dele', () => {
  /* Numa mesa de seis o argumento vale mais que no duelo: são cinco
     desconhecidos, e nenhum deles se apresenta. */
  it('cada rival tem a sua porta, e ela é um botão', async () => {
    const user = userEvent.setup();
    montaMesa(1000);
    render(<CashTableScreen />);

    const placa = screen.getByTestId('cash-profile-1');
    expect(placa.tagName).toBe('BUTTON');
    expect(placa).toHaveAccessibleName('Ver o perfil de Otto');

    await user.click(placa);
    const perfil = await screen.findByTestId('opponent-profile');
    expect(perfil).toHaveTextContent('Otto');
  });

  it('a SUA placa continua sendo placa', () => {
    montaMesa(1000);
    render(<CashTableScreen />);
    // O seu assento não tem `cash-profile-*`: só os rivais têm.
    expect(screen.queryByTestId('cash-profile-0')).toBeNull();
  });
});
