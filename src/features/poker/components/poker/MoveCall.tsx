import { motion } from 'framer-motion';

import { formatCredits } from '@/shared/lib/format';

import type { MoveAnnounce } from '../../store/gameStore';

export interface MoveCallProps {
  move: MoveAnnounce;
  opponentName: string;
  instant: boolean;
}

/**
 * O que a mesa anuncia de um lance, em palavras.
 *
 * O ALL-IN vem antes de tudo, e é a única leitura que substitui a ação
 * em vez de completá-la: quando alguém põe o stack inteiro no meio, o
 * quanto foi já não importa — o que importa é que não sobrou nada, e é
 * essa a notícia da mesa.
 */
function moveLabel(move: MoveAnnounce): string {
  if (move.allIn) return 'ALL-IN';
  switch (move.action) {
    case 'fold':
      return 'DESISTIU';
    case 'check':
      return 'PASSOU';
    case 'call':
      return `PAGOU ${formatCredits(move.amount)}`;
    case 'raise':
      return `APOSTOU ${formatCredits(move.to)}`;
  }
}

/**
 * O ALTO-FALANTE DA MESA: o último lance, dito por extenso na faixa
 * livre entre os dois assentos.
 *
 * Ele existe porque, sem ele, um lance do rival é só um número que mudou
 * em dois lugares da tela — o stack dele e o pote. O que aconteceu ("Luna
 * APOSTOU 240") tem de ser dito, e tem de ficar em cena tempo suficiente
 * para ser lido antes de a palavra voltar para você.
 *
 * O relógio zerado não ganha rótulo próprio: o que aconteceu na mesa foi
 * o lance, e o jogador viu o relógio zerar. Anunciar o motivo seria
 * ruído em cima da notícia.
 */
export function MoveCall({ move, opponentName, instant }: MoveCallProps) {
  const you = move.by === 'player';
  return (
    <motion.div
      key={move.id}
      className={`move-call move-call--${move.by} ${move.allIn ? 'is-allin' : ''}`}
      data-testid="move-call"
      role="status"
      initial={instant ? false : { opacity: 0, scale: 0.9, y: you ? 10 : -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 26 }}
    >
      <span className="move-call__who">{you ? 'Você' : opponentName}</span>
      <span className="move-call__what">{moveLabel(move)}</span>
    </motion.div>
  );
}
