import { describe, expect, it } from 'vitest';

import {
  CATEGORY_NAME,
  HAND_CATEGORIES,
  bestHand,
  categoryLevel,
  categoryStrength,
  compareRanks,
  decidingCard,
  decidingHand,
  readHand,
  readHoleCards,
  pokerValue,
  rankFiveCards,
} from '../engine/poker/handRank';
import type { Card, CardRank, CardSuit } from '../engine/types';

/**
 * Atalho de notação: 'As' = Ás de espadas, 'Kh' = Rei de copas, 'Td' = 10
 * de ouros. As mãos ficam legíveis como se estivessem sobre a mesa.
 */
function hand(notation: string): Card[] {
  return notation.split(' ').map(parseCard);
}

function parseCard(token: string): Card {
  const suits: Record<string, CardSuit> = {
    s: 'spades',
    h: 'hearts',
    d: 'diamonds',
    c: 'clubs',
  };
  const rankToken = token.slice(0, -1);
  const suit = suits[token.slice(-1)];
  if (!suit) throw new Error(`Naipe desconhecido em "${token}"`);
  const rank = (rankToken === 'T' ? '10' : rankToken) as CardRank;
  return { rank, suit };
}

describe('pokerValue', () => {
  it('o Ás é a carta mais alta do baralho (14), não 11', () => {
    expect(pokerValue('A')).toBe(14);
    expect(pokerValue('K')).toBe(13);
    expect(pokerValue('Q')).toBe(12);
    expect(pokerValue('J')).toBe(11);
    expect(pokerValue('10')).toBe(10);
    expect(pokerValue('2')).toBe(2);
  });
});

describe('categorias', () => {
  it('vão da carta alta ao straight flush, em ordem crescente de força', () => {
    expect(HAND_CATEGORIES).toHaveLength(9);
    expect(categoryStrength('high-card')).toBe(0);
    expect(categoryStrength('pair')).toBeLessThan(categoryStrength('two-pair'));
    expect(categoryStrength('flush')).toBeLessThan(categoryStrength('full-house'));
    expect(categoryStrength('straight-flush')).toBe(8);
  });
});

describe('rankFiveCards', () => {
  it('reconhece cada categoria do baralho', () => {
    expect(rankFiveCards(hand('As Ks Qs Js Ts')).category).toBe('straight-flush');
    expect(rankFiveCards(hand('9s 9h 9d 9c 2s')).category).toBe('quads');
    expect(rankFiveCards(hand('Ks Kh Kd 4c 4s')).category).toBe('full-house');
    expect(rankFiveCards(hand('As Js 9s 6s 3s')).category).toBe('flush');
    expect(rankFiveCards(hand('9s 8h 7d 6c 5s')).category).toBe('straight');
    expect(rankFiveCards(hand('7s 7h 7d Kc 2s')).category).toBe('trips');
    expect(rankFiveCards(hand('Qs Qh 5d 5c 2s')).category).toBe('two-pair');
    expect(rankFiveCards(hand('Js Jh 8d 4c 2s')).category).toBe('pair');
    expect(rankFiveCards(hand('As Jh 9d 6c 3s')).category).toBe('high-card');
  });

  it('o straight flush até o Ás é o royal flush, e tem nome próprio', () => {
    expect(rankFiveCards(hand('As Ks Qs Js Ts')).label).toBe('Royal flush');
    expect(rankFiveCards(hand('9h 8h 7h 6h 5h')).label).toBe('Straight flush ao 9');
  });

  it('a roda (A-2-3-4-5) é a sequência mais FRACA: vale 5 no topo, não Ás', () => {
    const wheel = rankFiveCards(hand('As 2h 3d 4c 5s'));
    const sixHigh = rankFiveCards(hand('6s 5h 4d 3c 2s'));
    expect(wheel.category).toBe('straight');
    expect(wheel.label).toBe('Sequência ao 5');
    // A roda perde até para a sequência imediatamente acima dela.
    expect(compareRanks(wheel, sixHigh)).toBeLessThan(0);
  });

  it('a roda de mesmo naipe é um straight flush ao 5, não ao Ás', () => {
    const steelWheel = rankFiveCards(hand('Ah 2h 3h 4h 5h'));
    expect(steelWheel.category).toBe('straight-flush');
    expect(steelWheel.label).toBe('Straight flush ao 5');
    expect(compareRanks(steelWheel, rankFiveCards(hand('As Ks Qs Js Ts')))).toBeLessThan(0);
  });

  it('desempata dentro da categoria pelos critérios na ordem certa', () => {
    // Dois pares: o par maior decide antes do menor, que decide antes do kicker.
    const aces = rankFiveCards(hand('As Ah 2d 2c 9s'));
    const kings = rankFiveCards(hand('Ks Kh Qd Qc 9s'));
    expect(compareRanks(aces, kings)).toBeGreaterThan(0);

    const kingsNine = rankFiveCards(hand('Ks Kh 9d 9c As'));
    const kingsNineLow = rankFiveCards(hand('Ks Kh 9d 9c 4s'));
    expect(compareRanks(kingsNine, kingsNineLow)).toBeGreaterThan(0);
    expect(compareRanks(kingsNineLow, kingsNine)).toBeLessThan(0);
  });

  it('mãos de força idêntica empatam — é o pote dividido', () => {
    const left = rankFiveCards(hand('As Kh Qd Jc 9s'));
    const right = rankFiveCards(hand('Ah Kd Qc Js 9h'));
    expect(compareRanks(left, right)).toBe(0);
  });

  it('recusa uma mão que não tenha exatamente cinco cartas', () => {
    expect(() => rankFiveCards(hand('As Kh Qd Jc'))).toThrow(RangeError);
  });

  it('nomeia a mão em português, com as faces por extenso', () => {
    expect(rankFiveCards(hand('As Ah 2d 2c 9s')).label).toBe('Dois pares, Ases e 2');
    expect(rankFiveCards(hand('Ks Kh Kd 4c 4s')).label).toBe('Full house, Reis com 4');
    expect(rankFiveCards(hand('7s 7h 7d Kc 2s')).label).toBe('Trinca de 7');
    expect(rankFiveCards(hand('Qs Qh 5d 3c 2s')).label).toBe('Par de Damas');
    expect(rankFiveCards(hand('As Js 9s 6s 3s')).label).toBe('Flush de espadas');
    expect(rankFiveCards(hand('As Jh 9d 6c 3s')).label).toBe('Carta alta: Ás');
  });
});

describe('categoryLevel e CATEGORY_NAME', () => {
  it('a força vai de 1 (carta alta) a 9 (straight flush)', () => {
    expect(categoryLevel('high-card')).toBe(1);
    expect(categoryLevel('two-pair')).toBe(3);
    expect(categoryLevel('straight-flush')).toBe(9);
  });

  it('toda categoria tem nome próprio em português', () => {
    for (const category of HAND_CATEGORIES) {
      expect(CATEGORY_NAME[category].length).toBeGreaterThan(0);
    }
    expect(CATEGORY_NAME['two-pair']).toBe('Dois pares');
    expect(CATEGORY_NAME['full-house']).toBe('Full house');
  });
});

describe('detail — o que decide dentro da categoria', () => {
  it('separa o que completa a mão do nome dela', () => {
    expect(rankFiveCards(hand('As Ah 2d 2c 9s')).detail).toBe('Ases e 2');
    expect(rankFiveCards(hand('Ks Kh Kd 4c 4s')).detail).toBe('Reis com 4');
    expect(rankFiveCards(hand('7s 7h 7d Kc 2s')).detail).toBe('de 7');
    expect(rankFiveCards(hand('9s 8h 7d 6c 5s')).detail).toBe('ao 9');
    expect(rankFiveCards(hand('As Js 9s 6s 3s')).detail).toBe('de espadas');
  });

  it('o royal flush não tem o que completar', () => {
    expect(rankFiveCards(hand('As Ks Qs Js Ts')).detail).toBe('');
  });

  it('duas mãos da MESMA categoria se separam pelo detalhe', () => {
    // É este par de textos que o embate do showdown acende quando as
    // duas forças marcam igual.
    const aces = rankFiveCards(hand('As Ah 4d 7c 9s'));
    const kings = rankFiveCards(hand('Ks Kh 4d 7c 9s'));
    expect(categoryLevel(aces.category)).toBe(categoryLevel(kings.category));
    expect(aces.detail).not.toBe(kings.detail);
  });
});

/** Lê as duas fechadas escritas na notação da mesa. */
function fechadas(notation: string) {
  const [first, second] = hand(notation);
  if (!first || !second) throw new Error('Uma mão fechada tem duas cartas.');
  return readHoleCards(first, second);
}

/** As duas fechadas como par, para o `readHand`. */
function par(notation: string): [Card, Card] {
  const [first, second] = hand(notation);
  if (!first || !second) throw new Error('Uma mão fechada tem duas cartas.');
  return [first, second];
}

describe('readHoleCards — a leitura das duas fechadas', () => {
  const hole = (notation: string): string => fechadas(notation).label;

  it('um par tem nome desde o pré-flop', () => {
    expect(hole('As Ah')).toBe('Par de Ases');
  });

  it('sem par não há combinação: o que se tem é carta alta', () => {
    expect(hole('Kh As')).toBe('Carta alta: Ás');
    expect(hole('7s 2h')).toBe('Carta alta: 7');
  });

  it('duas fechadas se COMPARAM como qualquer outra mão', () => {
    // É o que permite pôr lado a lado, num pré-flop desistido, o que
    // cada um tinha na mão.
    const ases = fechadas('As Ah');
    const reis = fechadas('Ks Kh');
    const lixo = fechadas('7s 2h');
    expect(compareRanks(ases, reis)).toBeGreaterThan(0);
    expect(compareRanks(reis, lixo)).toBeGreaterThan(0);
    expect(ases.cards).toHaveLength(2);
  });

  it('a leitura fala de MÃO, não de cartas — o naipe não muda a leitura', () => {
    // "Ás-Rei do mesmo naipe" descrevia as cartas e deixava para quem lê
    // a tradução para o que elas valem, que é o trabalho da placa.
    expect(hole('As Ks')).toBe('Carta alta: Ás');
    expect(hole('As Kh')).toBe('Carta alta: Ás');
  });
});

describe('decidingCard — o que responde "como é que ele ganhou?"', () => {
  it('nomeia o kicker quando as duas mãos leem igual', () => {
    /* O caso que a mesa mostrou e ninguém entendeu: o par de Damas
       estava no BOARD, os dois o tinham, e as duas placas escreveram
       "Par de Damas" — com a coroa numa delas. Quem decidiu foi o Ás. */
    const board = 'Qs Qh 7d 4c 2s';
    const meu = bestHand(hand(`Ah 9c ${board}`));
    const dele = bestHand(hand(`Kd 8c ${board}`));

    expect(meu.label).toBe(dele.label);
    expect(compareRanks(meu, dele)).toBeGreaterThan(0);
    expect(decidingCard(meu, dele)).toEqual({ rank: 'A', suit: 'hearts' });
  });

  it('desce até o kicker que realmente separou as duas', () => {
    // Mesmo par e mesmo primeiro kicker: quem decide é o segundo.
    const board = 'Qs Qh Ad 4c 2s';
    const meu = bestHand(hand(`9h 3c ${board}`));
    const dele = bestHand(hand(`8d 3s ${board}`));
    expect(meu.label).toBe(dele.label);
    expect(decidingCard(meu, dele)).toEqual({ rank: '9', suit: 'hearts' });
  });

  it('com categorias diferentes não há o que explicar: o nome basta', () => {
    const trinca = bestHand(hand('7s 7h 7d Kc 2s'));
    const par = bestHand(hand('As Ah 9d 6c 3s'));
    expect(decidingCard(trinca, par)).toBeUndefined();
  });

  it('duas mãos idênticas não têm carta que as separe', () => {
    const board = 'Ts Jh Qc Kd 9s';
    const meu = bestHand(hand(`2c 3d ${board}`));
    const dele = bestHand(hand(`2h 3s ${board}`));
    expect(compareRanks(meu, dele)).toBe(0);
    expect(decidingCard(meu, dele)).toBeUndefined();
  });
});

describe('decidingHand — o que a placa do desfecho mostra', () => {
  /** Só as faces, que é o que se confere de relance numa placa. */
  const faces = (cards: readonly Card[]) => cards.map((card) => card.rank);

  it('um par são DUAS cartas, não a mão de cinco', () => {
    const mao = bestHand(hand('Ks Kh 9d 7c 3s'));
    expect(faces(decidingHand(mao))).toEqual(['K', 'K']);
  });

  it('dois pares são quatro; a trinca, três; a quadra, quatro', () => {
    expect(faces(decidingHand(bestHand(hand('Ks Kh 9d 9c 3s'))))).toEqual(['K', 'K', '9', '9']);
    expect(faces(decidingHand(bestHand(hand('7s 7h 7d Kc 2s'))))).toEqual(['7', '7', '7']);
    expect(faces(decidingHand(bestHand(hand('4s 4h 4d 4c 2s'))))).toEqual(['4', '4', '4', '4']);
  });

  it('sequência, flush e full house gastam as cinco: ali as cinco SÃO a mão', () => {
    expect(decidingHand(bestHand(hand('9s 8h 7d 6c 5s')))).toHaveLength(5);
    expect(decidingHand(bestHand(hand('As Ks 9s 7s 3s')))).toHaveLength(5);
    expect(decidingHand(bestHand(hand('Ks Kh Kd 9c 9s')))).toHaveLength(5);
  });

  it('a carta alta é UMA: a mais alta', () => {
    expect(faces(decidingHand(bestHand(hand('As Kh 9d 7c 3s'))))).toEqual(['A']);
  });

  it('o kicker que decidiu entra ao lado da combinação', () => {
    /* O caso do print: par de Reis no board, e o 9 separando as duas
       mãos. A placa mostra K K 9 — a combinação e o que a decidiu. */
    const board = 'Ks Kh 4d 3c 2s';
    const meu = bestHand(hand(`9h 5c ${board}`));
    const dele = bestHand(hand(`8d 5s ${board}`));
    const kicker = decidingCard(meu, dele);
    expect(kicker).toEqual({ rank: '9', suit: 'hearts' });
    expect(faces(decidingHand(meu, kicker))).toEqual(['K', 'K', '9']);
  });

  it('um kicker que já está na combinação não entra duas vezes', () => {
    // Num flush as cinco já estão em cena: a que decidiu é uma delas.
    const flush = bestHand(hand('As Ks 9s 7s 3s'));
    const menor = bestHand(hand('Qs Js 9s 7s 3s'));
    const kicker = decidingCard(flush, menor);
    expect(decidingHand(flush, kicker)).toHaveLength(5);
  });

  it('as cartas saem da mais alta para a mais baixa', () => {
    const mao = bestHand(hand('3s Kh 9d Kc 7s'));
    const cartas = decidingHand(mao);
    expect(faces(cartas)).toEqual(['K', 'K']);
    expect(faces(decidingHand(bestHand(hand('9s 8h 7d 6c 5s'))))).toEqual([
      '9',
      '8',
      '7',
      '6',
      '5',
    ]);
  });
});

describe('readHand — a porta única de "o que esta mão é"', () => {
  it('sem comunitárias, lê as duas fechadas', () => {
    const leitura = readHand(par('As Ah'), []);
    expect(leitura.label).toBe('Par de Ases');
    expect(leitura.cards).toHaveLength(2);
  });

  it('do flop em diante, lê a melhor de cinco', () => {
    const leitura = readHand(par('As Ah'), hand('2c 7d 9h'));
    expect(leitura.label).toBe('Par de Ases');
    expect(leitura.cards).toHaveLength(5);
  });

  it('é a MESMA leitura que o showdown usa — não há duas verdades', () => {
    const hole = par('As Ah');
    const board = hand('2c 7d 9h Js 4h');
    expect(readHand(hole, board).score).toEqual(bestHand([...hole, ...board]).score);
  });
});

describe('bestHand', () => {
  it('acha a melhor mão de cinco entre as sete disponíveis', () => {
    // Duas fechadas + cinco na mesa: o flush está lá, escondido entre elas.
    const best = bestHand(hand('As 4s Ks 9s 2h 7s 3d'));
    expect(best.category).toBe('flush');
    expect(best.cards).toHaveLength(5);
  });

  it('descarta as duas cartas que não ajudam', () => {
    const best = bestHand(hand('Ah Ad Kc Kh Ks 2c 3d'));
    // Full house de Reis com Ases ganha do full de Ases com Reis.
    expect(best.category).toBe('full-house');
    expect(best.label).toBe('Full house, Reis com Ases');
  });

  it('lê a mão já no flop, com só cinco cartas na conta', () => {
    const flop = bestHand(hand('As Ah 7d 7c 2s'));
    expect(flop.category).toBe('two-pair');
  });

  it('recusa menos de cinco ou mais de sete cartas', () => {
    expect(() => bestHand(hand('As Ah 7d 7c'))).toThrow(RangeError);
    expect(() => bestHand(hand('As Ah 7d 7c 2s 3s 4s 5s'))).toThrow(RangeError);
  });

  it('o naipe não vale nada: duas mãos iguais em naipes diferentes empatam', () => {
    const left = bestHand(hand('As Ks 2h 3d 7c 9s Td'));
    const right = bestHand(hand('Ah Kh 2s 3c 7d 9h Ts'));
    expect(compareRanks(left, right)).toBe(0);
  });
});
