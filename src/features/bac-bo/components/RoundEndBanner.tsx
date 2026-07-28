import { motion, useReducedMotion } from 'framer-motion';

import type { RoundOutcome, RoundResult } from '../engine/types';

export interface RoundEndBannerProps {
  result: RoundResult;
}

/* As mesmas tintas gravadas do ResultBanner — o aviso fala a língua do
   veredito final, só que em tom de "ainda não acabou". */
const ROUND_COPY: Record<RoundOutcome, { title: string; className: string }> = {
  win: { title: 'MÃO GANHA', className: 'text-[#7a4503]' },
  lose: { title: 'MÃO PERDIDA', className: 'text-[#8f1616]' },
  tie: { title: 'EMPATE', className: 'text-[#26312a]' },
};

/**
 * Aviso de mão empatada no TORNEIO: o veredito e MAIS NADA. Existe só
 * ali, porque o mata-mata não admite empate — a mesa avisa e distribui
 * de novo. No 1v1 o empate encerra a partida (devolvendo a aposta) e
 * quem fala é o ResultBanner. Vive o TIMINGS.roundEndMs.
 */
export function RoundEndBanner({ result }: RoundEndBannerProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const copy = ROUND_COPY[result.outcome];

  return (
    <motion.div
      className="relative flex flex-1 flex-col items-center pb-4"
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 260 }}
      data-testid="round-end-banner"
    >
      {/* Espaçador superior: da base das cartas até o veredito parcial. */}
      <div aria-hidden className="w-full grow" />

      <p
        className={`font-display text-engraved text-3xl font-bold tracking-wide ${copy.className}`}
        data-testid="round-verdict"
      >
        {copy.title}
      </p>

      {/* Espaçador inferior: mesmo grow do de cima → veredito centrado. */}
      <div aria-hidden className="w-full grow" />
    </motion.div>
  );
}
