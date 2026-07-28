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
import type { Card, CardRank, CardSuit } from '../engine/types';
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
  /** A mão desta carta é um blackjack: o contorno pega fogo. */
  ablaze?: boolean;
  label: string;
}

const SUIT_LABEL: Record<CardSuit, string> = {
  spades: 'espadas',
  hearts: 'copas',
  diamonds: 'ouros',
  clubs: 'paus',
};

const RED_SUITS: readonly CardSuit[] = ['hearts', 'diamonds'];

/** Brasão da casa gravado no verso — o mesmo arquivo da marca da mesa. */
const CREST_SRC = `${import.meta.env.BASE_URL}brasaorvc.svg`;

/**
 * Carta 3D da mesa: plano de duas faces em preserve-3d. O baralho é um
 * só, então o verso é um só — o vinho borgonha do clube com filete
 * dourado e o brasão da casa no medalhão central.
 *
 * A FRENTE segue a anatomia de um baralho francês de verdade: índice de
 * canto (valor + naipe) nos dois cantos opostos e o campo de pips no
 * miolo, com a contagem e o arranjo clássicos de cada valor — inclusive
 * as cartas da metade de baixo de cabeça para baixo, como no baralho
 * impresso. Ver `PIP_LAYOUT`.
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
  ablaze = false,
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
      className={`card-scene ${ablaze ? 'card-scene--ablaze' : ''}`}
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
              <CornerIndex card={card} />
              <CornerIndex card={card} bottom />
              <CardField rank={card.rank} suit={card.suit} />
            </>
          )}
        </div>
        <div className="card3d__face card3d__face--back" aria-hidden="true">
          <span className="card3d__monogram">
            <span
              className="card3d__crest"
              style={{ '--crest-src': `url("${CREST_SRC}")` } as CSSProperties}
            />
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Índice de canto: valor em cima, naipe embaixo — os dois cantos
 * opostos da carta, o de baixo girado 180°, como num baralho impresso. */
function CornerIndex({ card, bottom = false }: { card: Card; bottom?: boolean }) {
  return (
    <span className={`card3d__corner ${bottom ? 'card3d__corner--bottom' : ''}`}>
      <span className="card3d__rank">{card.rank}</span>
      <SuitGlyph suit={card.suit} width="100%" />
    </span>
  );
}

/* ---------- Campo central: os pips ----------

   Coordenadas em fração do campo (0 = topo/esquerda, 1 = base/direita).
   As colunas são as três clássicas — esquerda, centro, direita — e as
   linhas saem do arranjo de cada valor. Um pip na METADE DE BAIXO entra
   de cabeça para baixo, exatamente como no baralho impresso: é o que
   deixa a carta legível pelos dois lados da mesa. */

const COL = { left: 0.18, center: 0.5, right: 0.82 } as const;

type Pip = readonly [x: number, y: number];

const pipsAt = (x: number, ys: readonly number[]): Pip[] => ys.map((y) => [x, y] as const);

/**
 * O arranjo canônico de cada valor. É a mesma contagem e a mesma
 * disposição de um baralho de verdade: as colunas laterais sobem de 2
 * para 4 pips conforme o valor cresce, e a coluna do centro recebe o que
 * sobra — um no 3, dois no 8, e o par intercalado do 10.
 */
const PIP_LAYOUT: Record<Exclude<CardRank, 'A' | 'J' | 'Q' | 'K'>, readonly Pip[]> = {
  '2': pipsAt(COL.center, [0, 1]),
  '3': pipsAt(COL.center, [0, 0.5, 1]),
  '4': [...pipsAt(COL.left, [0, 1]), ...pipsAt(COL.right, [0, 1])],
  '5': [...pipsAt(COL.left, [0, 1]), ...pipsAt(COL.right, [0, 1]), ...pipsAt(COL.center, [0.5])],
  '6': [...pipsAt(COL.left, [0, 0.5, 1]), ...pipsAt(COL.right, [0, 0.5, 1])],
  '7': [
    ...pipsAt(COL.left, [0, 0.5, 1]),
    ...pipsAt(COL.right, [0, 0.5, 1]),
    ...pipsAt(COL.center, [0.25]),
  ],
  '8': [
    ...pipsAt(COL.left, [0, 0.5, 1]),
    ...pipsAt(COL.right, [0, 0.5, 1]),
    ...pipsAt(COL.center, [0.25, 0.75]),
  ],
  '9': [
    ...pipsAt(COL.left, [0, 1 / 3, 2 / 3, 1]),
    ...pipsAt(COL.right, [0, 1 / 3, 2 / 3, 1]),
    ...pipsAt(COL.center, [0.5]),
  ],
  '10': [
    ...pipsAt(COL.left, [0, 1 / 3, 2 / 3, 1]),
    ...pipsAt(COL.right, [0, 1 / 3, 2 / 3, 1]),
    ...pipsAt(COL.center, [1 / 6, 5 / 6]),
  ],
};

/** Caixa do campo de pips dentro da carta, em % da face. */
const FIELD = { x: 22, y: 11, w: 56, h: 78 } as const;
/** Lado de um pip, em % da largura da FACE. Grande o bastante para o
 * naipe se ler num pip de carta de celular, e estreito o bastante para
 * a coluna da esquerda nunca esbarrar no índice de canto. */
const PIP = 17;

/**
 * O miolo da carta. Números recebem o arranjo de pips; o Ás, um único
 * naipe grande no centro (a carta mais reconhecível do baralho); e as
 * figuras, o painel de corte com a letra e os dois naipes em diagonal —
 * a leitura de uma figura sem depender de uma ilustração que, no tamanho
 * de uma carta de celular, viraria borrão.
 */
function CardField({ rank, suit }: { rank: CardRank; suit: CardSuit }) {
  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return (
      <span className="card3d__court">
        <SuitGlyph suit={suit} className="card3d__court-pip card3d__court-pip--top" />
        <span className="card3d__court-letter">{rank}</span>
        <SuitGlyph suit={suit} className="card3d__court-pip card3d__court-pip--bottom" />
      </span>
    );
  }

  if (rank === 'A') {
    return (
      <span className="card3d__ace">
        <SuitGlyph suit={suit} width="100%" />
      </span>
    );
  }

  return (
    <span className="card3d__pips">
      {PIP_LAYOUT[rank].map(([x, y], index) => (
        <span
          key={index}
          className="card3d__pip"
          style={
            {
              left: `${FIELD.x + x * FIELD.w}%`,
              top: `${FIELD.y + y * FIELD.h}%`,
              width: `${PIP}%`,
              // A metade de baixo da carta é a de cima girada — é assim
              // que ela se lê dos dois lados.
              rotate: y > 0.5 ? '180deg' : undefined,
            } as CSSProperties
          }
        >
          <SuitGlyph suit={suit} width="100%" />
        </span>
      ))}
    </span>
  );
}

/**
 * Naipes em SVG vetorial próprio (sem fonte, sem emoji): as silhuetas
 * clássicas do baralho francês em curvas de Bézier, pintadas com o
 * `currentColor` da face (vinho ou grafite). Desenhadas para aguentar o
 * tamanho de um pip de carta de celular — lóbulos bem separados e hastes
 * com peso, para o naipe continuar reconhecível a 10px.
 */
export function SuitGlyph({
  suit,
  width,
  className = '',
}: {
  suit: CardSuit;
  width?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width, display: 'block' }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {suit === 'spades' && (
        <path
          fill="currentColor"
          d="M 50 7 C 44 22 14 36 14 58 C 14 71 24 80 35 80 C 42 80 47 76 49 71 C 49 82 44 91 34 96 L 66 96 C 56 91 51 82 51 71 C 53 76 58 80 65 80 C 76 80 86 71 86 58 C 86 36 56 22 50 7 Z"
        />
      )}
      {suit === 'hearts' && (
        <path
          fill="currentColor"
          d="M 50 93 C 20 71 9 55 9 36 C 9 22 19 11 32 11 C 41 11 47 16 50 23 C 53 16 59 11 68 11 C 81 11 91 22 91 36 C 91 55 80 71 50 93 Z"
        />
      )}
      {suit === 'diamonds' && (
        <path
          fill="currentColor"
          d="M 50 5 C 54 13 68 35 88 50 C 68 65 54 87 50 95 C 46 87 32 65 12 50 C 32 35 46 13 50 5 Z"
        />
      )}
      {suit === 'clubs' && (
        <g fill="currentColor">
          <circle cx="50" cy="30" r="21" />
          <circle cx="29" cy="62" r="21" />
          <circle cx="71" cy="62" r="21" />
          <path d="M 44 57 C 46 74 42 88 32 96 L 68 96 C 58 88 54 74 56 57 Z" />
        </g>
      )}
    </svg>
  );
}
