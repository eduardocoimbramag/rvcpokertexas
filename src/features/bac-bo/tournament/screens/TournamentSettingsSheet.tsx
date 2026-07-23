import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { tournamentSelectors, useTournamentStore } from '../tournamentStore';
import type { TournamentSize } from '../types';
import { PrizeSplit } from './PrizeSplit';

export interface TournamentSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Ficha da sala. A taxa de entrada e a senha vêm da criação e não se
 * mexem mais — são o contrato com quem entrou. O que ainda se ajusta é o
 * tamanho da mesa, e só pelo dono; para os outros, a folha é leitura.
 */
export function TournamentSettingsSheet({ open, onClose }: TournamentSettingsSheetProps) {
  const size = useTournamentStore((s) => s.size);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const visibility = useTournamentStore((s) => s.visibility);
  const password = useTournamentStore((s) => s.password);
  const setSize = useTournamentStore((s) => s.setSize);
  const owner = useTournamentStore(tournamentSelectors.isOwner);

  return (
    <Sheet open={open} title="Detalhes da sala" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Jogadores</p>
          <div className="seg seg--full" role="group" aria-label="Número de jogadores">
            {([4, 8] as TournamentSize[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                disabled={!owner}
                aria-pressed={size === n}
                className={`seg__btn ${size === n ? 'seg__btn--on' : ''}`}
                data-testid={`settings-size-${n}`}
              >
                {n} jogadores
              </button>
            ))}
          </div>
        </div>

        {/* Taxa: definida na criação, exibida como fato consumado. */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
            Taxa de entrada
          </p>
          <div className="room-fact" data-testid="settings-fee">
            <span className="flex items-center gap-2">
              <Icon name="chip" /> Por jogador
            </span>
            <span className="room-fact__value">{formatCredits(entryFee)}</span>
          </div>
          <p className="field__hint">
            Definida na criação da sala. Só sai do seu saldo se você perder.
          </p>
        </div>

        {visibility === 'private' && (
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
              Senha da sala
            </p>
            <div className="room-fact" data-testid="settings-password">
              <span className="flex items-center gap-2">
                <Icon name="lock" /> Entrada
              </span>
              <span className="room-fact__value tracking-[0.35em]">{password}</span>
            </div>
            <p className="field__hint">A sala aparece na lista com cadeado para quem não tem.</p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Premiação</p>
          <PrizeSplit fee={entryFee} size={size} data-testid="settings-pot" />
        </div>
      </div>
    </Sheet>
  );
}
