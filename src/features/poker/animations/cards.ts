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
 * Mão DEITADA na mesa: as cartas ficam uma ao lado da outra, retas e
 * inteiramente visíveis — não é um leque na mão de alguém, é o que a
 * mesa mostra. Nada de sobreposição enquanto a mão couber na largura de
 * referência (ver `handStep`).
 */

/** Respiro entre cartas vizinhas, em fração de --card-w. */
export const HAND_GAP = 0.1;

/** Quantas cartas cabem deitadas antes de a mão precisar se apertar. */
export const HAND_SPREAD_MAX = 4;

/**
 * Largura de referência de uma mão, em cartas: o tamanho que a mão
 * ocupa cheia de cartas deitadas. Nenhuma mão passa disto — é o que
 * mantém as duas mesas alinhadas e o feltro respirando nas laterais.
 */
export const HAND_MAX_WIDTH = HAND_SPREAD_MAX + (HAND_SPREAD_MAX - 1) * HAND_GAP;

/**
 * Deslocamento de cada carta em relação à anterior (fração de --card-w):
 * positivo é respiro, negativo é sobreposição. Até `HAND_SPREAD_MAX`
 * cartas a mão fica aberta; a partir daí ela se aperta o MÍNIMO
 * necessário para continuar cabendo em `HAND_MAX_WIDTH` — uma mão de
 * sete cartas não pode vazar da mesa.
 */
export function handStep(count: number): number {
  if (count <= HAND_SPREAD_MAX) return HAND_GAP;
  return (HAND_MAX_WIDTH - 1) / (count - 1) - 1;
}

/**
 * Largura de referência de uma mão MINI (a de um rival na mesa única),
 * em cartas. Bem menor que a da mão cheia porque são até três assentos
 * por fileira numa casca de 480px: a mão do rival é para se CONTAR e
 * conferir o que está aberto, não para se ler carta por carta.
 */
export const MINI_HAND_MAX_WIDTH = 2.5;

/**
 * Deslocamento entre cartas de uma mão mini. Duas cartas (a
 * distribuição) abrem com respiro; da terceira em diante elas se
 * sobrepõem o quanto for preciso para a mão nunca passar de
 * `MINI_HAND_MAX_WIDTH` — é o que mantém seis assentos dentro da tela
 * mesmo com todas as mãos crescendo.
 */
export function miniHandStep(count: number): number {
  if (count <= 2) return HAND_GAP;
  return (MINI_HAND_MAX_WIDTH - 1) / (count - 1) - 1;
}
