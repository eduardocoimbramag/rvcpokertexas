import type { TournamentPlayer } from './types';
import { CASH_SEATS } from './types';

/**
 * A ROTAÇÃO DO PONTO DE VISTA da mesa de 6.
 *
 * A mesa tem seis cadeiras numeradas, e elas são as MESMAS para todo
 * mundo — a cadeira 3 é a cadeira 3 para qualquer um que olhe. É essa
 * numeração que a ordem da palavra usa, e é ela que o servidor um dia vai
 * emitir.
 *
 * O que muda de pessoa para pessoa é o LUGAR NA TELA. Você fica sempre
 * embaixo, olhando a mesa de cima; o que varia é quem aparece à sua
 * esquerda e à sua direita — foi exatamente o que o dono pediu:
 *
 *   > "o pov será sempre o mesmo, independente de onde você sentar, a
 *   > única diferença e quem vai estar na sua esquerda/direita"
 *
 * A conta é uma rotação circular, e ela vive aqui — fora dos componentes
 * — por dois motivos: é lógica pura (dá teste sem montar tela) e um
 * arquivo de componente que exporta função quebra o fast refresh do Vite.
 * É o mesmo motivo de `tableLayout.ts`, que desenha as faixas com o
 * resultado desta rotação.
 */

/**
 * As cadeiras na ordem de TELA, começando por você.
 *
 * Devolve os índices REAIS das cadeiras — nunca os jogadores —, porque
 * quem desenha precisa dos dois: o índice para falar com a mesa
 * ("sentar na 4", "é a vez da 2") e a posição na lista para saber onde
 * pintar. Trocar isso por uma lista de jogadores perderia a identidade
 * da cadeira, que é o que a mesa entende.
 *
 * ```
 * seatsFromPov(0) → [0, 1, 2, 3, 4, 5]
 * seatsFromPov(3) → [3, 4, 5, 0, 1, 2]
 * ```
 *
 * Em ambos os casos o primeiro da lista é VOCÊ, e o segundo é quem está
 * à sua esquerda — que no poker é quem fala depois de você, e por isso a
 * ordem é esta e não a inversa.
 */
export function seatsFromPov(you: number, total: number = CASH_SEATS): number[] {
  if (total <= 0) return [];
  const start = ((you % total) + total) % total; // aceita índice negativo
  return Array.from({ length: total }, (_, i) => (start + i) % total);
}

/**
 * Os RIVAIS na ordem de tela, da sua esquerda até a sua direita — é a
 * lista que as faixas da mesa consomem (ver `laneSlices`).
 *
 * Sem você, portanto: você não é rival de si mesmo e não entra na conta
 * das faixas, porque o seu lugar é fixo embaixo.
 */
export function rivalsFromPov(you: number, total: number = CASH_SEATS): number[] {
  return seatsFromPov(you, total).slice(1);
}

/**
 * Quem senta à sua ESQUERDA. No poker é quem fala logo depois de você —
 * a informação que uma cadeira vazia carrega quando se escolhe onde
 * sentar, e a única coisa que a escolha de cadeira de fato decide.
 */
export function leftOf(seat: number, total: number = CASH_SEATS): number {
  return (((seat + 1) % total) + total) % total;
}

/** Quem senta à sua DIREITA: fala logo antes de você. */
export function rightOf(seat: number, total: number = CASH_SEATS): number {
  return (((seat - 1) % total) + total) % total;
}

/**
 * A frase que uma cadeira vazia diz antes de você sentar nela.
 *
 * É a ÚNICA informação real que a escolha carrega — e por isso ela é
 * dita por extenso em vez de ficar implícita na posição do botão. Uma
 * cadeira ao lado de uma vazia não promete vizinho nenhum, então a
 * frase se cala em vez de inventar.
 */
export function neighbourHint(
  seat: number,
  seats: readonly (TournamentPlayer | null)[],
): string | null {
  const total = seats.length;
  if (total === 0) return null;
  const left = seats[leftOf(seat, total)] ?? null;
  const right = seats[rightOf(seat, total)] ?? null;
  if (left && right) return `Entre ${right.name} e ${left.name}`;
  if (left) return `À direita de ${left.name}`;
  if (right) return `À esquerda de ${right.name}`;
  return null;
}

/** Quantas cadeiras ainda estão livres. */
export function freeSeats(seats: readonly (TournamentPlayer | null)[]): number {
  return seats.reduce<number>((n, seat) => (seat === null ? n + 1 : n), 0);
}

/** Onde você está sentado; `-1` se ainda não sentou. */
export function seatOf(seats: readonly (TournamentPlayer | null)[], playerId: string): number {
  return seats.findIndex((seat) => seat?.id === playerId);
}
