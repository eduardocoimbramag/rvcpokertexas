import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { formatCredits } from '@/shared/lib/format';

import type { Match } from '../engine/types';
import { useGameStore } from '../store/gameStore';

export interface ConfirmPanelProps {
  match: Match;
}

const STAMP_SPRING = { type: 'spring', stiffness: 520, damping: 16 } as const;

interface ReadySeatProps {
  avatar: string;
  name: string;
  accent: 'player' | 'opponent';
  confirmed: boolean;
  instant: boolean;
}

/**
 * Assento do duelo com estado de prontidão: enquanto espera, um aro
 * tracejado gira devagar em volta do avatar; ao confirmar, um anel
 * esmeralda se desenha, o selo ✓ carimba no canto e um flash expande.
 */
function ReadySeat({ avatar, name, accent, confirmed, instant }: ReadySeatProps) {
  const border = accent === 'player' ? 'border-player' : 'border-opponent';
  const ink = accent === 'player' ? 'text-[#1e3a8a]' : 'text-[#7f1d1d]';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {confirmed ? (
          <svg className="confirm-ring" viewBox="0 0 100 100" aria-hidden="true">
            <motion.circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="#34d399"
              strokeWidth="3.5"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              initial={instant ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={instant ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
        ) : (
          <motion.svg
            className="confirm-ring"
            viewBox="0 0 100 100"
            aria-hidden="true"
            animate={instant ? undefined : { rotate: 360 }}
            transition={instant ? undefined : { repeat: Infinity, duration: 7, ease: 'linear' }}
          >
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="rgba(203, 115, 73, 0.6)"
              strokeWidth="3"
              strokeDasharray="10 8"
              strokeLinecap="round"
            />
          </motion.svg>
        )}

        <span
          className={`grid h-20 w-20 place-items-center rounded-full border-2 ${border} bg-arena-800 text-4xl`}
        >
          {avatar}
        </span>

        <AnimatePresence>
          {confirmed && (
            <motion.span
              className="confirm-badge"
              aria-hidden="true"
              initial={instant ? false : { scale: 0, rotate: -40, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={instant ? { duration: 0 } : STAMP_SPRING}
            >
              ✓
            </motion.span>
          )}
        </AnimatePresence>

        {confirmed && !instant && (
          <motion.span
            className="confirm-flash"
            aria-hidden="true"
            initial={{ opacity: 0.9, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </div>

      <span className={`text-engraved font-black ${ink}`}>{name}</span>
    </div>
  );
}

/**
 * Fase Confirm: o duelo só começa quando os DOIS lados confirmam.
 * O jogador confirma no botão; o oponente confirma sozinho instantes
 * depois (ou antes!). Cada confirmação carimba o assento correspondente;
 * com ambos prontos, o VS flareja e a faixa "duelo confirmado" fecha o
 * pacto antes do countdown.
 */
export function ConfirmPanel({ match }: ConfirmPanelProps) {
  const confirmMatch = useGameStore((state) => state.confirmMatch);
  const declineMatch = useGameStore((state) => state.declineMatch);
  const confirmations = useGameStore((state) => state.confirmations);
  const instant = useReducedMotion() ?? false;

  const bothReady = confirmations.player && confirmations.opponent;

  return (
    <div className="flex flex-1 flex-col">
      {/* Conteúdo centralizado verticalmente no couro livre (docs/
          centralizacao.md): título, assentos e aposta ficam no meio da
          mesa, não colados no trilho. Gaps enxutos: esta é a fase mais
          alta do fluxo e precisa caber no viewport fixo mesmo em
          aparelhos baixos (o dealer-spacer cede primeiro). */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        {/* Tinta escura gravada no couro, igual ao "Escolha sua aposta". */}
        <h2 className="text-engraved text-center text-2xl font-extrabold text-[#201608]">
          {bothReady ? 'Que vença o melhor!' : 'Confirmar duelo?'}
        </h2>

        <div className="flex w-full items-center justify-around">
          <ReadySeat
            avatar="🫵"
            name="Você"
            accent="player"
            confirmed={confirmations.player}
            instant={instant}
          />

          {/* VS central: flareja quando o pacto fecha — devagar, para o
              momento ser saboreado dentro do beat de lock-in. */}
          <div className="relative grid place-items-center">
            {bothReady && !instant && (
              <motion.span
                className="absolute h-16 w-16 rounded-full border-2 border-gold"
                aria-hidden="true"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 2.6, opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.0, ease: 'easeOut', delay: 0.1 }}
              />
            )}
            <motion.span
              className="vs-mark text-3xl"
              initial={false}
              animate={bothReady && !instant ? { scale: [1, 1.4, 1.12] } : { scale: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            >
              VS
            </motion.span>
          </div>

          <ReadySeat
            avatar={match.opponent.avatar}
            name={match.opponent.name}
            accent="opponent"
            confirmed={confirmations.opponent}
            instant={instant}
          />
        </div>

        <div className="rounded-2xl border border-arena-line bg-arena-800 px-8 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-lavender">Aposta</p>
          <p className="text-2xl font-black tabular-nums text-gold">{formatCredits(match.stake)}</p>
        </div>
      </div>

      {/* pb-4 espelha a margem inferior do CTA da tela de aposta
          (docs/margemdeseguranca.md) — mesmo respiro entre ações e borda. */}
      <div className="mx-auto flex min-h-28 w-full max-w-96 flex-col justify-end gap-3 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          {bothReady ? (
            <motion.div
              key="locked"
              className="confirm-locked"
              data-testid="confirm-locked"
              role="status"
              initial={instant ? false : { opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={
                instant
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 210, damping: 22, mass: 1.1, delay: 0.15 }
              }
            >
              ⚔️ Duelo confirmado
            </motion.div>
          ) : confirmations.player ? (
            <motion.div
              key="waiting"
              className="confirm-waiting"
              data-testid="confirm-waiting"
              role="status"
              initial={instant ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <span>Aguardando {match.opponent.name}</span>
              <span className="waiting-dots" aria-hidden="true">
                <span className="waiting-dot">.</span>
                <span className="waiting-dot">.</span>
                <span className="waiting-dot">.</span>
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              className="flex flex-col gap-3"
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Button onClick={confirmMatch} size="md" fullWidth data-testid="confirm-match">
                ✅ CONFIRMAR
              </Button>
              <Button
                variant="secondary"
                onClick={declineMatch}
                size="md"
                fullWidth
                data-testid="decline-match"
              >
                RECUSAR
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
