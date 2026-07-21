import { motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { formatCredits } from '@/shared/lib/format';

import { tournamentPot, tournamentSelectors, useTournamentStore } from '../tournamentStore';

/** Coroação do torneio: campeão (você ou um bot) + retorno ao início. */
export function ChampionScreen() {
  const champion = useTournamentStore(tournamentSelectors.champion);
  const stake = useTournamentStore((s) => s.stake);
  const size = useTournamentStore((s) => s.size);
  const leave = useTournamentStore((s) => s.leaveTournament);
  const reducedMotion = useReducedMotion() ?? false;

  if (!champion) return null;
  const youWon = champion.id === tournamentSelectors.youId;
  const pot = tournamentPot(stake, size);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <motion.p
        className="text-xs font-black uppercase tracking-[0.4em] text-copper"
        initial={reducedMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Royal VIP Club · Torneio
      </motion.p>

      <motion.div
        className="my-6 grid place-items-center"
        initial={reducedMotion ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 14, delay: 0.15 }}
      >
        <span className="champion-trophy" aria-hidden="true">
          🏆
        </span>
      </motion.div>

      <motion.h1
        className="font-display text-5xl font-bold tracking-wide text-gold [text-shadow:0_4px_20px_rgba(0,0,0,0.5)]"
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {youWon ? 'VOCÊ É O CAMPEÃO!' : 'CAMPEÃO'}
      </motion.h1>

      <motion.div
        className="mt-3 flex items-center gap-3 rounded-full border border-arena-line bg-arena-800 px-6 py-3"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45 }}
      >
        <span className="text-3xl" aria-hidden="true">
          {champion.avatar}
        </span>
        <span className="text-lg font-black tracking-wide text-ivory">{champion.name}</span>
      </motion.div>

      <motion.p
        className="mt-4 text-sm font-bold text-lavender"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        data-testid="champion-prize"
      >
        {youWon ? (
          <>
            Você levou o prêmio de{' '}
            <span className="font-black text-gold">{formatCredits(pot)} créditos</span>
          </>
        ) : (
          <>
            Prêmio: <span className="font-black text-gold">{formatCredits(pot)} créditos</span>
          </>
        )}
      </motion.p>

      <div className="action-stack mt-10">
        <Button onClick={leave} size="md" fullWidth data-testid="champion-home">
          VOLTAR AO INÍCIO
        </Button>
      </div>
    </main>
  );
}
