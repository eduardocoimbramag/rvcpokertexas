import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';
import { TABLE_TARGET_WINS, formatLabel } from '../types';
import { PrizeSplit } from './PrizeSplit';

export interface TournamentSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Ficha da sala. TUDO aqui vem da criação e não se mexe mais — tamanho,
 * taxa e senha são o contrato com quem entrou. Para todo mundo (dono
 * inclusive), a folha é só leitura.
 */
export function TournamentSettingsSheet({ open, onClose }: TournamentSettingsSheetProps) {
  const format = useTournamentStore((s) => s.format);
  const size = useTournamentStore((s) => s.size);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const visibility = useTournamentStore((s) => s.visibility);
  const password = useTournamentStore((s) => s.password);
  const lobbyCode = useTournamentStore((s) => s.lobbyCode);

  return (
    <Sheet open={open} title="Detalhes da sala" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Identidade da sala: como ela aparece na lista e o código que
            se compartilha. Saiu do cabeçalho da tela — lá fica só o
            nome — e passou a morar aqui, com o resto da ficha. */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Sala</p>
          <div className="room-fact" data-testid="settings-code">
            <span className="flex items-center gap-2">
              <Icon name={visibility === 'public' ? 'globe' : 'lock'} />{' '}
              {visibility === 'public' ? 'Pública' : 'Privada'}
            </span>
            <span className="room-fact__value tracking-[0.2em]">{lobbyCode}</span>
          </div>
        </div>

        {/* Formato: o que se joga aqui dentro. Vem antes do tamanho
            porque é ele que dá sentido ao número. */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Formato</p>
          <div className="room-fact" data-testid="settings-format">
            <span className="flex items-center gap-2">
              <Icon name={format === 'bracket' ? 'trophy' : 'users'} />{' '}
              {formatLabel(format)}
            </span>
            <span className="room-fact__value">
              {format === 'bracket' ? 'Mata-mata' : `Melhor de ${TABLE_TARGET_WINS}`}
            </span>
          </div>
          <p className="field__hint">
            {format === 'bracket'
              ? 'Duelos 1v1 em escada até a final, com pódio premiado.'
              : `Todos na mesma mesa. Quem vencer ${TABLE_TARGET_WINS} rodadas leva o bolo.`}
          </p>
        </div>

        {/* Tamanho: escolhido na criação, exibido como fato consumado —
            o chaveamento e a premiação derivam dele. */}
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Jogadores</p>
          <div className="room-fact" data-testid="settings-size">
            <span className="flex items-center gap-2">
              <Icon name="users" /> Na mesa
            </span>
            <span className="room-fact__value">{size} jogadores</span>
          </div>
          <p className="field__hint">Definido na criação da sala — não muda mais.</p>
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
          <PrizeSplit fee={entryFee} size={size} format={format} data-testid="settings-pot" />
        </div>
      </div>
    </Sheet>
  );
}
