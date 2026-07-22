import type { Variants } from 'framer-motion';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import type { DieValue } from '../engine/types';
import { audioManager } from '../services/AudioManager';
import type { DiceColorId } from '../store/diceColors';
import { Die3D } from './Die3D';

export interface DiceShakerProps {
  /** Valor final do dado; `null` até a engine revelar o resultado. */
  value: DieValue | null;
  side: 'player' | 'opponent';
  /** Cor escolhida no cara-ou-coroa (repassada ao Die3D). */
  color?: DiceColorId;
  /** Fase Rolling: o copo vibra e o dado gira sem valor. */
  rolling: boolean;
  /** Fase Reveal/Completed: o copo pode parar após o seu atraso. */
  revealed: boolean;
  /** Atraso da parada deste copo na sequência dramática da revelação. */
  settleDelayMs: number;
  /** Pula a coreografia (ex.: remontagem já na fase completed). */
  forceSettled: boolean;
  /** Dessincroniza a frequência de vibração entre copos vizinhos. */
  seed: number;
  label: string;
}

/**
 * Copo vibrador da mesa de Bac Bo: um poço circular com rebordo dourado
 * que chacoalha o dado até a sua vez de parar. A parada usa uma mola
 * sub-amortecida (o copo "assenta" com um resto de tremor) e um anel de
 * brilho pulsa no rebordo para marcar o momento — o dado então tomba
 * para o valor final por conta do Die3D.
 */

const SHAKER_VARIANTS: Variants = {
  shaking: (seed: number) => ({
    x: [0, -2.4, 1.8, -1.2, 2.2, 0],
    y: [0, 1.6, -2.2, 1.2, -1.4, 0],
    rotate: [0, -0.7, 0.5, -0.4, 0.7, 0],
    transition: { duration: 0.15 + seed * 0.017, repeat: Infinity, ease: 'linear' },
  }),
  rest: {
    x: 0,
    y: 0,
    rotate: 0,
    transition: { type: 'spring', stiffness: 320, damping: 11 },
  },
};

/** O dado quica dentro do poço em contratempo com o copo. */
const DIE_BOB_VARIANTS: Variants = {
  shaking: (seed: number) => ({
    y: [0, -3, 2, -2, 1, 0],
    transition: { duration: 0.19 + seed * 0.023, repeat: Infinity, ease: 'linear' },
  }),
  rest: {
    y: 0,
    transition: { type: 'spring', stiffness: 260, damping: 14 },
  },
};

export function DiceShaker({
  value,
  side,
  color,
  rolling,
  revealed,
  settleDelayMs,
  forceSettled,
  seed,
  label,
}: DiceShakerProps) {
  const reducedMotion = useReducedMotion() ?? false;
  // Com menos movimento não há coreografia: todos param juntos.
  const delayMs = reducedMotion ? 0 : settleDelayMs;

  // Não há reset: `revealed` nunca regride dentro de uma rodada (a arena
  // desmonta entre rodadas via phaseGroup/AnimatePresence).
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => {
      setStopped(true);
      // Cada copo anuncia a PRÓPRIA parada. Antes o som saía uma única
      // vez, disparado pela store ao entrar na fase de revelação — ou
      // seja, só o primeiro dado soava e os outros três assentavam em
      // silêncio. Aqui o áudio nasce junto do anel de brilho, no mesmo
      // instante em que o dado tomba, e a coreografia inteira fica com
      // o mesmo beat: quatro paradas, quatro sinais.
      // Com movimento reduzido não há escalonamento — os quatro param
      // juntos, então só o copo que abre a sequência fala, para não
      // empilhar quatro sons no mesmo milissegundo.
      if (!reducedMotion || settleDelayMs === 0) audioManager.playSfx('reveal');
    }, delayMs);
    return () => clearTimeout(timer);
  }, [revealed, delayMs, reducedMotion, settleDelayMs]);

  const settled = forceSettled || (revealed && stopped);
  const spinning = (rolling || revealed) && !settled;
  const vibrating = spinning && !reducedMotion;

  return (
    <motion.div
      className="shaker"
      custom={seed}
      variants={SHAKER_VARIANTS}
      animate={vibrating ? 'shaking' : 'rest'}
      initial={false}
      data-testid={`shaker-${side}-${label.includes('2') ? 2 : 1}`}
    >
      <div className="shaker__well">
        <motion.div
          custom={seed}
          variants={DIE_BOB_VARIANTS}
          animate={vibrating ? 'shaking' : 'rest'}
          initial={false}
        >
          <Die3D
            value={settled ? value : null}
            side={side}
            color={color}
            rolling={spinning}
            size="calc(var(--shaker-size) * 0.42)"
            label={label}
          />
        </motion.div>
      </div>
      <motion.span
        className="shaker__flash"
        aria-hidden="true"
        initial={false}
        animate={
          settled ? { opacity: [0, 0.9, 0], scale: [0.94, 1.05, 1.1] } : { opacity: 0, scale: 0.94 }
        }
        transition={settled ? { duration: 0.8, ease: 'easeOut' } : { duration: 0 }}
      />
    </motion.div>
  );
}
