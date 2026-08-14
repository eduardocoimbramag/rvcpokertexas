import { motion, useReducedMotion } from 'framer-motion';

export interface BrandFlushProps {
  /** Largura do SVG (px); a altura acompanha a proporção do leque. */
  size?: number;
  className?: string;
}

/* ---- A ONDA ----
   Uma carta por vez, da esquerda para a direita, e o ciclo recomeça.

   Os quatro números que a definem, e por que estes:

   - LIFT (2,8 unidades do viewBox ≈ 1/6 da altura da carta): o suficiente
     para a carta se destacar das vizinhas sem sair do leque. Mais que
     isso e ela deixa de ser "uma carta do flush" para virar uma carta
     avulsa flutuando;
   - RISE: cada levantada é uma ida e volta completa, com o pico a 45% —
     sobe um pouco mais rápido do que desce, que é como uma carta se
     comporta quando se solta o dedo;
   - STEP: o intervalo entre uma carta e a seguinte. É MENOR que a
     levantada de propósito: a seguinte começa a subir enquanto a
     anterior ainda desce, e é essa sobreposição que faz a fileira ler
     como onda em vez de cinco animações enfileiradas;
   - HOLD: o respiro antes de recomeçar. Sem ele o ciclo emenda em si
     mesmo e a peça vira um moinho — o que se quer é um gesto que
     acontece, termina, e volta a acontecer. */
const LIFT = 3.2;
const RISE = 0.66;
const STEP = 0.22;
const HOLD = 1.15;

/* ---- O LEQUE ----
   Cinco cartas girando em torno de um pivô MUITO ABAIXO do quadro
   (`PIVOT`), que é o que faz as bases quase se tocarem e as pontas se
   afastarem — a abertura de um leque na mão, e não cinco cartas
   enfileiradas.

   O pivô longe é o que permite ângulos PEQUENOS com afastamento grande:
   a 54 unidades de distância, 11° deslocam a carta 8,6 unidades de lado
   e a inclinam quase nada. Um pivô perto (logo abaixo das cartas) daria
   o mesmo afastamento com 29° por carta — as das pontas ficariam
   deitadas, e um flush deitado não se lê.

   O passo de 11° deixa 4,4 unidades de sobreposição em 13 de largura:
   cada carta esconde um terço da vizinha e mostra o próprio pau. Menos
   sobreposição e o leque vira baralho aberto; mais, e só a da frente
   tem naipe visível. */
const PIVOT_Y = 58;

/**
 * AS CINCO CARTAS: um straight flush de paus até o REI.
 *
 * A sequência importa. Cinco paus soltos são um flush; 9-10-J-Q-K do
 * mesmo naipe é um STRAIGHT FLUSH, a segunda melhor mão do jogo — e a
 * marca passa a dizer não só "isto é poker" como "isto é uma mão grande".
 *
 * O ÍNDICE é traçado, e não tipografado: a marca não depende de fonte
 * carregada, e os desenhos abaixo são os mesmos glifos que a casa usa nos
 * ícones. O "10" é o único de duas figuras e por isso ganha traço mais
 * fino — no espaço de um índice, dois algarismos gordos viram um borrão.
 */
const FAN = [
  { angle: -22, rank: '9' },
  { angle: -11, rank: '10' },
  { angle: 0, rank: 'J' },
  { angle: 11, rank: 'Q' },
  { angle: 22, rank: 'K' },
] as const;

/**
 * Os índices em TRAÇO, desenhados na caixa 0..4 (largura) por 0..6
 * (altura), para caberem no canto de uma carta de 13 por 18,5.
 */
const RANK_PATH: Record<string, string> = {
  '9': 'M3.4 1.9a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0v1.4c0 1.6-.7 2.5-2 2.9',
  '10': 'M0.1 1.5 1 0.7v5.3M2.6 2.1a1.3 1.3 0 0 1 2.6 0v2.4a1.3 1.3 0 0 1-2.6 0z',
  J: 'M3.4 0.7v3.9a1.5 1.5 0 0 1-3 0',
  Q: 'M0.4 2.1a1.6 1.6 0 0 1 3.2 0v1.9a1.6 1.6 0 0 1-3.2 0zM2.4 4.4 3.9 6.1',
  K: 'M0.5 0.7v5.4M3.6 0.7 0.7 3.4l3.1 2.7',
};

const CYCLE = FAN.length * STEP + HOLD;

/**
 * Marca da Home: o FLUSH DE PAUS — cinco cartas em leque, com uma onda
 * que sobe uma de cada vez.
 *
 * O ícone acompanha o jogo, e este é o terceiro. O primeiro era um Ás
 * sozinho, herdado do blackjack. O segundo foi o PAR fechado do Hold'em —
 * melhor, mas ainda a mesma silhueta de duas cartas que qualquer jogo de
 * carta usa: de longe, continuava lendo como blackjack.
 *
 * CINCO CARTAS DO MESMO NAIPE é uma imagem que só o poker tem. Não é a
 * mão que se recebe: é a que se persegue — e é ela que qualquer um
 * reconhece como "isto é poker" sem precisar contar pip nenhum.
 *
 * A ONDA existe porque uma marca parada num menu é um adesivo. A que
 * acontece aqui é a de um crupiê passando o dedo pelo leque para conferir
 * as cartas: uma sobe, assenta, a seguinte sobe. É um gesto de mesa, e
 * não um efeito — daí ele ser lento, ter respiro entre os ciclos e nunca
 * ter duas cartas no ar pelo mesmo motivo.
 *
 * A LEVANTADA É NO EIXO DA CARTA, e não na vertical da tela: o grupo que
 * anima vive DENTRO do grupo que gira, então a carta da ponta sobe
 * inclinada, como sairia de um leque de verdade. Fosse na vertical, as
 * cinco subiriam paralelas e o leque perderia a perspectiva.
 *
 * É a única arte que NÃO herda `currentColor`: como o brasão e o
 * logotipo, é peça de marca com as cores oficiais gravadas — a face
 * percorre a rampa de metal da casa (marfim → champagne → âmbar →
 * bronze) e os paus são cravados em vinho profundo.
 *
 * MOVIMENTO REDUZIDO desliga a onda e mantém o leque: quem pediu menos
 * movimento não perde a marca, perde o gesto.
 */
export function BrandFlush({ size = 96, className = '' }: BrandFlushProps) {
  const still = useReducedMotion() ?? false;

  return (
    <svg
      viewBox="0 0 64 32"
      width={size}
      height={(size * 32) / 64}
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Rampa de metal oficial, na diagonal da luz (alto-esquerda). */}
        <linearGradient id="flush-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" />
          <stop offset="0.38" stopColor="#fcd9a0" />
          <stop offset="0.72" stopColor="#f5b76f" />
          <stop offset="1" stopColor="#c67e38" />
        </linearGradient>
        {/* As cartas de FORA ficam na sombra das de dentro: a mesma rampa,
            rebaixada. É o que dá profundidade ao leque sem uma segunda
            fonte de luz. */}
        <linearGradient id="flush-face-deep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0dcc2" />
          <stop offset="0.5" stopColor="#e0ab6c" />
          <stop offset="1" stopColor="#ad6a2e" />
        </linearGradient>
        {/* Canto da carta na sombra: a "espessura" que dá corpo à peça. */}
        <linearGradient id="flush-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b06a30" />
          <stop offset="1" stopColor="#82441c" />
        </linearGradient>
        {/* Lustre especular: banda fria que morre antes do meio da face. */}
        <linearGradient id="flush-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4e8" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff4e8" stopOpacity="0" />
        </linearGradient>
        <clipPath id="flush-clip">
          <rect x="25.5" y="4" width="13" height="18.5" rx="1.8" />
        </clipPath>
      </defs>

      {/* Sombra assentando o leque na mesa: ele repousa, não flutua. */}
      <ellipse cx="32" cy="28.2" rx="17" ry="1.5" fill="rgba(20,4,4,0.34)" />

      {FAN.map(({ angle, rank }, index) => {
        const central = index === 2;
        return (
          <g key={rank} transform={`rotate(${angle} 32 ${PIVOT_Y})`}>
            <motion.g
              data-card={index}
              /* SEM `initial={false}` aqui, e a ausência é a peça:
                 com ele, o framer trata `animate` como estado INICIAL e
                 uma sequência de keyframes nunca chega a correr — o leque
                 nascia parado, e parado ficava. O estado de partida é
                 declarado por extenso. */
              initial={{ y: 0 }}
              animate={still ? { y: 0 } : { y: [0, -LIFT, 0] }}
              transition={
                still
                  ? { duration: 0 }
                  : {
                      duration: RISE,
                      times: [0, 0.45, 1],
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatDelay: CYCLE - RISE,
                      delay: index * STEP,
                    }
              }
            >
              {/* Espessura do baralho por baixo, deslocada para a sombra. */}
              <rect x="26" y="4.7" width="13" height="18.5" rx="1.8" fill="url(#flush-edge)" />

              <rect
                x="25.5"
                y="4"
                width="13"
                height="18.5"
                rx="1.8"
                fill={central ? 'url(#flush-face)' : 'url(#flush-face-deep)'}
              />

              {/* Lustre varrendo o canto da luz, contido pela própria face
                  — só na carta do meio, que é a que recebe a luz de cheio.
                  Nas cinco, cinco brilhos paralelos leriam como listras. */}
              {central && (
                <g clipPath="url(#flush-clip)">
                  <path d="M23.2 9.6 31.4 2.4l2.9 1.1L24.9 12.4z" fill="url(#flush-sheen)" />
                </g>
              )}

              {/* Filete interno em vinho: a moldura clássica da carta de
                  luxo, o mesmo detalhe do brasão e da placa de assento. */}
              <rect
                x="26.7"
                y="5.2"
                width="10.6"
                height="16.1"
                rx="1"
                fill="none"
                stroke="#4c0a15"
                strokeWidth="0.3"
                opacity="0.42"
              />

              {/* O ÍNDICE no canto de cima, onde ele fica numa carta — e
                  onde o leque o deixa visível: cada carta esconde um
                  terço da vizinha pela DIREITA, e o canto esquerdo de
                  todas fica de fora. É por isso que as cinco se leem
                  como uma sequência, e não só como cinco paus. */}
              <g
                transform={`translate(26.9 ${rank === '10' ? 6.1 : 6.2}) scale(${rank === '10' ? 0.62 : 0.72})`}
                fill="none"
                stroke="#4c0a15"
                strokeWidth={rank === '10' ? 1.15 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={RANK_PATH[rank]} />
              </g>

              {/* O PAU em vinho profundo — três lóbulos e o pé. Ele é
                  desenhado com círculos e um traço, e não com uma glifa:
                  a marca não depende de tipografia carregada. */}
              <g fill="#4c0a15">
                <circle cx="32.4" cy="12.4" r="1.55" />
                <circle cx="30.75" cy="15" r="1.55" />
                <circle cx="34.05" cy="15" r="1.55" />
                <path d="M31.35 19.4c.6-.95.9-2 1.05-3.2.15 1.2.45 2.25 1.05 3.2z" />
              </g>

              {/* Aresta em champagne: o fio de luz que faz a carta ler
                  "metal" e a separa da vizinha no leque. */}
              <rect
                x="25.5"
                y="4"
                width="13"
                height="18.5"
                rx="1.8"
                fill="none"
                stroke="#fcd9a0"
                strokeWidth="0.4"
                opacity={central ? 0.8 : 0.55}
              />
            </motion.g>
          </g>
        );
      })}
    </svg>
  );
}
