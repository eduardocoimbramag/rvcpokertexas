import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';
import { TABLE_TARGET_WINS, formatLabel, seatsLabel } from '../types';
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
  const buyIn = useTournamentStore((s) => s.buyIn);
  const blind = useTournamentStore((s) => s.blind);

  const cash = format === 'cash';

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

        {/* A FICHA DE UMA MESA DE POKER, e não a de um torneio.
            Aqui morava a ficha do chaveamento — formato, tamanho, TAXA DE
            ENTRADA e PREMIAÇÃO —, e num cash duas delas são falsas: não
            há taxa (o dinheiro é a compra, e ela volta em fichas) nem
            prêmio no fim (o prêmio é o que estiver na sua frente quando
            você levantar). Uma ficha que anuncia um bolo que a mesa não
            paga é pior que uma ficha incompleta.

            O que uma mesa de cash tem a dizer são três coisas, nesta
            ordem: quantos sentam, com quanto se senta, e quanto custa
            girar uma mão. */}
        {cash ? (
          <>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">Mesa</p>
              <div className="room-fact" data-testid="settings-format">
                <span className="flex items-center gap-2">
                  <Icon name="user" /> {seatsLabel(size)}
                </span>
                <span className="room-fact__value">Mão após mão</span>
              </div>
              <p className="field__hint">
                Mesa fechada: ninguém entra depois que ela abre, e você levanta quando quiser.
              </p>
            </div>

            {/* A COMPRA: o que se leva para o feltro. É o único dinheiro
                que sai do saldo, e ele volta em ficha. */}
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
                Compra
              </p>
              <div className="room-fact" data-testid="settings-buyin">
                <span className="flex items-center gap-2">
                  <Icon name="chip" /> Fichas na mesa
                </span>
                <span className="room-fact__value">{formatCredits(buyIn)}</span>
              </div>
              <p className="field__hint">
                Sai do saldo quando a mesa abre e volta em fichas na sua frente. Levantar devolve o
                que sobrou delas.
              </p>
            </div>

            {/* O BLIND: o que uma volta de mesa custa. A PROFUNDIDADE vem
                junto porque é a razão entre os dois que diz que jogo se
                joga ali — 50 blinds é uma mesa de manobra, 10 é uma mesa
                de all-in. */}
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
                Blinds
              </p>
              <div className="room-fact" data-testid="settings-blind">
                <span className="flex items-center gap-2">
                  <Icon name="dealer" /> Pequeno · grande
                </span>
                <span className="room-fact__value">
                  {formatCredits(Math.max(1, Math.floor(blind / 2)))} · {formatCredits(blind)}
                </span>
              </div>
              <p className="field__hint" data-testid="settings-depth">
                {blind > 0
                  ? `${Math.floor(buyIn / blind)} blinds na frente de cada um — a profundidade da mesa.`
                  : 'O que cada um paga antes de ver carta, a cada mão.'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
                Formato
              </p>
              <div className="room-fact" data-testid="settings-format">
                <span className="flex items-center gap-2">
                  <Icon name={format === 'bracket' ? 'trophy' : 'users'} /> {formatLabel(format)}
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

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
                Jogadores
              </p>
              <div className="room-fact" data-testid="settings-size">
                <span className="flex items-center gap-2">
                  <Icon name="users" /> Na mesa
                </span>
                <span className="room-fact__value">{size} jogadores</span>
              </div>
              <p className="field__hint">Definido na criação da sala — não muda mais.</p>
            </div>

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
          </>
        )}

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

        {/* A PREMIAÇÃO é de torneio: num cash não há bolo a repartir no
            fim — há o que estiver na sua frente quando você levantar. */}
        {!cash && (
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
              Premiação
            </p>
            <PrizeSplit fee={entryFee} size={size} format={format} data-testid="settings-pot" />
          </div>
        )}
      </div>
    </Sheet>
  );
}
