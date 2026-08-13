import type { TargetAndTransition, Variants } from 'framer-motion';
import { MotionConfig, motion } from 'framer-motion';
import { useEffect, useId, useMemo, useState } from 'react';

import { DEALER_TIMINGS } from '../scene.timings';
import type { DealerProps, DealerReaction } from './DealerController';
import { DEALER_REACTIONS } from './DealerController';
import type { IdleBeat } from './dealerBeats';
import { useIdleBeat } from './dealerBeats';
import type { DealerFace } from './dealerExpression';
import { faceForReaction, tearsForReaction } from './dealerExpression';
import type { RigPart } from './dealerRig';
import { CORTE_CABECA, CORTE_CORPO, PARTS, PIVOTS, RIG_VIEWBOX } from './dealerRig';

/**
 * Crupiê em rig SVG por camadas (arte de `public/dealernova/`).
 *
 * O rig tem DOIS vocabulários de animação rodando ao mesmo tempo:
 *
 * 1. a REAÇÃO (`idle`, `celebrate`, `console`, …) — o estado do jogo
 *    entrando no corpo dela;
 * 2. o BEAT de ociosidade (`olharDir`, `alonga`, `sorriso`, …) — um
 *    gesto curto, sorteado de tempos em tempos, SÓ durante o `idle`.
 *
 * Os dois viram rótulos de variante empilhados (`animate={[reação,
 * beat]}`) no grupo raiz, e o framer os propaga por toda a árvore: cada
 * articulação declara o que tem a dizer sobre cada rótulo e ignora o
 * resto. É o que permite um "olhar de lado" acontecer POR CIMA da
 * respiração sem que um anule o outro.
 *
 * O ROSTO anda por fora desse grafo: boca, pupila e sobrancelha são
 * peças TROCADAS (arte de `varfeliz`/`vartriste`), e trocar peça é
 * crossfade de opacidade — não há transform que interpole um sorriso
 * fechado num sorriso aberto com dentes.
 */

/* ---------------------------------------------------------------- */
/* Vocabulário de rótulos                                            */
/* ---------------------------------------------------------------- */

type Rotulo = DealerReaction | IdleBeat;

const MOLA: TargetAndTransition['transition'] = {
  type: 'spring',
  stiffness: 150,
  damping: 18,
};

/**
 * Monta as variantes de uma articulação.
 *
 * As REAÇÕES são preenchidas por completo — toda reação sem pose
 * própria volta ao repouso. Sem isso, sair de `celebrate` para
 * `present` deixaria o braço pendurado na última pose, porque o framer
 * simplesmente não encontra o rótulo e não mexe em nada.
 *
 * Os BEATS entram só onde foram declarados: um beat que a peça não
 * conhece TEM de deixá-la exatamente onde a reação a colocou.
 */
function variantes(
  repouso: TargetAndTransition,
  poses: Partial<Record<Rotulo, TargetAndTransition>>,
): Variants {
  const out: Variants = {};
  for (const reacao of DEALER_REACTIONS) {
    out[reacao] = { transition: MOLA, ...repouso, ...poses[reacao] };
  }
  for (const [rotulo, pose] of Object.entries(poses)) {
    if (!(rotulo in out)) out[rotulo] = { transition: MOLA, ...pose };
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Corpo inteiro — respiração, pulo, tombo                           */
/* ---------------------------------------------------------------- */

/**
 * Pivô no QUADRIL: o `scaleY` daqui é agachar e esticar ancorado no
 * chão (squash & stretch), não um zoom no meio da figura.
 */
const RAIZ = variantes(
  { x: 0, y: 0, scaleY: 1 },
  {
    idle: {
      y: [0, -7, 0],
      transition: { duration: 4.4, repeat: Infinity, ease: 'easeInOut' },
    },
    greet: { y: -6 },
    present: {
      y: [0, -5, 0],
      transition: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
    },
    anticipate: {
      y: [0, -4, 0],
      transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
    },
    shake: { x: [0, -3, 3, 0], transition: { duration: 0.34, repeat: Infinity } },
    reveal: { y: 10 },
    /* COMEMORAÇÃO: dois pulos de alturas diferentes por ciclo. Um pulo
       só, repetido, vira metrônomo; o segundo, mais baixo, dá o quique
       de quem está genuinamente animada. E o agacha ANTES de subir
       (scaleY < 1 no impulso) é o que faz o pulo ter peso. */
    celebrate: {
      y: [0, 6, -38, -8, -26, 0],
      scaleY: [1, 0.94, 1.045, 0.98, 1.025, 1],
      rotate: [0, 0, -2.2, 0, 2.2, 0],
      transition: {
        duration: 1.15,
        repeat: Infinity,
        ease: 'easeOut',
        times: [0, 0.1, 0.34, 0.56, 0.78, 1],
      },
    },
    /* DERROTA: o corpo desce e fica pesado, com uma respiração longa de
       choro contido — o oposto exato da curva de comemoração. */
    console: {
      y: [12, 16, 12],
      scaleY: 0.985,
      transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
    },
    shrug: { y: [0, -10, 0], transition: { duration: 0.6 } },
    apologize: { y: 16 },

    alonga: { y: -12, scaleY: 1.02, transition: { duration: 1.1, ease: 'easeInOut' } },
    ajeitaOmbro: { x: 7, transition: { duration: 0.9, ease: 'easeInOut' } },
    confere: { y: 5 },
  },
);

/* ---------------------------------------------------------------- */
/* Cabeça                                                            */
/* ---------------------------------------------------------------- */

/**
 * ORÇAMENTO DE MOVIMENTO (ver `CORTE_CABECA` em dealerRig.ts): ±6° de
 * giro e ±4 de deslocamento. Passando disso, a emenda do pescoço sai da
 * faixa preta do queixo e aparece. Todos os valores abaixo respeitam
 * esse teto — é limite de ARTE, não de gosto.
 */
const CABECA = variantes(
  { rotate: 0, x: 0, y: 0 },
  {
    idle: {
      rotate: [0, 1.3, 0, -1.3, 0],
      transition: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
    },
    greet: { rotate: -5 },
    anticipate: { rotate: -2 },
    shake: { rotate: [1.2, -1.2, 1.2], transition: { duration: 0.34, repeat: Infinity } },
    reveal: { rotate: 3.5, y: 2 },
    celebrate: {
      rotate: [-4, 4, -4],
      transition: { duration: 0.575, repeat: Infinity, ease: 'easeInOut' },
    },
    console: { rotate: 4.5, y: 3 },
    shrug: { rotate: -4 },
    apologize: { rotate: 5, y: 3 },

    olharDir: { rotate: 2 },
    olharEsq: { rotate: -2 },
    inclina: { rotate: -5.5, y: 1 },
    alonga: { rotate: [0, -3, 0], transition: { duration: 2.6, ease: 'easeInOut' } },
    confere: { rotate: 1.5, y: 3.5 },
    ajeitaOmbro: { rotate: 2 },
  },
);

/* ---------------------------------------------------------------- */
/* Braços                                                            */
/* ---------------------------------------------------------------- */

/**
 * O sinal de ABRIR (afastar a mão do corpo) depende do lado: com y para
 * baixo, rotação positiva leva a ponta de baixo do braço para a
 * esquerda da tela. Abrir é POSITIVO no braço da esquerda da tela (peça
 * `-dir`, o braço direito dela) e NEGATIVO no da direita.
 */
const ABRIR = { dir: 1, esq: -1 } as const;
type Lado = keyof typeof ABRIR;

function ombro(lado: Lado): Variants {
  const s = ABRIR[lado];
  const acena = lado === 'esq';
  return variantes(
    { rotate: 0 },
    {
      idle: {
        rotate: [0, s * 1.5, 0],
        transition: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
      },
      // Só um braço acena; o outro acompanha de leve, como um corpo real.
      greet: acena
        ? { rotate: [s * 6, s * 14, s * 6, s * 14, s * 5], transition: { duration: 1.25 } }
        : { rotate: s * 2 },
      present: { rotate: s * 7 },
      anticipate: { rotate: s * -3 },
      shake: acena
        ? { rotate: [s * 2, s * 5, s * 2], transition: { duration: 0.42, repeat: Infinity } }
        : { rotate: s * 1 },
      reveal: { rotate: s * 8 },
      // Braços ABERTOS no ar, no compasso do pulo (meio ciclo do corpo).
      celebrate: {
        rotate: [s * 20, s * 30, s * 20],
        transition: { duration: 0.575, repeat: Infinity, ease: 'easeInOut' },
      },
      console: { rotate: s * -4 },
      shrug: { rotate: s * 12, transition: { type: 'spring', stiffness: 240, damping: 14 } },
      apologize: { rotate: s * -3 },

      alonga: { rotate: s * 10, transition: { duration: 1.1, ease: 'easeInOut' } },
      ajeitaOmbro: { rotate: lado === 'dir' ? s * 4 : s * -1 },
      inclina: { rotate: s * 1.5 },
    },
  );
}

/**
 * Cotovelo. O REPOUSO já é dobrado (±12°): a arte vem com os antebraços
 * cruzando à frente e, sem essa abertura, as duas mãos se enfiavam uma
 * dentro da outra. Tudo aqui é medido a partir desse repouso.
 */
const FLEXAO_REPOUSO = 8;

function cotovelo(lado: Lado): Variants {
  const s = ABRIR[lado];
  const trabalha = lado === 'esq';
  /** Ângulo em torno do REPOUSO — todas as poses são desvios dele, para
   *  mexer na flexão de base não obrigar a recalcular a tabela inteira. */
  const g = (delta: number) => ({ rotate: s * (FLEXAO_REPOUSO + delta) });
  const kf = (...deltas: number[]) => deltas.map((d) => s * (FLEXAO_REPOUSO + d));
  return variantes(g(0), {
    idle: {
      rotate: kf(0, 1.5, 0),
      transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
    },
    greet: trabalha
      ? { rotate: kf(-6, -12, -6, -12, -4), transition: { duration: 1.25 } }
      : g(0),
    present: g(-3),
    anticipate: g(2),
    // DISTRIBUINDO: é o antebraço que trabalha, não o corpo inteiro.
    shake: trabalha
      ? { rotate: kf(0, -6, 4, 0), transition: { duration: 0.42, repeat: Infinity } }
      : { rotate: kf(0, 3, 0), transition: { duration: 0.42, repeat: Infinity } },
    reveal: g(-4),
    // Cotovelo ESTICA na comemoração: o braço abre inteiro, não dobrado.
    celebrate: {
      rotate: kf(-8, -18, -8),
      transition: { duration: 0.575, repeat: Infinity, ease: 'easeInOut' },
    },
    console: g(4),
    shrug: { rotate: s * (FLEXAO_REPOUSO + 8), transition: { type: 'spring', stiffness: 240, damping: 14 } },
    apologize: g(6),

    alonga: { rotate: s * (FLEXAO_REPOUSO - 6), transition: { duration: 1.1, ease: 'easeInOut' } },
    ajeitaOmbro: g(lado === 'dir' ? -2 : 1),
  });
}

const OMBRO_DIR = ombro('dir');
const OMBRO_ESQ = ombro('esq');
const COTOVELO_DIR = cotovelo('dir');
const COTOVELO_ESQ = cotovelo('esq');

/* ---------------------------------------------------------------- */
/* Sobrancelhas                                                      */
/* ---------------------------------------------------------------- */

const SOBRANCELHA = variantes(
  { y: 0 },
  {
    greet: { y: -2 },
    anticipate: { y: 1.6 },
    reveal: { y: -2.5 },
    celebrate: { y: -3 },
    shrug: { y: -2 },
    console: { y: 1 },

    alonga: { y: -2 },
    inclina: { y: -1.4 },
    sorriso: { y: -1.6 },
    confere: { y: 1.2 },
  },
);

/* ---------------------------------------------------------------- */
/* Olhos — abertura e direção do olhar                               */
/* ---------------------------------------------------------------- */

/** Quanto a pálpebra abre em cada reação (1 = aberta, 0 = fechada). */
const ABERTURA: Record<DealerReaction, number> = {
  idle: 1,
  greet: 1,
  present: 1,
  anticipate: 0.86,
  shake: 0.82,
  reveal: 1.1,
  celebrate: 0.9,
  console: 0.72,
  shrug: 1,
  apologize: 0.12,
};

/** Para onde a pupila corre em cada rótulo (unidades de cena). */
const OLHAR: Partial<Record<Rotulo, { x: number; y: number }>> = {
  celebrate: { x: 0, y: -1.5 },
  console: { x: 0, y: 2.5 },
  reveal: { x: 0, y: 1.5 },
  anticipate: { x: 0, y: -1 },

  olharDir: { x: 3.5, y: 0 },
  olharEsq: { x: -3.5, y: 0 },
  confere: { x: 0, y: 3 },
  alonga: { x: 0, y: -2.5 },
  inclina: { x: -2, y: 0 },
};

const OLHAR_PARADO = { x: 0, y: 0 };

/* ---------------------------------------------------------------- */
/* Blocos de construção                                              */
/* ---------------------------------------------------------------- */

function Peca({ part }: { part: RigPart }) {
  return (
    <image
      href={part.src}
      x={part.x}
      y={part.y}
      width={part.w}
      height={part.h}
      preserveAspectRatio="none"
    />
  );
}

interface JointProps {
  pivot: { x: number; y: number };
  variants?: Variants;
  animate?: TargetAndTransition | string[];
  transition?: TargetAndTransition['transition'];
  children: React.ReactNode;
}

/**
 * Articulação: leva a origem ao pivô, gira/escala ali e devolve o
 * conteúdo às coordenadas de cena.
 *
 * O retângulo âncora (simétrico em torno do pivô) existe porque o
 * framer resolve `transform-origin` como FRAÇÃO da caixa do grupo: sem
 * uma caixa simétrica, o centro cairia em cima da arte — sempre
 * assimétrica — e a peça giraria em torno do lugar errado. Com o
 * retângulo dominando a caixa, `originX/Y: 0.5` é exatamente o pivô.
 * ±2000 cobre toda a cena (x∈[1100,1750], y∈[0,950]) a partir de
 * qualquer pivô.
 */
function Joint({ pivot, variants, animate, transition, children }: JointProps) {
  return (
    <g transform={`translate(${pivot.x} ${pivot.y})`}>
      <motion.g
        variants={variants}
        animate={animate}
        transition={transition}
        initial={false}
        style={{ originX: 0.5, originY: 0.5 }}
      >
        <rect x={-2000} y={-2000} width={4000} height={4000} fill="none" stroke="none" />
        <g transform={`translate(${-pivot.x} ${-pivot.y})`}>{children}</g>
      </motion.g>
    </g>
  );
}

/* ---------------------------------------------------------------- */
/* Piscada                                                           */
/* ---------------------------------------------------------------- */

/**
 * Piscadas em intervalos irregulares e, de vez em quando, DUPLAS — o
 * olho humano pisca em rajada, e uma piscada perfeitamente periódica é
 * das coisas que mais denunciam um boneco.
 */
function usePiscada(ativo: boolean): boolean {
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const depois = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };

    const agendar = () => {
      const espera = DEALER_TIMINGS.blinkEveryMs * (0.65 + Math.random() * 0.7);
      depois(espera, () => {
        const dupla = Math.random() < 0.25;
        setFechado(true);
        depois(DEALER_TIMINGS.blinkMs, () => {
          setFechado(false);
          if (!dupla) {
            agendar();
            return;
          }
          depois(110, () => {
            setFechado(true);
            depois(DEALER_TIMINGS.blinkMs, () => {
              setFechado(false);
              agendar();
            });
          });
        });
      });
    };

    agendar();
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      // Sem o reset, desligar no meio de uma piscada deixaria o olho
      // fechado até a próxima vez que o agendador voltasse a rodar.
      setFechado(false);
    };
  }, [ativo]);

  return ativo && fechado;
}

/* ---------------------------------------------------------------- */
/* Componente                                                        */
/* ---------------------------------------------------------------- */

const BLEND = { duration: DEALER_TIMINGS.blendMs / 1000, ease: 'easeInOut' } as const;
const OLHAR_MOLA = { type: 'spring', stiffness: 210, damping: 22 } as const;

export function NovaDealer({ reaction, quality = 'high' }: Omit<DealerProps, 'variant'>) {
  const animado = quality === 'high';
  // Os dois recortes são referenciados por url(#id): precisam ser
  // únicos por instância (a cena monta a crupiê uma vez, mas os testes
  // montam várias) e válidos como fragmento de URL.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const recorteCabeca = `dealer-cabeca-${uid}`;
  const recorteCorpo = `dealer-corpo-${uid}`;

  const beat = useIdleBeat(animado && reaction === 'idle');
  const fechado = usePiscada(animado);

  const rosto: DealerFace = beat === 'sorriso' ? 'feliz' : faceForReaction(reaction);
  const chorando = tearsForReaction(reaction);

  const rotulos = useMemo(() => [reaction, beat], [reaction, beat]);
  const olhar = OLHAR[beat] ?? OLHAR[reaction] ?? OLHAR_PARADO;
  const abertura = fechado ? 0.06 : ABERTURA[reaction];

  return (
    <div
      className="dealer-rig"
      data-testid="dealer"
      data-reaction={reaction}
      data-face={rosto}
      data-beat={beat}
    >
      <MotionConfig reducedMotion={animado ? 'never' : 'always'}>
        <svg viewBox={RIG_VIEWBOX} aria-hidden="true" focusable="false">
          <defs>
            {/* O corte cabeça/corpo mora no espaço da CENA (fora do grupo
                que gira): assim a borda de baixo da cabeça cai sempre na
                mesma linha da sombra do queixo, gire ela o que girar —
                nunca abre fresta. */}
            <clipPath id={recorteCabeca}>
              <rect x={1100} y={-400} width={800} height={CORTE_CABECA + 400} />
            </clipPath>
            <clipPath id={recorteCorpo}>
              <rect x={1100} y={CORTE_CORPO} width={800} height={1200} />
            </clipPath>
          </defs>

          {/* A raiz recebe os DOIS rótulos; o framer os propaga a todas
              as articulações abaixo que tenham `variants`. */}
          <Joint pivot={PIVOTS.raiz} variants={RAIZ} animate={rotulos}>
            {/* Cabelo de trás: gira junto com a cabeça, mas por baixo de tudo. */}
            <Joint pivot={PIVOTS.cabeca} variants={CABECA}>
              <Peca part={PARTS.cabeloTras} />
            </Joint>

            {/* Braços superiores: ATRÁS do tronco, para o encaixe do ombro
                sumir sob o deltoide já desenhado no corpo. */}
            <Joint pivot={PIVOTS.ombroDir} variants={OMBRO_DIR}>
              <Peca part={PARTS.bracoDir} />
            </Joint>
            <Joint pivot={PIVOTS.ombroEsq} variants={OMBRO_ESQ}>
              <Peca part={PARTS.bracoEsq} />
            </Joint>

            {/* Tronco e vestido (a cabeça deste mesmo desenho é recortada fora). */}
            <g clipPath={`url(#${recorteCorpo})`}>
              <Peca part={PARTS.corpo} />
            </g>

            {/* Antebraços: à FRENTE do vestido e pendurados no ombro — o
                cotovelo soma a sua flexão à rotação do ombro. */}
            <Joint pivot={PIVOTS.ombroDir} variants={OMBRO_DIR}>
              <Joint pivot={PIVOTS.cotoveloDir} variants={COTOVELO_DIR}>
                <Peca part={PARTS.antebracoDir} />
              </Joint>
            </Joint>
            <Joint pivot={PIVOTS.ombroEsq} variants={OMBRO_ESQ}>
              <Joint pivot={PIVOTS.cotoveloEsq} variants={COTOVELO_ESQ}>
                <Peca part={PARTS.antebracoEsq} />
              </Joint>
            </Joint>

            {/* CABEÇA: rosto, olhos, boca e franja giram como uma peça só. */}
            <g clipPath={`url(#${recorteCabeca})`}>
              <Joint pivot={PIVOTS.cabeca} variants={CABECA}>
                <Peca part={PARTS.corpo} />

                <Joint pivot={PIVOTS.olhos} variants={SOBRANCELHA}>
                  <motion.g animate={{ opacity: rosto === 'triste' ? 0 : 1 }} transition={BLEND}>
                    <Peca part={PARTS.sobrancelha} />
                  </motion.g>
                  <motion.g animate={{ opacity: rosto === 'triste' ? 1 : 0 }} transition={BLEND}>
                    <Peca part={PARTS.sobrancelhaTriste} />
                  </motion.g>
                </Joint>

                {/* Pálpebra: o squash vertical vale para o branco E para a
                    pupila — piscar com a íris parada entrega o truque. */}
                <Joint
                  pivot={PIVOTS.olhos}
                  animate={{ scaleY: abertura }}
                  transition={{ duration: fechado ? 0.06 : 0.16, ease: 'easeOut' }}
                >
                  <Peca part={PARTS.olho} />
                  <motion.g animate={olhar} transition={OLHAR_MOLA}>
                    <motion.g animate={{ opacity: rosto === 'triste' ? 0 : 1 }} transition={BLEND}>
                      <Peca part={PARTS.pupilaDir} />
                      <Peca part={PARTS.pupilaEsq} />
                    </motion.g>
                    <motion.g animate={{ opacity: rosto === 'triste' ? 1 : 0 }} transition={BLEND}>
                      <Peca part={PARTS.pupilaTristeDir} />
                      <Peca part={PARTS.pupilaTristeEsq} />
                    </motion.g>
                  </motion.g>
                </Joint>

                <Lagrimas ativa={chorando && animado} />
                <Boca rosto={rosto} realce={reaction === 'celebrate'} />

                <Peca part={PARTS.cabeloFrente} />
              </Joint>
            </g>
          </Joint>
        </svg>
      </MotionConfig>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Boca e lágrimas                                                   */
/* ---------------------------------------------------------------- */

function Boca({ rosto, realce }: { rosto: DealerFace; realce: boolean }) {
  return (
    <Joint pivot={PIVOTS.bocaCentro} animate={{ scale: realce ? 1.07 : 1 }} transition={MOLA}>
      <motion.g animate={{ opacity: rosto === 'neutra' ? 1 : 0 }} transition={BLEND}>
        <Peca part={PARTS.bocaPadrao} />
      </motion.g>
      <motion.g animate={{ opacity: rosto === 'feliz' ? 1 : 0 }} transition={BLEND}>
        <Peca part={PARTS.bocaFeliz} />
      </motion.g>
      <motion.g animate={{ opacity: rosto === 'triste' ? 1 : 0 }} transition={BLEND}>
        <Peca part={PARTS.bocaTriste} />
      </motion.g>
    </Joint>
  );
}

/**
 * Lágrimas: nascem no canto do olho, engordam, escorrem pela bochecha e
 * somem. As duas correm DESSINCRONIZADAS (uma entra 0,9 s depois) —
 * duas lágrimas simétricas caindo juntas parecem um efeito, não choro.
 */
const queda = (atraso: number): TargetAndTransition => ({
  opacity: [0, 0.9, 1, 0],
  y: [0, 4, 30, 46],
  transition: {
    duration: 2.3,
    repeat: Infinity,
    repeatDelay: 0.5,
    delay: atraso,
    times: [0, 0.18, 0.78, 1],
    ease: 'easeIn',
  },
});

/* Os dois alvos são CONSTANTES de módulo, e não objetos criados no
   render: o rig re-renderiza a cada piscada, e um alvo novo a cada vez
   reiniciava a queda — a lágrima saltava de volta para o olho toda vez
   que ela piscava. */
const QUEDA_DIR = queda(0);
const QUEDA_ESQ = queda(0.9);
const LAGRIMA_INICIO = { opacity: 0 };

function Lagrimas({ ativa }: { ativa: boolean }) {
  if (!ativa) return null;
  return (
    <g data-testid="dealer-lagrimas">
      <motion.g initial={LAGRIMA_INICIO} animate={QUEDA_DIR}>
        <Peca part={PARTS.lagrimaDir} />
      </motion.g>
      <motion.g initial={LAGRIMA_INICIO} animate={QUEDA_ESQ}>
        <Peca part={PARTS.lagrimaEsq} />
      </motion.g>
    </g>
  );
}
