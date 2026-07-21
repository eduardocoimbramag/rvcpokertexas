import { useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { useGameStore } from '../../store/gameStore';
import { useTournamentStore } from '../../tournament/tournamentStore';
import { resolveSceneQuality } from '../sceneQuality';

/** Posições/durações fixas das partículas (determinístico e barato). */
const PARTICLES: readonly { x: string; dur: string; delay: string; size: string }[] = [
  { x: '12%', dur: '16s', delay: '0s', size: '3px' },
  { x: '26%', dur: '21s', delay: '4s', size: '2px' },
  { x: '43%', dur: '18s', delay: '9s', size: '3px' },
  { x: '58%', dur: '23s', delay: '2s', size: '2px' },
  { x: '71%', dur: '17s', delay: '12s', size: '3px' },
  { x: '84%', dur: '20s', delay: '6s', size: '2px' },
  { x: '93%', dur: '25s', delay: '15s', size: '2px' },
];

/**
 * Camada 0 — ambiente global (docs/scenario.md §6.4).
 * Gradiente + vinheta em CSS puro cobrindo a viewport inteira, atrás da
 * casca do app. Partículas de poeira só em qualidade alta.
 */
export function AmbientLayer() {
  const scenery = useGameStore((state) => state.settings.scenery);
  const phase = useGameStore((state) => state.phase);
  const tournamentStage = useTournamentStore((state) => state.stage);
  const reducedMotion = useReducedMotion();
  const quality = resolveSceneQuality(scenery, reducedMotion ?? false);

  // Enquadramento do salão: nos momentos de JOGO (mesa em cena — fluxo
  // 1v1 inteiro ou partida do torneio) a foto sobe para mostrar colunas
  // e arandelas atrás da dealer, não o teto. Menu, lobby e chaveamento
  // mantêm o enquadramento original com o lustre em cena.
  const atTable = phase !== 'idle' || tournamentStage === 'match';

  if (quality === 'off') return null;

  return (
    <div
      className={`scene-ambient ${atTable ? 'scene-ambient--game' : ''}`}
      aria-hidden="true"
      data-testid="scene-ambient"
    >
      {quality === 'high' &&
        PARTICLES.map((particle, index) => (
          <span
            key={index}
            className="scene-particle"
            style={
              {
                '--x': particle.x,
                '--dur': particle.dur,
                '--delay': particle.delay,
                '--size': particle.size,
              } as CSSProperties
            }
          />
        ))}
    </div>
  );
}
