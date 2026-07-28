import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SettingsSheet } from '../components/SettingsSheet';
import { AmbientLayer } from '../scene/ambient/AmbientLayer';
import { TableScene } from '../scene/TableScene';
import { DEALER_REACTIONS } from '../scene/dealer/DealerController';
import { SvgRigDealer } from '../scene/dealer/SvgRigDealer';
import { resolveDealerReaction } from '../scene/dealer/useDealerReaction';
import { resolveSceneQuality } from '../scene/sceneQuality';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';

afterEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('resolveDealerReaction', () => {
  it('mapeia cada fase para a reação da especificação (§9.1)', () => {
    const expected: Record<GamePhase, string> = {
      idle: 'idle',
      search: 'idle',
      found: 'greet',
      confirm: 'present',
      negotiate: 'present',
      coinflip: 'anticipate',
      countdown: 'anticipate',
      dealing: 'shake',
      playerTurn: 'present',
      opponentTurn: 'present',
      dealerTurn: 'reveal',
      settle: 'reveal',
      roundEnd: 'reveal',
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

  it('no veredito (settle e roundEnd), a dealer reage ao desfecho parcial', () => {
    expect(resolveDealerReaction('settle', 'win')).toBe('celebrate');
    expect(resolveDealerReaction('settle', 'lose')).toBe('console');
    expect(resolveDealerReaction('roundEnd', 'win')).toBe('celebrate');
    expect(resolveDealerReaction('roundEnd', 'lose')).toBe('console');
    expect(resolveDealerReaction('roundEnd', 'tie')).toBe('shrug');
  });

  it('fora do veredito, o resultado residual é ignorado', () => {
    expect(resolveDealerReaction('negotiate', 'win')).toBe('present');
    expect(resolveDealerReaction('dealing', 'tie')).toBe('shake');
    expect(resolveDealerReaction('playerTurn', 'win')).toBe('present');
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

describe('SvgRigDealer', () => {
  it.each(DEALER_REACTIONS)('renderiza a reação "%s" sem quebrar', (reaction) => {
    render(<SvgRigDealer reaction={reaction} />);
    expect(screen.getByTestId('dealer')).toHaveAttribute('data-reaction', reaction);
  });

  it('em qualidade baixa permanece renderizável (poses estáticas)', () => {
    render(<SvgRigDealer reaction="celebrate" quality="low" />);
    expect(screen.getByTestId('dealer')).toBeInTheDocument();
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
