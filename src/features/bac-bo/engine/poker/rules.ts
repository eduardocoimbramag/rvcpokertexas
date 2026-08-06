import type { Rng } from '@/shared/lib/random';

import type { Card, Duelist } from '../types';
import { bestHand, compareRanks, pokerValue } from './handRank';
import type { HandCategory } from './handRank';
import type { ForcedPokerDeal, HoleCards, PokerAction, PokerOutcome, Street } from './types';

/**
 * Regras puras do TEXAS HOLD'EM heads-up. Nenhuma função aqui guarda
 * estado: recebem a mesa como ela está e devolvem valores. É a única
 * fonte de verdade sobre entrada, ações legais, pote e payout — a UI
 * nunca recalcula nada disto.
 *
 * A MESA, em uma frase: dois duelistas, ENTRADA IGUAL de 100 e stacks
 * iguais, uma mão só. O botão age PRIMEIRO no pré-flop e por ÚLTIMO em
 * todas as ruas seguintes — a regra do heads-up, que inverte a do anel.
 * Vence quem levar o pote: por desistência do outro ou pela melhor mão
 * de cinco no showdown.
 *
 * O SIGILO é simétrico e estrutural: o bot decide sem ver uma carta sua
 * (`botDecision` só recebe a mão DELE e o que está aberto na mesa),
 * exatamente como você decide sem ver as dele.
 */

/** A rua seguinte; `null` no showdown, que é onde a mão termina. */
export function nextStreet(street: Street): Street | null {
  const order: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  return order[order.indexOf(street) + 1] ?? null;
}

/** Quantas comunitárias a mesa vira ao abrir esta rua. */
export function cardsDealtOn(street: Street): number {
  if (street === 'flop') return 3;
  if (street === 'turn' || street === 'river') return 1;
  return 0;
}

/**
 * De quem é a primeira vez da rua.
 *
 * É a regra que mais confunde quem vem do anel: no heads-up o botão fala
 * PRIMEIRO antes do flop e por ÚLTIMO do flop em diante — a posição, que
 * é a vantagem da mesa, só existe depois que as comunitárias começam a
 * abrir. Ela vale aqui do mesmo jeito: a entrada é igual dos dois lados,
 * mas quem fala por último continua falando sabendo mais.
 */
export function firstToAct(street: Street, button: Duelist): Duelist {
  const other: Duelist = button === 'player' ? 'opponent' : 'player';
  return street === 'preflop' ? button : other;
}

/** O outro lado da mesa. */
export function opposite(side: Duelist): Duelist {
  return side === 'player' ? 'opponent' : 'player';
}

/** Tudo o que se precisa saber para dizer o que é legal agora. */
export interface ActionContext {
  /** Quanto falta a quem está na vez para igualar a rua. */
  toCall: number;
  /** Fichas que quem está na vez ainda tem. */
  stack: number;
  /** O rival ainda tem fichas para cobrir um aumento. */
  rivalHasChips: boolean;
}

/**
 * As ações legais de quem está na vez.
 *
 * - sem nada a pagar → CORRER, PASSAR (check) e AUMENTAR (a abertura);
 * - com aposta na frente → CORRER, PAGAR e AUMENTAR.
 *
 * CORRER (o fold) está SEMPRE na mesa, e isso mudou quando o duelo virou
 * sessão. Numa mesa de mão única a regra clássica valia inteira: jogar a
 * mão fora podendo continuar de graça é lance que sala nenhuma aceita,
 * porque não custa nada e só atrasa. Numa sessão, custa — a entrada desta
 * mão já está no meio, e desistir dela é abrir mão de 100 fichas para
 * guardar as outras. Deixar de fora essa decisão obrigava o jogador a
 * acompanhar mãos que ele não queria jogar até aparecer uma aposta na
 * frente para poder sair.
 *
 * AUMENTAR some quando não há com quem aumentar — o rival já está all-in
 * e não há fichas do outro lado para cobrir mais nada.
 */
export function legalActionsFor({ toCall, stack, rivalHasChips }: ActionContext): PokerAction[] {
  if (stack <= 0) return [];
  const actions: PokerAction[] = ['fold'];
  if (toCall === 0) actions.push('check');
  if (toCall > 0) actions.push('call');
  // Só há aumento se sobrar ficha DEPOIS de pagar, e se houver do outro
  // lado quem cubra.
  if (rivalHasChips && stack > toCall) actions.push('raise');
  return actions;
}

/**
 * O menor total a que se pode aumentar numa rua: um crédito acima do que
 * já está na mesa.
 *
 * Aqui morava a regra do no-limit — o aumento tem de ser ao menos do
 * tamanho do último —, e ela saiu de propósito. Num anel, ela impede o
 * aumento de um crédito usado para empurrar o relógio e cansar a mesa;
 * neste duelo o relógio é de 20 s e o rival é a casa, então não há o que
 * empurrar. O que ela fazia de fato era recusar apostas pequenas: quem
 * quisesse apostar 20 num pote de 200 ouvia que o mínimo era 100.
 *
 * O tamanho do lance é a decisão que a barra de apostas existe para
 * oferecer, e ela volta inteira para quem joga.
 */
export function minRaiseTo(maxCommitted: number, minBet: number): number {
  return maxCommitted + minBet;
}

/**
 * O que a mesa faz por quem não agiu a tempo: PASSA se for de graça,
 * DESISTE se houver aposta na frente.
 *
 * É o desfecho seguro e é o mesmo de qualquer sala de verdade — jamais
 * pagar por alguém que não pediu para pagar.
 */
export function timeoutAction(toCall: number): PokerAction {
  return toCall > 0 ? 'fold' : 'check';
}

/* ---------------- Créditos ---------------- */

/**
 * COMO O POTE SE REPARTE no fim da mão, em fichas de mesa.
 *
 * Devolve quanto cada lado RECEBE de volta do que está no meio — o
 * excedente que ninguém cobriu mais a parte do pote disputado que lhe
 * cabe. Somado ao que sobrou nos stacks, o total da mesa não muda: as
 * fichas apenas trocam de lado.
 *
 * A CONSERVAÇÃO é a regra desta função, e ela existe porque a mesa virou
 * uma SESSÃO. A comissão da casa já foi descontada aqui, mão a mão, e com
 * uma mesa de mão única isso dava no mesmo. Numa sessão, não: fichas
 * evaporando a cada pote encolhem os dois stacks juntos, e "jogar até
 * alguém quebrar" vira "jogar até os dois quebrarem". A casa passou a
 * cobrar uma vez só, no caixa (ver `cashOutValue`).
 */
export function potShareFor(
  outcome: PokerOutcome,
  committed: { player: number; opponent: number },
): { player: number; opponent: number } {
  const contested = contestedOf(committed.player, committed.opponent);
  // O excedente não coberto nunca foi pote: volta para quem o pôs.
  const back = {
    player: committed.player - contested,
    opponent: committed.opponent - contested,
  };
  const disputed = contested * 2;

  switch (outcome) {
    case 'win':
      return { player: back.player + disputed, opponent: back.opponent };
    case 'lose':
      return { player: back.player, opponent: back.opponent + disputed };
    case 'tie':
      return { player: back.player + contested, opponent: back.opponent + contested };
  }
}

/**
 * O que esteve REALMENTE em disputa: o menor dos dois compromissos.
 *
 * A diferença é a aposta que ninguém cobriu — o excedente de quem apostou
 * mais do que o rival tinha para pagar — e ela não é pote: volta para
 * quem a fez, como em qualquer mesa. Sem este corte, um all-in por cima
 * de um stack curto pagaria ao vencedor um dinheiro que o perdedor nunca
 * teve como pôr.
 */
export function contestedOf(playerCommitted: number, opponentCommitted: number): number {
  return Math.min(playerCommitted, opponentCommitted);
}

/* ---------------- Cabeça do rival ---------------- */

/**
 * Força bruta da mão FECHADA, antes de qualquer comunitária (0 a 1).
 *
 * É a fórmula de Bill Chen, o padrão de mesa para ler duas cartas: peso
 * da carta alta, bônus de par, bônus de naipe igual e desconto pelo
 * buraco entre as duas. Normalizada para a mesma escala da leitura
 * pós-flop, para o bot ter UMA noção de força e não duas.
 */
export function preflopStrength(hole: HoleCards): number {
  const [first, second] = hole;
  const high = Math.max(pokerValue(first.rank), pokerValue(second.rank));
  const low = Math.min(pokerValue(first.rank), pokerValue(second.rank));

  const faceScore = (value: number): number => {
    if (value === 14) return 10;
    if (value === 13) return 8;
    if (value === 12) return 7;
    if (value === 11) return 6;
    return value / 2;
  };

  let score = faceScore(high);
  if (high === low) score = Math.max(5, score * 2);
  if (first.suit === second.suit) score += 2;

  const gap = high - low - 1;
  if (high !== low) {
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    // Conectores baixos puxam sequência com mais facilidade.
    if (gap <= 1 && high < 12) score += 1;
  }

  // A escala de Chen vai de -1,5 (72o) a 20 (AA).
  return clamp01((score + 1.5) / 21.5);
}

/**
 * A FAIXA DE FORÇA de cada categoria, de 0 a 1.
 *
 * As faixas são desiguais de propósito, e é isso que as torna úteis. Um
 * índice de categoria dividido por nove diria que qualquer par vale 0,11
 * e que dois pares valem 0,22 — números que só descrevem a ORDEM das
 * categorias, não o peso delas numa mesa. No heads-up, um par bom é uma
 * mão de apostar, e dois pares já ganham quase sempre: a faixa do par é
 * larga (a distância entre um par de dois e um par de Ases é enorme) e a
 * das mãos raras é estreita, porque entre uma quadra e outra já não há
 * decisão nenhuma a tomar.
 */
const CATEGORY_RANGE: Record<HandCategory, readonly [number, number]> = {
  'high-card': [0.05, 0.28],
  pair: [0.3, 0.62],
  'two-pair': [0.64, 0.78],
  trips: [0.8, 0.86],
  straight: [0.87, 0.9],
  flush: [0.91, 0.94],
  'full-house': [0.95, 0.97],
  quads: [0.98, 0.99],
  'straight-flush': [1, 1],
};

/**
 * Força da mão JÁ FORMADA com as comunitárias abertas (0 a 1).
 *
 * A categoria escolhe a faixa; o principal desempate (a face do par, da
 * trinca, o topo da sequência) diz onde dentro dela — é a diferença entre
 * um par de Ases e um par de dois, que a categoria sozinha não vê.
 *
 * O CORTE DO BOARD é o que separa uma leitura ingênua de uma útil: no
 * river, uma mão que não bate as cinco cartas da mesa é uma mão que
 * qualquer um tem. Ela vale pouco por definição, e o rival precisa saber
 * disso antes de pagar uma aposta com ela.
 */
export function madeStrength(hole: HoleCards, board: readonly Card[]): number {
  if (board.length < 3) return preflopStrength(hole);

  const mine = bestHand([...hole, ...board]);
  const [floor, ceiling] = CATEGORY_RANGE[mine.category];
  // O desempate principal é sempre o valor de uma carta (2 a 14).
  const within = clamp01(((mine.score[1] ?? 2) - 2) / 12);
  const strength = floor + (ceiling - floor) * within;

  if (board.length === 5 && compareRanks(mine, bestHand(board)) <= 0) {
    // Jogando o board: a mão do rival é, no mínimo, esta.
    return Math.min(strength, 0.16);
  }
  return clamp01(strength);
}

/** A mesa como o bot a vê na hora de decidir — nenhuma carta sua aqui. */
export interface BotContext {
  /** As duas cartas fechadas DELE. */
  hole: HoleCards;
  /** As comunitárias abertas — as mesmas que você está vendo. */
  board: readonly Card[];
  /** Quanto ele tem de pagar para seguir na mão. */
  toCall: number;
  /** O que já está no pote, antes do lance dele. */
  pot: number;
  /** Fichas que ele ainda tem. */
  stack: number;
  /** Total já comprometido por ele nesta rua. */
  committed: number;
  /** Limites legais de um aumento dele nesta rua. */
  minRaiseTo: number;
  maxRaiseTo: number;
  /** Ações que a mesa permite a ele agora. */
  legalActions: readonly PokerAction[];
  rng: Rng;
}

/** O lance escolhido pelo bot. */
export interface BotDecision {
  action: PokerAction;
  /** Total a que ele aumenta nesta rua (só no `raise`). */
  to?: number;
}

/**
 * A CABEÇA DO RIVAL. Ele decide com a mão dele, o que está aberto na mesa
 * e a matemática do pote — nunca com uma carta sua, que a engine nem lhe
 * entrega. É o mesmo contrato dos dois lados, e é isso que faz da mesa
 * uma mesa em vez de um handicap.
 *
 * Três forças governam o lance:
 *
 * - a FORÇA da mão, lida pela categoria já formada (ou pela fórmula de
 *   Chen antes do flop);
 * - as ODDS DO POTE — pagar 40 para disputar 200 exige muito menos mão do
 *   que pagar 200 para disputar 200, e é essa conta que separa um call
 *   correto de um call ruim;
 * - o BLEFE, numa frequência baixa e sorteada. Sem ele o rival seria um
 *   livro aberto: toda aposta dele significaria mão feita, e bastaria
 *   desistir sempre que ele apostasse. Uma frequência pequena de blefe é
 *   o que mantém as apostas dele com algum peso.
 */
export function botDecision(context: BotContext): BotDecision {
  const { hole, board, toCall, pot, legalActions, rng } = context;
  const canRaise = legalActions.includes('raise');
  const strength = madeStrength(hole, board);
  const roll = rng.next();

  /** Um aumento dentro dos limites, com o tamanho pedido em fração do pote. */
  const raiseTo = (fraction: number): number => {
    const target = context.committed + toCall + Math.round((pot + toCall) * fraction);
    return Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, target));
  };

  // ---- Sem aposta na frente: passar ou abrir ----
  if (toCall === 0) {
    if (canRaise && strength > 0.72 && roll < 0.78) return { action: 'raise', to: raiseTo(0.7) };
    if (canRaise && strength > 0.5 && roll < 0.4) return { action: 'raise', to: raiseTo(0.5) };
    // O blefe de abertura: mão fraca, aposta pequena, de vez em quando.
    if (canRaise && strength < 0.3 && roll > 0.88) return { action: 'raise', to: raiseTo(0.45) };
    return { action: 'check' };
  }

  // ---- Com aposta na frente: as odds mandam ----
  const potOdds = toCall / (pot + toCall);

  // Mão muito forte: aumenta na maior parte das vezes, paga no resto
  // (pagar com mão feita é o que esconde a força dela).
  if (strength > 0.78) {
    if (canRaise && roll < 0.62) return { action: 'raise', to: raiseTo(0.85) };
    return { action: 'call' };
  }

  // Mão boa: aumenta pouco, paga quase sempre.
  if (strength > 0.55) {
    if (canRaise && roll < 0.22) return { action: 'raise', to: raiseTo(0.6) };
    return { action: 'call' };
  }

  /* A conta que decide o resto: a mão precisa valer mais do que custa.
     A margem corrige as odds pelo que ainda pode acontecer com a mão, e
     por isso ela MUDA de rua para rua:

     - no PRÉ-FLOP ela é negativa, e isso é aritmética de pote, não
       generosidade: a entrada já está paga dos dois lados, e quem
       desiste ali abre mão de um pote que é dele pela metade tendo ainda
       cinco cartas pela frente para melhorar. Com margem positiva aqui o
       rival jogava a mão fora quase toda vez que não tinha figura — e um
       duelo de uma mão só que morre antes do flop não é uma mão de
       poker, é uma entrada entregue;
     - no RIVER ela quase some: não vem mais carta, e a mão que está na
       mesa é a mão final;
     - no meio, ela é maior: a mão ainda pode piorar em relação ao que o
       rival completa. */
  const margin = board.length === 0 ? -0.08 : board.length === 5 ? 0.04 : 0.1;
  if (strength >= potOdds + margin) return { action: 'call' };

  // O blefe de aumento, raro e só com o pote pequeno o bastante para
  // valer o risco.
  if (canRaise && roll > 0.94 && potOdds < 0.4) {
    return { action: 'raise', to: raiseTo(0.75) };
  }

  return legalActions.includes('fold') ? { action: 'fold' } : { action: 'check' };
}

/* ---------------- Distribuição empilhada (DevTools/testes) ---------------- */

/** As cartas de uma mão empilhada, na ORDEM em que a mesa as distribui. */
export interface ForcedDealCards {
  /** p1, o1, p2, o2 — uma carta de cada vez, como na mesa. */
  holes: [Card, Card, Card, Card];
  /** flop (3), turn (1), river (1). */
  board: [Card, Card, Card, Card, Card];
}

/**
 * Mão empilhada que garante o desfecho do SHOWDOWN (uso exclusivo do
 * DevTools e dos testes).
 *
 * Garante o showdown, não a mão: quem desiste é quem joga, e um jogador
 * que jogue fora um par de Ases perde a mão do mesmo jeito. É o que os
 * testes deterministas fazem — vão até o fim e conferem o veredito.
 *
 * O empate é montado com um board que se joga inteiro (sequência ao Ás):
 * as quatro cartas fechadas ficam irrelevantes e os dois lados leem
 * exatamente a mesma mão de cinco.
 */
export function forcedPokerDealFor(deal: ForcedPokerDeal): ForcedDealCards {
  const strong: [Card, Card, Card, Card] = [
    { rank: 'A', suit: 'spades' },
    { rank: 'K', suit: 'diamonds' },
    { rank: 'A', suit: 'hearts' },
    { rank: 'K', suit: 'clubs' },
  ];
  // Board seco: sem sequência, sem naipe repetido três vezes — quem tem
  // o par maior nas fechadas leva, e nada na mesa muda isso.
  const dryBoard: [Card, Card, Card, Card, Card] = [
    { rank: '2', suit: 'clubs' },
    { rank: '7', suit: 'diamonds' },
    { rank: '9', suit: 'hearts' },
    { rank: 'J', suit: 'spades' },
    { rank: '4', suit: 'hearts' },
  ];

  switch (deal) {
    case 'win':
      return { holes: strong, board: dryBoard };
    case 'lose':
      // Os mesmos pares, trocados de lado: o rival fica com os Ases.
      return {
        holes: [strong[1], strong[0], strong[3], strong[2]],
        board: dryBoard,
      };
    case 'flush':
      /* Cinco espadas para o jogador: as duas fechadas dele mais três da
         mesa. O rival fica com um par de Reis — mão boa o bastante para
         ele apostar, e que o flush bate com folga. */
      return {
        holes: [
          { rank: 'A', suit: 'spades' },
          { rank: 'K', suit: 'diamonds' },
          { rank: '9', suit: 'spades' },
          { rank: 'K', suit: 'clubs' },
        ],
        board: [
          { rank: 'K', suit: 'spades' },
          { rank: '7', suit: 'spades' },
          { rank: '3', suit: 'spades' },
          { rank: '2', suit: 'hearts' },
          { rank: '4', suit: 'diamonds' },
        ],
      };
    case 'tie':
      return {
        holes: [
          { rank: '2', suit: 'spades' },
          { rank: '2', suit: 'hearts' },
          { rank: '3', suit: 'diamonds' },
          { rank: '3', suit: 'clubs' },
        ],
        // Sequência ao Ás na mesa: os dois jogam o board e nada nas
        // fechadas melhora a mão de ninguém.
        board: [
          { rank: '10', suit: 'diamonds' },
          { rank: 'J', suit: 'diamonds' },
          { rank: 'Q', suit: 'clubs' },
          { rank: 'K', suit: 'clubs' },
          { rank: 'A', suit: 'hearts' },
        ],
      };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
