import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SettingsSheet } from '../components/SettingsSheet';
import { AmbientLayer } from '../scene/ambient/AmbientLayer';
import { TableScene } from '../scene/TableScene';
import { Dealer } from '../scene/dealer/Dealer';
import { DEALER_REACTIONS } from '../scene/dealer/DealerController';
import { resolveDealerReaction, useDealerReaction } from '../scene/dealer/useDealerReaction';
import { resolveSceneQuality } from '../scene/sceneQuality';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { useTournamentStore } from '../tournament/tournamentStore';

afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  // O cenário lê os DOIS stores para decidir o enquadramento: sem
  // devolver o torneio ao estado inicial, um estágio de mesa vaza para o
  // teste seguinte e o faz passar (ou falhar) pelo motivo errado.
  useTournamentStore.setState({ stage: 'closed' });
});

describe('resolveDealerReaction', () => {
  it('mapeia cada fase para a reação da especificação (§9.1)', () => {
    // A crupiê não joga: distribui, acompanha as vezes dos DOIS duelistas
    // (nunca a própria mão — ela não tem uma) e vira as ocultas no
    // showdown. O Record obriga o mapa a cobrir a união inteira.
    const expected: Record<GamePhase, string> = {
      idle: 'idle',
      search: 'idle',
      found: 'greet',
      confirm: 'present',
      countdown: 'anticipate',
      dealing: 'shake',
      betting: 'present',
      settle: 'reveal',
      // Entre as mãos ela recolhe o pote e prepara o baralho seguinte.
      handover: 'shake',
      completed: 'idle',
      error: 'apologize',
    };
    for (const [phase, reaction] of Object.entries(expected)) {
      expect(resolveDealerReaction(phase as GamePhase, null)).toBe(reaction);
    }
  });

  it('em completed, o resultado da rodada sobrepõe a fase', () => {
    expect(resolveDealerReaction('completed', 'win')).toBe('celebrate');
    expect(resolveDealerReaction('completed', 'lose')).toBe('console');
    expect(resolveDealerReaction('completed', 'tie')).toBe('shrug');
  });

  it('no showdown (settle), a crupiê já reage ao desfecho', () => {
    expect(resolveDealerReaction('settle', 'win')).toBe('celebrate');
    expect(resolveDealerReaction('settle', 'lose')).toBe('console');
    expect(resolveDealerReaction('settle', 'tie')).toBe('shrug');
  });

  it('fora do veredito, o resultado residual é ignorado', () => {
    expect(resolveDealerReaction('dealing', 'tie')).toBe('shake');
    expect(resolveDealerReaction('betting', 'win')).toBe('present');
  });
});

describe('useDealerReaction — o caixa reage à SESSÃO, não à última mão', () => {
  /** Sonda: expõe o que o hook devolve para o estado atual do store. */
  function Sonda() {
    return <p data-testid="sonda">{useDealerReaction()}</p>;
  }

  /** Sessão fechada com o stack final pedido (buy-in de 5.000). */
  const sessao = (stackFinal: number) => ({
    matchId: 'm1',
    buyIn: 5000,
    stacks: { player: stackFinal, opponent: 10000 - stackFinal },
    handsPlayed: 8,
    button: 'player' as const,
    over: true,
  });

  it('perdeu a última mão mas levantou no LUCRO → comemora (o bug do print)', () => {
    // A mesa é uma sessão: o caixa diz "terminou no positivo", e uma
    // crupiê chorando ao lado desse letreiro é contradição em cena.
    useGameStore.setState({
      phase: 'completed',
      session: sessao(7895),
      result: { outcome: 'lose' } as never,
    });
    render(<Sonda />);
    expect(screen.getByTestId('sonda')).toHaveTextContent('celebrate');
  });

  it('ganhou a última mão mas levantou no PREJUÍZO → lamenta', () => {
    useGameStore.setState({
      phase: 'completed',
      session: sessao(3200),
      result: { outcome: 'win' } as never,
    });
    render(<Sonda />);
    expect(screen.getByTestId('sonda')).toHaveTextContent('console');
  });

  it('no showdown (settle) segue valendo o desfecho da MÃO', () => {
    useGameStore.setState({
      phase: 'settle',
      session: sessao(7895),
      result: { outcome: 'lose' } as never,
    });
    render(<Sonda />);
    expect(screen.getByTestId('sonda')).toHaveTextContent('console');
  });
});

describe('resolveSceneQuality', () => {
  it('respeita off e low do jogador', () => {
    expect(resolveSceneQuality('off', false)).toBe('off');
    expect(resolveSceneQuality('low', false)).toBe('low');
  });

  it('rebaixa high para low quando o usuário prefere menos movimento', () => {
    expect(resolveSceneQuality('high', true)).toBe('low');
  });
});

describe('Dealer (fachada)', () => {
  it.each(DEALER_REACTIONS)('renderiza a reação "%s" sem quebrar', (reaction) => {
    render(<Dealer reaction={reaction} />);
    expect(screen.getByTestId('dealer')).toHaveAttribute('data-reaction', reaction);
  });

  it('em qualidade baixa permanece renderizável (poses estáticas)', () => {
    render(<Dealer reaction="celebrate" quality="low" />);
    expect(screen.getByTestId('dealer')).toBeInTheDocument();
  });

  it('variant "none" tira a crupiê de cena', () => {
    render(<Dealer reaction="idle" variant="none" />);
    expect(screen.queryByTestId('dealer')).not.toBeInTheDocument();
  });

  it('o rig ANTIGO continua montável, mas não é o padrão', () => {
    // `variant="svg"` é a arte aposentada (public/dealer/): o jogo nunca
    // a pede, e o teste existe para o dia em que alguém pedir.
    render(<Dealer reaction="idle" variant="svg" />);
    expect(screen.getByTestId('dealer')).not.toHaveAttribute('data-face');
  });
});

describe('TableScene', () => {
  it('renderiza mesa, dealer e o conteúdo do jogo por cima', () => {
    render(
      <TableScene reaction="present">
        <p>conteúdo do jogo</p>
      </TableScene>,
    );
    expect(screen.getByTestId('table-scene')).toBeInTheDocument();
    expect(screen.getByTestId('scene-table')).toBeInTheDocument();
    expect(screen.getByTestId('dealer')).toHaveAttribute('data-reaction', 'present');
    expect(screen.getByText('conteúdo do jogo')).toBeInTheDocument();
  });

  it('sem prop, a câmera padrão é a frontal', () => {
    render(
      <TableScene reaction="present">
        <p>jogo</p>
      </TableScene>,
    );
    expect(screen.getByTestId('table-scene')).toHaveAttribute('data-camera', 'front');
  });

  it('câmera vertical: mesa vista de cima em quadro, dealer fora do enquadramento', () => {
    render(
      <TableScene reaction="shake" camera="overhead">
        <p>dados</p>
      </TableScene>,
    );
    const stage = screen.getByTestId('table-scene');
    expect(stage).toHaveAttribute('data-camera', 'overhead');
    expect(stage.className).toContain('scene-stage--overhead');
    expect(screen.getByTestId('scene-table-overhead')).toBeInTheDocument();
    // A dealer permanece montada (o rig não reinicializa), apenas invisível.
    expect(screen.getByTestId('dealer')).toBeInTheDocument();
  });

  it('o brasão da casa fica gravado no couro nas duas câmeras', () => {
    const { rerender } = render(
      <TableScene reaction="present">
        <p>jogo</p>
      </TableScene>,
    );
    // Frontal e vertical coexistem no palco (o corte é um cross-fade),
    // então cada câmera traz a sua marca.
    expect(screen.getAllByTestId('table-crest')).toHaveLength(2);
    rerender(
      <TableScene reaction="shake" camera="overhead">
        <p>dados</p>
      </TableScene>,
    );
    for (const crest of screen.getAllByTestId('table-crest')) {
      expect(crest).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('o backdrop decorativo é invisível para leitores de tela', () => {
    render(
      <TableScene reaction="idle">
        <p>jogo</p>
      </TableScene>,
    );
    const dealer = screen.getByTestId('dealer');
    expect(dealer.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('com cenário desligado, renderiza apenas o conteúdo', () => {
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, scenery: 'off' },
    });
    render(
      <TableScene reaction="present">
        <p>jogo puro</p>
      </TableScene>,
    );
    expect(screen.queryByTestId('table-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dealer')).not.toBeInTheDocument();
    expect(screen.getByText('jogo puro')).toBeInTheDocument();
  });
});

describe('AmbientLayer — coluna de cena e extensão de ambiente', () => {
  it('desenha o salão numa coluna, com a extensão desfocada atrás', () => {
    render(<AmbientLayer />);
    const ambient = screen.getByTestId('scene-ambient');

    // A foto vive na coluna (.scene-ambient__stage); o que sobra ao redor
    // dela na web é preenchido pelo borrão (.scene-ambient__wash). Sem os
    // dois, a web volta ao enquadramento ampliado do `cover`.
    expect(screen.getByTestId('scene-ambient-stage')).toBeInTheDocument();
    expect(ambient.querySelector('.scene-ambient__wash')).not.toBeNull();
  });

  it('expõe a qualidade para o CSS baratear o desfoque', () => {
    render(<AmbientLayer />);
    expect(screen.getByTestId('scene-ambient')).toHaveAttribute('data-quality', 'high');
  });

  it('a poeira mora na faixa da coluna, não solta na viewport', () => {
    render(<AmbientLayer />);
    const dust = screen.getByTestId('scene-ambient').querySelector('.scene-ambient__dust');
    expect(dust).not.toBeNull();
    expect(dust?.querySelectorAll('.scene-particle').length).toBeGreaterThan(0);
  });

  it('troca o enquadramento quando a mesa entra em cena', () => {
    const { rerender } = render(<AmbientLayer />);
    expect(screen.getByTestId('scene-ambient').className).not.toContain('scene-ambient--game');

    useGameStore.setState({ phase: 'search' });
    rerender(<AmbientLayer />);
    expect(screen.getByTestId('scene-ambient').className).toContain('scene-ambient--game');
  });

  /* O 1v1 e a mesa de 6 mostram a MESMA crupiê; mostrá-la sobre dois
     enquadramentos diferentes é o defeito que este teste guarda. Ele
     cobra todos os estágios que desenham `TableScene` — foi ao ganhar
     `cash` e `cashout` (e não atualizar o cenário junto) que o caixa da
     mesa de 6 passou a aparecer com o enquadramento de menu. */
  it.each(['match', 'table', 'cash', 'cashout'] as const)(
    'usa o enquadramento de jogo no estágio %s do torneio',
    (stage) => {
      useTournamentStore.setState({ stage });
      render(<AmbientLayer />);
      expect(screen.getByTestId('scene-ambient').className).toContain('scene-ambient--game');
    },
  );

  /* O contraponto: onde a mesa NÃO está em cena, o enquadramento tem de
     continuar o do menu — inclusive na escolha de cadeira, que mostra o
     salão inteiro atrás das seis cadeiras. */
  it.each(['browse', 'lobby', 'seating', 'bracket'] as const)(
    'mantém o enquadramento de menu no estágio %s',
    (stage) => {
      useTournamentStore.setState({ stage });
      render(<AmbientLayer />);
      expect(screen.getByTestId('scene-ambient').className).not.toContain('scene-ambient--game');
    },
  );

  it('com cenário desligado, não renderiza nada', () => {
    useGameStore.setState({
      settings: { ...useGameStore.getState().settings, scenery: 'off' },
    });
    render(<AmbientLayer />);
    expect(screen.queryByTestId('scene-ambient')).not.toBeInTheDocument();
  });
});

describe('SettingsSheet — qualidade do cenário', () => {
  it('permite trocar e persiste a escolha no store', async () => {
    const user = userEvent.setup();
    render(<SettingsSheet open onClose={() => undefined} />);

    expect(screen.getByTestId('scenery-high')).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByTestId('scenery-off'));
    expect(useGameStore.getState().settings.scenery).toBe('off');
    expect(screen.getByTestId('scenery-off')).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByTestId('scenery-low'));
    expect(useGameStore.getState().settings.scenery).toBe('low');
  });
});
