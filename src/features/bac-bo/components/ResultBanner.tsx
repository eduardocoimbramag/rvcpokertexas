import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { formatDelta } from '@/shared/lib/format';

import type { RoundOutcome, RoundResult } from '../engine/types';
import { useGameStore } from '../store/gameStore';

export interface ResultBannerProps {
  result: RoundResult;
}

/* Tintas escuras e saturadas: o banner assenta sobre o couro claro. */
const OUTCOME_COPY: Record<RoundOutcome, { title: string; className: string }> = {
  win: { title: '🏆 VITÓRIA!', className: 'text-[#7a4503]' },
  lose: { title: '💥 DERROTA', className: 'text-[#8f1616]' },
  tie: { title: '🤝 EMPATE', className: 'text-[#3d372f]' },
};

/** Fase Completed: veredito da rodada, variação de saldo e próximas ações. */
export function ResultBanner({ result }: ResultBannerProps) {
  const playAgain = useGameStore((state) => state.playAgain);
  const goHome = useGameStore((state) => state.goHome);
  const reducedMotion = useReducedMotion();

  const copy = OUTCOME_COPY[result.outcome];

  return (
    <motion.div
      className="relative flex flex-col items-center gap-0.5 pb-2"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 260 }}
    >
      {result.outcome === 'win' && !reducedMotion && <WinParticles />}

      <p
        className={`text-engraved text-3xl font-black ${copy.className}`}
        data-testid="result-title"
      >
        {copy.title}
      </p>
      <p
        className="text-engraved text-lg font-extrabold tabular-nums text-[#33261a]"
        data-testid="result-delta"
      >
        {result.outcome === 'tie'
          ? 'Aposta devolvida'
          : `${formatDelta(result.netChange)} créditos`}
      </p>

      <div className="action-stack mt-2">
        <Button onClick={playAgain} size="md" fullWidth data-testid="play-again">
          🎲 JOGAR DE NOVO
        </Button>
        <Button variant="secondary" onClick={goHome} size="md" fullWidth data-testid="go-home">
          Início
        </Button>
      </div>
    </motion.div>
  );
}

/** Partículas douradas discretas para a vitória. */
function WinParticles() {
  return (
    <div className="pointer-events-none absolute -top-8 left-1/2" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            className="absolute h-2 w-2 rounded-full bg-gold"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * 90,
              y: Math.sin(angle) * 60 - 30,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: index * 0.02 }}
          />
        );
      })}
    </div>
  );
}
