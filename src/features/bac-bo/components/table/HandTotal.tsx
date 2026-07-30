import { handValue } from '../../engine/rules';
import type { Card, Duelist } from '../../engine/types';

export interface HandTotalProps {
  /**
   * As cartas que CONTAM — já podadas pela regra de POV (ver `povHand`).
   * Passar a mão inteira do rival aqui seria vazar a oculta pelo total.
   */
  cards: readonly Card[];
  /** A conta ainda não fechou: falta a carta virada ("+?"). */
  partial: boolean;
  /**
   * Onde este total mora. `duel` é a borda interna de uma das duas mãos
   * do 1v1; `seat` é o total miúdo de um assento da mesa única.
   */
  variant?: 'duel' | 'seat';
  /** Lado do feltro (só no duelo, onde os dois totais se espelham). */
  side?: Duelist;
  /** Assento de rival: o total encolhe e abre mão da leitura soft. */
  compact?: boolean;
  testid?: string;
}

/**
 * O total de uma mão.
 *
 * Tipografia: a condensada da casa (Oswald), em algarismos tabulares para
 * o número não dançar de largura ao trocar de 9 para 11. Uma mão soft
 * mostra as duas leituras ("7/17") com a menor em segundo plano — o que
 * vale é a de cima. No assento compacto a leitura soft sai de cena: a
 * dois dígitos de largura ela vira mancha, e o que importa ali é o total
 * que está valendo.
 *
 * A CONTA é a mesma nos dois modos, e é por isso que ela mora num lugar
 * só: o "+?" e o corte da oculta são a face visível da regra de POV, e
 * duas implementações dela é uma a mais.
 */
export function HandTotal({
  cards,
  partial,
  variant = 'duel',
  side,
  compact = false,
  testid,
}: HandTotalProps) {
  const value = handValue(cards);
  const soft = value.soft && value.total !== 21;
  // As duas famílias de classe são legítimas: o total do duelo e o do
  // assento têm tamanhos e posições próprios. O que não pode divergir é a
  // LÓGICA — e ela é esta função.
  const block = variant === 'duel' ? 'hand-total' : 'seat-total';
  const modifier = variant === 'duel' ? `${block}--${side}` : compact ? `${block}--mini` : '';

  return (
    <span
      className={`${block} ${modifier} ${value.total > 21 ? 'is-bust' : ''}`}
      data-testid={testid ?? (variant === 'duel' ? `${side}-total` : undefined)}
    >
      {soft && !compact && (
        <>
          <span className={`${block}__soft`}>{value.total - 10}</span>
          <span className={`${block}__slash`}>/</span>
        </>
      )}
      {value.total}
      {/* A conta do rival é sempre parcial até o showdown: o "+?" é a
          carta que ele guarda virada. */}
      {partial && <span className={`${block}__partial`}>+?</span>}
    </span>
  );
}
