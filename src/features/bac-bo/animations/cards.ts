/**
 * Constantes de animação das cartas. As DURAÇÕES canônicas vivem em
 * timings.ts (store e componentes leem de lá); aqui ficam as poses e
 * curvas que só as cartas usam.
 */

/**
 * Pose de largada do voo de distribuição: a carta nasce no ar, vinda do
 * sapato (acima da mesa, do lado do dealer), levemente girada — e
 * assenta na posição final com a curva de acomodação da casa.
 */
export const CARD_DEAL_FROM = {
  opacity: 0,
  y: -120,
  rotate: -8,
  scale: 0.82,
} as const;

/** Pose de repouso da carta assentada na mesa. */
export const CARD_DEAL_TO = {
  opacity: 1,
  y: 0,
  rotate: 0,
  scale: 1,
} as const;

/**
 * A mesma curva de assentamento dos objetos da mesa (era a do dado ao
 * tombar): acelera, passa de leve do ponto e volta — peso físico.
 */
export const CARD_SETTLE_EASE = [0.22, 0.9, 0.3, 1] as const;

/** Duração do voo + acomodação de uma carta (casa com timings.dealMs). */
export const CARD_SETTLE_S = 0.55;

/** Duração da virada de uma carta (fechada → aberta). */
export const CARD_FLIP_S = 0.6;

/**
 * Leque da mão: cada carta gira alguns graus em torno do centro da mão
 * e sobrepõe a anterior — o gesto de segurar cartas numa mesa real.
 */
export const FAN_STEP_DEG = 5;

/** Sobreposição horizontal entre cartas vizinhas (fração de --card-w). */
export const FAN_OVERLAP = 0.52;
