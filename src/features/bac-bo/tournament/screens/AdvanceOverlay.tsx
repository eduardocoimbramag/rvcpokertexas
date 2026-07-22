import { motion } from 'framer-motion';

import { AvatarBadge } from '../../components/AvatarBadge';
import type { TournamentPlayer } from '../types';

export interface AdvanceOverlayProps {
  you: TournamentPlayer;
  opponent: TournamentPlayer | null;
  phaseLabel: string;
}

/**
 * Avanço de fase: o "personagem + nome" do jogador sobe seguindo um rastro
 * dourado e é absorvido pela célula da próxima fase, que acende revelando
 * o novo confronto. Puramente visual — o store já promoveu o jogador.
 */
export function AdvanceOverlay({ you, opponent, phaseLabel }: AdvanceOverlayProps) {
  return (
    <motion.div
      className="advance-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      data-testid="advance-overlay"
    >
      <motion.p
        className="advance-kicker"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        Você avança para
      </motion.p>
      <motion.p
        className="advance-phase"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 320, damping: 18 }}
      >
        {phaseLabel}
      </motion.p>

      <div className="advance-track">
        {/* Célula-destino da próxima fase — acende quando o token chega. */}
        <motion.div
          className="advance-cell"
          initial={{ opacity: 0.25, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.05, type: 'spring', stiffness: 300, damping: 20 }}
        >
          <div className="advance-cell__seat advance-cell__seat--you">
            <AvatarBadge name={you.name} you className="text-[0.8rem]" />
            <span className="advance-cell__name">{you.name}</span>
          </div>
          <div className="advance-cell__vs">VS</div>
          <div className="advance-cell__seat">
            {opponent ? (
              <AvatarBadge name={opponent.name} className="text-[0.8rem]" />
            ) : (
              <span aria-hidden="true">·</span>
            )}
            <span className="advance-cell__name">{opponent?.name ?? 'A definir'}</span>
          </div>
        </motion.div>

        {/* Rastro dourado sendo desenhado de baixo para cima. */}
        <motion.div
          className="advance-trail"
          aria-hidden="true"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: [0, 1, 0.6] }}
          transition={{ duration: 1, ease: 'easeInOut', delay: 0.2 }}
        />

        {/* Token do jogador subindo o rastro até a célula. */}
        <motion.div
          className="advance-token"
          style={{ left: '50%' }}
          initial={{ x: '-50%', y: 210, opacity: 0, scale: 0.6 }}
          animate={{
            x: '-50%',
            y: [210, 6, 6],
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1.12, 1, 0.9],
          }}
          transition={{ duration: 1.15, times: [0, 0.55, 0.85, 1], ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
        >
          <span className="advance-token__streak" aria-hidden="true" />
          <span className="advance-token__avatar" aria-hidden="true">
            <AvatarBadge name={you.name} you className="text-[0.85rem]" />
          </span>
          <span className="advance-token__name">{you.name}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
