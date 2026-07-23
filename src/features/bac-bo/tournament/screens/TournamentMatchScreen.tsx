import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { COUNTDOWN_START, TIMINGS } from '../../animations/timings';
import { Confetti } from '../../components/Confetti';
import { CountdownOverlay } from '../../components/CountdownOverlay';
import { DiceArena } from '../../components/DiceArena';
import { FoundSplash } from '../../components/FoundSplash';
import { audioManager } from '../../services/AudioManager';
import { TableScene } from '../../scene/TableScene';
import type { SceneCamera } from '../../scene/TableScene';
import type { DealerReaction } from '../../scene/dealer/DealerController';
import type { GamePhase } from '../../store/gameStore';
import { useTournamentStore } from '../tournamentStore';

type LocalPhase = 'intro' | 'countdown' | 'rolling' | 'reveal' | 'completed';

function cameraFor(phase: LocalPhase): SceneCamera {
  return phase === 'rolling' || phase === 'reveal' ? 'overhead' : 'front';
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
 * meio exato entre os poços e o botão.
 */
const COUNTDOWN_LINE = 'mb-1.5 text-center text-xs font-extrabold';

/**
 * Partida do torneio: reusa exatamente a mesma mesa, dados e ritmo do 1v1.
 * Toda partida abre com a MESMA apresentação de duelo do 1v1 (Você → VS →
 * adversário), depois countdown → giro → revelação → resultado. Ao
 * terminar, grava o placar e oferece o retorno ao chaveamento.
 */
export function TournamentMatchScreen() {
  const activeMatch = useTournamentStore((s) => s.activeMatch);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const finishMyMatch = useTournamentStore((s) => s.finishMyMatch);
  const backToBracket = useTournamentStore((s) => s.backToBracket);
  const reducedMotion = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<LocalPhase>('intro');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  // Já nasce cheio: a tela é remontada a cada partida (key do stage), e
  // o rótulo só aparece na fase completed — não precisa ser reiniciado
  // dentro do efeito.
  const [returnSecs, setReturnSecs] = useState(AUTO_RETURN_SECONDS);
  const recorded = useRef(false);

  // Máquina de fases local: apresentação de duelo + os MESMOS tempos do 1v1.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    const introMs = TIMINGS.foundSplashMs;
    at(() => setPhase('countdown'), introMs);

    let elapsed = introMs;
    for (let value = COUNTDOWN_START; value >= 1; value -= 1) {
      const v = value;
      at(() => setCountdown(v), elapsed);
      elapsed += TIMINGS.countdownTickMs;
    }
    at(() => setPhase('rolling'), elapsed);
    at(() => setPhase('reveal'), elapsed + TIMINGS.rollingMs);
    at(() => setPhase('completed'), elapsed + TIMINGS.rollingMs + TIMINGS.revealMs);

    return () => timers.forEach(clearTimeout);
  }, []);

  // Grava o resultado no chaveamento assim que a mesa termina de revelar
  // (e toca o veredito — na vitória, com a plateia aplaudindo).
  useEffect(() => {
    if (phase === 'completed' && !recorded.current && activeMatch) {
      recorded.current = true;
      audioManager.playSfx(activeMatch.youWin ? 'win' : 'lose');
      finishMyMatch();
    }
  }, [phase, finishMyMatch, activeMatch]);

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

  const { match, result, youWin, thirdPlace } = activeMatch;
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
  const reaction: DealerReaction =
    phase === 'intro'
      ? 'greet'
      : phase === 'countdown'
        ? 'anticipate'
        : phase === 'rolling'
          ? 'shake'
          : phase === 'reveal'
            ? 'reveal'
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
            // Sem justify-between/gap: em completed o bloco de resultado é
            // flex-1 e divide sozinho a faixa livre, exatamente como o
            // ResultBanner do 1v1 (GameScreen). Assim os poços ficam no
            // mesmo lugar das duas modalidades e o veredito fica centrado.
            <motion.div
              key="arena"
              className="flex flex-1 flex-col"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DiceArena phase={phase as GamePhase} match={match} result={result} />
              {phase === 'completed' && (
                <motion.div
                  className="relative flex flex-1 flex-col items-center pb-4"
                  initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                >
                  {youWin && !reducedMotion && <Confetti />}

                  {/* Espaçador superior: da base dos dados ao veredito. */}
                  <div aria-hidden className="w-full grow" />

                  {/* Cópia invisível da linha de contagem. Ela existe só
                      para compensar, do lado de cima, a altura que a
                      contagem real ocupa do lado de baixo — sem isso o
                      centro do título cairia acima do meio real. */}
                  <p aria-hidden className={`invisible ${COUNTDOWN_LINE}`}>
                    <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Retornando em {returnSecs}s
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
                      className={`font-display text-engraved text-4xl font-bold tracking-wide ${youWin ? 'text-[#7a4503]' : 'text-[#8f1616]'}`}
                      data-testid="tournament-result-title"
                    >
                      {youWin ? 'VITÓRIA!' : 'DERROTA'}
                    </p>
                    <p className="text-engraved text-sm font-extrabold text-[#33261a]">
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
                    className={`text-engraved text-[#33261a] ${COUNTDOWN_LINE}`}
                    data-testid="auto-return"
                  >
                    <Icon name="timer" size="0.95em" className="inline align-[-0.1em]" /> Retornando em {returnSecs}s
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
