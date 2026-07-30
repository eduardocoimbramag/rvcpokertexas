import { motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

import { EmptyState } from '../../components/EmptyState';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { useTournamentStore } from '../tournamentStore';
import type { LobbyListing } from '../types';
import { formatLabel } from '../types';
import { CreateLobbySheet } from './CreateLobbySheet';
import { JoinPrivateSheet } from './JoinPrivateSheet';

/** Sala destrancada esperando o "sim" da porta. */
interface PendingJoin {
  lobby: LobbyListing;
  /** Senha digitada (vazia nas públicas) — vai junto no joinLobby. */
  password: string;
}

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
  // sala escolhida). O terceiro é a pergunta da porta.
  const [creating, setCreating] = useState(false);
  const [locked, setLocked] = useState<LobbyListing | null>(null);
  const [pending, setPending] = useState<PendingJoin | null>(null);
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
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
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
          {/* Sem CTA próprio: o "CRIAR SALA" já está logo acima, e dois
              convites iguais na mesma tela viram ruído — o texto aponta
              para o botão que existe. */}
          {lobbies.length === 0 && (
            <EmptyState title="Nenhuma sala aberta" data-testid="lobbies-empty">
              Crie a sua no botão acima e os outros entram em seguida.
            </EmptyState>
          )}
          {lobbies.map((lobby, i) => {
            const isPrivate = lobby.visibility === 'private';
            return (
              <motion.button
                key={lobby.id}
                type="button"
                // Pública vai direto à pergunta da porta; privada pede a
                // senha antes — e a pergunta vem depois, igual para as
                // duas.
                onClick={() =>
                  isPrivate ? openLocked(lobby) : setPending({ lobby, password: '' })
                }
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`lobby-card ${isPrivate ? 'lobby-card--locked' : ''}`}
                data-testid={`lobby-${lobby.id}`}
                aria-label={`${lobby.name}, ${formatLabel(lobby.format)}${isPrivate ? ', sala privada com senha' : ''}`}
              >
                <span className="lobby-card__crown text-gold" aria-hidden="true">
                  <Icon name={isPrivate ? 'lock' : 'crown'} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-ivory">{lobby.name}</span>
                    {isPrivate && <span className="lobby-card__tag">Senha</span>}
                  </span>
                  {/* O formato vem antes da taxa: é o que a pessoa
                      precisa saber para decidir se quer aquela sala. */}
                  <span className="block text-xs text-lavender">
                    <Icon
                      name={lobby.format === 'bracket' ? 'trophy' : 'users'}
                      size="0.85em"
                      className="inline align-[-0.1em]"
                    />{' '}
                    {formatLabel(lobby.format)} ·{' '}
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
        onUnlocked={(password) => {
          if (!locked) return;
          setPending({ lobby: locked, password });
          setLocked(null);
        }}
      />

      {/* A porta de qualquer sala: entrar é assumir uma taxa, então a
          entrada nunca acontece por um toque só. Nas privadas esta
          pergunta vem DEPOIS da senha — destrancar a porta e atravessá-la
          são dois gestos. */}
      <ConfirmDialog
        open={pending !== null}
        title="Entrar na sala"
        message={
          <>
            Deseja realmente entrar em <span className="text-gold">{pending?.lobby.name}</span>? A
            taxa de entrada é de{' '}
            <span className="text-gold">{formatCredits(pending?.lobby.fee ?? 0)} créditos</span>.
          </>
        }
        confirmLabel="SIM"
        cancelLabel="NÃO"
        actions="row"
        data-testid="join-room-confirm"
        onConfirm={() => {
          if (pending) joinLobby(pending.lobby, pending.password);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </main>
  );
}
