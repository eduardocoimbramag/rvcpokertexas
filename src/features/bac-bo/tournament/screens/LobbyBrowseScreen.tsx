import { motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';
import type { LobbyListing } from '../types';
import { CreateLobbySheet } from './CreateLobbySheet';
import { JoinPrivateSheet } from './JoinPrivateSheet';

export interface LobbyBrowseScreenProps {
  onBack: () => void;
}

/**
 * Entrada do torneio: um botão para criar (pública ou privada se decide
 * dentro da folha, junto das outras características) ou entrar numa sala
 * da lista. Pública abre direto; privada aparece igual, com cadeado, e
 * pede a senha antes de abrir a porta.
 */
export function LobbyBrowseScreen({ onBack }: LobbyBrowseScreenProps) {
  const lobbies = useTournamentStore((s) => s.lobbies);
  const joinLobby = useTournamentStore((s) => s.joinLobby);

  // Duas folhas, dois estados: a de criação e a da senha (que guarda a
  // sala escolhida).
  const [creating, setCreating] = useState(false);
  const [locked, setLocked] = useState<LobbyListing | null>(null);
  // Contadores de abertura usados como `key`: remontar a folha é o que
  // devolve os formulários ao estado inicial. Eles só sobem ao ABRIR —
  // no fechamento a chave fica parada, senão a folha seria arrancada da
  // tela no meio da animação de saída.
  const [createSeq, setCreateSeq] = useState(0);
  const [lockedSeq, setLockedSeq] = useState(0);

  const openCreate = () => {
    setCreateSeq((n) => n + 1);
    setCreating(true);
  };

  const openLocked = (lobby: LobbyListing) => {
    setLockedSeq((n) => n + 1);
    setLocked(lobby);
  };

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

      <div className="action-stack mb-5">
        <Button onClick={openCreate} size="md" fullWidth data-testid="create-room">
          <Icon name="plus" /> CRIAR SALA
        </Button>
      </div>

      <div className="mx-auto w-[min(100%,80vw)] max-w-96 flex-1">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-copper">
          Salas abertas
        </p>
        <div className="flex flex-col gap-2" data-testid="public-lobbies">
          {lobbies.map((lobby, i) => {
            const isPrivate = lobby.visibility === 'private';
            return (
              <motion.button
                key={lobby.id}
                type="button"
                onClick={() => (isPrivate ? openLocked(lobby) : joinLobby(lobby))}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`lobby-card ${isPrivate ? 'lobby-card--locked' : ''}`}
                data-testid={`lobby-${lobby.id}`}
                aria-label={`${lobby.name}${isPrivate ? ', sala privada com senha' : ''}`}
              >
                <span className="lobby-card__crown text-gold" aria-hidden="true">
                  <Icon name={isPrivate ? 'lock' : 'crown'} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-ivory">{lobby.name}</span>
                    {isPrivate && <span className="lobby-card__tag">Senha</span>}
                  </span>
                  <span className="block text-xs text-lavender">
                    por {lobby.hostName} ·{' '}
                    <Icon name="chip" size="0.85em" className="inline align-[-0.1em]" />{' '}
                    {formatCredits(lobby.fee)}
                  </span>
                </span>
                <span className="lobby-card__count">
                  {lobby.filled}/{lobby.size}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <CreateLobbySheet
        key={`create-${createSeq}`}
        open={creating}
        onClose={() => setCreating(false)}
      />

      <JoinPrivateSheet
        key={`join-${lockedSeq}`}
        lobby={locked}
        onClose={() => setLocked(null)}
      />
    </main>
  );
}
