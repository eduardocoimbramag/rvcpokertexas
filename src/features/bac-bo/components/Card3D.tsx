import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';

import {
  CARD_DEAL_FROM,
  CARD_DEAL_TO,
  CARD_FLIP_S,
  CARD_SETTLE_EASE,
  CARD_SETTLE_S,
} from '../animations/cards';
import type { Card, CardSuit } from '../engine/types';
import { audioManager } from '../services/AudioManager';

export interface Card3DProps {
  /**
   * Carta a exibir; `null` para uma carta cuja identidade a UI ainda não
   * conhece (a última do adversário, antes do showdown).
   */
  card: Card | null;
  /** Exibe o verso mesmo conhecendo a carta (a virada acontece quando
      isto vira `false` com a carta preenchida). */
  faceDown?: boolean;
  /** Largura como comprimento CSS. Default: var(--card-w). */
  size?: string;
  /** Atraso do voo de entrada na coreografia da distribuição. */
  dealDelayMs?: number;
  /** Carta de mostruário: entra sem som nem voo. */
  silent?: boolean;
  label: string;
}

const SUIT_LABEL: Record<CardSuit, string> = {
  spades: 'espadas',
  hearts: 'copas',
  diamonds: 'ouros',
  clubs: 'paus',
};

const RED_SUITS: readonly CardSuit[] = ['hearts', 'diamonds'];

/**
 * Carta 3D da mesa: plano de duas faces em preserve-3d. O baralho é um
 * só, então o verso é um só — o vinho borgonha do clube com filete
 * dourado, igual para os dois duelistas (quem é dono da mão se lê pela
 * posição na mesa, não pela cor).
 *
 * O voo de entrada sai do baralho (acima da mesa) com stagger por carta;
 * a virada gira o plano em rotateY. O som de cada carta nasce AQUI, no
 * instante em que ela assenta — não no store — para a coreografia
 * inteira ter um beat por carta.
 */
export function Card3D({
  card,
  faceDown = false,
  size,
  dealDelayMs = 0,
  silent = false,
  label,
}: Card3DProps) {
  const reducedMotion = useReducedMotion() ?? false;
  // Com menos movimento não há coreografia: todas assentam juntas.
  const delayMs = reducedMotion ? 0 : dealDelayMs;

  // Um som por assentamento e um por virada — nunca re-tocados em
  // re-renders (a carta não "assenta de novo" quando um vizinho muda).
  useEffect(() => {
    if (silent) return;
    const timer = setTimeout(() => {
      // Com movimento reduzido todas pousam juntas: só a primeira fala,
      // para não empilhar quatro sons no mesmo milissegundo.
      if (!reducedMotion || dealDelayMs === 0) audioManager.playSfx('cardFlip');
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na entrada
  }, []);

  const wasFaceDown = useRef(faceDown);
  useEffect(() => {
    if (wasFaceDown.current && !faceDown) {
      // A virada da carta oculta — o momento clássico do showdown.
      audioManager.playSfx('cardFlip');
    }
    wasFaceDown.current = faceDown;
  }, [faceDown]);

  const sceneStyle = (size ? { '--card-size': size } : {}) as CSSProperties;

  const red = card ? RED_SUITS.includes(card.suit) : false;
  const shownLabel = faceDown || !card ? 'carta oculta' : `${card.rank} de ${SUIT_LABEL[card.suit]}`;

  return (
    <motion.div
      className="card-scene"
      style={sceneStyle}
      role="img"
      aria-label={`${label}: ${shownLabel}`}
      initial={reducedMotion || silent ? false : CARD_DEAL_FROM}
      animate={CARD_DEAL_TO}
      transition={
        reducedMotion || silent
          ? { duration: 0 }
          : { duration: CARD_SETTLE_S, delay: delayMs / 1000, ease: CARD_SETTLE_EASE }
      }
    >
      <motion.div
        className="card3d"
        // A carta VOA DE VERSO (como sai de um baralho real) e vira ao
        // assentar. A oculta simplesmente não vira (o alvo continua
        // 180°) até o showdown.
        initial={reducedMotion || silent ? false : { rotateY: 180 }}
        animate={{ rotateY: faceDown || !card ? 180 : 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: CARD_FLIP_S, ease: CARD_SETTLE_EASE, delay: delayMs / 1000 + 0.25 }
        }
      >
        <div
          className={`card3d__face card3d__face--front ${red ? 'card3d--red' : 'card3d--black'}`}
          aria-hidden="true"
        >
          {card && (
            <>
              <span className="card3d__corner">
                {card.rank}
                <SuitGlyph suit={card.suit} width="58%" />
              </span>
              <span className="card3d__corner card3d__corner--bottom">
                {card.rank}
                <SuitGlyph suit={card.suit} width="58%" />
              </span>
              <span className="card3d__pip">
                <SuitGlyph suit={card.suit} width="100%" />
              </span>
            </>
          )}
        </div>
        <div className="card3d__face card3d__face--back" aria-hidden="true">
          <span className="card3d__monogram">RVC</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Naipes em SVG vetorial próprio (sem fonte, sem emoji): silhuetas
 * clássicas de baralho francês desenhadas em curvas de Bézier, pintadas
 * com o `currentColor` da face (vinho ou grafite).
 */
export function SuitGlyph({ suit, width = '1em' }: { suit: CardSuit; width?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width, display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      {suit === 'spades' && (
        <path
          fill="currentColor"
          d="M50 4 C36 26 13 40 13 60 C13 74 25 83 37 79 C42 77 46 74 48 70 C47 80 43 88 36 95 L64 95 C57 88 53 80 52 70 C54 74 58 77 63 79 C75 83 87 74 87 60 C87 40 64 26 50 4 Z"
        />
      )}
      {suit === 'hearts' && (
        <path
          fill="currentColor"
          d="M50 93 C22 70 8 53 8 34 C8 20 19 9 32 9 C40 9 47 13 50 20 C53 13 60 9 68 9 C81 9 92 20 92 34 C92 53 78 70 50 93 Z"
        />
      )}
      {suit === 'diamonds' && <path fill="currentColor" d="M50 3 L88 50 L50 97 L12 50 Z" />}
      {suit === 'clubs' && (
        <g fill="currentColor">
          <circle cx="50" cy="27" r="19" />
          <circle cx="28" cy="56" r="19" />
          <circle cx="72" cy="56" r="19" />
          <path d="M45 60 C47 74 43 85 36 95 L64 95 C57 85 53 74 55 60 Z" />
        </g>
      )}
    </svg>
  );
}
