import { motion, useReducedMotion } from 'framer-motion';

import type { Match } from '../engine/types';

export interface FoundSplashProps {
  match: Match;
}

/**
 * Fase Found: apresentação de duelo em três tempos, como tela de
 * matchup de jogo de luta — a placa do jogador entra pela esquerda,
 * o "VS" carimba no centro com um anel de impacto e a placa do
 * oponente responde pela direita, fechando a sequência.
 * O orçamento total é TIMINGS.foundSplashMs (a store troca de fase
 * sozinha ao fim). Com reduced motion tudo aparece de uma vez.
 */

/**
 * Tempos (s) de entrada de cada elemento dentro do splash — em ritmo
 * lento de apresentação: cada beat tem tempo de assentar antes do
 * próximo. O último beat + respiro cabem em TIMINGS.foundSplashMs.
 */
const BEATS = { kicker: 0, player: 0.35, vs: 1.15, opponent: 1.9 } as const;

const SPRING = { type: 'spring', stiffness: 220, damping: 22 } as const;

interface PlateProps {
  avatar: string;
  name: string;
  accent: 'player' | 'opponent';
  fromX: number;
  delay: number;
  instant: boolean;
}

/** Placa de apresentação: navy lapidado com aro na cor do lado. */
function DuelPlate({ avatar, name, accent, fromX, delay, instant }: PlateProps) {
  const border = accent === 'player' ? 'border-player' : 'border-opponent';
  return (
    <motion.div
      className={`flex w-[clamp(5.5rem,26vw,8rem)] flex-col items-center gap-1 rounded-2xl border-2 ${border} bg-gradient-to-b from-[#2a2133] to-[#15101c] px-3 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]`}
      initial={instant ? false : { x: fromX, opacity: 0, rotate: fromX < 0 ? -5 : 5 }}
      animate={{ x: 0, opacity: 1, rotate: 0 }}
      transition={instant ? { duration: 0 } : { ...SPRING, delay }}
    >
      <span className="text-[clamp(2.25rem,9vw,3rem)]" aria-hidden="true">
        {avatar}
      </span>
      <span className="max-w-full truncate text-sm font-black uppercase tracking-widest text-ivory">
        {name}
      </span>
    </motion.div>
  );
}

export function FoundSplash({ match }: FoundSplashProps) {
  const instant = useReducedMotion() ?? false;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6" role="status">
      <motion.p
        className="rounded-full bg-arena-900/75 px-4 py-1 text-xs font-black uppercase tracking-[0.3em] text-gold"
        initial={instant ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={instant ? { duration: 0 } : { delay: BEATS.kicker, duration: 0.45 }}
      >
        Duelo encontrado
      </motion.p>

      <div className="flex w-full items-center justify-center gap-3">
        <DuelPlate
          avatar="🫵"
          name="Você"
          accent="player"
          fromX={-90}
          delay={BEATS.player}
          instant={instant}
        />

        {/* Carimbo VS com anel de impacto */}
        <div className="relative grid place-items-center">
          <motion.span
            className="absolute h-20 w-20 rounded-full border-2 border-gold"
            initial={instant ? false : { scale: 0.3, opacity: 0 }}
            animate={instant ? { opacity: 0 } : { scale: 2.1, opacity: [0, 0.8, 0] }}
            transition={instant ? { duration: 0 } : { delay: BEATS.vs, duration: 0.8 }}
            aria-hidden="true"
          />
          <motion.span
            className="vs-mark text-[clamp(2.25rem,10vw,3rem)]"
            initial={instant ? false : { scale: 3, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            transition={
              instant
                ? { duration: 0 }
                : { delay: BEATS.vs, type: 'spring', stiffness: 340, damping: 18 }
            }
          >
            VS
          </motion.span>
        </div>

        <DuelPlate
          avatar={match.opponent.avatar}
          name={match.opponent.name}
          accent="opponent"
          fromX={90}
          delay={BEATS.opponent}
          instant={instant}
        />
      </div>
    </div>
  );
}
