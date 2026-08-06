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

/* ---------------- O MONTANTE DE CADA JOGADOR ---------------- */

/**
 * AS QUATRO FICHAS DA CASA, do valor mais alto ao mais baixo.
 *
 * O montante de um duelista não pode ser contado como o pote é contado.
 * O pote anda em dezenas e uma unidade fixa serve: dobrar a aposta dobra
 * as fichas, e o olho lê. Um STACK anda em milhares — com a unidade do
 * pote, um buy-in de 5.000 viraria duzentas fichas, e não há feltro que
 * as mostre nem olho que as conte.
 *
 * A saída é a de qualquer sala de verdade: fichas de VALORES DIFERENTES,
 * cada valor com a sua cor. Deixa de se contar fichas e passa-se a ler
 * cores — três douradas são três mil, e isso se vê de relance sem contar
 * nada. É também o que mantém o montante do mesmo TAMANHO das fichas do
 * pote: uma ficha é uma ficha em toda a mesa, e o que muda é quanto ela
 * vale.
 */
export const CHIP_DENOMINATIONS = [1000, 500, 100, 25] as const;
export type ChipDenomination = (typeof CHIP_DENOMINATIONS)[number];

/**
 * Quantas fichas cabem no montante antes de ele passar da faixa livre
 * ao lado da mão.
 *
 * Duas colunas de seis é o que o vão entre a mão e a borda do feltro
 * comporta num aparelho de 360px — medido, não estimado. Passar disso
 * não é um montante grande, é um montante fora da tela.
 */
export const RACK_PER_COLUMN = 6;
export const RACK_MAX_CHIPS = RACK_PER_COLUMN * 2;

/**
 * Os degraus de arredondamento, do mais fino ao mais grosso.
 *
 * Um stack é um número qualquer (o menor lance da mesa é UM crédito), e
 * 3.076 não se escreve em fichas de 25. Arredondar é obrigatório, e o
 * degrau é escolhido pelo que CABE: começa fino e engrossa até o
 * montante caber na faixa. É o mesmo que um crupiê faz ao trocar as
 * fichas miúdas de quem está ganhando muito — a pilha continua legível
 * porque o valor de cada ficha subiu.
 */
const ROUNDING_STEPS = [25, 100, 500, 1000] as const;

/** Uma coluna do montante: N fichas de um mesmo valor. */
export interface ChipGroup {
  value: ChipDenomination;
  count: number;
}

/** Reparte um valor nas fichas da casa, da mais alta para a mais baixa. */
function breakDown(amount: number): ChipGroup[] {
  let left = amount;
  const groups: ChipGroup[] = [];
  for (const value of CHIP_DENOMINATIONS) {
    const count = Math.floor(left / value);
    if (count > 0) {
      groups.push({ value, count });
      left -= count * value;
    }
  }
  return groups;
}

/**
 * O MONTANTE de um duelista em fichas da casa.
 *
 * Devolve os grupos já prontos para desenhar — cor por cor, do valor mais
 * alto ao mais baixo. O arredondamento engrossa sozinho até o montante
 * caber na faixa livre (ver `ROUNDING_STEPS`): com isso um stack de
 * 6.724 vira seis douradas, uma roxa, duas vinho e uma clara, e um de
 * 9.900 vira dez douradas — nos dois casos uma pilha que se lê.
 *
 * O piso de uma ficha é deliberado: quem está por um fio tem POUCO, e a
 * diferença entre pouco e nada é a própria sessão.
 */
export function rackChips(stack: number): ChipGroup[] {
  if (!Number.isFinite(stack) || stack <= 0) return [];

  for (const step of ROUNDING_STEPS) {
    const rounded = Math.round(stack / step) * step;
    // Arredondar para baixo até zero apagaria da mesa quem ainda tem
    // fichas: o piso é uma ficha do menor valor.
    if (rounded <= 0) continue;
    const groups = breakDown(rounded);
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    if (total > 0 && total <= RACK_MAX_CHIPS) return groups;
  }

  // Piso: uma ficha do menor valor. Quem tem pouco tem POUCO, e a
  // diferença entre pouco e nada é a própria sessão.
  return [{ value: 25, count: 1 }];
}
