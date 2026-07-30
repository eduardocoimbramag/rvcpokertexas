import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';
import { createId } from '@/shared/lib/ids';

import { COUNTDOWN_START, TIMINGS } from '../../animations/timings';
import { Confetti } from '../../components/Confetti';
import { CountdownOverlay } from '../../components/CountdownOverlay';
import { FoundSplash } from '../../components/FoundSplash';
import { HandsArena } from '../../components/HandsArena';
import { RoundEndBanner } from '../../components/RoundEndBanner';
import { LocalBlackjackGameEngine } from '../../engine/LocalBlackjackGameEngine';
import type { BlackjackRoundState, RoundResult } from '../../engine/types';
import { audioManager } from '../../services/AudioManager';
import { TableScene } from '../../scene/TableScene';
import type { SceneCamera } from '../../scene/TableScene';
import type { DealerReaction } from '../../scene/dealer/DealerController';
import type { GamePhase, TurnClock, TurnReveal } from '../../store/gameStore';
import { TURN_SECONDS } from '../../store/gameStore';
import { useTournamentStore } from '../tournamentStore';

/**
 * Fases da TELA. A vez de cada duelista não mora aqui: enquanto a mesa
 * está de pé (`table`) quem manda é o `phase` da rodada que o motor
 * devolve — a tela só decide quando a mesa entra e quando ela sai.
 */
type LocalPhase = 'intro' | 'countdown' | 'dealing' | 'table' | 'completed';

/** Fases em que a rodada está sobre o feltro (câmera vertical). */
const TABLE_PHASES: readonly LocalPhase[] = ['dealing', 'table'];

function cameraFor(phase: LocalPhase): SceneCamera {
  return TABLE_PHASES.includes(phase) ? 'overhead' : 'front';
}

/**
 * Retorno automático ao chaveamento após o resultado — espelha o
 * AUTO_START_SECONDS da BracketScreen (mesma duração e mesma leitura
 * "⏱ … em Xs"), fechando o ciclo: entra na partida sozinho, sai dela
 * sozinho. O botão continua disponível para pular a espera.
 */
const AUTO_RETURN_SECONDS = 10;

/**
 * Classes da linha de contagem. Compartilhadas entre a linha visível (em
 * cima do botão) e a cópia invisível que a compensa acima do veredito —
 * as duas PRECISAM ocupar exatamente a mesma caixa para o título cair no
 * meio exato entre as cartas e o botão.
 */
const COUNTDOWN_LINE = 'mb-1.5 text-center text-xs font-extrabold';

/**
 * Partida do torneio: a mesma mesa, cartas e ritmo do 1v1. A tela
 * carrega um motor de duelo próprio e a mão é jogada de verdade
 * (PEDIR/PARAR), não pré-decidida. Abre com a MESMA apresentação de
 * duelo do 1v1 (Você → VS → adversário) e segue em countdown →
 * distribuição → vezes simultâneas de 20 s → showdown. Empate
 * re-distribui (mata-mata não admite empate); ao terminar, grava o
 * placar e oferece o retorno ao chaveamento.
 */
export function TournamentMatchScreen() {
  const activeMatch = useTournamentStore((s) => s.activeMatch);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const finishMyMatch = useTournamentStore((s) => s.finishMyMatch);
  const backToBracket = useTournamentStore((s) => s.backToBracket);
  const reducedMotion = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<LocalPhase>('intro');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [round, setRound] = useState<BlackjackRoundState | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [reveal, setReveal] = useState<TurnReveal | null>(null);
  const [turn, setTurn] = useState<TurnClock>({ seconds: 0, opponentReady: false });
  /** Uma vez fechada = uma janela de escolha nova (reinicia o relógio). */
  const [turnId, setTurnId] = useState(0);
  /** As ocultas já viraram (o beat da última revelação passou). */
  const [showdown, setShowdown] = useState(false);
  // Já nasce cheio: a tela é remontada a cada partida (key do stage), e
  // o rótulo só aparece na fase completed — não precisa ser reiniciado
  // dentro do efeito.
  const [returnSecs, setReturnSecs] = useState(AUTO_RETURN_SECONDS);
  const recorded = useRef(false);

  // Motor da partida: um por tela (a tela remonta a cada partida). O
  // matchmaking dele é instantâneo — o adversário de verdade é o do
  // chaveamento; o motor só distribui cartas e aplica as regras.
  const engineRef = useRef<LocalBlackjackGameEngine | null>(null);
  if (engineRef.current == null) {
    engineRef.current = new LocalBlackjackGameEngine({
      matchmakingDelayMs: [0, 0],
      dealDelayMs: 150,
    });
  }
  const engineMatchIdRef = useRef<string | null>(null);

  // Apresentação de duelo → countdown → distribuição, nos MESMOS tempos
  // do 1v1. Cada fase agenda só o SEU sucessor: um único efeito que
  // agendasse a corrente inteira teria os timers restantes cancelados
  // pela própria troca de fase (o cleanup roda a cada mudança).
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

  /**
   * Conduz a mesa a partir do estado que o motor devolveu: revela os
   * dois lances da vez que fechou. Espelha o `handOff` do 1v1 — a mesa é
   * uma só, e o ritmo tem de bater beat a beat nos dois modos.
   */
  const applyRound = useCallback((next: BlackjackRoundState) => {
    setRound(next);
    setResult(next.result ?? null);
    setTurnId((n) => n + 1);
    if (next.lastTurn) {
      setReveal({ ...next.lastTurn, id: createId() });
      audioManager.playSfx(next.lastTurn.player?.action === 'hit' ? 'tap' : 'ready');
    }
  }, []);

  // A revelação sai de cena sozinha um beat depois de entrar.
  useEffect(() => {
    if (!reveal) return;
    const timer = setTimeout(() => setReveal(null), TIMINGS.revealHoldMs);
    return () => clearTimeout(timer);
  }, [reveal]);

  // Distribuição: o motor tira as cartas do baralho (o mesmo da partida
  // — empates re-distribuem sem reembaralhar) e a mesa as apresenta nos
  // beats canônicos. Um natural já fecha a mão de quem o recebeu, e a
  // primeira vez sai do estado que o motor devolve.
  useEffect(() => {
    if (phase !== 'dealing') return;
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    let openTimer: ReturnType<typeof setTimeout> | null = null;
    audioManager.playSfx('shuffle');
    void (async () => {
      try {
        if (!engineMatchIdRef.current) {
          const engineMatch = await engine.findMatch({});
          engineMatchIdRef.current = engineMatch.id;
        }
        const state = await engine.beginRound({ matchId: engineMatchIdRef.current });
        if (cancelled) return;
        setRound(state);
        setResult(state.result ?? null);
        openTimer = setTimeout(() => setPhase('table'), TIMINGS.dealMs);
      } catch {
        // Motor local não falha em produção; num azar extremo, volta ao
        // chaveamento sem gravar nada (a partida continua pendente).
        if (!cancelled) backToBracket();
      }
    })();
    return () => {
      cancelled = true;
      if (openTimer) clearTimeout(openTimer);
    };
  }, [phase, backToBracket]);

  // Trava a SUA escolha da vez. Nada sai na mesa até o rival bater o
  // martelo dele — a vez é simultânea aqui como no 1v1.
  const commitChoice = useCallback(async (action: 'hit' | 'stand') => {
    const engine = engineRef.current;
    const matchId = engineMatchIdRef.current;
    if (!engine || !matchId) return;
    setActionPending(true);
    audioManager.playSfx('tap');
    try {
      setRound(await engine.commit({ matchId, action }));
    } finally {
      setActionPending(false);
    }
  }, []);
  const hit = useCallback(() => void commitChoice('hit'), [commitChoice]);
  const stand = useCallback(() => void commitChoice('stand'), [commitChoice]);

  /**
   * Fecha a vez: executa os dois lances de uma vez só. O ref é a trava
   * contra a corrida entre os dois gatilhos (o relógio zerando e o
   * segundo martelo caindo no mesmo instante) — sem ela, duas chamadas
   * jogariam DUAS vezes seguidas.
   */
  const resolvingRef = useRef(false);
  const closeTurn = useCallback(() => {
    const engine = engineRef.current;
    const matchId = engineMatchIdRef.current;
    if (!engine || !matchId || resolvingRef.current) return;
    resolvingRef.current = true;
    void (async () => {
      try {
        const next = await engine.resolveTurn({ matchId });
        setReveal(null);
        applyRound(next);
      } catch {
        backToBracket();
      } finally {
        resolvingRef.current = false;
      }
    })();
  }, [applyRound, backToBracket]);

  /* Janela de escolha. Depende do `turnId` (uma vez fechada = uma janela
     nova), NUNCA do `round` inteiro: travar a sua escolha muda o round,
     e o relógio não pode reiniciar por causa disso. */
  const roundRef = useRef<BlackjackRoundState | null>(null);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);
  useEffect(() => {
    const current = roundRef.current;
    if (phase !== 'table' || !current || current.phase !== 'choosing') return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Na distribuição não há revelação a esperar: a primeira vez abre já.
    const beat = current.lastTurn ? TIMINGS.turnRevealMs : 0;
    const waitingPlayer = !current.playerClosed;
    const waitingOpponent = !current.opponentClosed;

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setTurn({ seconds: waitingPlayer ? TURN_SECONDS : 0, opponentReady: !waitingOpponent });

        if (waitingOpponent) {
          const at = Math.min(
            TIMINGS.opponentChoiceMinMs +
              Math.random() * (TIMINGS.opponentChoiceMaxMs - TIMINGS.opponentChoiceMinMs),
            TURN_SECONDS * 1000 - 1500,
          );
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              setTurn((clock) => ({ ...clock, opponentReady: true }));
              audioManager.playSfx('tap');
            }, at),
          );
        }

        if (!waitingPlayer) return;
        // Relógio de 20 s: zerou, a mesa para a mão de quem não escolheu.
        for (let s = TURN_SECONDS - 1; s >= 0; s -= 1) {
          const value = s;
          timers.push(
            setTimeout(
              () => {
                if (cancelled) return;
                setTurn((clock) => ({ ...clock, seconds: value }));
                if (value === 0) closeTurn();
              },
              (TURN_SECONDS - s) * 1000,
            ),
          );
        }
      }, beat),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, turnId, closeTurn]);

  // A vez fecha assim que os DOIS baterem o martelo.
  useEffect(() => {
    if (phase !== 'table' || !round || round.phase !== 'choosing') return;
    const playerIn = round.playerClosed || round.playerChoice !== undefined;
    if (playerIn && turn.opponentReady) closeTurn();
  }, [phase, round, turn.opponentReady, closeTurn]);

  // Mãos fechadas → showdown: as ocultas viram, o quadro respira e o
  // desfecho entra. Empate re-distribui (mata-mata não admite empate).
  useEffect(() => {
    if (phase !== 'table' || round?.phase !== 'settled' || !result) return;
    const tie = result.outcome === 'tie';
    const beat = round.lastTurn ? TIMINGS.turnRevealMs : 0;
    const revealTimer = setTimeout(() => setShowdown(true), beat);
    const finish = setTimeout(
      () => {
        if (tie) {
          audioManager.playSfx('tie');
          setShowdown(false);
          setRound(null);
          setResult(null);
          setPhase('dealing');
          return;
        }
        setPhase('completed');
      },
      beat + TIMINGS.revealMs + TIMINGS.settleMs + (tie ? TIMINGS.roundEndMs : 0),
    );
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(finish);
    };
  }, [phase, round, result]);

  const youWin = result?.outcome === 'win';

  // Grava o resultado no chaveamento assim que a mesa fecha a mão
  // (e toca o veredito — na vitória, com a plateia aplaudindo).
  useEffect(() => {
    if (phase === 'completed' && !recorded.current && activeMatch && result) {
      recorded.current = true;
      if (youWin) {
        // Fanfarra + a plateia de pé: o aplauso é um efeito próprio e
        // acompanha toda vitória.
        audioManager.playSfx('win');
        audioManager.playSfx('applause');
      } else {
        audioManager.playSfx('lose');
      }
      finishMyMatch(result);
    }
  }, [phase, finishMyMatch, activeMatch, result, youWin]);

  // Retorno único ao chaveamento. `backToBracket` NÃO é idempotente
  // (dispara runSimulation, que grava no chaveamento), e o cleanup do
  // efeito não roda no clique: o AnimatePresence do TournamentApp
  // segura esta tela montada por ~220ms durante a saída. Sem esta
  // trava, um clique nos últimos milissegundos da contagem deixaria o
  // timer disparar também — duas simulações concorrentes sobrescrevendo
  // placares já gravados.
  const returned = useRef(false);
  const returnOnce = useCallback(() => {
    if (returned.current) return;
    returned.current = true;
    backToBracket();
  }, [backToBracket]);

  // Contagem regressiva de retorno — mesmo desenho do início automático
  // da BracketScreen: um tick por segundo para o rótulo e um disparo no
  // fim. Sair da tela limpa os dois.
  useEffect(() => {
    if (phase !== 'completed') return;
    const tick = setInterval(() => setReturnSecs((s) => (s > 0 ? s - 1 : s)), 1000);
    const fire = setTimeout(returnOnce, AUTO_RETURN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(fire);
    };
  }, [phase, returnOnce]);

  if (!activeMatch) return null;

  const { match, thirdPlace } = activeMatch;
  const subtitle = thirdPlace
    ? youWin
      ? 'O 3º lugar é seu'
      : 'Fim da sua caminhada'
    : youWin
      ? 'Você avança de fase'
      : 'Fim da sua caminhada';
  // A taxa sai na PRIMEIRA derrota. Quem perde a disputa do 3º lugar já
  // pagou ao perder a semi — repetir o aviso seria cobrar duas vezes na
  // leitura do jogador.
  const feeCharged = !youWin && !thirdPlace;
  const feeLine = `Taxa de entrada de ${formatCredits(entryFee)} debitada`;

  /* A fase que a MESA enxerga: enquanto a rodada corre, quem manda é o
     estado do motor; o showdown só entra depois de a última revelação
     respirar (até lá as ocultas continuam viradas). */
  const arenaPhase: GamePhase =
    phase === 'completed'
      ? 'completed'
      : phase === 'dealing' || round === null
        ? 'dealing'
        : round.phase === 'settled'
          ? showdown
            ? 'settle'
            : 'dealing'
          : 'turn';

  const reaction: DealerReaction =
    phase === 'intro'
      ? 'greet'
      : phase === 'countdown'
        ? 'anticipate'
        : phase === 'dealing'
          ? 'shake'
          : arenaPhase === 'settle'
            ? result?.outcome === 'tie'
              ? 'shrug'
              : youWin
                ? 'celebrate'
                : 'console'
            : phase === 'table'
              ? 'present'
              : youWin
                ? 'celebrate'
                : 'console';

  return (
    <main className="flex flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira —
          o selo da partida flutua acima do recorte expandido. */}
      <header className="relative z-20 mb-4 flex items-center justify-center">
        <span className="rounded-full bg-arena-900/75 px-4 py-1 text-xs font-black uppercase tracking-[0.3em] text-gold">
          {thirdPlace ? 'Disputa do 3º lugar' : 'Partida do torneio'}
        </span>
      </header>

      <TableScene reaction={reaction} camera={cameraFor(phase)}>
        <AnimatePresence mode="wait">
          {phase === 'intro' ? (
            <motion.div
              key="intro"
              className="flex flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FoundSplash match={match} />
            </motion.div>
          ) : phase === 'countdown' ? (
            <motion.div
              key="countdown"
              className="flex flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CountdownOverlay value={countdown} />
            </motion.div>
          ) : (
            // relative: o aviso de empate e o bloco de resultado se
            // sobrepõem à mesa em vez de disputar o flex com as mãos —
            // as cartas não pulam de lugar quando o veredito entra.
            <motion.div
              key="arena"
              className="relative flex flex-1 flex-col"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HandsArena
                phase={arenaPhase}
                match={match}
                round={round}
                result={result}
                onHit={hit}
                onStand={stand}
                actionPending={actionPending}
                reveal={reveal}
                turn={turn}
              />
              {arenaPhase === 'settle' && result?.outcome === 'tie' && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
                  <RoundEndBanner result={result} />
                </div>
              )}
              {phase === 'completed' && (
                <motion.div
                  className="result-stage relative flex flex-1 flex-col items-center pb-4"
                  initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                  data-testid="tournament-result-block"
                >
                  {youWin && !reducedMotion && <Confetti />}

                  {/* Espaçador superior: da base das cartas ao veredito. */}
                  <div aria-hidden className="w-full grow" />

                  {/* Cópia invisível da linha de contagem. Ela existe só
                      para compensar, do lado de cima, a altura que a
                      contagem real ocupa do lado de baixo — sem isso o
                      centro do título cairia acima do meio real. */}
                  <p aria-hidden className={`invisible ${COUNTDOWN_LINE}`}>
                    <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Retornando
                    em {returnSecs}s
                  </p>

                  {/* Uma cópia invisível do subtítulo acima do título
                      equilibra o grupo: sobra a MESMA altura acima e
                      abaixo do título, então ele fica no centro exato do
                      grupo — e o grupo, entre os dois espaçadores, no
                      centro da faixa. Tudo em fluxo normal (nada absoluto),
                      então em telas baixas o layout comprime junto em vez
                      de sobrepor. */}
                  <div className="flex flex-col items-center gap-0.5">
                    {/* A derrota é o instante em que a taxa sai do saldo:
                        a linha do débito nasce junto do veredito. Ela
                        também ganha cópia invisível — o grupo tem de
                        continuar simétrico para o título ficar no centro. */}
                    {feeCharged && (
                      <p aria-hidden className="invisible text-xs font-extrabold">
                        {feeLine}
                      </p>
                    )}
                    <p aria-hidden className="invisible text-sm font-extrabold">
                      {subtitle}
                    </p>
                    <p
                      className={`result-title font-display text-engraved font-bold tracking-wide ${youWin ? 'text-[#7a4503]' : 'text-[#8f1616]'}`}
                      data-testid="tournament-result-title"
                    >
                      {youWin ? 'VITÓRIA!' : 'DERROTA'}
                    </p>
                    <p className="text-engraved text-sm font-extrabold text-[#123324]">
                      {subtitle}
                    </p>
                    {feeCharged && (
                      <p
                        className="text-engraved text-xs font-extrabold text-[#7a1f28]"
                        data-testid="entry-fee-charged"
                      >
                        {feeLine}
                      </p>
                    )}
                  </div>

                  {/* Espaçador inferior: do veredito ao botão. Mesmo grow
                      do de cima → veredito EXATAMENTE no meio da faixa. */}
                  <div aria-hidden className="w-full grow" />

                  <p
                    className={`text-engraved text-[#123324] ${COUNTDOWN_LINE}`}
                    data-testid="auto-return"
                  >
                    <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Retornando
                    em {returnSecs}s
                  </p>

                  <div className="action-stack">
                    <Button onClick={returnOnce} size="md" fullWidth data-testid="back-to-bracket">
                      <Icon name="trophy" /> VOLTAR AO CHAVEAMENTO
                    </Button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </TableScene>
    </main>
  );
}
