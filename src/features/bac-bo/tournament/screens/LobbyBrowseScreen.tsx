import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';

export interface LobbyBrowseScreenProps {
  onBack: () => void;
}

/** Entrada do torneio: criar sala (pública/privada) ou entrar numa pública. */
export function LobbyBrowseScreen({ onBack }: LobbyBrowseScreenProps) {
  const publicLobbies = useTournamentStore((s) => s.publicLobbies);
  const createLobby = useTournamentStore((s) => s.createLobby);
  const joinLobby = useTournamentStore((s) => s.joinLobby);

  return (
    <main className="flex flex-1 flex-col px-6 py-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="chevron-left" />
        </button>
        <h1 className="text-xl font-bold tracking-wide">Torneio</h1>
        <span className="h-11 w-11 shrink-0" aria-hidden="true" />
      </header>

      <div className="action-stack mb-6">
        <Button onClick={() => createLobby('public')} size="md" fullWidth data-testid="create-public">
          <Icon name="globe" /> CRIAR SALA PÚBLICA
        </Button>
        <Button
          variant="secondary"
          onClick={() => createLobby('private')}
          size="md"
          fullWidth
          data-testid="create-private"
        >
          <Icon name="lock" /> Criar sala privada
        </Button>
      </div>

      <div className="mx-auto w-[min(100%,80vw)] max-w-96 flex-1">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
          Salas públicas
        </p>
        <div className="flex flex-col gap-2" data-testid="public-lobbies">
          {publicLobbies.map((lobby, i) => (
            <motion.button
              key={lobby.id}
              type="button"
              onClick={() => joinLobby(lobby)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="lobby-card"
            >
              <span className="lobby-card__crown text-gold" aria-hidden="true">
                <Icon name="crown" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-bold text-ivory">{lobby.name}</span>
                <span className="block text-xs text-lavender">
                  por {lobby.hostName} · <Icon name="chip" size="0.85em" className="inline align-[-0.1em]" /> {formatCredits(lobby.stake)}
                </span>
              </span>
              <span className="lobby-card__count">
                {lobby.filled}/{lobby.size}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </main>
  );
}
