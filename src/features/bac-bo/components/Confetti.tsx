import { motion, useIsPresent } from 'framer-motion';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

/* Dourados da mesa + tintas vivas de festa. */
const CONFETTI_COLORS = [
  '#f5c542',
  '#e8b04b',
  '#f7f3e8',
  '#e4572e',
  '#3d9970',
  '#4f86c6',
  '#c94277',
];

interface ConfettiPiece {
  id: number;
  leftPct: number;
  delaySec: number;
  fallSec: number;
  driftPx: number;
  spinDeg: number;
  widthPx: number;
  heightPx: number;
  color: string;
}

function buildPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    leftPct: Math.random() * 100,
    delaySec: Math.random() * 1.2,
    fallSec: 2.4 + Math.random() * 1.4,
    driftPx: (Math.random() - 0.5) * 160,
    spinDeg: (Math.random() - 0.5) * 1080,
    widthPx: 6 + Math.random() * 6,
    heightPx: 10 + Math.random() * 8,
    color: CONFETTI_COLORS[id % CONFETTI_COLORS.length] ?? '#f5c542',
  }));
}

export interface ConfettiProps {
  /** Quantidade de pedaços da rajada. */
  count?: number;
}

/**
 * Chuva de confetes em tela cheia para celebrar a vitória: uma rajada
 * única em que cada pedaço cai girando (o `scaleY` oscilando simula o
 * tombamento do papel no ar) e some perto do chão.
 *
 * Renderizada em portal no <body>: os ancestrais animados pelo Framer
 * carregam transforms que fariam o `fixed` ancorar na caixa errada.
 */
export function Confetti({ count = 56 }: ConfettiProps) {
  // Sorteado uma única vez por montagem: re-renders não reembaralham.
  const pieces = useMemo(() => buildPieces(count), [count]);
  // O portal escapa do DOM da tela, mas não do contexto React: quando o
  // AnimatePresence começa o fade de saída da tela, isPresent vira false
  // e o overlay acompanha o fade — sem isso os confetes ficariam 100%
  // opacos sobre a tela esmaecendo e sumiriam num único frame.
  const isPresent = useIsPresent();

  return createPortal(
    <motion.div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
      data-testid="confetti"
      animate={{ opacity: isPresent ? 1 : 0 }}
      transition={{ duration: 0.18 }}
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${piece.leftPct}%`,
            width: piece.widthPx,
            height: piece.heightPx,
            backgroundColor: piece.color,
          }}
          initial={{ y: '-6vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: '108vh',
            x: [0, piece.driftPx, -piece.driftPx * 0.6, piece.driftPx * 0.3],
            rotate: piece.spinDeg,
            scaleY: [1, 0.35, 1, 0.4, 1, 0.5, 1],
            opacity: [1, 1, 1, 1, 0],
          }}
          transition={{ duration: piece.fallSec, delay: piece.delaySec, ease: 'linear' }}
        />
      ))}
    </motion.div>,
    document.body,
  );
}
