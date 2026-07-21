import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { formatCredits } from '@/shared/lib/format';

import { useGameStore } from '../../store/gameStore';
import { tournamentPot, tournamentSelectors, useTournamentStore } from '../tournamentStore';
import type { TournamentPlayer } from '../types';
import { TournamentSettingsSheet } from './TournamentSettingsSheet';

/** Assento do lobby: membro presente, ou vaga aguardando. */
function Seat({
  player,
  canKick,
  onKick,
}: {
  player: TournamentPlayer | null;
  canKick: boolean;
  onKick: () => void;
}) {
  if (!player) {
    return (
      <div className="lobby-seat lobby-seat--empty">
        <span className="lobby-seat__avatar">➕</span>
        <span className="lobby-seat__name">Aguardando…</span>
      </div>
    );
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`lobby-seat ${player.isYou ? 'lobby-seat--you' : ''}`}
    >
      <span className="lobby-seat__avatar" aria-hidden="true">
        {player.avatar}
      </span>
      <span className="lobby-seat__name">{player.name}</span>
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={`Expulsar ${player.name}`}
          className="lobby-seat__kick"
        >
          ✕
        </button>
      )}
    </motion.div>
  );
}

/** Lobby do torneio: assentos, chat, controles do anfitrião e início. */
export function LobbyScreen() {
  const lobbyName = useTournamentStore((s) => s.lobbyName);
  const lobbyCode = useTournamentStore((s) => s.lobbyCode);
  const visibility = useTournamentStore((s) => s.visibility);
  const size = useTournamentStore((s) => s.size);
  const stake = useTournamentStore((s) => s.stake);
  const members = useTournamentStore((s) => s.members);
  const chat = useTournamentStore((s) => s.chat);
  const kickMember = useTournamentStore((s) => s.kickMember);
  const sendChat = useTournamentStore((s) => s.sendChat);
  const start = useTournamentStore((s) => s.startTournament);
  const leave = useTournamentStore((s) => s.leaveTournament);
  const owner = useTournamentStore(tournamentSelectors.isOwner);
  const full = useTournamentStore(tournamentSelectors.seatsFull);
  const balance = useGameStore((s) => s.balance);

  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const pot = tournamentPot(stake, size);
  const canAfford = balance >= stake;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);

  const seats = Array.from({ length: size }, (_, i) => members[i] ?? null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    sendChat(draft);
    setDraft('');
  };

  return (
    <main className="flex flex-1 flex-col px-6 py-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={leave}
          aria-label="Sair da sala"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg active:brightness-125"
        >
          ←
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-xl font-bold tracking-wide">{lobbyName}</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-copper">
            {visibility === 'public' ? 'Pública' : 'Privada'} · Código {lobbyCode}
          </p>
        </div>
        {owner ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações do torneio"
            data-testid="lobby-settings"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg active:brightness-125"
          >
            ⚙️
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" aria-hidden="true" />
        )}
      </header>

      {/* Resumo: jogadores · aposta · prêmio (edição pelo ⚙️, só o dono) */}
      <div className="tournament-summary mb-3">
        <span className="tournament-summary__item">
          👥 {members.length}/{size}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item">🪙 {formatCredits(stake)}</span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item tournament-summary__item--prize">
          🏆 {formatCredits(pot)}
        </span>
      </div>

      {/* Assentos */}
      <div className="lobby-seats">
        {seats.map((player, i) => (
          <Seat
            key={player?.id ?? `empty-${i}`}
            player={player}
            canKick={owner && !!player && !player.isYou}
            onKick={() => player && kickMember(player.id)}
          />
        ))}
      </div>

      {/* Chat */}
      <div className="lobby-chat">
        <div className="lobby-chat__log" data-testid="lobby-chat">
          <AnimatePresence initial={false}>
            {chat.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`chat-line ${m.system ? 'chat-line--system' : ''}`}
              >
                {m.system ? (
                  <span className="chat-line__system">{m.text}</span>
                ) : (
                  <>
                    <span className="chat-line__author">{m.authorName}</span>
                    <span className="chat-line__text">{m.text}</span>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>
        <form className="lobby-chat__form" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Mensagem…"
            maxLength={120}
            className="lobby-chat__input"
            aria-label="Mensagem do chat"
            data-testid="chat-input"
          />
          <button type="submit" className="lobby-chat__send" aria-label="Enviar">
            ➤
          </button>
        </form>
      </div>

      <div className="action-stack pb-2 pt-3">
        {owner ? (
          <Button
            onClick={start}
            disabled={!full || !canAfford}
            size="md"
            fullWidth
            data-testid="start-tournament"
          >
            {!full
              ? `AGUARDANDO (${members.length}/${size})`
              : !canAfford
                ? 'SALDO INSUFICIENTE'
                : '🏁 INICIAR TORNEIO'}
          </Button>
        ) : (
          <div className="bracket-status" role="status">
            Aguardando o anfitrião iniciar
            <span className="waiting-dots" aria-hidden="true">
              <span className="waiting-dot">.</span>
              <span className="waiting-dot">.</span>
              <span className="waiting-dot">.</span>
            </span>
          </div>
        )}
      </div>

      <TournamentSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
