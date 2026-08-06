import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';
import { CryptoRng } from '@/shared/lib/random';

import { COUNTDOWN_START, TIMINGS } from '../../animations/timings';
import { Confetti } from '../../components/Confetti';
import { CountdownOverlay } from '../../components/CountdownOverlay';
import { GoldAnnounce } from '../../components/GoldAnnounce';
import { HudPill } from '../../components/HudPill';
import { ResultStage } from '../../components/ResultStage';
import { buildDeck } from '../../engine/rules';
import type { Card, PlayerAction } from '../../engine/types';
import { TableScene } from '../../scene/TableScene';
import type { SceneCamera } from '../../scene/TableScene';
import type { DealerReaction } from '../../scene/dealer/DealerController';
import { audioManager } from '../../services/AudioManager';
import { TURN_SECONDS } from '../../components/table/duelArena';
import type { TableRoundState } from '../tableRound';
import { dealTableRound, isSeatWaiting, lockTableChoice, resolveTableTurn } from '../tableRound';
import { bestTableHands, tableStandingOf } from '../tableRules';
import { tablePrize, tournamentSelectors, useTournamentStore } from '../tournamentStore';
import { TABLE_TARGET_WINS } from '../types';
import { TableArena } from './TableArena';

/**
 * Fases da TELA da mesa única. Uma rodada inteira acontece aqui e a
 * série continua na mesma tela — não há ida e volta a um chaveamento:
 *
 * intro → countdown → dealing → table → showdown → verdict → (dealing… |
 * over)
 */
type LocalPhase = 'intro' | 'countdown' | 'dealing' | 'table' | 'showdown' | 'verdict' | 'over';

/** Fases em que as cartas estão no feltro (câmera vertical). */
const FELT_PHASES: readonly LocalPhase[] = ['dealing', 'table', 'showdown', 'verdict'];

/** Quanto o anúncio do veredito segura a mesa antes da rodada seguinte. */
const VERDICT_MS = 2600;

/** Retorno automático à coroação — o mesmo ritmo do resto do torneio. */
const AUTO_RETURN_SECONDS = 10;

/** Baralhos do sapato: seis mãos que crescem secariam um maço de 52. */
const TABLE_DECKS = 2;

function cameraFor(phase: LocalPhase): SceneCamera {
  return FELT_PHASES.includes(phase) ? 'overhead' : 'front';
}

/**
 * MESA ÚNICA do torneio: de 3 a 6 jogadores no mesmo feltro, rodada após
 * rodada de 21, melhor de 3.
 *
 * A tela é a mesa inteira: distribui, conduz as vezes simultâneas (20 s
 * no relógio, como em todo o jogo), revela o showdown, anuncia o veredito
 * e emenda a rodada seguinte. As regras de quem pontua — inclusive o
 * empate que vira rodada de desempate — vivem no store e em
 * ../tableRules; aqui mora só a coreografia.
 */
export function TableMatchScreen() {
  const series = useTournamentStore((s) => s.tableSeries);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const size = useTournamentStore((s) => s.size);
  const lobbyName = useTournamentStore((s) => s.lobbyName);
  const settleTableRound = useTournamentStore((s) => s.settleTableRound);
  const showTableChampion = useTournamentStore((s) => s.showTableChampion);
  const reduced = useReducedMotion() ?? false;
  const youId = tournamentSelectors.youId;

  const [phase, setPhase] = useState<LocalPhase>('intro');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [round, setRound] = useState<TableRoundState | null>(null);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [turnId, setTurnId] = useState(0);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [returnSecs, setReturnSecs] = useState(AUTO_RETURN_SECONDS);

  /* Espelho síncrono da rodada: a coreografia decide dentro de callbacks
     e timers, onde o estado do React ainda não chegou. A SÉRIE não
     precisa de espelho — ela mora no store, e `getState()` sempre
     devolve a versão fresca dela. */
  const roundRef = useRef<TableRoundState | null>(null);
  const deckRef = useRef<Card[]>([]);
  const rngRef = useRef(new CryptoRng());
  const resolvingRef = useRef(false);
  /** Rodada já julgada no store (uma vez por rodada, nunca duas). */
  const settledRoundRef = useRef(-1);
  const returnedRef = useRef(false);

  const roundNumber = series?.round ?? 0;
  const championId = series?.championId ?? null;

  const setRoundState = useCallback((next: TableRoundState | null) => {
    roundRef.current = next;
    setRound(next);
  }, []);

  // Apresentação → countdown, nos mesmos tempos do resto do jogo. Cada
  // fase agenda só o SEU sucessor (o cleanup roda a cada troca).
  useEffect(() => {
    if (phase === 'intro') {
      const timer = setTimeout(() => setPhase('countdown'), TIMINGS.foundSplashMs);
      return () => clearTimeout(timer);
    }
    if (phase === 'countdown') {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let elapsed = 0;
      for (let value = COUNTDOWN_START; value >= 1; value -= 1) {
        const v = value;
        timers.push(setTimeout(() => setCountdown(v), elapsed));
        elapsed += TIMINGS.countdownTickMs;
      }
      timers.push(setTimeout(() => setPhase('dealing'), elapsed));
      return () => timers.forEach(clearTimeout);
    }
    return;
  }, [phase]);

  // Distribuição da rodada: sapato novo, duas cartas por assento EM JOGO
  // (numa rodada de desempate os espectadores não recebem cartas).
  useEffect(() => {
    if (phase !== 'dealing') return;
    const current = useTournamentStore.getState().tableSeries;
    if (!current || current.playingIds.length === 0) return;
    audioManager.playSfx('shuffle');
    deckRef.current = buildDeck(rngRef.current, TABLE_DECKS);
    setRoundState(dealTableRound(current.playingIds, deckRef.current));
    setWinnerIds([]);
    setReadyIds([]);
    const timer = setTimeout(() => {
      setPhase('table');
      setTurnId((n) => n + 1);
    }, TIMINGS.dealMs);
    return () => clearTimeout(timer);
  }, [phase, roundNumber, setRoundState]);

  /**
   * Fecha a vez: todos os lances de uma vez só. O ref é a trava contra a
   * corrida entre os dois gatilhos (o relógio zerando e o último martelo
   * caindo no mesmo instante).
   */
  const closeTurn = useCallback(() => {
    if (resolvingRef.current) return;
    const current = roundRef.current;
    if (!current || current.phase !== 'choosing') return;
    resolvingRef.current = true;
    const next = resolveTableTurn(current, deckRef.current, youId);
    setRoundState(next);
    setReadyIds([]);
    if (next.phase === 'settled') setPhase('showdown');
    else setTurnId((n) => n + 1);
    resolvingRef.current = false;
  }, [setRoundState, youId]);

  /* Janela de escolha da vez. Depende do `turnId` (uma vez fechada = uma
     janela nova), nunca do `round` inteiro: travar a sua escolha muda o
     round, e o relógio não pode reiniciar por causa disso. */
  useEffect(() => {
    if (phase !== 'table' || turnId === 0) return;
    const current = roundRef.current;
    if (!current || current.phase !== 'choosing') return;

    const youWaiting = current.hands.some((h) => h.playerId === youId && isSeatWaiting(h));
    const rivalsWaiting = current.hands.filter((h) => h.playerId !== youId && isSeatWaiting(h));
    setSeconds(youWaiting ? TURN_SECONDS : 0);

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Cada rival bate o martelo em algum instante da janela — nunca
    // todos no mesmo tempo, e nunca revelando O QUE escolheu.
    for (const rival of rivalsWaiting) {
      const at = Math.min(
        TIMINGS.opponentChoiceMinMs +
          Math.random() * (TIMINGS.opponentChoiceMaxMs - TIMINGS.opponentChoiceMinMs),
        TURN_SECONDS * 1000 - 1500,
      );
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setReadyIds((prev) => (prev.includes(rival.playerId) ? prev : [...prev, rival.playerId]));
          audioManager.playSfx('tap');
        }, at),
      );
    }

    if (youWaiting) {
      for (let s = TURN_SECONDS - 1; s >= 0; s -= 1) {
        const value = s;
        timers.push(
          setTimeout(
            () => {
              if (cancelled) return;
              setSeconds(value);
              // Zerou: a mesa PARA a sua mão (parar nunca estoura).
              if (value === 0) closeTurn();
            },
            (TURN_SECONDS - s) * 1000,
          ),
        );
      }
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, turnId, youId, closeTurn]);

  // A vez fecha quando TODO mundo estiver dentro: você (ou a sua mão já
  // fechada) e o martelo de cada rival vivo.
  useEffect(() => {
    if (phase !== 'table' || !round || round.phase !== 'choosing') return;
    const youIn = !round.hands.some((h) => h.playerId === youId && isSeatWaiting(h));
    const rivalsIn = round.hands
      .filter((h) => h.playerId !== youId && isSeatWaiting(h))
      .every((h) => readyIds.includes(h.playerId));
    if (youIn && rivalsIn) closeTurn();
  }, [phase, round, readyIds, youId, closeTurn]);

  // Showdown: as ocultas viram, a mesa respira e o veredito é julgado
  // pelo store — uma vez só por rodada.
  useEffect(() => {
    if (phase !== 'showdown') return;
    const current = roundRef.current;
    if (!current) return;
    const standings = current.hands.map((hand) => tableStandingOf(hand.playerId, hand.cards));
    setWinnerIds(bestTableHands(standings));
    const timer = setTimeout(() => {
      if (settledRoundRef.current !== roundNumber) {
        settledRoundRef.current = roundNumber;
        settleTableRound(standings);
      }
      setPhase('verdict');
    }, TIMINGS.revealMs + TIMINGS.settleMs);
    return () => clearTimeout(timer);
  }, [phase, roundNumber, settleTableRound]);

  // O veredito respira e a mesa emenda: rodada nova, ou o fim da série.
  useEffect(() => {
    if (phase !== 'verdict') return;
    const timer = setTimeout(() => {
      if (useTournamentStore.getState().tableSeries?.championId) {
        setPhase('over');
        return;
      }
      setPhase('dealing');
    }, VERDICT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const returnOnce = useCallback(() => {
    if (returnedRef.current) return;
    returnedRef.current = true;
    showTableChampion();
  }, [showTableChampion]);

  // Contagem de retorno à coroação (o botão pula a espera).
  useEffect(() => {
    if (phase !== 'over') return;
    const tick = setInterval(() => setReturnSecs((s) => (s > 0 ? s - 1 : s)), 1000);
    const fire = setTimeout(returnOnce, AUTO_RETURN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(fire);
    };
  }, [phase, returnOnce]);

  const choose = useCallback(
    (action: PlayerAction) => {
      const current = roundRef.current;
      if (!current || current.phase !== 'choosing') return;
      const seat = current.hands.find((h) => h.playerId === youId);
      if (!seat || !isSeatWaiting(seat)) return;
      audioManager.playSfx('tap');
      setRoundState(lockTableChoice(current, youId, action));
    },
    [setRoundState, youId],
  );

  if (!series) return null;

  const yourSeat = series.seats.find((seat) => seat.player.id === youId);
  const youWon = championId === youId;
  const champion = series.seats.find((seat) => seat.player.id === championId)?.player ?? null;
  const revealed = phase === 'showdown' || phase === 'verdict' || phase === 'over';

  /* Quem a MESA mostra como estando na mão. Enquanto o showdown e o
     veredito estão em cena, é quem JOGOU a rodada — não quem o store já
     escalou para a próxima. Sem isto, um veredito de desempate apagava
     na hora os assentos que acabaram de empatar, escondendo justamente
     as mãos que explicam o desempate. */
  const roundParticipants = round?.hands.map((hand) => hand.playerId) ?? [];
  const shownPlayingIds =
    revealed && roundParticipants.length > 0
      ? roundParticipants
      : series.playingIds.length > 0
        ? series.playingIds
        : series.seats.map((seat) => seat.player.id);
  const yourTurn =
    phase === 'table' &&
    !!round?.hands.some((hand) => hand.playerId === youId && isSeatWaiting(hand));

  /** O anúncio do veredito, na voz da mesa. */
  const verdict = series.lastVerdict;
  const announce =
    phase !== 'verdict' || !verdict
      ? null
      : verdict.kind === 'void'
        ? { title: 'Mão morta', detail: 'Ninguém salvou a mão — a mesa redistribui.' }
        : verdict.kind === 'tiebreak'
          ? {
              title: 'Desempate',
              detail: `Empate na decisão: ${verdict.contenders.length} líderes jogam a rodada, o resto assiste.`,
            }
          : verdict.championId
            ? {
                title: verdict.championId === youId ? 'Mesa é sua' : 'Mesa fechada',
                detail: `${nameOf(series, verdict.championId)} venceu ${TABLE_TARGET_WINS} rodadas.`,
              }
            : verdict.winners.length > 1
              ? {
                  title: 'Empate',
                  detail: `+1 para ${verdict.winners.map((id) => nameOf(series, id)).join(' e ')}.`,
                }
              : {
                  title: 'Rodada vencida',
                  detail: `+1 para ${nameOf(series, verdict.winners[0] ?? '')}.`,
                };

  const reaction: DealerReaction =
    phase === 'intro'
      ? 'greet'
      : phase === 'countdown'
        ? 'anticipate'
        : phase === 'dealing'
          ? 'shake'
          : phase === 'showdown' || phase === 'verdict'
            ? winnerIds.includes(youId)
              ? 'celebrate'
              : winnerIds.length === 0
                ? 'shrug'
                : 'console'
            : phase === 'over'
              ? youWon
                ? 'celebrate'
                : 'console'
              : 'present';

  return (
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira —
          o selo da rodada flutua acima do recorte expandido. */}
      <header className="relative z-20 mb-3 flex items-center justify-between gap-2">
        <HudPill variant="tag" data-testid="table-round">
          {series.tiebreak ? 'Desempate' : `Rodada ${series.round}`}
        </HudPill>
        <HudPill
          variant="tag"
          className="hud-pill--num"
          data-testid="table-pot"
          leading={<Icon name="trophy" size="0.9em" />}
        >
          {formatCredits(tablePrize(entryFee, size))}
        </HudPill>
      </header>

      <TableScene reaction={reaction} camera={cameraFor(phase)}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {phase === 'countdown' ? (
            <CountdownOverlay value={countdown} />
          ) : (
            <TableArena
              seats={series.seats}
              hands={round?.hands ?? []}
              playingIds={shownPlayingIds}
              youId={youId}
              revealed={revealed}
              winnerIds={winnerIds}
              tiebreak={series.tiebreak}
              yourTurn={yourTurn}
              readyIds={readyIds}
              seconds={seconds}
              actionPending={false}
              onHit={() => choose('hit')}
              onStand={() => choose('stand')}
            />
          )}

          {/* A mesa se apresenta: o título carimba o feltro com todos os
              assentos já em cena. */}
          <AnimatePresence>
            {phase === 'intro' && (
              <GoldAnnounce
                key="intro"
                text={`Mesa única · melhor de ${TABLE_TARGET_WINS}`}
                data-testid="table-intro"
              />
            )}
            {announce && (
              <motion.div
                key={`verdict-${series.round}`}
                className="table-verdict"
                data-testid="table-verdict"
                role="status"
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }
                }
              >
                <p className="table-verdict__title">{announce.title}</p>
                <p className="table-verdict__detail">{announce.detail}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fim da série: o veredito da mesa e a saída para a coroação.
              É o MESMO palco do duelo e da partida do torneio — só que
              sobre a cortina escura em vez do couro (ver ResultStage). */}
          {phase === 'over' && (
            <ResultStage
              surface="overlay"
              tone={youWon ? 'win' : 'lose'}
              title={youWon ? 'VITÓRIA!' : 'DERROTA'}
              titleTestId="table-result-title"
              subtitle={
                youWon
                  ? `Você levou ${formatCredits(tablePrize(entryFee, size))} créditos`
                  : `${champion?.name ?? 'A mesa'} fechou a série · você fez ${yourSeat?.wins ?? 0} de ${TABLE_TARGET_WINS}`
              }
              note={!youWon ? `Taxa de entrada de ${formatCredits(entryFee)} debitada` : undefined}
              noteTestId="table-fee-charged"
              footer={
                <>
                  <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Encerrando
                  em {returnSecs}s
                </>
              }
              footerTestId="table-auto-return"
              instant={reduced}
              decoration={youWon && !reduced ? <Confetti /> : undefined}
              data-testid="table-over"
            >
              <Button onClick={returnOnce} size="md" fullWidth data-testid="table-finish">
                <Icon name="trophy" /> VER O RESULTADO
              </Button>
            </ResultStage>
          )}
        </div>
      </TableScene>

      <span className="sr-only" aria-live="polite">
        {lobbyName}
      </span>
    </main>
  );
}

/** Nome de um assento pelo id (para os anúncios da mesa). */
function nameOf(
  series: { seats: readonly { player: { id: string; name: string } }[] },
  id: string,
): string {
  const seat = series.seats.find((s) => s.player.id === id);
  if (!seat) return 'A mesa';
  return seat.player.id === 'you' ? 'Você' : seat.player.name;
}
