import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

import { DIE_ROTATIONS, ROLL_EXTRA_SPINS } from '../animations/dice';
import type { DieValue } from '../engine/types';
import type { DiceColorId } from '../store/diceColors';
import { DICE_COLORS } from '../store/diceColors';

export interface Die3DProps {
  /** Valor final do dado; `null` enquanto o resultado não foi revelado. */
  value: DieValue | null;
  side: 'player' | 'opponent';
  /** Quando verdadeiro o dado gira continuamente (fase Rolling). */
  rolling: boolean;
  /** Lado do cubo como comprimento CSS (aceita calc/var para escalar
      junto com o contêiner). Default: 4rem. */
  size?: string;
  /** Cor escolhida no cara-ou-coroa; sem ela vale a cor clássica do lado. */
  color?: DiceColorId;
  label: string;
}

/** Índices preenchidos (grade 3×3) para cada valor de face. */
const PIP_LAYOUT: Record<DieValue, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const FACES: readonly { value: DieValue; className: string }[] = [
  { value: 1, className: 'die-face-front' },
  { value: 6, className: 'die-face-back' },
  { value: 3, className: 'die-face-right' },
  { value: 4, className: 'die-face-left' },
  { value: 2, className: 'die-face-top' },
  { value: 5, className: 'die-face-bottom' },
];

/**
 * Dado 3D em CSS puro (cubo com 6 faces) animado por Framer Motion.
 * O valor exibido deriva exclusivamente da engine — este componente
 * apenas gira o cubo até a face correspondente.
 */
export function Die3D({ value, side, rolling, size = '4rem', color, label }: Die3DProps) {
  const reducedMotion = useReducedMotion();
  // Cada revelação acumula voltas extras para o cubo sempre girar "para frente".
  const [settleCount, setSettleCount] = useState(0);
  const wasRolling = useRef(false);

  useEffect(() => {
    if (wasRolling.current && !rolling && value !== null) {
      setSettleCount((count) => count + 1);
    }
    wasRolling.current = rolling;
  }, [rolling, value]);

  const target = value !== null ? DIE_ROTATIONS[value] : DIE_ROTATIONS[1];
  const spins = reducedMotion ? 0 : settleCount * ROLL_EXTRA_SPINS * 360;

  const animate = rolling
    ? reducedMotion
      ? { rotateX: 0, rotateY: 0, scale: [1, 1.05, 1] }
      : { rotateX: [0, 360], rotateY: [0, -360], scale: 1 }
    : { rotateX: target.x + spins, rotateY: target.y + spins, scale: 1 };

  const transition = rolling
    ? reducedMotion
      ? { repeat: Infinity, duration: 1.2 }
      : { repeat: Infinity, duration: 0.65, ease: 'linear' as const }
    : reducedMotion
      ? { duration: 0.2 }
      : { duration: 0.9, ease: [0.22, 0.9, 0.3, 1] as const };

  const palette = color ? DICE_COLORS[color] : null;
  const sceneStyle = {
    '--die-size': size,
    ...(palette ? { '--die-color-a': palette.gradientA, '--die-color-b': palette.gradientB } : {}),
  } as CSSProperties;

  return (
    <div
      className="die-scene"
      style={sceneStyle}
      role="img"
      aria-label={`${label}: ${rolling || value === null ? 'rolando' : value}`}
    >
      <motion.div className="die-cube" animate={animate} transition={transition}>
        {FACES.map((face) => (
          <div
            key={face.value}
            className={`die-face die-face--${side} ${palette ? 'die-face--custom' : ''} ${face.className}`}
            aria-hidden="true"
          >
            {Array.from({ length: 9 }, (_, index) => (
              <span
                key={index}
                className={PIP_LAYOUT[face.value].includes(index) ? 'die-pip' : ''}
              />
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
