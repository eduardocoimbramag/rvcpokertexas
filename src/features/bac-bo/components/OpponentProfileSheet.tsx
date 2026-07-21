import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useId, useRef } from 'react';

import type { Opponent } from '../engine/types';
import type { Achievement } from './opponentProfile';
import { RARITY_RING, buildOpponentProfile } from './opponentProfile';

export interface OpponentProfileSheetProps {
  open: boolean;
  opponent: Opponent;
  onClose: () => void;
}

/**
 * Perfil do adversário no estilo Discord, aberto POR CIMA da tela de
 * confirmação (que continua ativa atrás, apenas escurecida).
 *
 * Layout enxuto: à esquerda o avatar, nome, @user e nível, mais duas
 * ações compactas em ícone — "adicionar amigo" (círculo com +) e
 * "denunciar" (círculo vermelho com bandeira). À direita, os 4 selos de
 * conquista empilhados na vertical (sem painel nem rótulos).
 *
 * Segue o manual de marca (Royal VIP Club): fundo vinho borgonha, aro na
 * cor do oponente (vermelho), dourado âmbar nos destaques e marfim/taupe
 * no texto. Conteúdo ILUSTRATIVO (ver opponentProfile.ts).
 */
export function OpponentProfileSheet({ open, opponent, onClose }: OpponentProfileSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const instant = useReducedMotion() ?? false;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const profile = buildOpponentProfile(opponent);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Escurece a tela de confirmação (que segue montada atrás). */}
          <motion.div
            className="absolute inset-0 bg-black/72"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-testid="opponent-profile"
            className="profile-card relative w-full max-w-[380px] outline-none"
            initial={instant ? false : { opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={instant ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={instant ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Fechar (X) no canto superior direito. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar perfil"
              data-testid="profile-close"
              className="profile-close"
            >
              ✕
            </button>

            <div className="flex gap-4 p-5">
              {/* Coluna esquerda: identidade + ações. */}
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <span className="profile-avatar" aria-hidden="true">
                  {opponent.avatar}
                </span>

                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 id={titleId} className="truncate text-xl font-black tracking-wide text-ivory">
                    {opponent.name}
                  </h2>
                  <p className="truncate text-sm font-semibold text-lavender">{profile.username}</p>
                  <p
                    className="mt-1 text-xs font-black uppercase tracking-widest text-gold"
                    data-testid="profile-level"
                  >
                    Nível {profile.level}
                  </p>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="profile-action profile-action--friend"
                    aria-label={`Adicionar ${opponent.name} como amigo`}
                    data-testid="profile-add-friend"
                  >
                    <span className="profile-action__glyph" aria-hidden="true">
                      👤
                    </span>
                    <span className="profile-action__plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                  <button
                    type="button"
                    className="profile-action profile-action--report"
                    aria-label={`Denunciar ${opponent.name}`}
                    data-testid="profile-report"
                  >
                    🚩
                  </button>
                </div>
              </div>

              {/* Coluna direita: 4 selos empilhados na vertical. O pt-8
                  abre espaço para o botão de fechar (X) não sobrepor o
                  primeiro selo. */}
              <div className="flex flex-col gap-2.5 pt-8" data-testid="profile-badges">
                {profile.showcased.map((achievement) => (
                  <BadgeChip key={achievement.id} achievement={achievement} />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Selo estampado: apenas o ícone com aro na cor da raridade. */
function BadgeChip({ achievement }: { achievement: Achievement }) {
  const ring = RARITY_RING[achievement.rarity];
  return (
    <span
      className="profile-badge"
      style={{ boxShadow: `0 0 0 2px ${ring}, 0 0 12px ${ring}55` }}
      title={`${achievement.name} — ${achievement.description}`}
      aria-hidden="true"
    >
      {achievement.icon}
    </span>
  );
}
