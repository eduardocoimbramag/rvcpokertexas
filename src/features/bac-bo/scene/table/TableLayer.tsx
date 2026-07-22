import { useId } from 'react';

import type { SceneQuality } from '../sceneQuality';
import { TableCrest } from './TableCrest';

export interface TableLayerProps {
  quality: Exclude<SceneQuality, 'off'>;
}

/** Altura do viewBox — referência para normalizar a curva do couro. */
const TABLE_H = 480;
/** Borda superior do couro nas laterais e no ápice da curva. */
const FELT_EDGE_Y = 118;
const FELT_APEX_Y = 34;

/** Curva do rebordo externo (trilho de mogno). */
const RAIL_PATH = 'M 0 96 Q 200 8 400 96 L 400 480 L 0 480 Z';
/** Curva da superfície de couro, inserida dentro do trilho. */
const FELT_PATH = `M 0 ${FELT_EDGE_Y} Q 200 ${FELT_APEX_Y} 400 ${FELT_EDGE_Y} L 400 ${TABLE_H} L 0 ${TABLE_H} Z`;
/**
 * A MESMA curva do couro em unidades 0–1 (`objectBoundingBox`): é o que
 * permite recortar a marca d'água — um elemento HTML sobreposto — pelo
 * contorno curvo da mesa, sem repetir números mágicos.
 */
const FELT_CLIP_UNIT_PATH = `M 0 ${FELT_EDGE_Y / TABLE_H} Q 0.5 ${FELT_APEX_Y / TABLE_H} 1 ${FELT_EDGE_Y / TABLE_H} L 1 1 L 0 1 Z`;
/** Linha dourada decorativa acompanhando a borda do couro. */
const PINLINE_PATH = 'M 0 126 Q 200 44 400 126';
/** Costura pespontada do couro, logo abaixo da pinline. */
const STITCH_PATH = 'M 0 134 Q 200 52 400 134';

/**
 * Camada 10 — mesa de Bac Bo em couro cáqui (a mesma superfície onde os
 * poços de dados são rebaixados — mesa e poços são uma peça só).
 * Couro + trilho de mogno + pinline dourada + costura, tudo em SVG
 * vetorial com gradientes. O grão do couro (ruído) só em qualidade alta,
 * e o brasão da casa prensado no couro (TableCrest) em qualquer uma.
 */
export function TableLayer({ quality }: TableLayerProps) {
  const uid = useId();
  const feltGradId = `felt-grad-${uid}`;
  const railGradId = `rail-grad-${uid}`;
  const noiseFilterId = `felt-noise-${uid}`;
  const feltClipId = `felt-clip-${uid}`;
  const crestClipId = `crest-clip-${uid}`;

  return (
    <div className="scene-table" data-testid="scene-table">
      <svg viewBox="0 0 400 480" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id={feltGradId} cx="50%" cy="18%" r="95%">
            <stop offset="0%" stopColor="var(--color-table-500)" />
            <stop offset="55%" stopColor="var(--color-table-700)" />
            <stop offset="100%" stopColor="var(--color-table-900)" />
          </radialGradient>
          <linearGradient id={railGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-rail-700)" />
            <stop offset="18%" stopColor="var(--color-rail-900)" />
            <stop offset="100%" stopColor="#241207" />
          </linearGradient>
          {/* Recorte da marca d'água pelo contorno do couro. */}
          <clipPath id={crestClipId} clipPathUnits="objectBoundingBox">
            <path d={FELT_CLIP_UNIT_PATH} />
          </clipPath>
          {quality === 'high' && (
            <>
              <clipPath id={feltClipId}>
                <path d={FELT_PATH} />
              </clipPath>
              <filter id={noiseFilterId}>
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.9"
                  numOctaves="2"
                  stitchTiles="stitch"
                />
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"
                />
              </filter>
            </>
          )}
        </defs>

        {/* Trilho de mogno */}
        <path d={RAIL_PATH} fill={`url(#${railGradId})`} />
        {/* Brilho especular no topo do trilho */}
        <path
          d="M 0 96 Q 200 8 400 96"
          fill="none"
          stroke="rgba(255, 220, 170, 0.28)"
          strokeWidth="3"
        />

        {/* Superfície de couro */}
        <path d={FELT_PATH} fill={`url(#${feltGradId})`} />
        {/* Sombra interna: o trilho projeta sombra sobre o couro */}
        <path
          d="M 0 118 Q 200 34 400 118"
          fill="none"
          stroke="rgba(0, 0, 0, 0.45)"
          strokeWidth="10"
          opacity="0.6"
        />
        {/* Pinline dourada */}
        <path
          d={PINLINE_PATH}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1.6"
          opacity="0.55"
        />
        {/* Costura pespontada do couro */}
        <path
          d={STITCH_PATH}
          fill="none"
          stroke="rgba(90, 64, 34, 0.55)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />

        {/* Grão do couro (ruído procedural) */}
        {quality === 'high' && (
          <rect
            x="0"
            y="0"
            width="400"
            height="480"
            clipPath={`url(#${feltClipId})`}
            filter={`url(#${noiseFilterId})`}
            opacity="0.28"
          />
        )}
      </svg>

      {/* Brasão da casa prensado no couro, deitado na curva da mesa. */}
      <TableCrest camera="front" clipPath={`url(#${crestClipId})`} />
    </div>
  );
}
