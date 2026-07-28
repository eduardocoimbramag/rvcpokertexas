import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  botAction,
  buildShoe,
  dealInitialHands,
  drawCard,
  duelistCategory,
  forcedDealFor,
  handValue,
  isBust,
  isNaturalBlackjack,
  naturalProfit,
  netChangeFor,
  payoutFor,
  playBotHand,
  playDealerHand,
  rankValue,
  resolveOutcome,
  winProfit,
} from '../engine/rules';
import type { Card, CardRank, RoundOutcome } from '../engine/types';

/** Atalho para montar cartas nos testes (naipe irrelevante por padrão). */
function card(rank: CardRank, suit: Card['suit'] = 'spades'): Card {
  return { rank, suit };
}

describe('rankValue', () => {
  it('Ás vale 11; figuras e 10 valem 10; números valem a face', () => {
    expect(rankValue('A')).toBe(11);
    expect(rankValue('K')).toBe(10);
    expect(rankValue('Q')).toBe(10);
    expect(rankValue('J')).toBe(10);
    expect(rankValue('10')).toBe(10);
    expect(rankValue('7')).toBe(7);
    expect(rankValue('2')).toBe(2);
  });
});

describe('handValue', () => {
  it('soma mãos duras', () => {
    expect(handValue([card('10'), card('7')])).toEqual({ total: 17, soft: false });
    expect(handValue([card('2'), card('3'), card('4')])).toEqual({ total: 9, soft: false });
  });

  it('Ás vale 11 enquanto couber (mão soft)', () => {
    expect(handValue([card('A'), card('6')])).toEqual({ total: 17, soft: true });
    expect(handValue([card('A'), card('A')])).toEqual({ total: 12, soft: true });
    expect(handValue([card('A'), card('A'), card('9')])).toEqual({ total: 21, soft: true });
  });

  it('rebaixa o Ás para 1 quando a mão estouraria (vira dura)', () => {
    expect(handValue([card('A'), card('6'), card('10')])).toEqual({ total: 17, soft: false });
    expect(handValue([card('A'), card('K'), card('5')])).toEqual({ total: 16, soft: false });
  });

  it('detecta estouro mesmo com todos os Áses rebaixados', () => {
    expect(isBust([card('K'), card('Q'), card('5')])).toBe(true);
    expect(isBust([card('A'), card('K'), card('Q'), card('A')])).toBe(true);
    expect(isBust([card('A'), card('K'), card('Q')])).toBe(false); // 21
  });
});

describe('isNaturalBlackjack', () => {
  it('só as duas primeiras cartas somando 21 contam como natural', () => {
    expect(isNaturalBlackjack([card('A'), card('K')])).toBe(true);
    expect(isNaturalBlackjack([card('10'), card('A')])).toBe(true);
    expect(isNaturalBlackjack([card('10'), card('J')])).toBe(false); // 20
    expect(isNaturalBlackjack([card('7'), card('7'), card('7')])).toBe(false); // 21 em 3 cartas
  });
});

describe('buildShoe / drawCard', () => {
  it('monta 6 baralhos (312 cartas) com 24 Áses', () => {
    const shoe = buildShoe(new SeededRng(1));
    expect(shoe).toHaveLength(312);
    expect(shoe.filter((c) => c.rank === 'A')).toHaveLength(24);
    expect(shoe.filter((c) => c.suit === 'hearts')).toHaveLength(78);
  });

  it('o embaralhamento é determinístico por seed', () => {
    const a = buildShoe(new SeededRng(42));
    const b = buildShoe(new SeededRng(42));
    expect(a).toEqual(b);
  });

  it('drawCard consome o sapato e reclama quando ele seca', () => {
    const shoe = [card('A'), card('K')];
    expect(drawCard(shoe)).toEqual(card('K'));
    expect(shoe).toHaveLength(1);
    drawCard(shoe);
    expect(() => drawCard(shoe)).toThrow(RangeError);
  });
});

describe('dealInitialHands', () => {
  it('distribui na ordem da mesa: jogador, oponente, jogador, oponente, dealer', () => {
    // drawCard tira do FIM do array — a pilha entra invertida.
    const ordered = [card('2'), card('3'), card('4'), card('5'), card('6'), card('7')];
    const shoe = [...ordered].reverse();
    const deal = dealInitialHands(shoe);
    expect(deal.playerHand).toEqual([card('2'), card('4')]);
    expect(deal.opponentHand).toEqual([card('3'), card('5')]);
    expect(deal.dealerHand).toEqual([card('6'), card('7')]);
    expect(shoe).toHaveLength(0);
  });
});

describe('botAction (estratégia básica)', () => {
  it('mãos duras: para em 17+, pede abaixo de 12', () => {
    expect(botAction([card('10'), card('7')], card('A'))).toBe('stand');
    expect(botAction([card('5'), card('6')], card('2'))).toBe('hit');
  });

  it('12 a 16 seguram contra dealer fraco e pedem contra dealer forte', () => {
    expect(botAction([card('10'), card('6')], card('6'))).toBe('stand');
    expect(botAction([card('10'), card('6')], card('10'))).toBe('hit');
    expect(botAction([card('10'), card('2')], card('4'))).toBe('stand');
    expect(botAction([card('10'), card('2')], card('2'))).toBe('hit');
  });

  it('soft: pede até soft 17, decide soft 18 pela carta do dealer', () => {
    expect(botAction([card('A'), card('6')], card('6'))).toBe('hit'); // soft 17
    expect(botAction([card('A'), card('7')], card('6'))).toBe('stand'); // soft 18 vs fraco
    expect(botAction([card('A'), card('7')], card('9'))).toBe('hit'); // soft 18 vs forte
    expect(botAction([card('A'), card('8')], card('A'))).toBe('stand'); // soft 19
  });
});

describe('playDealerHand (S17)', () => {
  it('para seco em 17 duro sem comprar', () => {
    const shoe = [card('5')];
    const hand = playDealerHand(shoe, [card('9'), card('8')]);
    expect(hand).toHaveLength(2);
    expect(shoe).toHaveLength(1);
  });

  it('para em soft 17 (regra S17)', () => {
    const shoe = [card('5')];
    const hand = playDealerHand(shoe, [card('A'), card('6')]);
    expect(hand).toHaveLength(2);
    expect(handValue(hand)).toEqual({ total: 17, soft: true });
  });

  it('compra até alcançar pelo menos 17', () => {
    const shoe = [card('2'), card('3')].reverse();
    const hand = playDealerHand(shoe, [card('10'), card('4')]);
    // 14 → +2 = 16 → +3 = 19: duas compras.
    expect(hand).toHaveLength(4);
    expect(handValue(hand).total).toBe(19);
  });
});

describe('playBotHand', () => {
  it('joga a mão do bot até a estratégia mandar parar', () => {
    const shoe = [card('9')];
    const hand = playBotHand(shoe, [card('5'), card('6')], card('10'));
    // 11 → +9 = 20: para.
    expect(handValue(hand).total).toBe(20);
    expect(shoe).toHaveLength(0);
  });

  it('não toca no sapato quando a mão inicial já segura', () => {
    const shoe = [card('9')];
    const hand = playBotHand(shoe, [card('10'), card('7')], card('A'));
    expect(hand).toHaveLength(2);
    expect(shoe).toHaveLength(1);
  });
});

describe('duelistCategory', () => {
  const dealer17 = [card('9'), card('8')];

  it('estouro é estouro, não importa o dealer', () => {
    expect(duelistCategory([card('K'), card('Q'), card('5')], dealer17)).toBe('bust');
  });

  it('natural vence tudo, menos o natural do dealer (empata)', () => {
    expect(duelistCategory([card('A'), card('K')], dealer17)).toBe('blackjack');
    expect(duelistCategory([card('A'), card('K')], [card('A'), card('Q')])).toBe('push');
  });

  it('21 em três cartas perde para o natural do dealer', () => {
    expect(duelistCategory([card('7'), card('7'), card('7')], [card('A'), card('Q')])).toBe('lose');
  });

  it('dealer estourado dá vitória a qualquer mão viva', () => {
    const dealerBust = [card('10'), card('6'), card('K')];
    expect(duelistCategory([card('10'), card('3')], dealerBust)).toBe('win');
  });

  it('compara totais contra o dealer que parou', () => {
    expect(duelistCategory([card('10'), card('8')], dealer17)).toBe('win');
    expect(duelistCategory([card('10'), card('7')], dealer17)).toBe('push');
    expect(duelistCategory([card('10'), card('6')], dealer17)).toBe('lose');
  });
});

describe('resolveOutcome', () => {
  it('categoria melhor vence: blackjack > vitória > empate > derrota > estouro', () => {
    expect(resolveOutcome({ category: 'blackjack', total: 21 }, { category: 'win', total: 20 })).toBe(
      'win',
    );
    expect(resolveOutcome({ category: 'lose', total: 16 }, { category: 'bust', total: 22 })).toBe(
      'win',
    );
    expect(resolveOutcome({ category: 'push', total: 17 }, { category: 'win', total: 18 })).toBe(
      'lose',
    );
  });

  it('na mesma categoria, o total mais alto desempata', () => {
    expect(resolveOutcome({ category: 'win', total: 20 }, { category: 'win', total: 19 })).toBe(
      'win',
    );
    expect(resolveOutcome({ category: 'lose', total: 13 }, { category: 'lose', total: 16 })).toBe(
      'lose',
    );
  });

  it('estourados não se comparam: empatam e a rodada se repete', () => {
    expect(resolveOutcome({ category: 'bust', total: 26 }, { category: 'bust', total: 22 })).toBe(
      'tie',
    );
  });

  it('mesma categoria e mesmo total empatam', () => {
    expect(resolveOutcome({ category: 'win', total: 19 }, { category: 'win', total: 19 })).toBe(
      'tie',
    );
    expect(
      resolveOutcome({ category: 'blackjack', total: 21 }, { category: 'blackjack', total: 21 }),
    ).toBe('tie');
  });
});

describe('payout e variação líquida', () => {
  it('vitória comum leva 90% do stake do adversário (10% ficam com a casa)', () => {
    expect(winProfit(100)).toBe(90);
    expect(payoutFor('win', 100)).toBe(190);
    expect(netChangeFor('win', 100)).toBe(90);

    expect(netChangeFor('win', 50)).toBe(45);
    expect(netChangeFor('win', 25)).toBe(22); // 22,5 → arredonda para baixo
    expect(netChangeFor('win', 10)).toBe(9);
  });

  it('vitória com blackjack natural paga 3:2, sem comissão', () => {
    expect(naturalProfit(100)).toBe(150);
    expect(naturalProfit(25)).toBe(37); // 37,5 → arredonda para baixo
    expect(payoutFor('win', 100, true)).toBe(250);
    expect(netChangeFor('win', 50, true)).toBe(75);
  });

  it('a casa nunca cria crédito: o ganho é sempre inteiro e para baixo', () => {
    for (const stake of [1, 3, 7, 15, 33, 99]) {
      expect(Number.isInteger(winProfit(stake))).toBe(true);
      expect(winProfit(stake)).toBeLessThanOrEqual(stake * 0.9);
      expect(Number.isInteger(naturalProfit(stake))).toBe(true);
      expect(naturalProfit(stake)).toBeLessThanOrEqual(stake * 1.5);
    }
  });

  it('empate devolve exatamente o stake; natural não muda isso', () => {
    expect(payoutFor('tie', 50)).toBe(50);
    expect(payoutFor('tie', 50, true)).toBe(50);
    expect(netChangeFor('tie', 50)).toBe(0);
  });

  it('derrota perde o stake', () => {
    expect(payoutFor('lose', 50)).toBe(0);
    expect(netChangeFor('lose', 50)).toBe(-50);
  });
});

describe('forcedDealFor', () => {
  const outcomes: RoundOutcome[] = ['win', 'lose', 'tie'];

  it.each(outcomes)('as cartas empilhadas garantem o resultado "%s"', (outcome) => {
    // Reproduz o que a engine faz: pilha forçada no topo de um sapato real.
    const shoe = buildShoe(new SeededRng(5));
    shoe.push(...[...forcedDealFor(outcome)].reverse());

    const deal = dealInitialHands(shoe);
    const opponentHand = playBotHand(shoe, deal.opponentHand, deal.dealerHand[0]);
    const dealerHand = playDealerHand(shoe, deal.dealerHand);

    const resolved = resolveOutcome(
      {
        category: duelistCategory(deal.playerHand, dealerHand),
        total: handValue(deal.playerHand).total,
      },
      { category: duelistCategory(opponentHand, dealerHand), total: handValue(opponentHand).total },
    );
    expect(resolved).toBe(outcome);
  });

  it('o dealer forçado recebe 17 seco e o desfecho independe do jogador', () => {
    for (const outcome of outcomes) {
      const dealerCards = forcedDealFor(outcome).slice(4);
      expect(handValue(dealerCards)).toEqual({ total: 17, soft: false });
    }
  });
});
