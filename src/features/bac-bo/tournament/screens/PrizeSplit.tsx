import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { PODIUM_METALS } from '../podium';
import { PRIZE_SHARES, prizeFor } from '../tournamentStore';
import type { TournamentSize } from '../types';

export interface PrizeSplitProps {
  fee: number;
  size: TournamentSize;
  'data-testid'?: string;
}

/**
 * A tabela de prêmios da sala: quem sobe ao pódio e com quanto. Os três
 * valores saem do bolo das taxas dos derrotados, já sem a comissão da
 * casa — é o número que cai no saldo, não uma promessa bruta.
 */
export function PrizeSplit({ fee, size, 'data-testid': testId }: PrizeSplitProps) {
  return (
    <div className="prize-split" data-testid={testId}>
      {PRIZE_SHARES.map((share, i) => {
        const { label, icon, metal } = PODIUM_METALS[i] ?? PODIUM_METALS[0];
        return (
          <div key={label} className={`prize-split__row prize-split__row--${metal}`}>
            <span className="prize-split__place">
              <Icon name={icon} size="0.95em" className="mr-1 inline align-[-0.15em]" />
              {label}
            </span>
            <span className="prize-split__share">{Math.round(share * 100)}%</span>
            <span className="prize-split__value">{formatCredits(prizeFor(i + 1, fee, size))}</span>
          </div>
        );
      })}
    </div>
  );
}
