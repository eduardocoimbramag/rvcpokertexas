import { act, render, screen } from '@testing-library/react';
import type * as FramerMotion from 'framer-motion';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As cenas da partida trocam dentro de um `AnimatePresence mode="wait"`,
 * que só monta a cena seguinte quando a anterior TERMINA de sair — e no
 * jsdom, sem quadros de animação, essa saída nunca termina. Aqui a
 * presença vira passagem direta: o que se testa é a máquina de fases,
 * não a coreografia.
 */
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof FramerMotion>();
  return { ...actual, AnimatePresence: ({ children }: { children?: ReactNode }) => children };
});

import { COIN_PICK_SECONDS, TIMINGS } from '../animations/timings';
import type { ActiveMatch } from '../tournament/tournamentStore';
import { useTournamentStore } from '../tournament/tournamentStore';
import { TournamentApp } from '../tournament/TournamentApp';
import { DEFAULT_CARD_COLORS } from '../store/cardColors';
import { useGameStore } from '../store/gameStore';

/**
 * O cara-ou-coroa do TORNEIO: a partida do chaveamento passa pelo mesmo
 * sorteio do 1v1 (a moeda decide quem escolhe a cor das cartas) antes de
 * as cartas saírem do sapato — e é o FIM do sorteio, não um relógio
 * fixo, que solta o countdown.
 */

const initialTournament = useTournamentStore.getInitialState();
const initialGame = useGameStore.getInitialState();

/**
 * Avança UM beat. Cada estágio agenda o seu sucessor de dentro de um
 * efeito, que só roda quando o React reconcilia — por isso os beats
 * precisam de blocos `act` separados: um único avanço somado dispararia
 * apenas o primeiro timer da corrente.
 */
function beat(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Da apresentação até a vez de o jogador escolher a cor. */
function advanceToPick() {
  beat(TIMINGS.foundSplashMs); // apresentação → sorteio
  beat(TIMINGS.coinIntroMs); // a ficha sai da mão
  beat(TIMINGS.coinTossMs); // voo e pouso
  beat(TIMINGS.coinResultMs); // face sorteada em cena
  beat(TIMINGS.coinVerdictMs); // veredito → escolha
}

/**
 * A partida não nasce decidida: a tela abre a mesa e joga a mão de
 * blackjack de verdade — o ActiveMatch só aponta o duelo do chaveamento.
 */
function activeMatch(): ActiveMatch {
  return {
    bracketMatchId: 'bm-1',
    match: {
      id: 'bm-1',
      opponent: { id: 'o1', name: 'Luna', avatar: 'L', rating: 1000 },
      stake: 0,
      createdAt: 0,
    },
    thirdPlace: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // 0.25 em toda tiragem: lado 'cara' e moeda em 'cara' → o JOGADOR
  // vence o sorteio, e a cor sorteada pelo relógio é a azul.
  vi.spyOn(Math, 'random').mockReturnValue(0.25);
  useTournamentStore.setState(
    { ...initialTournament, stage: 'match', activeMatch: activeMatch(), size: 4, entryFee: 10 },
    true,
  );
  useGameStore.setState({ ...initialGame, cardColors: DEFAULT_CARD_COLORS }, true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useTournamentStore.setState(initialTournament, true);
  useGameStore.setState(initialGame, true);
});

describe('partida do torneio — cara-ou-coroa', () => {
  it('sorteia depois da apresentação e só então abre o countdown', () => {
    render(<TournamentApp onExit={() => undefined} />);

    // Apresentação do duelo primeiro; nada de moeda ainda.
    expect(screen.queryByTestId('coinflip-overlay')).not.toBeInTheDocument();

    beat(TIMINGS.foundSplashMs);
    expect(screen.getByTestId('coinflip-overlay')).toBeInTheDocument();

    // A moeda voa, pousa e o veredito dá a vez ao jogador — as cartas
    // continuam fora de cena o sorteio inteiro.
    beat(TIMINGS.coinIntroMs);
    beat(TIMINGS.coinTossMs);
    beat(TIMINGS.coinResultMs);
    beat(TIMINGS.coinVerdictMs);
    expect(screen.getByTestId('coin-headline')).toHaveTextContent('Escolha suas cartas');
    expect(screen.queryByTestId('countdown-value')).not.toBeInTheDocument();

    // Ninguém toca: o relógio zera, a mesa escolhe pelo jogador e só
    // ENTÃO o countdown da rodada começa.
    beat(COIN_PICK_SECONDS * 1000);
    beat(TIMINGS.coinPickedMs);
    expect(screen.getByTestId('countdown-value')).toBeInTheDocument();
  });

  it('a cor escolhida no sorteio vale para as cartas da mesa', () => {
    render(<TournamentApp onExit={() => undefined} />);
    advanceToPick();

    // Vencendo o sorteio, o jogador escolhe — aqui, o vermelho.
    act(() => {
      screen.getByTestId('card-color-vermelho').click();
    });
    act(() => {
      screen.getByTestId('confirm-card-color').click();
    });

    // Só há duas cores: pegar o vermelho entrega o azul ao adversário —
    // e a troca vale para as cartas desta partida do torneio.
    expect(useGameStore.getState().cardColors).toEqual({
      player: 'vermelho',
      opponent: 'azul',
    });
  });
});
