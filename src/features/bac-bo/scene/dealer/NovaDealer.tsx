import type { TargetAndTransition, Variants } from 'framer-motion';
import { MotionConfig, motion } from 'framer-motion';
import { useEffect, useId, useMemo, useState } from 'react';

import { DEALER_TIMINGS } from '../scene.timings';
import type { DealerProps, DealerReaction } from './DealerController';
import { DEALER_REACTIONS } from './DealerController';
import type { IdleBeat } from './dealerBeats';
import { useIdleBeat } from './dealerBeats';
import type { BracoPose, DealerFace } from './dealerExpression';
import { bracosForReaction, faceForReaction, tearsForReaction } from './dealerExpression';
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
    /* Altura do pulo LIMITADA pelo quadro: a franja repousa ~21 unidades
       abaixo do topo do viewBox, e subir mais que isso corta o cabelo em
       telas cujo recorte encosta no topo do palco. O peso do gesto vem
       do squash & stretch, não da altura. */
    celebrate: {
      y: [0, 6, -20, -6, -14, 0],
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

/**
 * Ombro. O ângulo é sempre o de ABRIR, e o clamp abaixo garante que ele
 * NUNCA feche para dentro — é limite de montagem, não de gosto.
 *
 * O braço superior vive ATRÁS do tronco e o antebraço À FRENTE do
 * vestido. Girando para dentro, o braço superior afunda no tronco e
 * some, enquanto o antebraço continua em cena: o braço parte no meio e
 * o cotovelo vira um degrau. Era exatamente o que deformava a pose de
 * choro (que fechava 4°) e, em menor grau, a tensão e o pedido de
 * desculpas. Abrir é seguro: a calota do ombro gira em torno do próprio
 * centro, então o topo continua coberto pelo deltoide desenhado no
 * corpo, e o braço só ganha mais pele à mostra.
 *
 * Com `abre(0)` a pose fica IDÊNTICA à de repouso, pixel a pixel — que
 * é o encaixe perfeito da arte. Toda reação sem gesto de braço próprio
 * usa esse zero, e a emoção vem do corpo, do rosto e das lágrimas.
 */
function ombro(lado: Lado): Variants {
  const s = ABRIR[lado];
  const acena = lado === 'esq';
  /** Ângulo de abrir, travado em ≥ 0: fechar quebraria a montagem. */
  const abre = (graus: number) => s * Math.max(0, graus);
  return variantes(
    { rotate: 0 },
    {
      idle: {
        rotate: [abre(0), abre(1.5), abre(0)],
        transition: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
      },
      // Só um braço acena; o outro acompanha de leve, como um corpo real.
      greet: acena
        ? {
            rotate: [abre(8), abre(15), abre(8), abre(15), abre(6)],
            transition: { duration: 1.25 },
          }
        : { rotate: abre(2) },
      // present/celebrate: os braços de REPOUSO saem de cena (troca de
      // pose — ver bracosForReaction); ficam neutros para o crossfade
      // não misturar um gesto pela metade.
      present: { rotate: abre(0) },
      // Tensão, choro e desculpa: braços na pose de repouso, EXATA. A
      // emoção está no corpo (mais baixo), no rosto e nas lágrimas.
      anticipate: { rotate: abre(0) },
      shake: acena
        ? {
            rotate: [abre(2), abre(6), abre(2)],
            transition: { duration: 0.42, repeat: Infinity },
          }
        : {
            rotate: [abre(1), abre(3), abre(1)],
            transition: { duration: 0.42, repeat: Infinity },
          },
      reveal: { rotate: abre(8) },
      celebrate: { rotate: abre(0) },
      console: { rotate: abre(0) },
      shrug: { rotate: abre(12), transition: { type: 'spring', stiffness: 240, damping: 14 } },
      apologize: { rotate: abre(0) },

      alonga: { rotate: abre(10), transition: { duration: 1.1, ease: 'easeInOut' } },
      ajeitaOmbro: { rotate: abre(lado === 'dir' ? 4 : 0) },
      inclina: { rotate: abre(1.5) },
    },
  );
}

/**
 * Cotovelo dos braços de REPOUSO — PINADO. A expressão dos braços vem
 * da TROCA DE POSE (docs/antebraco.md, solução B): `apresenta` e
 * `palmas` são artes prontas do designer com o cotovelo resolvido no
 * desenho. O repouso, único que articula, fica preso à pose em que o
 * encaixe das peças é perfeito — o clamp de ±1,5° (a micro-flexão que o
 * idle provou ser invisível) garante que nenhuma reação o mova por
 * engano.
 */
const FLEXAO_REPOUSO = 8;
const PINO = 1.5;

function cotovelo(lado: Lado): Variants {
  const s = ABRIR[lado];
  const g = (delta: number) => ({
    rotate: s * (FLEXAO_REPOUSO + Math.max(-PINO, Math.min(PINO, delta))),
  });
  const kf = (...deltas: number[]) => deltas.map((d) => g(d).rotate);
  return variantes(g(0), {
    idle: {
      rotate: kf(0, 1.5, 0),
      transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
    },
    shake: {
      rotate: kf(0, 1.5, 0.5, 0),
      transition: { duration: 0.42, repeat: Infinity },
    },
    alonga: { rotate: g(0).rotate, transition: { duration: 1.1, ease: 'easeInOut' } },
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

/* Animações das POSES DE BRAÇO — constantes de módulo: um alvo recriado
   a cada render reiniciaria o loop de keyframes toda vez que ela pisca. */

/**
 * Palmas: giram no COTOVELO (sao antebracos), e o repouso do ciclo e o
 * CONTATO - cada mao so afasta e volta, que e o gesto de bater palma.
 * Amplitude curta de proposito: no cotovelo, 2,5 graus ja afastam a mao
 * o bastante para o olho ler a batida, e mais que isso vira aceno.
 */
const PALMA_DIR_BATE = { rotate: [0, -2.5, 0] };
const PALMA_ESQ_BATE = { rotate: [0, 2.5, 0] };
const PALMA_RITMO = { duration: 0.4, repeat: Infinity, ease: 'easeInOut' } as const;

/** Apresenta: a mão estendida flutua de leve, como quem sustenta o gesto. */
const APRESENTA_FLUTUA = { rotate: [0, 2.5, 0] };
const APRESENTA_RITMO = { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } as const;


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
  const bracos: BracoPose = bracosForReaction(reaction);

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
      data-bracos={bracos}
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

            {/* BRACOS POR POSE (docs/antebraco.md, solucao B): o que a
                pose troca e o ANTEBRACO -- as variantes do designer sao
                antebracos, com o cotovelo ja resolvido na arte.

                Os bracos superiores ficam SEMPRE em cena, atras do
                tronco: e deles que todo antebraco nasce, e escondê-los
                deixava o ombro solto, sem nada ligando o corpo a mao. */}
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

            {/* Antebraço da ESQUERDA da tela: a mão que repousa no ventre —
                vale para repouso E apresenta. */}
            <motion.g animate={{ opacity: bracos === 'palmas' ? 0 : 1 }} transition={BLEND}>
              <Joint pivot={PIVOTS.ombroDir} variants={OMBRO_DIR}>
                <Joint pivot={PIVOTS.cotoveloDir} variants={COTOVELO_DIR}>
                  <Peca part={PARTS.antebracoDir} />
                </Joint>
              </Joint>
            </motion.g>

            {/* Antebraço da DIREITA da tela em repouso (cruza para o ventre). */}
            <motion.g animate={{ opacity: bracos === 'repouso' ? 1 : 0 }} transition={BLEND}>
              <Joint pivot={PIVOTS.ombroEsq} variants={OMBRO_ESQ}>
                <Joint pivot={PIVOTS.cotoveloEsq} variants={COTOVELO_ESQ}>
                  <Peca part={PARTS.antebracoEsq} />
                </Joint>
              </Joint>
            </motion.g>

            {/* POSE APRESENTA: a mão estendida, nascendo no MESMO cotovelo
                direito (aninhada no ombro para acompanhar qualquer resto de
                movimento dele), com uma flutuação lenta de quem sustenta o
                convite. */}
            <motion.g animate={{ opacity: bracos === 'apresenta' ? 1 : 0 }} transition={BLEND}>
              <Joint pivot={PIVOTS.ombroEsq} variants={OMBRO_ESQ}>
                <Joint
                  pivot={PIVOTS.cotoveloEsq}
                  animate={APRESENTA_FLUTUA}
                  transition={APRESENTA_RITMO}
                >
                  <Peca part={PARTS.bracoApresenta} />
                </Joint>
              </Joint>
            </motion.g>

            {/* POSE PALMAS: os dois ANTEBRACOS do designer, pendurados no
                cotovelo (e nao no ombro -- montá-los como bracos inteiros
                era o que deixava o ombro sem conexao).

                A ordem aqui e INVERTIDA em relacao ao repouso: a mao da
                DIREITA da tela entra primeiro e fica ATRAS da esquerda,
                como no desenho de referencia. */}
            <motion.g animate={{ opacity: bracos === 'palmas' ? 1 : 0 }} transition={BLEND}>
              <Joint pivot={PIVOTS.ombroEsq} variants={OMBRO_ESQ}>
                <Joint
                  pivot={PIVOTS.cotoveloEsq}
                  animate={PALMA_ESQ_BATE}
                  transition={PALMA_RITMO}
                >
                  <Peca part={PARTS.bracoPalmasEsq} />
                </Joint>
              </Joint>
              <Joint pivot={PIVOTS.ombroDir} variants={OMBRO_DIR}>
                <Joint
                  pivot={PIVOTS.cotoveloDir}
                  animate={PALMA_DIR_BATE}
                  transition={PALMA_RITMO}
                >
                  <Peca part={PARTS.bracoPalmasDir} />
                </Joint>
              </Joint>
            </motion.g>

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
