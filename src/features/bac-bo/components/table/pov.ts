import type { Card } from '../../engine/types';

/**
 * O SEGREDO DA MESA — o que a tela pode desenhar da mão alheia — mora
 * AQUI, e só aqui. São duas regras, uma por modo:
 *
 * - `povHand` — a mesa única: a mão menos a última carta.
 * - `blindHand` — o duelo 1v1: a mão inteira virada para baixo.
 *
 * Por quê tanto zelo: esta é a única regra do jogo cuja violação não dá
 * erro, não quebra teste de layout e não aparece em lugar nenhum além da
 * tela do jogador — ela simplesmente entrega de graça a informação que
 * decide o duelo. Enquanto o duelo e a mesa única mantinham cada um a sua
 * cópia do corte, qualquer divergência entre as duas era um vazamento à
 * espera de acontecer. Duas implementações de um segredo é uma a mais.
 *
 * Quem revela é a FASE (o showdown), nunca a chegada das cartas: um
 * estado que já traz a mão inteira aberta continua sendo cortado até a
 * mesa mandar virar.
 */
export interface PovHand {
  /** As cartas a DESENHAR: as conhecidas mais o `null` da que está virada. */
  shown: readonly (Card | null)[];
  /** As cartas que CONTAM no total exibido — nunca a oculta. */
  counted: readonly Card[];
}

/**
 * @param hand     A mão como a tela a conhece.
 * @param revealed Showdown: tudo vira, nada é cortado.
 * @param pruned   `hand` já vem sem a oculta (a engine do duelo entrega a
 *                 mão do rival podada quando ela guarda carta virada).
 */
export function povHand(
  hand: readonly Card[],
  revealed: boolean,
  pruned = false,
): PovHand {
  if (revealed) return { shown: [...hand], counted: hand };
  const counted = pruned ? hand : hand.slice(0, -1);
  return { shown: [...counted, null], counted };
}

/**
 * A MÃO CEGA do duelo 1v1: nenhuma carta do rival na mesa — só o monte
 * de cartas de bruços que ele tem à frente. `counted` sai vazio porque
 * não há uma única carta a somar: o total dele é uma incógnita até o
 * showdown, e é assim que a placa o escreve (ver `HandTotal blind`).
 *
 * Não recebe as cartas por parâmetro, e isso é de propósito: a engine do
 * duelo não entrega nem uma (`opponentVisible` vem vazio), então a única
 * coisa que existe para desenhar é a CONTAGEM. Uma assinatura que
 * aceitasse cartas seria um convite a vazá-las.
 *
 * @param count Quantas cartas o rival tem na mesa, todas de bruços.
 */
export function blindHand(count: number): PovHand {
  return { shown: Array.from({ length: count }, () => null), counted: [] };
}
