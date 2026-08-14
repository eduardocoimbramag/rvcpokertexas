import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  TABLE_ANTE,
  TABLE_MAX_STACK,
  TABLE_MIN_BET,
  cashOutValue,
  tableStackFor,
} from '../engine/credits';
import { bestHand, compareRanks } from '../engine/poker/handRank';
import {
  botDecision,
  cardsDealtOn,
  contestedOf,
  firstToAct,
  forcedPokerDealFor,
  legalActionsFor,
  madeStrength,
  minRaiseTo,
  nextStreet,
  opposite,
  potShareFor,
  preflopStrength,
  timeoutAction,
} from '../engine/poker/rules';
import type { HoleCards } from '../engine/poker/types';
import type { Card, CardRank, CardSuit } from '../engine/types';

function hand(notation: string): Card[] {
  return notation.split(' ').map((token) => {
    const suits: Record<string, CardSuit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
    const rankToken = token.slice(0, -1);
    const suit = suits[token.slice(-1)];
    if (!suit) throw new Error(`Naipe desconhecido em "${token}"`);
    return { rank: (rankToken === 'T' ? '10' : rankToken) as CardRank, suit };
  });
}

function hole(notation: string): HoleCards {
  const [first, second] = hand(notation);
  if (!first || !second) throw new Error('Uma mão fechada tem duas cartas.');
  return [first, second];
}

describe('entrada da mesa', () => {
  it('a ENTRADA é fixa, mas o menor LANCE é um crédito', () => {
    /* São duas coisas diferentes, e confundi-las custava ao jogador a
       decisão que a barra de apostas existe para oferecer: a entrada é o
       que se paga para sentar (100), e o menor lance é o que se pode
       apostar depois de sentado. Com o piso na entrada, quem quisesse
       apostar 20 num pote de 200 ouvia da mesa que o mínimo era 100. */
    expect(TABLE_ANTE).toBe(100);
    expect(TABLE_MIN_BET).toBe(1);
  });

  it('a entrada é IGUAL dos dois lados — não há blind desigual a pagar', () => {
    // A mesa não tem small/big blind: os dois põem o mesmo antes de ver
    // carta, e a vantagem que resta é só a posição (ver firstToAct).
    expect(TABLE_ANTE).toBe(100);
    expect(TABLE_MAX_STACK).toBe(5000);
    expect(TABLE_ANTE).toBeLessThan(TABLE_MAX_STACK);
  });

  it('o stack é o teto da mesa, ou o que o saldo permitir', () => {
    expect(tableStackFor(5000)).toBe(TABLE_MAX_STACK);
    expect(tableStackFor(1000)).toBe(1000);
    // Quem tem pouco senta com pouco — e joga, em vez de ficar de fora.
    expect(tableStackFor(300)).toBe(300);
  });
});

describe('ordem das ruas', () => {
  it('vai do pré-flop ao showdown e para lá', () => {
    expect(nextStreet('preflop')).toBe('flop');
    expect(nextStreet('flop')).toBe('turn');
    expect(nextStreet('turn')).toBe('river');
    expect(nextStreet('river')).toBe('showdown');
    expect(nextStreet('showdown')).toBeNull();
  });

  it('a mesa abre três no flop e uma no turn e no river', () => {
    expect(cardsDealtOn('preflop')).toBe(0);
    expect(cardsDealtOn('flop')).toBe(3);
    expect(cardsDealtOn('turn')).toBe(1);
    expect(cardsDealtOn('river')).toBe(1);
  });
});

describe('firstToAct — a regra invertida do heads-up', () => {
  it('o botão fala PRIMEIRO no pré-flop', () => {
    expect(firstToAct('preflop', 'player')).toBe('player');
    expect(firstToAct('preflop', 'opponent')).toBe('opponent');
  });

  it('e por ÚLTIMO em todas as ruas seguintes', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(firstToAct(street, 'player')).toBe('opponent');
      expect(firstToAct(street, 'opponent')).toBe('player');
    }
  });

  it('opposite devolve o outro lado da mesa', () => {
    expect(opposite('player')).toBe('opponent');
    expect(opposite('opponent')).toBe('player');
  });
});

describe('legalActionsFor', () => {
  it('CORRER está sempre na mesa, com ou sem aposta na frente', () => {
    /* A regra clássica tirava o fold de graça: sem aposta na frente,
       largar a mão não custava nada e só atrasava a mesa. Numa SESSÃO
       custa — a entrada desta mão já está no meio, e correr é abrir mão
       de 100 fichas para guardar as outras. É decisão de quem joga. */
    expect(legalActionsFor({ toCall: 0, stack: 100, rivalHasChips: true })).toEqual([
      'fold',
      'check',
      'raise',
    ]);
    expect(legalActionsFor({ toCall: 40, stack: 100, rivalHasChips: true })).toEqual([
      'fold',
      'call',
      'raise',
    ]);
  });

  it('com aposta na frente: desistir, pagar ou aumentar', () => {
    expect(legalActionsFor({ toCall: 40, stack: 100, rivalHasChips: true })).toEqual([
      'fold',
      'call',
      'raise',
    ]);
  });

  it('sem fichas depois de pagar, só resta desistir ou pagar all-in', () => {
    expect(legalActionsFor({ toCall: 100, stack: 100, rivalHasChips: true })).toEqual([
      'fold',
      'call',
    ]);
  });

  it('sem rival com fichas não há aumento: não há quem cubra', () => {
    expect(legalActionsFor({ toCall: 0, stack: 500, rivalHasChips: false })).toEqual([
      'fold',
      'check',
    ]);
  });

  it('quem está all-in não tem ação nenhuma', () => {
    expect(legalActionsFor({ toCall: 0, stack: 0, rivalHasChips: true })).toEqual([]);
  });
});

describe('minRaiseTo — o piso de um lance', () => {
  it('abrir uma rua custa um crédito', () => {
    expect(minRaiseTo(0, TABLE_MIN_BET)).toBe(1);
  });

  it('aumentar é pôr um crédito a mais do que já está na mesa', () => {
    // Com 100 de entrada dos dois lados, apostar 10 leva o total a 110 —
    // e é 10 que o rival tem de cobrir.
    expect(minRaiseTo(100, TABLE_MIN_BET)).toBe(101);
    expect(minRaiseTo(300, TABLE_MIN_BET)).toBe(301);
  });

  it('o tamanho do último aumento NÃO é mais o piso do próximo', () => {
    /* A regra do no-limit saiu de propósito: num anel ela impede o
       aumento de um crédito usado para empurrar o relógio, e neste duelo
       o relógio é de 20 s e o rival é a casa. O que ela fazia de fato era
       recusar apostas pequenas. */
    expect(minRaiseTo(300, TABLE_MIN_BET)).toBe(301);
  });
});

describe('timeoutAction', () => {
  it('a mesa passa de graça e desiste quando há aposta na frente', () => {
    expect(timeoutAction(0)).toBe('check');
    expect(timeoutAction(40)).toBe('fold');
  });
});

describe('a repartição do pote', () => {
  /** O que a mesa devolve aos dois lados, somado, tem de ser o que estava
   *  no meio: nenhuma ficha nasce nem some numa sessão. */
  const total = (share: { player: number; opponent: number }) => share.player + share.opponent;

  it('quem leva o pote leva TUDO o que estava no meio', () => {
    const share = potShareFor('win', { player: 400, opponent: 400 });
    expect(share).toEqual({ player: 800, opponent: 0 });
    expect(total(share)).toBe(800);
  });

  it('a derrota entrega o pote inteiro ao rival', () => {
    const share = potShareFor('lose', { player: 400, opponent: 400 });
    expect(share).toEqual({ player: 0, opponent: 800 });
  });

  it('o empate divide o disputado e devolve o resto a quem o pôs', () => {
    expect(potShareFor('tie', { player: 400, opponent: 400 })).toEqual({
      player: 400,
      opponent: 400,
    });
  });

  it('a aposta que o rival não cobriu volta a quem a fez', () => {
    // Ele só tinha 200: os 300 a mais nunca foram pote.
    const share = potShareFor('win', { player: 500, opponent: 200 });
    expect(share).toEqual({ player: 300 + 400, opponent: 0 });
    expect(total(share)).toBe(700);
  });

  it('NENHUMA FICHA EVAPORA: a casa não cobra dentro da sessão', () => {
    /* A comissão já foi descontada aqui, mão a mão, e com uma mesa de mão
       única dava no mesmo. Numa sessão, fichas evaporando a cada pote
       encolhem os dois stacks juntos, e "jogar até alguém quebrar" vira
       "jogar até os dois quebrarem". A casa cobra no caixa. */
    for (const outcome of ['win', 'lose', 'tie'] as const) {
      const committed = { player: 370, opponent: 250 };
      expect(total(potShareFor(outcome, committed))).toBe(620);
    }
  });
});

describe('o caixa da sessão', () => {
  it('quem sai no lucro paga 10% SOBRE O LUCRO, nunca sobre o buy-in', () => {
    // Sentou com 1.000, levantou com 1.500: leva 1.000 + 90% de 500.
    expect(cashOutValue(1000, 1500)).toBe(1450);
  });

  it('quem sai no prejuízo leva o que sobrou, sem desconto nenhum', () => {
    expect(cashOutValue(1000, 400)).toBe(400);
    expect(cashOutValue(1000, 0)).toBe(0);
  });

  it('sair no zero a zero não custa comissão', () => {
    expect(cashOutValue(1000, 1000)).toBe(1000);
  });
});

describe('contas de crédito', () => {
  it('em disputa está sempre o MENOR dos dois compromissos', () => {
    // A aposta que o rival não cobriu não é pote: volta para quem a fez.
    expect(contestedOf(500, 200)).toBe(200);
    expect(contestedOf(200, 500)).toBe(200);
    expect(contestedOf(300, 300)).toBe(300);
  });
});

describe('leitura de força', () => {
  it('a escala pré-flop ordena as mãos como qualquer mesa ordenaria', () => {
    const aces = preflopStrength(hole('As Ah'));
    const kings = preflopStrength(hole('Ks Kh'));
    const bigSuited = preflopStrength(hole('As Ks'));
    const trash = preflopStrength(hole('7s 2h'));

    expect(aces).toBeGreaterThan(kings);
    expect(kings).toBeGreaterThan(bigSuited);
    expect(bigSuited).toBeGreaterThan(trash);
    expect(aces).toBeLessThanOrEqual(1);
    expect(trash).toBeGreaterThanOrEqual(0);
  });

  it('o mesmo par vale mais de mesmo naipe', () => {
    expect(preflopStrength(hole('As Ks'))).toBeGreaterThan(preflopStrength(hole('As Kh')));
  });

  it('a categoria escolhe a faixa e a face desempata dentro dela', () => {
    const board = hand('2c 7d 9h');
    const acePair = madeStrength(hole('As Ad'), board);
    const deucePair = madeStrength(hole('3s 3d'), board);
    const twoPair = madeStrength(hole('7s 9d'), board);

    expect(acePair).toBeGreaterThan(deucePair);
    expect(twoPair).toBeGreaterThan(acePair);
    // Um par bom é mão de apostar — não um número perto de zero.
    expect(acePair).toBeGreaterThan(0.5);
  });

  it('jogar o board no river vale pouco: qualquer mão empata com essa', () => {
    // Sequência ao Rei já na mesa; estas fechadas não melhoram nada.
    const board = hand('9s Th Jc Qd Kh');
    expect(madeStrength(hole('2c 3d'), board)).toBeLessThanOrEqual(0.16);
    // Quem usa uma fechada para melhorar (aqui, o Ás que fecha a
    // sequência maior) sai do corte.
    expect(madeStrength(hole('Ac 3d'), board)).toBeGreaterThan(0.16);
  });
});

describe('botDecision — a cabeça do rival', () => {
  const base = {
    board: hand('2c 7d 9h'),
    pot: 120,
    stack: 900,
    committed: 0,
    minRaiseTo: 40,
    maxRaiseTo: 900,
  };

  it('passa de graça com mão fraca em vez de apostar sem motivo', () => {
    // Roll baixo: fora da janela de blefe, que mora no topo do sorteio.
    const decision = botDecision({
      ...base,
      hole: hole('3s 4h'),
      toCall: 0,
      legalActions: ['check', 'raise'],
      rng: new SeededRng(1),
    });
    expect(decision.action).toBe('check');
  });

  it('desiste quando a mão não paga as odds do pote', () => {
    const decision = botDecision({
      ...base,
      hole: hole('3s 4h'),
      toCall: 400,
      legalActions: ['fold', 'call', 'raise'],
      rng: new SeededRng(7),
    });
    expect(decision.action).toBe('fold');
  });

  it('paga uma aposta barata mesmo com mão média: as odds mandam', () => {
    const decision = botDecision({
      ...base,
      hole: hole('9s 4h'),
      pot: 400,
      toCall: 20,
      legalActions: ['fold', 'call', 'raise'],
      rng: new SeededRng(3),
    });
    expect(decision.action).not.toBe('fold');
  });

  it('nunca escolhe uma ação que a mesa não permitiu', () => {
    // Cem mesas sorteadas: a decisão está sempre entre as legais.
    const rng = new SeededRng(99);
    for (let round = 0; round < 100; round += 1) {
      const legalActions = ['fold', 'call'] as const;
      const decision = botDecision({
        ...base,
        hole: hole('As Ad'),
        toCall: 900,
        legalActions: [...legalActions],
        rng,
      });
      expect(legalActions).toContain(decision.action);
    }
  });

  it('o aumento fica sempre dentro dos limites legais da rua', () => {
    const rng = new SeededRng(42);
    for (let round = 0; round < 200; round += 1) {
      const decision = botDecision({
        ...base,
        hole: hole('As Ad'),
        toCall: 0,
        minRaiseTo: 40,
        maxRaiseTo: 300,
        legalActions: ['check', 'raise'],
        rng,
      });
      if (decision.action === 'raise') {
        expect(decision.to).toBeGreaterThanOrEqual(40);
        expect(decision.to).toBeLessThanOrEqual(300);
      }
    }
  });

  it('blefa de vez em quando — sem isso as apostas dele não valeriam nada', () => {
    const rng = new SeededRng(5);
    let bluffs = 0;
    for (let round = 0; round < 300; round += 1) {
      const decision = botDecision({
        ...base,
        hole: hole('3s 4h'),
        toCall: 0,
        legalActions: ['check', 'raise'],
        rng,
      });
      if (decision.action === 'raise') bluffs += 1;
    }
    expect(bluffs).toBeGreaterThan(0);
    // …mas raramente: uma mão fraca que aposta sempre é outro livro aberto.
    expect(bluffs).toBeLessThan(90);
  });
});

describe('forcedPokerDealFor — mãos empilhadas do DevTools', () => {
  it('a vitória dá ao jogador o par maior', () => {
    const { holes, board } = forcedPokerDealFor('win');
    const player = bestHand([holes[0], holes[2], ...board]);
    const opponent = bestHand([holes[1], holes[3], ...board]);
    expect(player.category).toBe('pair');
    expect(player.score[1]).toBeGreaterThan(opponent.score[1] ?? 0);
  });

  it('a derrota é a mesma mesa com os lados trocados', () => {
    const { holes, board } = forcedPokerDealFor('lose');
    const player = bestHand([holes[0], holes[2], ...board]);
    const opponent = bestHand([holes[1], holes[3], ...board]);
    expect(opponent.score[1]).toBeGreaterThan(player.score[1] ?? 0);
  });

  it('o empate põe na mesa um board que os dois jogam inteiro', () => {
    const { holes, board } = forcedPokerDealFor('tie');
    const player = bestHand([holes[0], holes[2], ...board]);
    const opponent = bestHand([holes[1], holes[3], ...board]);
    expect(player.category).toBe('straight');
    expect(player.score).toEqual(opponent.score);
  });

  it('o "puxar flush" enche a mão do jogador de espadas', () => {
    const { holes, board } = forcedPokerDealFor('flush');
    const player = bestHand([holes[0], holes[2], ...board]);
    const opponent = bestHand([holes[1], holes[3], ...board]);

    expect(player.category).toBe('flush');
    expect(player.cards.every((card) => card.suit === 'spades')).toBe(true);
    // O rival fica com mão boa o bastante para apostar — e perde mesmo assim.
    expect(opponent.category).toBe('trips');
    expect(compareRanks(player, opponent)).toBeGreaterThan(0);
  });

  it('nenhuma mão empilhada repete uma carta do baralho', () => {
    for (const deal of ['win', 'lose', 'tie', 'flush'] as const) {
      const { holes, board } = forcedPokerDealFor(deal);
      const keys = [...holes, ...board].map((card) => `${card.rank}${card.suit}`);
      expect(new Set(keys).size).toBe(9);
    }
  });
});
