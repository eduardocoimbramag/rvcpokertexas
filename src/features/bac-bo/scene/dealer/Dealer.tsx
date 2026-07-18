import type { DealerProps } from './DealerController';
import { SvgRigDealer } from './SvgRigDealer';

/**
 * Fachada do dealer (docs/scenario.md §7.3): o jogo só conhece este
 * componente. A implementação ativa é o rig SVG em camadas
 * (`public/dealer/*.svg`). `rive` fica reservado para uma futura arte
 * riggada profissionalmente.
 */
export function Dealer({ variant = 'svg', ...props }: DealerProps) {
  if (variant === 'none') return null;
  return <SvgRigDealer {...props} />;
}
