/**
 * O POTE DA MESA em fichas — a conta que transforma um valor de aposta
 * numa quantidade de fichas no feltro.
 *
 * Ela é PROPORCIONAL de propósito, e isso é o contrato: dobrar a aposta
 * dobra as fichas. A conta anterior era afim (`2 + stake/50`), então
 * dobrar 100 levava de 4 para 6 fichas — o jogador dobrava o que estava
 * em jogo e a mesa mal reagia. Com uma unidade fixa, 100 são quatro
 * fichas e 200 são oito: o gesto de dobrar tem retrato.
 */

/** Quanto vale uma ficha desenhada na mesa. */
export const CHIP_UNIT = 25;

/**
 * Teto de fichas desenhadas. Existe porque a faixa livre do feltro do
 * duelo tem 92px de altura no pior aparelho — uma aposta de 5.000 são
 * 200 fichas, e não há mesa que as mostre.
 *
 * O teto foi escolhido para cair FORA do alcance de quem joga: com ele,
 * dobrar continua dobrando exatamente até uma aposta de 375 créditos, e
 * a aposta padrão da casa é 100. Passar do teto é a mesa dizendo "está
 * cheia", que é a leitura certa quando o pote é grande demais para
 * contar de relance.
 */
export const CHIP_MAX = 30;

/** Quantas fichas este valor põe no feltro. Zero não desenha pote. */
export function potChips(stake: number): number {
  if (!Number.isFinite(stake) || stake <= 0) return 0;
  // O piso de 1 é o que mantém a aposta mínima (10) visível: menos de
  // meia ficha ainda é dinheiro na mesa.
  return Math.min(CHIP_MAX, Math.max(1, Math.round(stake / CHIP_UNIT)));
}

/**
 * Reparte as fichas em COLUNAS, como um pote de verdade — nenhuma mesa
 * empilha trinta fichas numa torre só, e uma torre dessas não caberia na
 * faixa livre entre as duas mãos.
 *
 * As colunas são EQUILIBRADAS (a diferença entre a mais alta e a mais
 * baixa nunca passa de uma ficha): oito fichas viram 4+4, não 6+2. É o
 * que faz o pote crescer para os lados de forma legível — uma coluna
 * vira duas quando a aposta dobra, e o olho lê isso sem contar.
 *
 * @param perColumn Altura máxima de uma coluna, que muda por cena: a
 *                  negociação tem feltro de sobra e empilha alto; o duelo
 *                  tem uma faixa estreita e espalha.
 */
export function potColumns(count: number, perColumn: number): number[] {
  if (count <= 0 || perColumn <= 0) return [];
  const columns = Math.ceil(count / perColumn);
  const base = Math.floor(count / columns);
  const rest = count % columns;
  return Array.from({ length: columns }, (_, index) => base + (index < rest ? 1 : 0));
}
