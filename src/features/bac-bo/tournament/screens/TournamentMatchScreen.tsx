import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';

import { COUNTDOWN_START, TIMINGS } from '../../animations/timings';
import { CountdownOverlay } from '../../components/CountdownOverlay';
import { DiceArena } from '../../components/DiceArena';
import { FoundSplash } from '../../components/FoundSplash';
import { TableScene } from '../../scene/TableScene';
import type { SceneCamera } from '../../scene/TableScene';
import type { DealerReaction } from '../../scene/dealer/DealerController';
import type { GamePhase } from '../../store/gameStore';
import { useTournamentStore } from '../tournamentStore';

type LocalPhase = 'intro' | 'countdown' | 'rolling' | 'reveal' | 'completed';

function cameraFor(phase: LocalPhase): SceneCamera {
  return phase === 'rolling' || phase === 'reveal' ? 'overhead' : 'front';
}

/**
 * Partida do torneio: reusa exatamente a mesma mesa, dados e ritmo do 1v1.
 * Toda partida abre com a MESMA apresentação de duelo do 1v1 (Você → VS →
 * adversário), depois countdown → giro → revelação → resultado. Ao
 * terminar, grava o placar e oferece o retorno ao chaveamento.
 */
export function TournamentMatchScreen() {
  const activeMatch = useTournamentStore((s) => s.activeMatch);
  const finishMyMatch = useTournamentStore((s) => s.finishMyMatch);
  const backToBracket = useTournamentStore((s) => s.backToBracket);
  const reducedMotion = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<LocalPhase>('intro');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const recorded = useRef(false);

  // Máquina de fases local: apresentação de duelo + os MESMOS tempos do 1v1.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    const introMs = TIMINGS.foundSplashMs;
    at(() => setPhase('countdown'), introMs);

    let elapsed = introMs;
    for (let value = COUNTDOWN_START; value >= 1; value -= 1) {
      const v = value;
      at(() => setCountdown(v), elapsed);
      elapsed += TIMINGS.countdownTickMs;
    }
    at(() => setPhase('rolling'), elapsed);
    at(() => setPhase('reveal'), elapsed + TIMINGS.rollingMs);
    at(() => setPhase('completed'), elapsed + TIMINGS.rollingMs + TIMINGS.revealMs);

    return () => timers.forEach(clearTimeout);
  }, []);

  // Grava o resultado no chaveamento assim que a mesa termina de revelar.
  useEffect(() => {
    if (phase === 'completed' && !recorded.current) {
      recorded.current = true;
      finishMyMatch();
    }
  }, [phase, finishMyMatch]);

  if (!activeMatch) return null;

  const { match, result, youWin } = activeMatch;
  const reaction: DealerReaction =
    phase === 'intro'
      ? 'greet'
      : phase === 'countdown'
        ? 'anticipate'
        : phase === 'rolling'
          ? 'shake'
          : phase === 'reveal'
            ? 'reveal'
            : youWin
              ? 'celebrate'
              : 'console';

  return (
    <main className="flex flex-1 flex-col px-6 py-4">
      <header className="mb-4 flex items-center justify-center">
        <span className="rounded-full bg-arena-900/75 px-4 py-1 text-xs font-black uppercase tracking-[0.3em] text-gold">
          Partida do torneio
        </span>
      </header>

      <TableScene reaction={reaction} camera={cameraFor(phase)}>
        <AnimatePresence mode="wait">
          {phase === 'intro' ? (
            <motion.div
              key="intro"
              className="flex flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FoundSplash match={match} />
            </motion.div>
          ) : phase === 'countdown' ? (
            <motion.div
              key="countdown"
              className="flex flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CountdownOverlay value={countdown} />
            </motion.div>
          ) : (
            <motion.div
              key="arena"
              className="flex flex-1 flex-col justify-between gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DiceArena phase={phase as GamePhase} match={match} result={result} />
              {phase === 'completed' && (
                <motion.div
                  className="relative flex flex-col items-center gap-2 pb-4"
                  initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                >
                  <p
                    className={`font-display text-engraved text-4xl font-bold tracking-wide ${youWin ? 'text-[#7a4503]' : 'text-[#8f1616]'}`}
                    data-testid="tournament-result-title"
                  >
                    {youWin ? 'VITÓRIA!' : 'DERROTA'}
                  </p>
                  <p className="text-engraved text-sm font-extrabold text-[#33261a]">
                    {youWin ? 'Você avança de fase' : 'Fim da sua caminhada'}
                  </p>
                  <div className="action-stack mt-1">
                    <Button onClick={backToBracket} size="md" fullWidth data-testid="back-to-bracket">
                      🏆 VOLTAR AO CHAVEAMENTO
                    </Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </TableScene>
    </main>
  );
}
