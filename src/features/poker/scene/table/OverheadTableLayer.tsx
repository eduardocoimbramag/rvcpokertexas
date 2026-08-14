import { useId } from 'react';

import type { SceneQuality } from '../sceneQuality';
import { TableCrest } from './TableCrest';

export interface OverheadTableLayerProps {
  quality: Exclude<SceneQuality, 'off'>;
}

/** Insets concêntricos da moldura, do trilho para dentro. */
const LEATHER_INSET = 24;
const PINLINE_INSET = 37;
const STITCH_INSET = 46;

/**
 * Mesa vista de cima (câmera vertical da rodada de blackjack): o trilho
 * de mogno vira uma moldura em volta de todo o palco e o feltro verde
 * preenche o interior, com a mesma linguagem da mesa frontal — pinline
 * dourada, costura pespontada e grão do feltro em qualidade alta. É a
 * única camada em cena: a dealer sai do enquadramento e a mesa (mãos +
 * estampas) fica em evidência.
 */
export function OverheadTableLayer({ quality }: OverheadTableLayerProps) {
  const uid = useId();
  const feltGradId = `felt-overhead-grad-${uid}`;
  const railGradId = `rail-overhead-grad-${uid}`;
  const noiseFilterId = `felt-overhead-noise-${uid}`;
  const feltClipId = `felt-overhead-clip-${uid}`;

  return (
    <div className="scene-table-overhead" data-testid="scene-table-overhead">
      <svg viewBox="0 0 400 720" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id={feltGradId} cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="var(--color-table-500)" />
            <stop offset="55%" stopColor="var(--color-table-700)" />
            <stop offset="100%" stopColor="var(--color-table-900)" />
          </radialGradient>
          <linearGradient id={railGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-rail-700)" />
            <stop offset="30%" stopColor="var(--color-rail-900)" />
            <stop offset="100%" stopColor="#241207" />
          </linearGradient>
          {quality === 'high' && (
            <>
              <clipPath id={feltClipId}>
                <rect
                  x={LEATHER_INSET}
                  y={LEATHER_INSET}
                  width={400 - LEATHER_INSET * 2}
                  height={720 - LEATHER_INSET * 2}
                  rx="30"
                />
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

        {/* Trilho de mogno emoldurando o palco inteiro */}
        <rect x="0" y="0" width="400" height="720" fill={`url(#${railGradId})`} />
        {/* Brilho especular na quina interna do trilho */}
        <rect
          x={LEATHER_INSET - 4}
          y={LEATHER_INSET - 4}
          width={400 - (LEATHER_INSET - 4) * 2}
          height={720 - (LEATHER_INSET - 4) * 2}
          rx="33"
          fill="none"
          stroke="rgba(255, 220, 170, 0.22)"
          strokeWidth="2.5"
        />

        {/* Superfície de couro */}
        <rect
          x={LEATHER_INSET}
          y={LEATHER_INSET}
          width={400 - LEATHER_INSET * 2}
          height={720 - LEATHER_INSET * 2}
          rx="30"
          fill={`url(#${feltGradId})`}
        />
        {/* Sombra interna: o trilho projeta sombra sobre o couro */}
        <rect
          x={LEATHER_INSET + 4}
          y={LEATHER_INSET + 4}
          width={400 - (LEATHER_INSET + 4) * 2}
          height={720 - (LEATHER_INSET + 4) * 2}
          rx="27"
          fill="none"
          stroke="rgba(0, 0, 0, 0.45)"
          strokeWidth="9"
          opacity="0.6"
        />
        {/* Pinline dourada */}
        <rect
          x={PINLINE_INSET}
          y={PINLINE_INSET}
          width={400 - PINLINE_INSET * 2}
          height={720 - PINLINE_INSET * 2}
          rx="22"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1.6"
          opacity="0.55"
        />
        {/* Costura pespontada do feltro (linha verde-mata, tom sobre tom) */}
        <rect
          x={STITCH_INSET}
          y={STITCH_INSET}
          width={400 - STITCH_INSET * 2}
          height={720 - STITCH_INSET * 2}
          rx="18"
          fill="none"
          stroke="rgba(14, 46, 30, 0.6)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />

        {/* Grão do couro (ruído procedural) */}
        {quality === 'high' && (
          <rect
            x="0"
            y="0"
            width="400"
            height="720"
            clipPath={`url(#${feltClipId})`}
            filter={`url(#${noiseFilterId})`}
            opacity="0.28"
          />
        )}
      </svg>

      {/* Brasão da casa gravado no feltro, na faixa livre entre as mãos. */}
      <TableCrest camera="overhead" />

      {/* Luz zenital: poça quente sobre as cartas + vinheta nas bordas. */}
      <div className="overhead-light" />
    </div>
  );
}
