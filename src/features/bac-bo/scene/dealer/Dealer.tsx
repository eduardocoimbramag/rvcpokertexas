import type { DealerProps } from './DealerController';
import { NovaDealer } from './NovaDealer';
import { SvgRigDealer } from './SvgRigDealer';

/**
 * Fachada do dealer (docs/scenario.md §7.3): o jogo só conhece este
 * componente.
 *
 * A implementação ATIVA é o rig da arte nova (`public/dealernova/`, ver
 * docs/animacaodealer.md). O rig antigo (`public/dealer/`) continua
 * montável por `variant="svg"` — não é usado em lugar nenhum do jogo, e
 * está aí só como referência do primeiro rig.
 */
export function Dealer({ variant = 'nova', ...props }: DealerProps) {
  if (variant === 'none') return null;
  if (variant === 'svg') return <SvgRigDealer {...props} />;
  return <NovaDealer {...props} />;
}
