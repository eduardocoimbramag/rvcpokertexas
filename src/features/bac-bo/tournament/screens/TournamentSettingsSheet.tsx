import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { STAKE_PRESETS } from '../../engine/credits';
import { useGameStore } from '../../store/gameStore';
import { tournamentPot, useTournamentStore } from '../tournamentStore';
import type { TournamentSize } from '../types';

export interface TournamentSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Configurações do torneio (só o dono): número de jogadores e a aposta
 * por jogador. O campeão leva todo o montante (stake × jogadores).
 */
export function TournamentSettingsSheet({ open, onClose }: TournamentSettingsSheetProps) {
  const size = useTournamentStore((s) => s.size);
  const stake = useTournamentStore((s) => s.stake);
  const setSize = useTournamentStore((s) => s.setSize);
  const setStake = useTournamentStore((s) => s.setStake);
  const balance = useGameStore((s) => s.balance);

  const pot = tournamentPot(stake, size);

  return (
    <Sheet open={open} title="Configurações do torneio" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Jogadores</p>
          <div className="seg seg--full" role="group" aria-label="Número de jogadores">
            {([4, 8] as TournamentSize[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                className={`seg__btn ${size === n ? 'seg__btn--on' : ''}`}
                data-testid={`settings-size-${n}`}
              >
                {n} jogadores
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
            Aposta por jogador
          </p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Aposta">
            {STAKE_PRESETS.map((value) => {
              const disabled = value > balance;
              const selected = stake === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setStake(value)}
                  data-testid={`settings-stake-${value}`}
                  className={`stake-chip flex min-h-16 flex-col items-center justify-center gap-0.5 font-black tabular-nums ${
                    selected ? 'stake-chip--selected' : ''
                  }`}
                >
                  <span className="text-2xl leading-none">{formatCredits(value)}</span>
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-wide ${selected ? 'text-gold-bright/80' : 'text-lavender'}`}
                  >
                    créditos
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tournament-prize">
          <span className="flex items-center gap-2">
            <Icon name="trophy" /> Campeão leva tudo
          </span>
          <span className="tournament-prize__value" data-testid="settings-pot">
            {formatCredits(pot)}
          </span>
        </div>
      </div>
    </Sheet>
  );
}
