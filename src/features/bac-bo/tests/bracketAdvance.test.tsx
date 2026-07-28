import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBracket, propagateWinners, recordMatchResult } from '../tournament/bracket';
import { makeBots, you } from '../tournament/simulation';
import { TournamentApp } from '../tournament/TournamentApp';
import { useTournamentStore } from '../tournament/tournamentStore';
import type { Bracket } from '../tournament/types';

/**
 * Regressão do travamento do torneio: ao avançar de fase, o overlay de
 * avanço ficava para sempre na tela porque o timer que o fecha morria a
 * cada reescrita do chaveamento feita pela simulação dos bots. Como
 * `canPlay` exige `advance === null`, o torneio congelava — sem botão e
 * sem início automático.
 */

const YOU = 'you';
const initialTournament = useTournamentStore.getInitialState();

/** Rodada 0 com a partida do jogador vencida e 3 das 4 já registradas. */
function bracketOnLastMatchOfRound0(): { bracket: Bracket; lastMatchId: string } {
  let bracket = createBracket([you(), ...makeBots(7)], 8);
  const round0 = bracket.rounds[0] ?? [];

  const mine = round0.find((m) => m.a?.id === YOU || m.b?.id === YOU);
  if (!mine) throw new Error('partida do jogador não encontrada');
  // O jogador vence (ele é o assento A por ser o primeiro da lista).
  bracket = recordMatchResult(bracket, mine.id, 11, 4);

  const others = round0.filter((m) => m.id !== mine.id);
  const pending = others[others.length - 1];
  if (!pending) throw new Error('rodada sem outras partidas');
  for (const m of others.slice(0, -1)) {
    bracket = recordMatchResult(bracket, m.id, 9, 5);
  }

  return { bracket, lastMatchId: pending.id };
}

describe('BracketScreen — avanço de fase não trava o torneio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useTournamentStore.setState(initialTournament, true);
  });

  it('fecha o overlay mesmo com o chaveamento sendo reescrito durante a animação', () => {
    const { bracket, lastMatchId } = bracketOnLastMatchOfRound0();
    useTournamentStore.setState({
      stage: 'bracket',
      bracket,
      simulating: false,
      size: 8,
      entryFee: 10,
    });

    render(<TournamentApp onExit={() => undefined} />);

    // Fecha a rodada 0 → o jogador avança para a semi e o overlay entra.
    // Em dois `act`: o primeiro libera o efeito (que agenda a exibição),
    // o segundo dispara o timer.
    act(() => {
      useTournamentStore.setState({ bracket: recordMatchResult(bracket, lastMatchId, 8, 3) });
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('advance-overlay')).toBeInTheDocument();

    // A simulação dos bots reescreve o chaveamento no meio da animação:
    // é ISSO que antes cancelava o fechamento do overlay.
    act(() => {
      vi.advanceTimersByTime(700);
      const current = useTournamentStore.getState().bracket;
      if (current) useTournamentStore.setState({ bracket: propagateWinners(current) });
      vi.advanceTimersByTime(300);
      const again = useTournamentStore.getState().bracket;
      if (again) useTournamentStore.setState({ bracket: propagateWinners(again) });
    });

    // Passado o tempo do overlay, o torneio volta a ser jogável.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('play-tournament-match')).toBeInTheDocument();
  });

  it('as oitavas da sala de 16 usam a grade densa (8 cartas em 2 colunas)', () => {
    useTournamentStore.setState({
      stage: 'bracket',
      bracket: createBracket([you(), ...makeBots(15)], 16),
      simulating: false,
      size: 16,
      entryFee: 10,
    });

    const { container } = render(<TournamentApp onExit={() => undefined} />);
    // 8 partidas não cabem empilhadas: a fase troca para a grade densa.
    expect(container.querySelector('.active-round--dense')).not.toBeNull();
    expect(screen.getAllByTestId('bracket-match')).toHaveLength(8);
  });
});
