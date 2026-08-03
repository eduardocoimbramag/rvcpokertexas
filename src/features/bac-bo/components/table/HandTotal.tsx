import { handValue } from '../../engine/rules';
import type { Card, Duelist } from '../../engine/types';

export interface HandTotalProps {
  /**
   * As cartas que CONTAM — já podadas pela regra de POV (ver `povHand`).
   * Passar a mão inteira do rival aqui seria vazar a oculta pelo total.
   */
  cards: readonly Card[];
  /**
   * A conta ainda não fechou: há carta virada fora dela. NÃO se escreve
   * na placa — o número que ela mostra é o das cartas abertas, e ponto.
   * Fica no DOM (`data-partial`) para quem precisa saber se aquele total
   * é o final ou o do meio da mão.
   */
  partial: boolean;
  /**
   * A mão está INTEIRA de bruços — a do rival no duelo cego. Não há um
   * único ponto a somar, então a placa escreve "?" no lugar do número:
   * um "0" ali seria uma informação falsa, e uma placa vazia deixaria o
   * lado do rival sem o par da sua.
   */
  blind?: boolean;
  /**
   * Onde este total mora. `duel` é a borda interna de uma das duas mãos
   * do 1v1; `seat` é o total miúdo de um assento da mesa única.
   */
  variant?: 'duel' | 'seat';
  /** Lado do feltro (só no duelo, onde os dois totais se espelham). */
  side?: Duelist;
  /** Assento de rival: o total encolhe e abre mão da leitura soft. */
  compact?: boolean;
  /**
   * A mão desta placa é um blackjack. A placa entra no clímax junto com
   * a combustão — um pulo curto, um reflexo e um aro champagne — e
   * depois guarda só o aro. Sem isto o "21" ficava alheio ao fogo que
   * queima logo abaixo dele.
   */
  ablaze?: boolean;
  testid?: string;
}

/**
 * O total de uma mão — uma PLACA dourada gravada no feltro.
 *
 * O número deitado direto no verde não se lia: tinta escura sobre uma
 * mesa clara, à mercê do brasão e da luz zenital por baixo dele. Agora
 * ele mora numa peça do ouro da casa, com a tinta escura por cima — o
 * mesmo contraste das pastilhas do chaveamento, e o único elemento da
 * mesa que se lê de relance sem procurar.
 *
 * Tipografia: a condensada da casa (Oswald), em algarismos tabulares para
 * o número não dançar de largura ao trocar de 9 para 11. Uma mão soft
 * mostra as duas leituras ("7/17") com a menor em segundo plano — o que
 * vale é a de cima. No assento compacto a leitura soft sai de cena: a
 * dois dígitos de largura ela vira mancha, e o que importa ali é o total
 * que está valendo.
 *
 * O que a placa NUNCA escreve é o que falta: a conta é a das cartas que
 * ela pode somar, e se apresenta como um número limpo. O "+?" que ficava
 * colado no total dizia duas coisas ao mesmo tempo e não se lia bem
 * nenhuma delas — quem conta que existe carta virada é a própria carta
 * virada, deitada na mesa ao lado das outras.
 *
 * No duelo cego não sobra carta nenhuma para somar do lado do rival, e
 * aí a placa inteira vira o "?" (`blind`): a incógnita é o total, não um
 * apêndice dele.
 *
 * A CONTA é a mesma nos dois modos, e é por isso que ela mora num lugar
 * só: o que a placa pode somar é a face visível do segredo da mesa, e
 * duas implementações dele é uma a mais.
 */
export function HandTotal({
  cards,
  partial,
  blind = false,
  variant = 'duel',
  side,
  compact = false,
  ablaze = false,
  testid,
}: HandTotalProps) {
  const value = handValue(cards);
  const soft = !blind && value.soft && value.total !== 21;
  // As duas famílias de classe são legítimas: o total do duelo e o do
  // assento têm tamanhos e posições próprios. O que não pode divergir é a
  // LÓGICA — e ela é esta função.
  const block = variant === 'duel' ? 'hand-total' : 'seat-total';
  const modifier = variant === 'duel' ? `${block}--${side}` : compact ? `${block}--mini` : '';

  return (
    <span
      className={`${block} ${modifier} ${!blind && value.total > 21 ? 'is-bust' : ''} ${
        ablaze ? `${block}--ablaze` : ''
      }`}
      data-testid={testid ?? (variant === 'duel' ? `${side}-total` : undefined)}
      data-partial={partial}
      data-blind={blind || undefined}
    >
      {soft && !compact && (
        <>
          <span className={`${block}__soft`}>{value.total - 10}</span>
          <span className={`${block}__slash`}>/</span>
        </>
      )}
      {blind ? '?' : value.total}
    </span>
  );
}
