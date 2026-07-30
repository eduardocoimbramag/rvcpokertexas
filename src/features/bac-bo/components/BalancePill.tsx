import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { useEffect, useState } from 'react';

import { Icon } from '@/shared/components/Icon';
import { formatCredits, formatDelta } from '@/shared/lib/format';

import { HudPill } from './HudPill';

export interface BalancePillProps {
  /**
   * Saldo-alvo exibido. Durante a rodada o GameScreen segura este valor
   * no saldo pré-rodada (escondendo o débito do stake); no resultado ele
   * passa a ser o saldo final.
   */
  balance: number;
  /**
   * Variação líquida da rodada (netChange) no instante do resultado —
   * dispara a ficha que voa para dentro do saldo e o contador. `null`
   * (ou 0, no empate) fora do resultado: sem animação.
   */
  delta?: number | null;
}

const GAIN = '#34d399';
const LOSS = '#f87171';

/**
 * Saldo com contador animado. No resultado da rodada, uma ficha de
 * variação (+/−) sobe para dentro da pílula (verde em ganho, vermelho em
 * perda) e o número corre suavemente do saldo antigo até o novo.
 */
export function BalancePill({ balance, delta = null }: BalancePillProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const count = useMotionValue(balance);
  const rendered = useTransform(count, (value) => formatCredits(Math.round(value)));
  const [chip, setChip] = useState<number | null>(null);
  const [pulse, setPulse] = useState<'gain' | 'loss' | null>(null);

  useEffect(() => {
    // Fora do resultado: acompanha o alvo sem animar. Inclui o "hold" do
    // saldo durante a rodada — o débito do stake fica invisível. A limpeza
    // de ficha/pulso remanescentes vai num timer (evita setState síncrono
    // no corpo do effect) e cobre o retorno via "jogar de novo".
    if (!delta) {
      count.set(balance);
      const reset = window.setTimeout(() => {
        setChip(null);
        setPulse(null);
      }, 0);
      return () => window.clearTimeout(reset);
    }

    const gain = delta > 0;
    count.set(balance - delta); // saldo pré-rodada; o hold já o exibia

    if (reducedMotion) {
      count.set(balance);
      return;
    }

    // Sequência: a ficha voa para dentro (~0–0,95s), o contador começa
    // quando ela chega (~0,38s) e a pílula pulsa na cor da variação.
    let stop: (() => void) | undefined;
    const showChip = window.setTimeout(() => setChip(delta), 0);
    const startCount = window.setTimeout(() => {
      setPulse(gain ? 'gain' : 'loss');
      stop = animate(count, balance, { duration: 0.95, ease: [0.22, 0.9, 0.3, 1] }).stop;
    }, 380);
    const clearChip = window.setTimeout(() => setChip(null), 1050);
    const clearPulse = window.setTimeout(() => setPulse(null), 1550);

    return () => {
      window.clearTimeout(showChip);
      window.clearTimeout(startCount);
      window.clearTimeout(clearChip);
      window.clearTimeout(clearPulse);
      stop?.();
    };
  }, [delta, balance, count, reducedMotion]);

  // A cor vive no CONTÊINER, não no número: a ficha usa currentColor, então
  // ícone e algarismos são sempre a mesma tinta — marfim em repouso, e a
  // pílula inteira vira esmeralda/vermelha no instante da variação.
  const inkClass =
    pulse === 'gain' ? 'text-emerald-400' : pulse === 'loss' ? 'text-red-400' : 'text-ivory';

  return (
    <HudPill
      variant="value"
      className={inkClass}
      animate={pulse ? { scale: [1, 1.09, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-label={`Saldo: ${formatCredits(balance)} créditos`}
      data-testid="balance"
      leading={<Icon name="chip" size="1.05em" />}
      // A ficha da variação é ABSOLUTA sobre o centro da pílula: o lugar
      // dela no DOM não importa, e como slot da direita ela fica fora do
      // rótulo (que corta o que transborda).
      trailing={
        <AnimatePresence>
          {chip !== null && (
            <motion.span
              key="delta"
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 text-sm font-black tabular-nums"
              style={{ color: chip > 0 ? GAIN : LOSS }}
              data-testid="balance-delta"
              initial={{ y: 24, opacity: 0, scale: 0.7 }}
              animate={{ y: [24, 0, -10], opacity: [0, 1, 1, 0], scale: [0.7, 1.18, 1, 0.85] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.95, times: [0, 0.35, 0.72, 1], ease: 'easeOut' }}
            >
              {formatDelta(chip)}
            </motion.span>
          )}
        </AnimatePresence>
      }
    >
      <motion.span>{rendered}</motion.span>
    </HudPill>
  );
}
