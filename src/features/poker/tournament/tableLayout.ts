/**
 * Geometria dos assentos da MESA ÚNICA. Vive fora dos componentes por
 * dois motivos: é lógica pura (dá teste sem montar tela) e um arquivo de
 * componente que exporta função quebra o fast refresh do Vite.
 */

/** Máximo de assentos de rival numa faixa — além disso a mão mini não
 *  caberia legível na casca de 480px. */
export const MAX_SEATS_PER_LANE = 3;

/**
 * Como os rivais se dividem em FAIXAS DE PROFUNDIDADE, da mais funda (de
 * frente para você, cartas menores) até a que encosta na sua mão. É o
 * desenho de uma mesa de cassino vista de cima — e a profundidade é
 * informação de layout, porque é dela que sai o tamanho da carta de cada
 * faixa.
 *
 *  2 rivais → [2]        3 → [3]
 *  4 rivais → [2, 2]     5 → [3, 2]
 */
export function splitLanes(rivals: number): number[] {
  if (rivals <= 0) return [];
  if (rivals <= MAX_SEATS_PER_LANE) return [rivals];
  const back = Math.ceil(rivals / 2);
  return [back, rivals - back];
}

/**
 * Os índices de cada faixa, já fatiados — evita acumulador mutável no
 * meio de um render (e deixa a divisão testável de uma vez).
 */
export function laneSlices(rivals: number): { start: number; count: number }[] {
  let start = 0;
  return splitLanes(rivals).map((count) => {
    const slice = { start, count };
    start += count;
    return slice;
  });
}
