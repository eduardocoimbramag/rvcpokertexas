import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  AVERAGE_HIDDEN_VALUE,
  DECK_COUNT,
  DECK_RESHUFFLE_THRESHOLD,
  botAction,
  buildDeck,
  dealInitialHands,
  doubleAcceptChance,
  drawCard,
  forcedDealFor,
  handValue,
  isBust,
  isNaturalBlackjack,
  netChangeFor,
  payoutFor,
  rankValue,
  resolveOutcome,
  standingOf,
  visibleCards,
  winProfit,
} from '../engine/rules';
import type { Card, CardRank, RoundOutcome } from '../engine/types';

/** Atalho para montar cartas nos testes (naipe irrelevante por padrão). */
function card(rank: CardRank, suit: Card['suit'] = 'spades'): Card {
  return { rank, suit };
}

/**
 * Empilha cartas na ordem em que serão distribuídas. `drawCard` tira do
 * FIM do array, então a pilha entra invertida — é assim que a engine faz.
 */
function stack(...cards: Card[]): Card[] {
  return [...cards].reverse();
}

describe('constantes da mesa', () => {
  it('duelo de baralho único, com limiar de reembaralho e carta média', () => {
    expect(DECK_COUNT).toBe(1);
    expect(DECK_RESHUFFLE_THRESHOLD).toBe(30);
    expect(AVERAGE_HIDDEN_VALUE).toBe(7);
  });
});

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

  it('rebaixa um Ás de cada vez, nunca mais do que o necessário', () => {
    // A+A+9 = 21 com um Ás alto; só o segundo Ás desce para 1.
    expect(handValue([card('A'), card('A'), card('9')])).toEqual({ total: 21, soft: true });
    // Com mais uma carta os dois Áses viram 1.
    expect(handValue([card('A'), card('A'), card('9'), card('5')])).toEqual({
      total: 16,
      soft: false,
    });
  });
});

describe('isBust', () => {
  it('detecta estouro mesmo com todos os Áses rebaixados', () => {
    expect(isBust([card('K'), card('Q'), card('5')])).toBe(true);
    expect(isBust([card('A'), card('K'), card('Q'), card('A')])).toBe(true);
    expect(isBust([card('A'), card('K'), card('Q')])).toBe(false); // 21
    expect(isBust([card('10'), card('7')])).toBe(false);
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

describe('buildDeck / drawCard', () => {
  it('monta um baralho único de 52 cartas, com 4 Áses e 13 por naipe', () => {
    const deck = buildDeck(new SeededRng(1));
    expect(deck).toHaveLength(52);
    expect(deck.filter((c) => c.rank === 'A')).toHaveLength(4);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
    // Baralho honesto: 52 cartas distintas, nenhuma repetida.
    expect(new Set(deck.map((c) => `${c.rank}-${c.suit}`)).size).toBe(52);
  });

  it('aceita mais de um baralho quando pedido explicitamente', () => {
    expect(buildDeck(new SeededRng(1), 2)).toHaveLength(104);
  });

  it('o embaralhamento é determinístico por seed', () => {
    const a = buildDeck(new SeededRng(42));
    const b = buildDeck(new SeededRng(42));
    expect(a).toEqual(b);
    expect(buildDeck(new SeededRng(43))).not.toEqual(a);
  });

  it('drawCard consome o baralho pelo topo e reclama quando ele seca', () => {
    const deck = [card('A'), card('K')];
    expect(drawCard(deck)).toEqual(card('K'));
    expect(deck).toHaveLength(1);
    expect(drawCard(deck)).toEqual(card('A'));
    expect(() => drawCard(deck)).toThrow(RangeError);
  });
});

describe('dealInitialHands', () => {
  it('distribui na ordem da mesa: jogador, oponente, jogador, oponente', () => {
    const deck = stack(card('2'), card('3'), card('4'), card('5'));
    const deal = dealInitialHands(deck);
    expect(deal.playerHand).toEqual([card('2'), card('4')]);
    expect(deal.opponentHand).toEqual([card('3'), card('5')]);
    expect(deck).toHaveLength(0);
  });

  it('consome exatamente 4 cartas de um baralho real', () => {
    const deck = buildDeck(new SeededRng(9));
    dealInitialHands(deck);
    expect(deck).toHaveLength(48);
  });
});

describe('visibleCards (regra de POV)', () => {
  it('esconde SEMPRE a última carta da mão', () => {
    expect(visibleCards([card('A'), card('K')])).toEqual([card('A')]);
    expect(visibleCards([card('5'), card('6'), card('7')])).toEqual([card('5'), card('6')]);
  });

  it('não mexe na mão original', () => {
    const hand = [card('9'), card('4')];
    visibleCards(hand);
    expect(hand).toEqual([card('9'), card('4')]);
  });
});

describe('botAction (estratégia do duelo)', () => {
  it('para com 21 ou mais na própria mão, não importa o rival', () => {
    expect(botAction([card('A'), card('K')], 5)).toBe('stand');
    expect(botAction([card('K'), card('Q'), card('5')], 5)).toBe('stand');
  });

  it('para quando o rival já estourou à vista (a vitória já está na mão)', () => {
    expect(botAction([card('5'), card('6')], 22)).toBe('stand');
    expect(botAction([card('2'), card('3')], 30)).toBe('stand');
  });

  it('mão soft pede até 17 (o Ás alto não estoura)', () => {
    expect(botAction([card('A'), card('5')], 10)).toBe('hit'); // soft 16
    expect(botAction([card('A'), card('6')], 10)).toBe('hit'); // soft 17
    expect(botAction([card('A'), card('7')], 10)).toBe('stand'); // soft 18 vs alvo 17
  });

  it('pede abaixo de 17, como em qualquer mesa', () => {
    expect(botAction([card('10'), card('6')], 10)).toBe('hit');
    expect(botAction([card('5'), card('4')], 20)).toBe('hit');
  });

  it('17 ou 18 atrás do alvo estimado pede assim mesmo', () => {
    expect(botAction([card('10'), card('7')], 12)).toBe('hit'); // alvo 19
    expect(botAction([card('10'), card('8')], 14)).toBe('hit'); // alvo 21
  });

  it('o alvo é o visível do rival mais a carta média oculta', () => {
    const hand17 = [card('10'), card('7')];
    // Alvo exatamente 17: empatar não é ficar atrás, então para.
    expect(botAction(hand17, 17 - AVERAGE_HIDDEN_VALUE)).toBe('stand');
    // Um ponto a mais no visível já coloca o bot atrás: pede.
    expect(botAction(hand17, 18 - AVERAGE_HIDDEN_VALUE)).toBe('hit');
  });

  it('19 ou mais para (o risco de estourar não compensa)', () => {
    expect(botAction([card('10'), card('9')], 14)).toBe('stand');
    expect(botAction([card('K'), card('Q')], 14)).toBe('stand');
    expect(botAction([card('A'), card('8')], 14)).toBe('stand'); // soft 19
  });
});

describe('standingOf', () => {
  it('lê a mão como uma situação de showdown', () => {
    expect(standingOf([card('A'), card('K')])).toEqual({ total: 21, bust: false, natural: true });
    expect(standingOf([card('7'), card('7'), card('7')])).toEqual({
      total: 21,
      bust: false,
      natural: false,
    });
    expect(standingOf([card('K'), card('Q'), card('5')])).toEqual({
      total: 25,
      bust: true,
      natural: false,
    });
  });
});

describe('resolveOutcome (showdown do duelo)', () => {
  const natural = standingOf([card('A'), card('K')]);
  const twentyOneInThree = standingOf([card('7'), card('7'), card('7')]);
  const twenty = standingOf([card('K'), card('Q')]);
  const seventeen = standingOf([card('10'), card('7')]);
  const bust = standingOf([card('K'), card('Q'), card('5')]);
  const bustHigher = standingOf([card('K'), card('Q'), card('K')]);

  it('dois estourados empatam: ninguém tem mão para mostrar', () => {
    expect(resolveOutcome(bust, bustHigher)).toBe('tie');
  });

  it('estourar perde para qualquer mão viva', () => {
    expect(resolveOutcome(bust, seventeen)).toBe('lose');
    expect(resolveOutcome(seventeen, bust)).toBe('win');
  });

  it('o natural ganha de um 21 montado em três cartas', () => {
    expect(resolveOutcome(natural, twentyOneInThree)).toBe('win');
    expect(resolveOutcome(twentyOneInThree, natural)).toBe('lose');
  });

  it('sem natural em jogo, o maior total leva a rodada', () => {
    expect(resolveOutcome(twenty, seventeen)).toBe('win');
    expect(resolveOutcome(seventeen, twenty)).toBe('lose');
  });

  it('totais iguais empatam — inclusive dois naturais', () => {
    expect(resolveOutcome(seventeen, seventeen)).toBe('tie');
    expect(resolveOutcome(natural, natural)).toBe('tie');
    expect(resolveOutcome(twentyOneInThree, twentyOneInThree)).toBe('tie');
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

  it('o pote é fechado: nem o blackjack natural leva mais que o stake do rival', () => {
    // Sem 3:2 nesta mesa — um prêmio de 1,5× criaria crédito que nenhum
    // dos dois apostou, e ainda deixaria a casa sem a comissão dela.
    expect(payoutFor('win', 100)).toBe(190);
    expect(netChangeFor('win', 50)).toBe(45);
  });

  it('a casa nunca cria crédito: o ganho é sempre inteiro e para baixo', () => {
    for (const stake of [1, 3, 7, 15, 33, 99]) {
      expect(Number.isInteger(winProfit(stake))).toBe(true);
      expect(winProfit(stake)).toBeLessThanOrEqual(stake * 0.9);
    }
  });

  it('empate devolve exatamente o stake', () => {
    expect(payoutFor('tie', 50)).toBe(50);
    expect(netChangeFor('tie', 50)).toBe(0);
  });

  it('derrota perde o stake', () => {
    expect(payoutFor('lose', 50)).toBe(0);
    expect(netChangeFor('lose', 50)).toBe(-50);
  });
});

describe('doubleAcceptChance — o rival diante do pedido de dobra', () => {
  it('quanto mais forte a sua mesa aberta, menos ele topa subir o valor', () => {
    const totals = [8, 13, 17, 20];
    const chances = totals.map(doubleAcceptChance);
    for (let i = 1; i < chances.length; i += 1) {
      expect(chances[i]).toBeLessThan(chances[i - 1] as number);
    }
  });

  it('contra uma mesa estourada à vista ele sobe quase sempre', () => {
    expect(doubleAcceptChance(24)).toBeGreaterThan(doubleAcceptChance(8));
  });

  it('nunca é certeza: o blefe continua de pé nos dois sentidos', () => {
    for (const total of [4, 10, 15, 18, 21, 26]) {
      expect(doubleAcceptChance(total)).toBeGreaterThan(0);
      expect(doubleAcceptChance(total)).toBeLessThan(1);
    }
  });
});

describe('forcedDealFor', () => {
  const outcomes: RoundOutcome[] = ['win', 'lose', 'tie'];

  it.each(outcomes)('empilha as 4 cartas da distribuição para "%s"', (outcome) => {
    expect(forcedDealFor(outcome)).toHaveLength(4);
  });

  it.each(outcomes)('as cartas empilhadas garantem o resultado "%s"', (outcome) => {
    // Reproduz o que a engine faz: pilha forçada no topo de um baralho real.
    const deck = buildDeck(new SeededRng(5));
    deck.push(...[...forcedDealFor(outcome)].reverse());

    const { playerHand, opponentHand } = dealInitialHands(deck);
    // O rival joga lance a lance, como na mesa — e só enxerga as cartas
    // ABERTAS do jogador.
    const playerVisibleTotal = handValue(visibleCards(playerHand)).total;
    const played: Card[] = [...opponentHand];
    while (!isBust(played) && botAction(played, playerVisibleTotal) === 'hit') {
      played.push(drawCard(deck));
    }

    expect(resolveOutcome(standingOf(playerHand), standingOf(played))).toBe(outcome);
  });

  it('todo desfecho forçado é selado por naturais — nenhuma decisão o alcança', () => {
    const expected: Record<RoundOutcome, { player: boolean; opponent: boolean }> = {
      win: { player: true, opponent: false },
      lose: { player: false, opponent: true },
      tie: { player: true, opponent: true },
    };

    for (const outcome of outcomes) {
      const deck = [...forcedDealFor(outcome)].reverse();
      const { playerHand, opponentHand } = dealInitialHands(deck);
      expect({
        player: isNaturalBlackjack(playerHand),
        opponent: isNaturalBlackjack(opponentHand),
      }).toEqual(expected[outcome]);
    }
  });
});
