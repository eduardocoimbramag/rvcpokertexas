import type { Rng } from '@/shared/lib/random';

import type { Card } from '../types';
import { madeStrength } from './rules';
import type { HoleCards, PokerAction } from './types';

/**
 * A CABEÇA DOS RIVAIS NUMA MESA DE SEIS.
 *
 * Ela existe separada de `botDecision` porque um bot de duelo posto numa
 * mesa de seis não joga mal — ele joga OUTRO JOGO. E as duas diferenças
 * que importam não são de afinação, são de natureza:
 *
 * 1. **Contra cinco, a mão precisa ser muito melhor.** Num duelo, um par
 *    de noves ganha na maioria das vezes; contra cinco mãos ele perde na
 *    maioria. A conta é a mesma probabilidade elevada ao número de
 *    rivais, e o efeito é brutal: uma mão que ganha 70% contra um ganha
 *    17% contra cinco. Um bot de duelo numa mesa de seis paga tudo e
 *    perde tudo, e a mesa vira um festival de all-in.
 *
 * 2. **POSIÇÃO passa a existir.** Num duelo há duas posições e elas se
 *    alternam; num anel há seis, e falar depois de quatro pessoas que já
 *    se comprometeram vale mais que a força de uma carta. Um bot que
 *    ignora posição abre com qualquer coisa do primeiro assento — e
 *    quem faz isso numa mesa de seis é o jogador que paga a conta de
 *    todo mundo.
 *
 * O que ela COMPARTILHA com o duelo é a leitura da mão (`madeStrength`)
 * e o sigilo: ela decide com a mão dela, o que está aberto na mesa e a
 * matemática do pote — nunca com uma carta sua, que a engine nem lhe
 * entrega. O contrato é o mesmo dos dois lados, e é isso que faz da mesa
 * uma mesa em vez de um handicap.
 */

/** A mesa como um rival a vê. Nenhuma carta sua aqui. */
export interface RingBotContext {
  /** As duas cartas fechadas DELE. */
  hole: HoleCards;
  /** As comunitárias abertas — as mesmas que você está vendo. */
  board: readonly Card[];
  /** Quanto ele tem de pagar para seguir. */
  toCall: number;
  /** O que já está no meio, antes do lance dele. */
  pot: number;
  stack: number;
  /** O que ele já pôs NESTA rua. */
  committed: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  legalActions: readonly PokerAction[];
  /**
   * Quantos rivais ainda estão na mão com ele. É o número que muda tudo:
   * a mesma mão vale uma coisa contra um e outra contra cinco.
   */
  opponents: number;
  /**
   * Quantos ainda falam DEPOIS dele nesta rua. Zero é a melhor posição
   * da mesa — ele decide sabendo o que todo mundo fez.
   */
  actingAfter: number;
  rng: Rng;
}

export interface RingBotDecision {
  action: PokerAction;
  /** Total a que ele aumenta nesta rua (só no `raise`). */
  to?: number;
}

/**
 * A FORÇA DA MÃO CONTRA VÁRIOS.
 *
 * Se a mão ganha com probabilidade `p` contra um rival, ela ganha
 * aproximadamente `p^n` contra `n` rivais independentes. A aproximação
 * ignora que as mãos alheias se correlacionam pelo board, mas erra para
 * o lado certo: ela é conservadora, e conservador é exatamente o que uma
 * mesa de seis exige.
 *
 * O expoente é AMORTECIDO (`1 + (n−1)·0,45`) em vez de ser `n` cheio.
 * Com o expoente cheio, um par de ases contra cinco cairia para 0,3 e o
 * bot largaria a melhor mão do baralho — porque `p` aqui não é a
 * probabilidade real de ganhar, é uma leitura de força numa escala de 0
 * a 1, e elevá-la à quinta potência confunde as duas coisas.
 *
 * Com um rival só (`n = 1`) o expoente é 1 e a função devolve a força
 * intacta: a mesa de dois pela mesma cabeça, sem correção nenhuma.
 */
export function strengthVersus(strength: number, opponents: number): number {
  const n = Math.max(1, opponents);
  return Math.pow(Math.max(0, Math.min(1, strength)), 1 + (n - 1) * 0.45);
}

/**
 * O que a POSIÇÃO acrescenta.
 *
 * Falar por último não muda a sua mão — muda o que você sabe quando joga
 * ela. É por isso que o bônus entra na força e não no tamanho da aposta:
 * o efeito prático de posição é jogar MAIS MÃOS, não apostar mais fichas
 * com as mesmas.
 *
 * O teto é pequeno de propósito (0,06). Posição vale muito no poker, mas
 * um bônus grande faria o bot do botão pagar all-in com nada — e posição
 * nenhuma conserta uma mão que perde para tudo.
 */
export function positionBonus(actingAfter: number, opponents: number): number {
  if (opponents <= 0) return 0;
  const atrás = Math.max(0, Math.min(actingAfter, opponents));
  return 0.06 * (1 - atrás / opponents);
}

/**
 * A MARGEM sobre as odds do pote — o quanto a mão precisa valer ACIMA do
 * que ela custa para o pagamento se justificar.
 *
 * Ela muda de rua para rua pelo mesmo motivo do duelo (ainda vêm cartas,
 * a mão ainda pode piorar em relação ao que os outros completam), mas
 * aqui há uma diferença de fundo: no duelo a margem do pré-flop é
 * NEGATIVA, porque a entrada já está paga dos dois lados e desistir
 * entrega metade de um pote que já é seu. Numa mesa de seis não há
 * entrada paga — há dois blinds e quatro pessoas que não puseram nada. A
 * margem do pré-flop passa a ser positiva, e é ela que impede o bot de
 * pagar aumento com qualquer duas cartas.
 */
export function marginFor(board: readonly Card[], opponents: number): number {
  const multiway = opponents >= 3;
  if (board.length === 0) return multiway ? 0.1 : 0.02;
  if (board.length === 5) return multiway ? 0.08 : 0.04;
  return multiway ? 0.14 : 0.1;
}

/**
 * O LANCE DE UM RIVAL DA MESA DE SEIS.
 *
 * Três forças o governam, as mesmas do duelo mas pesadas para o anel: a
 * FORÇA da mão corrigida pelo número de rivais, as ODDS DO POTE, e o
 * BLEFE numa frequência baixa e sorteada.
 *
 * O blefe é MAIS RARO aqui, e a razão é aritmética: um blefe precisa que
 * todo mundo desista, e a chance de cinco pessoas desistirem é muito
 * menor que a de uma. Blefar contra a mesa cheia na mesma frequência do
 * duelo não seria ousadia, seria doar fichas.
 */
export function ringBotDecision(context: RingBotContext): RingBotDecision {
  const { hole, board, toCall, pot, legalActions, opponents, actingAfter, rng } = context;
  const canRaise = legalActions.includes('raise');
  const canFold = legalActions.includes('fold');
  const roll = rng.next();

  const bruta = madeStrength(hole, board);
  const força = Math.min(
    1,
    strengthVersus(bruta, opponents) + positionBonus(actingAfter, opponents),
  );
  const multiway = opponents >= 3;

  /** Um aumento dentro dos limites, com o tamanho pedido em fração do pote. */
  const raiseTo = (fraction: number): number => {
    const alvo = context.committed + toCall + Math.round((pot + toCall) * fraction);
    return Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, alvo));
  };

  // ---- Sem nada a pagar: passar ou abrir ----
  if (toCall === 0) {
    if (canRaise && força > 0.6 && roll < 0.75) return { action: 'raise', to: raiseTo(0.65) };
    if (canRaise && força > 0.38 && roll < 0.35) return { action: 'raise', to: raiseTo(0.5) };
    /* O blefe de abertura só existe com a mesa curta. Com quatro ou cinco
       ainda na mão, apostar com nada é comprar a chance de todos
       desistirem — e essa chance é pequena demais para pagar por ela. */
    if (canRaise && !multiway && bruta < 0.3 && roll > 0.9) {
      return { action: 'raise', to: raiseTo(0.45) };
    }
    return { action: 'check' };
  }

  // ---- Com aposta na frente: as odds mandam ----
  const potOdds = toCall / (pot + toCall);

  // Mão muito forte para o número de rivais: aumenta na maior parte das
  // vezes, paga no resto (pagar com mão feita é o que esconde a força).
  if (força > 0.66) {
    if (canRaise && roll < 0.6) return { action: 'raise', to: raiseTo(0.8) };
    return { action: 'call' };
  }

  // Mão boa: aumenta pouco, paga quase sempre.
  if (força > 0.44) {
    if (canRaise && roll < 0.18) return { action: 'raise', to: raiseTo(0.55) };
    return { action: 'call' };
  }

  // A conta que decide o resto: a mão precisa valer mais do que custa.
  if (força >= potOdds + marginFor(board, opponents)) return { action: 'call' };

  /* O blefe de aumento, raro e só com o pote pequeno o bastante para
     valer o risco. Com a mesa cheia ele some: são cinco desistências a
     comprar de uma vez. */
  if (canRaise && !multiway && roll > 0.95 && potOdds < 0.4) {
    return { action: 'raise', to: raiseTo(0.7) };
  }

  return canFold ? { action: 'fold' } : { action: 'check' };
}
