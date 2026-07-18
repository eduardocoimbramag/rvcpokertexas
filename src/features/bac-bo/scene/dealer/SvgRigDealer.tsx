import type { TargetAndTransition, Variants } from 'framer-motion';
import { MotionConfig, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { DEALER_TIMINGS } from '../scene.timings';
import type { DealerProps, DealerReaction } from './DealerController';
import { DEALER_REACTIONS } from './DealerController';

/**
 * Dealer em rig SVG (modelo pronto em camadas — public/dealer/*.svg).
 *
 * Todas as 16 partes compartilham o mesmo canvas de cena (4000×3000),
 * já posicionadas no lugar: a montagem é o empilhamento na ordem de
 * pintura correta e o enquadramento um viewBox da cintura para cima.
 *
 * Rig: cada articulação usa o "sanduíche de translação" — um <g> leva a
 * origem ao pivô, o motion.g gira ali (com um retângulo âncora simétrico
 * que estabiliza o transform-origin) e um <g> interno devolve as camadas
 * às coordenadas de cena. Ombro e cotovelo compartilham variants de
 * ombro (segmentos rígidos entre si), e o cotovelo soma a flexão.
 */

/* ---------- Geometria medida da cena (coordenadas do canvas) ---------- */

/** Recorte da cintura para cima (a mesa cobre o restante). */
const VIEWBOX = '312 86 720 1440';
export const RIG_ASPECT = '720 / 1440';

const HEAD_PIVOT = { x: 660, y: 495 };
/** Centro real do encaixe do ombro, medido por hit-testing do fill. */
const SHOULDER = { L: { x: 469, y: 666 }, R: { x: 843, y: 666 } };
const EYES_CENTER = { x: 662, y: 363 };

const PART_BASE = `${import.meta.env.BASE_URL}dealer/`;

/* ---------- Variants ---------- */

const SPRING: TargetAndTransition['transition'] = {
  type: 'spring',
  stiffness: 140,
  damping: 17,
};

function makeVariants(
  base: TargetAndTransition,
  overrides: Partial<Record<DealerReaction, TargetAndTransition>>,
): Variants {
  const variants: Variants = {};
  for (const reaction of DEALER_REACTIONS) {
    variants[reaction] = { transition: SPRING, ...base, ...overrides[reaction] };
  }
  return variants;
}

/** Corpo inteiro (unidades da cena ≈ 3.5× px de tela): respiração e ênfases. */
const ROOT_VARIANTS = makeVariants(
  { x: 0, y: 0 },
  {
    idle: { y: [0, -12, 0], transition: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } },
    greet: { y: -8 },
    present: { y: [0, -8, 0], transition: { duration: 4.6, repeat: Infinity, ease: 'easeInOut' } },
    anticipate: {
      y: [0, -10, 0],
      transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
    },
    shake: { x: [0, -6, 6, 0], transition: { duration: 0.3, repeat: Infinity } },
    reveal: { y: 16 },
    celebrate: {
      y: [0, -26, 0],
      transition: { duration: 0.6, repeat: Infinity, ease: 'easeOut' },
    },
    console: { y: 10 },
    shrug: { y: [0, -14, 0], transition: { duration: 0.55 } },
    apologize: { y: 22 },
  },
);

/** Cabeça (e cabelo de trás, sincronizado): balanço, acenos, inclinações. */
const HEAD_VARIANTS = makeVariants(
  { rotate: 0 },
  {
    idle: {
      rotate: [0, 1.6, 0, -1.6, 0],
      transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
    },
    greet: { rotate: -6 },
    anticipate: { rotate: -2.5 },
    shake: { rotate: [1.4, -1.4, 1.4], transition: { duration: 0.3, repeat: Infinity } },
    reveal: { rotate: 5 },
    celebrate: { rotate: [-4, -1, -4], transition: { duration: 0.6, repeat: Infinity } },
    console: { rotate: 8 },
    shrug: { rotate: -4 },
    apologize: { rotate: 12 },
  },
);

/**
 * Braços RÍGIDOS: todo gesto gira o braço inteiro no ombro — braço
 * superior e antebraço+mão recebem exatamente os mesmos variants, então
 * o contorno nunca "quebra" nas articulações (a arte tem pouca
 * sobreposição nos encaixes).
 *
 * O multiplicador `s` converte o ângulo semântico "abrir" (afastar a mão
 * do corpo) para o sentido de rotação SVG: com y para baixo, rotação
 * positiva leva a mão à esquerda — abrir é positivo no braço esquerdo
 * (tela esquerda) e negativo no direito.
 */
function makeArmVariants(side: 'L' | 'R'): Variants {
  const s = side === 'L' ? 1 : -1; // multiplicador para "abrir"
  return makeVariants(
    { rotate: 0 },
    {
      idle: {
        rotate: [0, s * 1.5, 0],
        transition: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
      },
      greet:
        side === 'R'
          ? { rotate: [s * 6, s * 13, s * 6, s * 13, s * 4], transition: { duration: 1.2 } }
          : { rotate: s * 2 },
      present: { rotate: s * 9 },
      anticipate: { rotate: s * -3 },
      shake:
        side === 'R'
          ? { rotate: [s * -3, s * -8, s * -3], transition: { duration: 0.24, repeat: Infinity } }
          : { rotate: s * 2 },
      reveal: { rotate: s * 10, transition: { duration: 0.5, ease: 'easeOut' } },
      celebrate: {
        rotate: [s * 10, s * 14, s * 10],
        transition: { duration: 0.6, repeat: Infinity },
      },
      console: { rotate: side === 'R' ? s * -6 : s * 2 },
      shrug: { rotate: s * 12, transition: { type: 'spring', stiffness: 220, damping: 14 } },
      apologize: { rotate: s * -4 },
    },
  );
}

const ARM_L = makeArmVariants('L');
const ARM_R = makeArmVariants('R');

/** Abertura dos olhos por reação (squash vertical = piscar/fechar). */
const EYE_SCALE: Record<DealerReaction, number> = {
  idle: 1,
  greet: 1,
  present: 1,
  anticipate: 0.85,
  shake: 0.75,
  reveal: 1.15,
  celebrate: 1,
  console: 0.8,
  shrug: 1,
  apologize: 0.15,
};

/* ---------- Blocos de construção ---------- */

/** Camada da cena: um SVG externo pintado nas coordenadas do canvas. */
function Part({ name }: { name: string }) {
  return <image href={`${PART_BASE}${name}.svg`} x="0" y="0" width="4000" height="3000" />;
}

interface JointProps {
  x: number;
  y: number;
  variants?: Variants;
  animate?: TargetAndTransition;
  children: React.ReactNode;
}

/**
 * Articulação: leva a origem ao pivô, gira ali e devolve as camadas às
 * coordenadas de cena. O retângulo âncora (simétrico ao pivô) fixa o
 * bounding box, garantindo transform-origin exatamente no pivô.
 *
 * O rect precisa CONTER a arte transladada em qualquer pivô: a imagem de
 * 4000×3000 chega a se estender de −843 a 3531 em x. Se o bbox fosse
 * dominado pela arte de um lado só, o centro (originX/Y 0.5) sairia do
 * pivô e a peça giraria em torno do ponto errado — era exatamente isso
 * que deformava o ombro e deslocava a boca. ±4000 cobre todos os casos.
 */
function Joint({ x, y, variants, animate, children }: JointProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g
        variants={variants}
        animate={animate}
        style={{ originX: 0.5, originY: 0.5 }}
        transition={animate ? { duration: 0.09 } : undefined}
      >
        <rect x="-4000" y="-4000" width="8000" height="8000" fill="none" stroke="none" />
        <g transform={`translate(${-x} ${-y})`}>{children}</g>
      </motion.g>
    </g>
  );
}

/* ---------- Componente principal ---------- */

export function SvgRigDealer({ reaction, quality = 'high' }: Omit<DealerProps, 'variant'>) {
  const animated = quality === 'high';

  // Piscar em intervalos levemente irregulares.
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!animated) return;
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const jitter = DEALER_TIMINGS.blinkEveryMs * (0.7 + Math.random() * 0.6);
      closeTimer = setTimeout(() => {
        setBlink(true);
        openTimer = setTimeout(() => {
          setBlink(false);
          schedule();
        }, DEALER_TIMINGS.blinkMs);
      }, jitter);
    };
    schedule();
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
    };
  }, [animated]);

  const eyeScaleY = blink ? 0.1 : EYE_SCALE[reaction];

  return (
    <div className="dealer-rig" data-testid="dealer" data-reaction={reaction}>
      <MotionConfig reducedMotion={animated ? 'never' : 'always'}>
        <svg viewBox={VIEWBOX} aria-hidden="true" focusable="false">
          <motion.g variants={ROOT_VARIANTS} animate={reaction} initial={false}>
            {/* Cabelo de trás: acompanha a rotação da cabeça */}
            <Joint x={HEAD_PIVOT.x} y={HEAD_PIVOT.y} variants={HEAD_VARIANTS}>
              <Part name="backhair" />
            </Joint>

            {/* Pernas e saia (estáticas — cobertas pela mesa) */}
            <Part name="leftleg" />
            <Part name="rightleg" />
            <Part name="shirt" />

            {/* Braços superiores (pivô no ombro) */}
            <Joint x={SHOULDER.L.x} y={SHOULDER.L.y} variants={ARM_L}>
              <Part name="leftupperarm" />
            </Joint>
            <Joint x={SHOULDER.R.x} y={SHOULDER.R.y} variants={ARM_R}>
              <Part name="rightupperarm" />
            </Joint>

            {/* Corpete do vestido */}
            <Part name="top" />

            {/* Antebraços + mãos: mesmos variants do ombro → braço rígido,
                contorno contínuo (a ordem de pintura exige grupos separados,
                mas o movimento é idêntico). */}
            <Joint x={SHOULDER.L.x} y={SHOULDER.L.y} variants={ARM_L}>
              <Part name="leftforearm" />
              <Part name="lefthand" />
            </Joint>
            <Joint x={SHOULDER.R.x} y={SHOULDER.R.y} variants={ARM_R}>
              <Part name="rightforearm" />
              <Part name="righthand" />
            </Joint>

            {/* Pescoço/colo (estático) */}
            <Part name="neck" />

            {/* Cabeça: rosto, boca, olhos e franja giram juntos no pescoço.
                A boca é fixa no rosto — nenhum movimento próprio, só
                acompanha a rotação da cabeça (movimento independente lia
                como deformação). */}
            <Joint x={HEAD_PIVOT.x} y={HEAD_PIVOT.y} variants={HEAD_VARIANTS}>
              <Part name="head" />
              <Part name="mouth" />
              <Joint x={EYES_CENTER.x} y={EYES_CENTER.y} animate={{ scaleY: eyeScaleY }}>
                <Part name="eyes" />
              </Joint>
              <Part name="fronthair" />
            </Joint>
          </motion.g>
        </svg>
      </MotionConfig>
    </div>
  );
}
