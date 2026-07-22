import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { useGameStore } from '../../store/gameStore';
import { AvatarBadge } from '../../components/AvatarBadge';
import { OpponentProfileSheet } from '../../components/OpponentProfileSheet';
import { illustrativeRating } from '../../components/opponentProfile';
import type { Opponent } from '../../engine/types';
import { tournamentPot, tournamentSelectors, useTournamentStore } from '../tournamentStore';
import type { TournamentPlayer } from '../types';
import { TournamentSettingsSheet } from './TournamentSettingsSheet';

/**
 * Adapta um participante do torneio ao formato que o perfil consome.
 * O torneio só guarda nome e id; nível e conquistas do perfil são
 * derivados do NOME para que a mesma pessoa mostre sempre o mesmo
 * perfil, em qualquer sala (o id é sorteado a cada entrada).
 */
function asOpponent(player: TournamentPlayer): Opponent {
  return {
    id: player.name,
    name: player.name,
    avatar: player.avatar,
    rating: illustrativeRating(player.name),
  };
}

/** Assento do lobby: membro presente, ou vaga aguardando. */
function Seat({
  player,
  canKick,
  onKick,
  onOpenProfile,
}: {
  player: TournamentPlayer | null;
  canKick: boolean;
  onKick: () => void;
  onOpenProfile: () => void;
}) {
  if (!player) {
    return (
      <div className="lobby-seat lobby-seat--empty">
        <span className="lobby-seat__avatar text-lavender">
          <Icon name="plus" size="1em" />
        </span>
        <span className="lobby-seat__name">Aguardando…</span>
      </div>
    );
  }

  const face = (
    <>
      <span className="lobby-seat__avatar" aria-hidden="true">
        <AvatarBadge name={player.name} you={player.isYou} className="text-[1.05rem]" />
      </span>
      <span className="lobby-seat__name">{player.name}</span>
    </>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`lobby-seat ${player.isYou ? 'lobby-seat--you' : ''}`}
    >
      {/* O assento dos OUTROS abre o perfil; o seu é estático (não há
          perfil de si mesmo). O botão fica por dentro do assento, e não
          é o assento inteiro, porque o "expulsar" também é um botão —
          um dentro do outro seria HTML inválido. */}
      {player.isYou ? (
        face
      ) : (
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`Ver perfil de ${player.name}`}
          data-testid={`seat-profile-${player.id}`}
          className="lobby-seat__open"
        >
          {face}
        </button>
      )}

      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={`Expulsar ${player.name}`}
          data-testid={`seat-kick-${player.id}`}
          className="lobby-seat__kick"
        >
          <Icon name="close" size={10} strokeWidth={3} />
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
  // Perfil aberto e expulsão pendente de confirmação: estado LOCAL de UI.
  // Guardam o JOGADOR (e não só o id) para que o cartão e a pergunta
  // continuem íntegros mesmo que a lista mude embaixo — um bot pode
  // entrar ou sair enquanto o modal está aberto.
  const [profileOf, setProfileOf] = useState<TournamentPlayer | null>(null);
  const [kickTarget, setKickTarget] = useState<TournamentPlayer | null>(null);
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
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="chevron-left" />
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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
          >
            <Icon name="gear" />
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" aria-hidden="true" />
        )}
      </header>

      {/* Resumo: jogadores · aposta · prêmio (edição pela engrenagem, só o dono) */}
      <div className="tournament-summary mb-3">
        <span className="tournament-summary__item flex items-center gap-1.5">
          <Icon name="users" size="0.95em" /> {members.length}/{size}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item flex items-center gap-1.5">
          <Icon name="chip" size="0.95em" /> {formatCredits(stake)}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item tournament-summary__item--prize flex items-center gap-1.5">
          <Icon name="trophy" size="0.95em" /> {formatCredits(pot)}
        </span>
      </div>

      {/* Assentos */}
      <div className="lobby-seats">
        {seats.map((player, i) => (
          <Seat
            key={player?.id ?? `empty-${i}`}
            player={player}
            canKick={owner && !!player && !player.isYou}
            onKick={() => player && setKickTarget(player)}
            onOpenProfile={() => player && setProfileOf(player)}
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
            <Icon name="send" size={16} />
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
                : (
                    <>
                      <Icon name="flag" /> INICIAR TORNEIO
                    </>
                  )}
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

      {/* Perfil do participante, por cima do lobby (que segue vivo atrás). */}
      {profileOf && (
        <OpponentProfileSheet
          open
          opponent={asOpponent(profileOf)}
          onClose={() => setProfileOf(null)}
        />
      )}

      {/* Expulsar é irreversível enquanto a sala existir — por isso passa
          por uma pergunta antes, com o nome de quem vai sair. */}
      <ConfirmDialog
        open={kickTarget !== null}
        title="Expulsar jogador"
        message={
          <>
            Deseja mesmo expulsar <span className="text-gold">{kickTarget?.name}</span> da sala? Não
            será possível entrar de novo enquanto a sala existir.
          </>
        }
        confirmLabel="Expulsar"
        danger
        data-testid="kick-confirm"
        onConfirm={() => {
          if (kickTarget) kickMember(kickTarget.id);
          setKickTarget(null);
        }}
        onCancel={() => setKickTarget(null)}
      />
    </main>
  );
}
