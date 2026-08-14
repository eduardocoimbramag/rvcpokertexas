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

/**
 * Teto de fichas desenhadas no pote. Existe porque a faixa livre do
 * feltro do duelo tem 92px de altura no pior aparelho — não há mesa que
 * mostre cem fichas.
 *
 * Passar do teto é a mesa dizendo "está cheia": ali ela engrossa a
 * repartição (ver `ROUNDING_STEPS`), que é o que um crupiê faz quando o
 * monte de miúdas fica alto demais para contar de relance.
 */
export const CHIP_MAX = 24;

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
 *
 * ELAS ERAM QUATRO (1.000, 500, 100 e 25), e com a menor valendo 25 a
 * mesa não conseguia escrever um número qualquer: um stack de 2.140 não
 * se reparte em fichas de 25, e o desenho dizia um valor enquanto a
 * cifra ao lado dizia outro. As três miúdas — 10, 5 e 1 — fecham
 * QUALQUER conta, e é isso que faz as fichas na mesa passarem a ser o
 * retrato do que se tem.
 *
 * O CONJUNTO É CANÔNICO, e isso importa: com {1, 5, 10, 25, 100, 500,
 * 1000} a repartição gulosa (pegar sempre a maior que couber) é
 * PROVADAMENTE a de menor número de fichas. Não é sorte — é a mesma
 * família do sistema de moedas que a régua de qualquer caixa usa. Num
 * conjunto não canônico ela falharia: com {1, 10, 25}, 30 sairia como
 * 25+1×5 (seis fichas) em vez de 10+10+10 (três).
 */
export const CHIP_DENOMINATIONS = [1000, 500, 100, 25, 10, 5, 1] as const;
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
 * O PRIMEIRO É 1 — ou seja, EXATO. Ele começava em 25, e com isso todo
 * montante era arredondado antes mesmo de a mesa perguntar se ele cabia:
 * a pilha nunca dizia o número da cifra ao lado. Agora o exato é a
 * primeira tentativa, e só se ele não couber na faixa é que a mesa
 * engrossa — que é o que um crupiê faz ao trocar as fichas miúdas de
 * quem está ganhando muito. A pilha continua legível porque o valor de
 * cada ficha subiu, e não porque o número mentiu.
 */
const ROUNDING_STEPS = [1, 5, 25, 100, 500, 1000] as const;

/** Uma coluna do montante: N fichas de um mesmo valor. */
export interface ChipGroup {
  value: ChipDenomination;
  count: number;
}

/**
 * Reparte um valor nas fichas da casa, da mais alta para a mais baixa.
 *
 * A repartição é GULOSA, e no conjunto da casa isso é o mesmo que
 * ÓTIMA: pegar sempre a maior ficha que couber devolve o menor número
 * de fichas possível (ver `CHIP_DENOMINATIONS`).
 */
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
 * UM VALOR EM FICHAS DA CASA, na repartição de MENOR número de fichas
 * que cabe no espaço disponível.
 *
 * É a única conta de fichas da mesa — a do montante de cada jogador e a
 * do pote no meio do feltro. Elas eram duas: o pote contava fichas de
 * valor único (uma a cada 25 créditos) e o montante repartia por valor,
 * e o resultado era que as fichas do meio da mesa não tinham relação com
 * a cifra escrita embaixo delas. Uma ficha é uma ficha em toda a mesa, e
 * o que ela vale tem de ser o mesmo em todo lugar.
 *
 * A CONTA TENTA O EXATO PRIMEIRO. Só se a repartição exata não couber no
 * teto é que ela engrossa, degrau a degrau (ver `ROUNDING_STEPS`) — o
 * mesmo gesto de um crupiê que troca as miúdas de quem está ganhando
 * muito. O número escrito ao lado continua sendo o verdadeiro; o que
 * cede é a granularidade do desenho, e só quando não há alternativa.
 *
 * O piso de uma ficha é deliberado: quem está por um fio tem POUCO, e a
 * diferença entre pouco e nada é a própria sessão.
 *
 * @param maxChips Quantas fichas cabem no espaço em que ela vai ser
 *                 desenhada. Muda por cena: a faixa ao lado da mão
 *                 comporta doze, o meio do feltro comporta mais.
 */
export function chipsFor(amount: number, maxChips: number): ChipGroup[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const teto = Math.max(1, Math.floor(maxChips));

  for (const step of ROUNDING_STEPS) {
    const rounded = Math.round(amount / step) * step;
    // Arredondar para baixo até zero apagaria da mesa quem ainda tem
    // fichas: o piso é uma ficha do menor valor.
    if (rounded <= 0) continue;
    const groups = breakDown(rounded);
    const total = groups.reduce((sum, group) => sum + group.count, 0);
    if (total > 0 && total <= teto) return groups;
  }

  // Piso: uma ficha do menor valor. Quem tem pouco tem POUCO, e a
  // diferença entre pouco e nada é a própria sessão.
  return [{ value: 1, count: 1 }];
}

/** Quantas fichas uma repartição põe na mesa. */
export function chipCount(groups: readonly ChipGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

/**
 * A repartição achatada, uma entrada por FICHA, na ORDEM DE EMPILHAR: a
 * de menor valor no fundo, a maior no topo.
 *
 * A ordem não é decorativa. Numa pilha vista de lado o que se vê inteiro
 * é a ficha DE CIMA, e as de baixo aparecem só pela borda — com a menor
 * no topo, um pote de 2.030 era coroado por uma ficha de 5 e lia como
 * troco. Com a maior no topo, a pilha é lida pela melhor ficha dela, que
 * é como se lê um monte numa mesa de verdade.
 */
export function flatChips(groups: readonly ChipGroup[]): ChipDenomination[] {
  return groups
    .flatMap((group) => Array.from({ length: group.count }, () => group.value))
    .reverse();
}

/**
 * O MONTANTE de um duelista em fichas da casa — a conta acima, no espaço
 * da faixa ao lado da mão.
 */
export function rackChips(stack: number, maxChips: number = RACK_MAX_CHIPS): ChipGroup[] {
  return chipsFor(stack, maxChips);
}
