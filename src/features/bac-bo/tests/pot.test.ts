import { describe, expect, it } from 'vitest';

import { CHIP_MAX, CHIP_UNIT, potChips, potColumns } from '../components/table/pot';
import { MIN_STAKE, TABLE_ANTE } from '../engine/credits';

/**
 * O pote é a única peça da mesa cujo VALOR é lido em quantidade, não em
 * número. Se a conta deixar de ser proporcional, nada quebra e nenhum
 * teste de layout falha — o jogador só deixa de sentir que dobrou a
 * aposta. Por isso o contrato mora aqui, escrito como regra.
 */
describe('pot — quantas fichas o valor da mesa vale', () => {
  it('DOBRAR A APOSTA DOBRA AS FICHAS — é o contrato da peça', () => {
    // A conta anterior era afim (2 + stake/50): dobrar 100 levava de 4
    // para 6 fichas, e o gesto de dobrar mal aparecia na mesa.
    for (const stake of [25, 50, 100, 150, 175]) {
      expect(potChips(stake * 2), `dobro de ${stake}`).toBe(potChips(stake) * 2);
    }
  });

  it('a aposta padrão da casa põe quatro fichas na mesa', () => {
    expect(potChips(TABLE_ANTE)).toBe(4);
    expect(potChips(TABLE_ANTE * 2)).toBe(8);
  });

  it('a aposta mínima ainda é dinheiro na mesa: nunca some', () => {
    expect(potChips(MIN_STAKE)).toBe(1);
    expect(potChips(1)).toBe(1);
  });

  it('sem valor na mesa não há pote (o torneio joga com stake 0)', () => {
    expect(potChips(0)).toBe(0);
    expect(potChips(-50)).toBe(0);
    expect(potChips(Number.NaN)).toBe(0);
  });

  it('satura no teto, e o teto está fora do alcance de quem joga', () => {
    expect(potChips(CHIP_UNIT * CHIP_MAX)).toBe(CHIP_MAX);
    expect(potChips(999_999)).toBe(CHIP_MAX);
    // O dobro exato vale até 375 — bem acima da aposta padrão de 100.
    const ultimoExato = (CHIP_MAX / 2) * CHIP_UNIT;
    expect(potChips(ultimoExato * 2)).toBe(potChips(ultimoExato) * 2);
  });
});

describe('pot — as colunas do monte', () => {
  const soma = (c: number[]) => c.reduce((total, n) => total + n, 0);

  it('reparte tudo o que existe, sem perder nem inventar ficha', () => {
    for (let count = 0; count <= CHIP_MAX; count += 1) {
      for (const perColumn of [6, 8]) {
        expect(soma(potColumns(count, perColumn)), `${count}/${perColumn}`).toBe(count);
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
