import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
import { prizeFor, tablePrize, tournamentSelectors, useTournamentStore } from '../tournamentStore';
import type { TournamentPlayer } from '../types';
import { TABLE_TARGET_WINS, formatLabel } from '../types';
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

const STAMP_SPRING = { type: 'spring', stiffness: 520, damping: 16 } as const;

/**
 * Prontidão do assento, na MESMA linguagem da confirmação do duelo 1v1
 * (ConfirmPanel), em escala de lobby: enquanto espera, um aro tracejado
 * gira em volta do medalhão; ao confirmar, o anel esmeralda se desenha,
 * o selo de visto carimba no canto e um flash expande.
 */
function ReadyMark({ ready, instant }: { ready: boolean; instant: boolean }) {
  return (
    <>
      {ready ? (
        <svg className="confirm-ring confirm-ring--seat" viewBox="0 0 100 100" aria-hidden="true">
          <motion.circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="#34d399"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            initial={instant ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={instant ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
      ) : (
        <motion.svg
          className="confirm-ring confirm-ring--seat"
          viewBox="0 0 100 100"
          aria-hidden="true"
          animate={instant ? undefined : { rotate: 360 }}
          transition={instant ? undefined : { repeat: Infinity, duration: 7, ease: 'linear' }}
        >
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="rgba(203, 115, 73, 0.6)"
            strokeWidth="3.5"
            strokeDasharray="10 8"
            strokeLinecap="round"
          />
        </motion.svg>
      )}

      <AnimatePresence>
        {ready && (
          <motion.span
            className="confirm-badge confirm-badge--seat"
            aria-hidden="true"
            initial={instant ? false : { scale: 0, rotate: -40, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={instant ? { duration: 0 } : STAMP_SPRING}
          >
            <Icon name="check" size={9} strokeWidth={3.4} />
          </motion.span>
        )}
      </AnimatePresence>

      {ready && !instant && (
        <motion.span
          className="confirm-flash confirm-flash--seat"
          aria-hidden="true"
          initial={{ opacity: 0.9, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      )}
    </>
  );
}

/** Assento do lobby: membro presente (pronto ou não), ou vaga aguardando. */
function Seat({
  player,
  ready,
  leader,
  canKick,
  instant,
  onKick,
  onOpenProfile,
}: {
  player: TournamentPlayer | null;
  ready: boolean;
  /** Dono da sala: usa coroa em vez do selo de confirmação. */
  leader: boolean;
  canKick: boolean;
  instant: boolean;
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
      <span className="lobby-seat__avatar">
        <AvatarBadge name={player.name} you={player.isYou} className="text-[1.05rem]" />
        {/* O dono não confirma nada: onde os outros carimbam o visto, ele
            usa a coroa da casa. */}
        {leader ? (
          <span className="lobby-seat__crown" aria-label="Anfitrião da sala">
            <Icon name="crown" size={10} strokeWidth={2.4} />
          </span>
        ) : (
          <ReadyMark ready={ready} instant={instant} />
        )}
      </span>
      <span className="lobby-seat__name">{player.name}</span>
    </>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`lobby-seat ${player.isYou ? 'lobby-seat--you' : ''} ${leader ? 'lobby-seat--leader' : ready ? 'lobby-seat--ready' : ''}`}
      data-testid={`lobby-seat-${player.id}`}
      data-ready={ready}
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
  const format = useTournamentStore((s) => s.format);
  const size = useTournamentStore((s) => s.size);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const members = useTournamentStore((s) => s.members);
  const readyIds = useTournamentStore((s) => s.readyIds);
  const ownerId = useTournamentStore((s) => s.ownerId);
  const chat = useTournamentStore((s) => s.chat);
  const kickMember = useTournamentStore((s) => s.kickMember);
  const sendChat = useTournamentStore((s) => s.sendChat);
  const confirmPresence = useTournamentStore((s) => s.confirmPresence);
  const cancelPresence = useTournamentStore((s) => s.cancelPresence);
  const start = useTournamentStore((s) => s.startTournament);
  const leave = useTournamentStore((s) => s.leaveTournament);
  const owner = useTournamentStore(tournamentSelectors.isOwner);
  const youReady = useTournamentStore(tournamentSelectors.youReady);
  const readyCount = useTournamentStore(tournamentSelectors.readyCount);
  const allReady = useTournamentStore(tournamentSelectors.allReady);
  const balance = useGameStore((s) => s.balance);
  const instant = useReducedMotion() ?? false;

  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Perfil aberto e expulsão pendente de confirmação: estado LOCAL de UI.
  // Guardam o JOGADOR (e não só o id) para que o cartão e a pergunta
  // continuem íntegros mesmo que a lista mude embaixo — um bot pode
  // entrar ou sair enquanto o modal está aberto.
  const [profileOf, setProfileOf] = useState<TournamentPlayer | null>(null);
  const [kickTarget, setKickTarget] = useState<TournamentPlayer | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // No resumo compacto cabe o topo do pódio; a divisão inteira
  // (50/30/20) vive na ficha da sala, atrás da engrenagem. Na mesa única
  // não há divisão: o campeão leva o bolo.
  const prize =
    format === 'table' ? tablePrize(entryFee, size) : prizeFor(1, entryFee, size);
  // A taxa não é debitada aqui — mas o saldo precisa cobri-la, porque é
  // ela que sai se o jogador perder.
  const canAfford = balance >= entryFee;

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
    // min-h-0: a sala de 16 tem mais conteúdo mínimo que a tela — sem
    // isto o lobby estoura o viewport (cortando o cabeçalho) em vez de
    // encolher assentos e chat nas suas rolagens internas.
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={leave}
          aria-label="Sair da sala"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="chevron-left" />
        </button>
        {/* Só o nome da sala. Visibilidade, código e senha são ficha
            técnica: moram atrás da engrenagem, onde já vivem a taxa e a
            premiação — o cabeçalho não é lugar de ficha. */}
        <div className="flex min-w-0 items-center">
          <h1 className="truncate text-xl font-bold tracking-wide">{lobbyName}</h1>
        </div>
        {/* Visível para todos: a folha é a ficha da sala (taxa, prêmio,
            senha). Só o dono encontra lá algo para mexer. */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Detalhes da sala"
          data-testid="lobby-settings"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="gear" />
        </button>
      </header>

      {/* Resumo: formato · jogadores · taxa de entrada · prêmio. */}
      <div className="tournament-summary mb-3">
        <span className="tournament-summary__item flex items-center gap-1.5">
          <Icon name={format === 'bracket' ? 'trophy' : 'users'} size="0.95em" />{' '}
          {format === 'bracket' ? formatLabel(format) : `Melhor de ${TABLE_TARGET_WINS}`}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item flex items-center gap-1.5">
          <Icon name="user" size="0.95em" /> {members.length}/{size}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item flex items-center gap-1.5">
          <Icon name="chip" size="0.95em" /> {formatCredits(entryFee)}
        </span>
        <span className="tournament-summary__sep" aria-hidden="true">
          ·
        </span>
        <span className="tournament-summary__item tournament-summary__item--prize flex items-center gap-1.5">
          <Icon name="trophy" size="0.95em" /> {formatCredits(prize)}
        </span>
      </div>

      {/* Assentos, cada um com o seu estado de prontidão. A sala de 16
          usa a variante densa (compacta e rolável) para o chat
          continuar respirando. */}
      <div className={`lobby-seats ${size === 16 ? 'lobby-seats--dense' : ''}`} data-testid="lobby-seats">
        {seats.map((player, i) => (
          <Seat
            key={player?.id ?? `empty-${i}`}
            player={player}
            ready={!!player && readyIds.includes(player.id)}
            leader={!!player && player.id === ownerId}
            canKick={owner && !!player && !player.isYou}
            instant={instant}
            onKick={() => player && setKickTarget(player)}
            onOpenProfile={() => player && setProfileOf(player)}
          />
        ))}
      </div>

      {/* Chat. Na sala de 16 ele ganha um piso de altura: os assentos é
          que encolhem (com rolagem), nunca o chat inteiro. */}
      <div className={`lobby-chat ${size === 16 ? 'lobby-chat--floor' : ''}`}>
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

      {/* Dois papéis, dois botões: o dono acompanha as confirmações e dá
          o start; os convidados confirmam — e podem voltar atrás. */}
      <div className="action-stack pb-2 pt-3">
        {owner ? (
          <Button
            onClick={start}
            disabled={!allReady || !canAfford}
            size="md"
            fullWidth
            data-testid="start-tournament"
          >
            {!allReady ? (
              `${readyCount}/${size} JOGADORES CONFIRMADOS`
            ) : !canAfford ? (
              'SALDO INSUFICIENTE'
            ) : (
              <>
                <Icon name="flag" /> INICIAR TORNEIO
              </>
            )}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {youReady && (
              <p className="text-xs font-bold text-lavender" role="status" data-testid="lobby-waiting">
                {allReady ? 'Aguardando o anfitrião iniciar' : 'Aguardando os jogadores'}
                <span className="waiting-dots" aria-hidden="true">
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                </span>
              </p>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {youReady ? (
                <motion.div
                  key="cancel"
                  className="w-full"
                  initial={instant ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    variant="danger"
                    onClick={cancelPresence}
                    size="md"
                    fullWidth
                    data-testid="cancel-presence"
                  >
                    <Icon name="close" strokeWidth={2.6} /> CANCELAR
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="confirm"
                  className="w-full"
                  initial={instant ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button onClick={confirmPresence} size="md" fullWidth data-testid="confirm-presence">
                    <Icon name="check" strokeWidth={2.4} /> CONFIRMAR PRESENÇA
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
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
