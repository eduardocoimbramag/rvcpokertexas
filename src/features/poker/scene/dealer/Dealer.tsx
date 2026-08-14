import type { DealerProps } from './DealerController';
import { NovaDealer } from './NovaDealer';

/**
 * Fachada do dealer: o jogo só conhece este componente.
 *
 * Existe UMA implementação — o rig da arte nova (`public/dealernova/`,
 * ver docs/animacaodealer.md). A fachada permanece porque é ela que
 * garante isso: quando a crupiê virar Rive (ou qualquer outra coisa), a
 * troca acontece aqui e mais em lugar nenhum.
 *
 * `variant="none"` tira a crupiê de cena — é o que o cenário reduzido
 * usa. Houve um `variant="svg"`, do primeiro rig (`public/dealer/`), que
 * o jogo nunca pediu; foi aposentado com a arte dele.
 */
export function Dealer({ variant = 'nova', ...props }: DealerProps) {
  if (variant === 'none') return null;
  return <NovaDealer {...props} />;
}
