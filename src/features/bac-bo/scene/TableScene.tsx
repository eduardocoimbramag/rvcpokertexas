import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

import { useGameStore } from '../store/gameStore';
import type { DealerReaction } from './dealer/DealerController';
import { Dealer } from './dealer/Dealer';
import { resolveSceneQuality } from './sceneQuality';
import { OverheadTableLayer } from './table/OverheadTableLayer';
import { TableLayer } from './table/TableLayer';

/**
 * Enquadramentos da cena:
 * - `front`: câmera padrão — dealer atrás da mesa, de frente.
 * - `overhead`: câmera vertical sobre a mesa (fases rolling/reveal) —
 *   a dealer sai de quadro e só a estrutura da mesa aparece.
 */
export type SceneCamera = 'front' | 'overhead';

export interface TableSceneProps {
  reaction: DealerReaction;
  camera?: SceneCamera;
  children: ReactNode;
}

/** Curva de "grua de câmera": acelera cedo e assenta suave. */
const CAMERA_EASE = [0.32, 0.72, 0.24, 1] as const;

/**
 * Compositor da cena (docs/scenario.md §4): dealer + mesa como pano de
 * fundo decorativo, com o conteúdo do jogo por cima. O backdrop inteiro
 * é `aria-hidden` e `pointer-events: none` — nunca interfere no jogo.
 *
 * As duas câmeras vivem em camadas cruzadas: a frontal (dealer + mesa)
 * sobe e some quando a vertical desce sobre o couro, como um único
 * movimento de grua; na volta, a dealer reaparece já reagindo ao
 * resultado. A dealer permanece montada (opacity 0) para o rig não
 * reinicializar entre cortes.
 *
 * A geometria vertical (--dealer-h, dealer-spacer) é ÚNICA para todas
 * as fases e câmeras: o corte troca o pano de fundo, nunca o layout.
 */
export function TableScene({ reaction, camera = 'front', children }: TableSceneProps) {
  const scenery = useGameStore((state) => state.settings.scenery);
  const reducedMotion = useReducedMotion();
  const quality = resolveSceneQuality(scenery, reducedMotion ?? false);

  if (quality === 'off') {
    return <div className="flex flex-1 flex-col">{children}</div>;
  }

  const overhead = camera === 'overhead';
  const cameraTransition = reducedMotion ? { duration: 0 } : { duration: 0.65, ease: CAMERA_EASE };

  return (
    <div
      className={`scene-stage relative flex flex-1 flex-col ${overhead ? 'scene-stage--overhead' : ''}`}
      data-testid="table-scene"
      data-camera={camera}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Câmera frontal: dealer de pé atrás da mesa. */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={overhead ? { opacity: 0, y: -36, scale: 1.05 } : { opacity: 1, y: 0, scale: 1 }}
          transition={cameraTransition}
        >
          <div className="dealer-slot">
            <Dealer reaction={reaction} quality={quality} />
          </div>
          <TableLayer quality={quality} />
        </motion.div>

        {/* Câmera vertical: a mesa vista de cima, em quadro cheio. */}
        <motion.div
          className="absolute inset-0"
          style={{ transformPerspective: 1200 }}
          initial={false}
          animate={
            overhead
              ? { opacity: 1, scale: 1, rotateX: 0 }
              : { opacity: 0, scale: 1.14, rotateX: 14 }
          }
          transition={cameraTransition}
        >
          <OverheadTableLayer quality={quality} />
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="dealer-spacer" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
