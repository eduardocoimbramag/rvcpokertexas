import type { Card } from '../../engine/types';

/**
 * A REGRA DE POV — a mão do rival menos a última carta — mora AQUI, e só
 * aqui.
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
