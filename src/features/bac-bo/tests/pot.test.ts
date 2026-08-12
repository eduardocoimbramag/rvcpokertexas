import { describe, expect, it } from 'vitest';

import {
  CHIP_DENOMINATIONS,
  CHIP_MAX,
  RACK_MAX_CHIPS,
  chipCount,
  chipsFor,
  flatChips,
  potColumns,
  rackChips,
} from '../components/table/pot';

const soma = (groups: readonly { value: number; count: number }[]) =>
  groups.reduce((total, g) => total + g.value * g.count, 0);

/**
 * A CONTA DE FICHAS é a única peça da mesa em que o desenho PROMETE um
 * número. Se ela deixar de ser exata, nada quebra e nenhum teste de
 * layout falha — o monte no meio do feltro simplesmente passa a dizer
 * uma coisa enquanto a cifra embaixo dele diz outra. Foi o que
 * aconteceu: o pote contava fichas de valor único e o montante repartia
 * por valor, e as duas contas nunca bateram.
 */
describe('as fichas dizem o valor que está na mesa', () => {
  it('A REPARTIÇÃO É EXATA — é o contrato da peça', () => {
    /* Qualquer número, e o número que o dono viu no print (2.140). Com a
       menor ficha valendo 25 isto era impossível. */
    for (const amount of [1, 2, 3, 7, 13, 24, 25, 26, 99, 140, 2140, 4877, 9999]) {
      expect(soma(chipsFor(amount, 99)), `${amount}`).toBe(amount);
    }
  });

  it('e é a de MENOR número de fichas possível', () => {
    /* O conjunto da casa é canônico: a gulosa é ótima. A prova por
       exaustão contra a programação dinâmica, para todo valor até 1.200
       — se alguém acrescentar uma ficha que quebre a canonicidade, este
       teste cai. */
    const valores = [...CHIP_DENOMINATIONS];
    const otimo = [0, ...Array<number>(1200).fill(Number.POSITIVE_INFINITY)];
    for (let n = 1; n <= 1200; n += 1) {
      for (const v of valores) {
        if (v <= n) otimo[n] = Math.min(otimo[n] ?? Infinity, (otimo[n - v] ?? Infinity) + 1);
      }
    }
    for (let n = 1; n <= 1200; n += 1) {
      expect(chipCount(chipsFor(n, 99)), `${n}`).toBe(otimo[n]);
    }
  });

  it('a repartição achatada empilha da MENOR para a MAIOR', () => {
    /* Numa pilha vista de lado só a ficha do topo aparece inteira: com a
       menor no topo, um pote de 2.030 era coroado por uma de 5 e lia
       como troco. */
    const fichas = flatChips(chipsFor(1236, 99));
    expect(fichas).toEqual([1, 10, 25, 100, 100, 1000]);
    expect(fichas).toEqual([...fichas].sort((a, b) => a - b));
  });

  it('só ENGROSSA quando o exato não cabe — e nunca antes', () => {
    /* Um stack de 2.140 cabe em 10 fichas: o desenho é exato. Um de
       999.999 não cabe em teto nenhum, e aí a mesa troca as miúdas por
       fichas de valor maior, que é o que um crupiê faz. */
    expect(soma(chipsFor(2140, RACK_MAX_CHIPS))).toBe(2140);
    expect(chipCount(chipsFor(2140, RACK_MAX_CHIPS))).toBeLessThanOrEqual(RACK_MAX_CHIPS);
    expect(chipCount(chipsFor(999_999, RACK_MAX_CHIPS))).toBeLessThanOrEqual(RACK_MAX_CHIPS);
  });

  it('quem tem pouco não some da mesa', () => {
    expect(chipsFor(1, RACK_MAX_CHIPS)).toEqual([{ value: 1, count: 1 }]);
    expect(chipCount(chipsFor(1, RACK_MAX_CHIPS))).toBe(1);
  });

  it('sem valor não há ficha (o torneio joga com stake 0)', () => {
    expect(chipsFor(0, CHIP_MAX)).toEqual([]);
    expect(chipsFor(-50, CHIP_MAX)).toEqual([]);
    expect(chipsFor(Number.NaN, CHIP_MAX)).toEqual([]);
  });

  it('o montante é a mesma conta, no espaço da faixa da mão', () => {
    expect(rackChips(2140)).toEqual(chipsFor(2140, RACK_MAX_CHIPS));
    expect(chipCount(rackChips(9999))).toBeLessThanOrEqual(RACK_MAX_CHIPS);
  });
});

describe('pot — as colunas do monte', () => {
  const somaColunas = (c: number[]) => c.reduce((total, n) => total + n, 0);

  it('reparte tudo o que existe, sem perder nem inventar ficha', () => {
    for (let count = 0; count <= CHIP_MAX; count += 1) {
      for (const perColumn of [6, 8]) {
        expect(somaColunas(potColumns(count, perColumn)), `${count}/${perColumn}`).toBe(count);
      }
    }
  });

  it('equilibra as colunas: a diferença entre a maior e a menor é no máximo uma ficha', () => {
    // Oito fichas viram 4+4, não 6+2 — é o que faz o pote crescer para
    // os lados de forma legível.
    for (let count = 1; count <= CHIP_MAX; count += 1) {
      const colunas = potColumns(count, 6);
      expect(Math.max(...colunas) - Math.min(...colunas), `${count} fichas`).toBeLessThanOrEqual(1);
    }
    expect(potColumns(8, 6)).toEqual([4, 4]);
  });

  it('nenhuma coluna passa da altura permitida pela cena', () => {
    for (let count = 1; count <= CHIP_MAX; count += 1) {
      for (const perColumn of [6, 8]) {
        expect(Math.max(...potColumns(count, perColumn))).toBeLessThanOrEqual(perColumn);
      }
    }
  });

  it('dobrar as fichas nunca mais que dobra a largura do monte', () => {
    // A largura é o número de colunas. Se ela crescesse mais que o
    // dobro, o pote estouraria a faixa justamente quando o jogador
    // dobrasse a aposta — o pior momento possível.
    for (let count = 1; count <= CHIP_MAX / 2; count += 1) {
      const antes = potColumns(count, 6).length;
      const depois = potColumns(count * 2, 6).length;
      expect(depois, `${count} → ${count * 2}`).toBeLessThanOrEqual(antes * 2);
    }
  });

  it('sem fichas não há coluna nenhuma', () => {
    expect(potColumns(0, 6)).toEqual([]);
    expect(potColumns(5, 0)).toEqual([]);
  });
});
