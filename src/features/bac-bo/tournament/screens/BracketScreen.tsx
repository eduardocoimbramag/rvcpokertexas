import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { AvatarBadge } from '../../components/AvatarBadge';
import { currentMatches, matchWinner } from '../bracket';
import { tournamentSelectors, useTournamentStore } from '../tournamentStore';
import type { BracketMatch, TournamentPlayer } from '../types';
import { roundLabel } from '../types';
import { AdvanceOverlay } from './AdvanceOverlay';

/** Linha de um participante dentro da partida do chaveamento. */
function SeatRow({
  player,
  score,
  isWinner,
  played,
  youId,
}: {
  player: TournamentPlayer | null;
  score: number | null;
  isWinner: boolean;
  played: boolean;
  youId: string;
}) {
  const you = player?.id === youId;
  const state = !played ? 'pending' : isWinner ? 'winner' : 'loser';
  return (
    <div className={`bk-seat bk-seat--${state}`}>
      <span className="bk-seat__avatar" aria-hidden="true">
        {player ? <AvatarBadge name={player.name} you={player.id === youId} /> : '·'}
      </span>
      <span className={`bk-seat__name ${you ? 'bk-seat__name--you' : ''}`}>
        {player ? player.name : 'A definir'}
      </span>
      {isWinner && played && (
        <span className="bk-seat__crown text-gold" aria-hidden="true">
          <Icon name="crown" />
        </span>
      )}
      <span className="bk-seat__score">{score ?? ''}</span>
    </div>
  );
}

function BracketCard({
  match,
  youId,
  isActive,
  index,
}: {
  match: BracketMatch;
  youId: string;
  isActive: boolean;
  index: number;
}) {
  const winner = matchWinner(match);
  return (
    <motion.div
      layout
      className={`bk-match ${isActive ? 'bk-match--active' : ''} ${match.played ? 'bk-match--done' : ''}`}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: index * 0.07 }}
      data-testid="bracket-match"
    >
      {isActive && <span className="bk-match__tag">Sua partida</span>}
      <SeatRow
        player={match.a}
        score={match.scoreA}
        isWinner={winner?.id === match.a?.id && match.played}
        played={match.played}
        youId={youId}
      />
      <div className="bk-match__divider" aria-hidden="true" />
      <SeatRow
        player={match.b}
        score={match.scoreB}
        isWinner={winner?.id === match.b?.id && match.played}
        played={match.played}
        youId={youId}
      />
    </motion.div>
  );
}

const AUTO_START_SECONDS = 10;

/** Tempo em tela do overlay de avanço de fase (cobre a animação inteira). */
const ADVANCE_OVERLAY_MS = 2300;

/**
 * Chaveamento focado no ESTADO ATUAL: mostra só a fase em andamento (sem
 * rolagem lateral), com um stepper indicando o progresso. A partida do
 * jogador inicia sozinha em 10s (anti-AFK). Ao avançar de fase, o token do
 * jogador sobe o rastro até a célula da próxima fase (AdvanceOverlay).
 */
export function BracketScreen() {
  const bracket = useTournamentStore((s) => s.bracket);
  const simulating = useTournamentStore((s) => s.simulating);
  const playMyMatch = useTournamentStore((s) => s.playMyMatch);
  const leave = useTournamentStore((s) => s.leaveTournament);
  const yourPending = useTournamentStore(tournamentSelectors.yourPending);
  const eliminated = useTournamentStore(tournamentSelectors.youEliminated);
  const activeRound = useTournamentStore(tournamentSelectors.activeRound);
  const playingThird = useTournamentStore(tournamentSelectors.yourPendingIsThirdPlace);
  const reducedMotion = useReducedMotion() ?? false;

  const youId = tournamentSelectors.youId;
  const yourPendingId = yourPending?.id ?? null;

  const [advance, setAdvance] = useState<{
    opponent: TournamentPlayer | null;
    phaseLabel: string;
    kicker: string;
  } | null>(null);
  const [autoSecs, setAutoSecs] = useState<number | null>(null);
  const prevRoundRef = useRef(activeRound);

  const canPlay = yourPendingId !== null && !simulating && advance === null;

  // Anima o avanço de fase quando a rodada troca e o jogador segue vivo.
  // O ref só avança quando a rodada REALMENTE sobe: assim as reescritas
  // do chaveamento (que reexecutam este efeito) não são confundidas com
  // um novo avanço.
  useEffect(() => {
    if (activeRound <= prevRoundRef.current) return;
    prevRoundRef.current = activeRound;
    if (reducedMotion || eliminated || !yourPending || !bracket) return;
    const round = bracket.rounds[activeRound];
    const opp = yourPending.a?.id === youId ? yourPending.b : yourPending.a;
    // Quem perdeu a semi não avança: cai na disputa do bronze, e o
    // anúncio precisa dizer isso em vez de comemorar uma promoção.
    const data = playingThird
      ? { opponent: opp ?? null, phaseLabel: '3º lugar', kicker: 'Você joga pelo' }
      : {
          opponent: opp ?? null,
          phaseLabel: roundLabel(round?.length ?? 1),
          kicker: 'Você avança para',
        };
    const show = setTimeout(() => setAdvance(data), 0);
    return () => clearTimeout(show);
  }, [activeRound, eliminated, yourPending, bracket, youId, reducedMotion, playingThird]);

  // Fechamento do overlay em efeito PRÓPRIO, dependendo só de `advance`.
  // Antes ele vivia no efeito acima, junto de `bracket`/`yourPending`:
  // como a simulação dos bots reescreve o chaveamento a cada ~750ms, o
  // cleanup cancelava o fechamento e o efeito reexecutado saía cedo
  // (a rodada não tinha subido de novo) sem reagendá-lo. O overlay
  // ficava na tela para sempre e, como `canPlay` exige `advance === null`,
  // o torneio travava — nem o botão nem o início automático voltavam.
  useEffect(() => {
    if (!advance) return;
    const hide = setTimeout(() => setAdvance(null), ADVANCE_OVERLAY_MS);
    return () => clearTimeout(hide);
  }, [advance]);

  // Início automático da partida do jogador (10s por rodada, anti-AFK).
  useEffect(() => {
    if (!canPlay) {
      const reset = setTimeout(() => setAutoSecs(null), 0);
      return () => clearTimeout(reset);
    }
    const init = setTimeout(() => setAutoSecs(AUTO_START_SECONDS), 0);
    const tick = setInterval(
      () => setAutoSecs((s) => (typeof s === 'number' && s > 0 ? s - 1 : s)),
      1000,
    );
    const fire = setTimeout(() => playMyMatch(), AUTO_START_SECONDS * 1000);
    return () => {
      clearTimeout(init);
      clearInterval(tick);
      clearTimeout(fire);
    };
  }, [canPlay, yourPendingId, playMyMatch]);

  if (!bracket) return null;

  // O que está em jogo agora — entre a semi e a final, a disputa do 3º.
  const round = currentMatches(bracket);
  const onThirdPlace = bracket.thirdPlace ? round[0]?.id === bracket.thirdPlace.id : false;
  const steps = bracket.rounds.map((r) => roundLabel(r.length));

  return (
    // min-h-0: com as 8 cartas das oitavas, a grade densa precisa poder
    // encolher e rolar por dentro — sem isto ela empurraria o botão de
    // jogar para fora do viewport fixo.
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={leave}
          aria-label="Sair do torneio"
          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="chevron-left" />
        </button>
        <h1 className="text-xl font-bold tracking-wide">Chaveamento</h1>
        <span className="h-11 w-11 shrink-0" aria-hidden="true" />
      </header>

      {/* Stepper das fases (progresso, sem mostrar todo o chaveamento). */}
      <div className="phase-steps" role="list">
        {steps.map((label, i) => {
          const state = i < activeRound ? 'done' : i === activeRound ? 'current' : 'todo';
          return (
            <div key={label} className="phase-step" role="listitem">
              <span className={`phase-step__dot phase-step__dot--${state}`}>
                {i < activeRound ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`phase-step__label phase-step__label--${state}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* A disputa do bronze não é um degrau da escada: em vez de virar
          um passo no stepper, ela se anuncia aqui em cima das cartas. */}
      {onThirdPlace && (
        <p className="third-place-tag" data-testid="third-place-tag">
          <Icon name="crown" size="0.95em" className="inline align-[-0.1em]" /> Disputa do 3º lugar
        </p>
      )}

      {/* Só a fase atual — sem overflow lateral. As oitavas (8 partidas
          da sala de 16) trocam a pilha por uma grade densa de duas
          colunas para caber na tela. */}
      <div className={`active-round ${round.length > 4 ? 'active-round--dense' : ''}`}>
        <AnimatePresence mode="popLayout">
          {round.map((match, i) => (
            <BracketCard
              key={match.id}
              match={match}
              youId={youId}
              index={i}
              isActive={yourPendingId === match.id && !simulating}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="action-stack pb-2 pt-4">
        {canPlay ? (
          <div className="flex flex-col items-center gap-1.5">
            {autoSecs !== null && (
              <p className="text-xs font-bold text-lavender" data-testid="auto-start">
                <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Início automático em {autoSecs}s
              </p>
            )}
            <Button onClick={playMyMatch} size="md" fullWidth data-testid="play-tournament-match">
              <Icon name="club" /> JOGAR AGORA
            </Button>
          </div>
        ) : (
          <div className="bracket-status" role="status" data-testid="bracket-status">
            {eliminated ? (
              <>Você foi eliminado — acompanhe até o campeão</>
            ) : (
              <>
                Aguardando término das outras partidas
                <span className="waiting-dots" aria-hidden="true">
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {advance && (
          <AdvanceOverlay
            you={{ id: youId, name: 'Você', avatar: 'V', isYou: true }}
            opponent={advance.opponent}
            phaseLabel={advance.phaseLabel}
            kicker={advance.kicker}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
