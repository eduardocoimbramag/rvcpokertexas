import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import type { Match } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import { Monogram } from './AvatarBadge';
import { OpponentProfileSheet } from './OpponentProfileSheet';
import { PhaseTitle } from './PhaseTitle';

export interface ConfirmPanelProps {
  match: Match;
}

const STAMP_SPRING = { type: 'spring', stiffness: 520, damping: 16 } as const;

interface ReadySeatProps {
  name: string;
  accent: 'player' | 'opponent';
  confirmed: boolean;
  instant: boolean;
  /** Se definido, o avatar vira um botão que abre o perfil (oponente). */
  onOpenProfile?: () => void;
}

/**
 * Assento do duelo com estado de prontidão: enquanto espera, um aro
 * tracejado gira devagar em volta do avatar; ao confirmar, um anel
 * esmeralda se desenha, o selo de visto carimba no canto e um flash
 * expande. A identidade é o monograma do jogador (AvatarBadge).
 */
function ReadySeat({ name, accent, confirmed, instant, onOpenProfile }: ReadySeatProps) {
  const border = accent === 'player' ? 'border-player' : 'border-opponent';
  const ink = accent === 'player' ? 'text-[#1e3a8a]' : 'text-[#7f1d1d]';

  // O avatar do oponente é clicável (abre o perfil); o do jogador é
  // estático. Mesmo visual nos dois — só o oponente ganha o affordance
  // de toque (cursor, tap-scale e rótulo acessível).
  const avatarClass = `grid h-20 w-20 place-items-center rounded-full border-2 ${border} bg-arena-800 text-4xl`;
  const face = <Monogram name={name} you={accent === 'player'} />;

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

        {onOpenProfile ? (
          <motion.button
            type="button"
            onClick={onOpenProfile}
            whileTap={instant ? undefined : { scale: 0.92 }}
            aria-label={`Ver perfil de ${name}`}
            data-testid="opponent-avatar-button"
            className={`${avatarClass} cursor-pointer transition-shadow hover:shadow-[0_0_0_3px_rgba(245,183,111,0.55)] focus-visible:shadow-[0_0_0_3px_rgba(245,183,111,0.7)] focus-visible:outline-none`}
          >
            {face}
          </motion.button>
        ) : (
          <span className={avatarClass}>{face}</span>
        )}

        <AnimatePresence>
          {confirmed && (
            <motion.span
              className="confirm-badge"
              aria-hidden="true"
              initial={instant ? false : { scale: 0, rotate: -40, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={instant ? { duration: 0 } : STAMP_SPRING}
            >
              <Icon name="check" size={14} strokeWidth={3} />
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
      {onOpenProfile && (
        <button
          type="button"
          onClick={onOpenProfile}
          className="text-[10px] font-bold uppercase tracking-wider text-[#7f1d1d]/70 underline decoration-dotted underline-offset-2 active:brightness-125"
          data-testid="opponent-profile-hint"
        >
          ver perfil
        </button>
      )}
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
  // Perfil do oponente: estado LOCAL de UI. Abre por cima da tela de
  // confirmação (que segue montada e ativa atrás). Não toca no store
  // nem na máquina de estados — fechar o perfil devolve o foco à mesa.
  const [profileOpen, setProfileOpen] = useState(false);

  const bothReady = confirmations.player && confirmations.opponent;

  return (
    <div className="flex flex-1 flex-col">
      {/* Conteúdo centralizado verticalmente no couro livre (docs/
          centralizacao.md): título, assentos e aposta ficam no meio da
          mesa, não colados no trilho. Gaps enxutos: esta é a fase mais
          alta do fluxo e precisa caber no viewport fixo mesmo em
          aparelhos baixos (o dealer-spacer cede primeiro). */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <PhaseTitle>{bothReady ? 'Que vença o melhor!' : 'Confirmar duelo?'}</PhaseTitle>

        <div className="flex w-full items-center justify-around">
          <ReadySeat
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
            name={match.opponent.name}
            accent="opponent"
            confirmed={confirmations.opponent}
            instant={instant}
            onOpenProfile={() => setProfileOpen(true)}
          />
        </div>

        <div className="rounded-2xl border border-arena-line bg-arena-800 px-8 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-lavender">Aposta</p>
          <p className="text-2xl font-black tabular-nums text-gold">{formatCredits(match.stake)}</p>
        </div>
      </div>

      {/* Mesma faixa de segurança do CTA da tela de aposta
          (docs/margemdeseguranca.md): w-[min(100%,80vw)] + max-w-96 +
          mx-auto = ~10% lateral no mobile, teto de 24rem no desktop; pb-4
          espelha o respiro inferior. Antes usava w-full e vazava até o
          px-6 do <main>, ignorando a margem lateral. */}
      <div className="mx-auto flex min-h-28 w-[min(100%,80vw)] max-w-96 flex-col justify-end gap-3 pb-4">
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
              <span className="inline-flex items-center gap-2">
                <Icon name="swords" /> Duelo confirmado
              </span>
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
              // gap-1.5 (0.375rem = 6px): mesmo respiro compacto entre as
              // ações do desfecho (ResultBanner .action-stack--tight),
              // metade do gap-3 padrão — Confirmar e Recusar mais juntos.
              className="flex flex-col gap-1.5"
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Button onClick={confirmMatch} size="md" fullWidth data-testid="confirm-match">
                <Icon name="check" strokeWidth={2.4} /> CONFIRMAR
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

      {/* Perfil do oponente por cima da mesa de confirmação. */}
      <OpponentProfileSheet
        open={profileOpen}
        opponent={match.opponent}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}
