import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import type { SceneCamera } from '../scene/TableScene';
import { TableScene } from '../scene/TableScene';
import { useDealerReaction } from '../scene/dealer/useDealerReaction';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { BalancePill } from './BalancePill';
import { CoinFlipOverlay } from './CoinFlipOverlay';
import { ConfirmPanel } from './ConfirmPanel';
import { CountdownOverlay } from './CountdownOverlay';
import { FoundSplash } from './FoundSplash';
import { HandsArena } from './HandsArena';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { NegotiationPanel } from './NegotiationPanel';
import { ResultBanner } from './ResultBanner';
import { RoundEndBanner } from './RoundEndBanner';
import { SeriesDots } from './SeriesDots';

/** Fases em que a rodada de blackjack está sobre a mesa (grupo arena). */
const ARENA_PHASES: readonly GamePhase[] = [
  'dealing',
  'playerTurn',
  'opponentTurn',
  'dealerTurn',
  'settle',
  'roundEnd',
  'completed',
];

/**
 * Tela de jogo: renderiza o conteúdo correspondente à fase atual da
 * máquina de estados. Não há navegação "voltar" — cada fase tem a sua
 * saída própria (cancelar a busca, recusar o duelo, desistir da mesa).
 */
export function GameScreen() {
  const phase = useGameStore((state) => state.phase);
  const balance = useGameStore((state) => state.balance);
  const match = useGameStore((state) => state.match);
  const round = useGameStore((state) => state.round);
  const actionPending = useGameStore((state) => state.actionPending);
  const result = useGameStore((state) => state.result);
  const series = useGameStore((state) => state.series);
  const cardColors = useGameStore((state) => state.cardColors);
  const coinFlip = useGameStore((state) => state.coinFlip);
  const chooseCardColor = useGameStore((state) => state.chooseCardColor);
  const hit = useGameStore((state) => state.hit);
  const stand = useGameStore((state) => state.stand);
  const countdown = useGameStore((state) => state.countdown);
  const error = useGameStore((state) => state.error);
  const dismissError = useGameStore((state) => state.dismissError);
  const dealerReaction = useDealerReaction();

  // Saldo segurado: enquanto a SÉRIE corre (stake já debitado no início
  // do duelo), a pílula continua exibindo o saldo PRÉ-duelo — o débito
  // fica invisível e só aparece na animação do resultado. No completed a
  // pílula recebe o saldo final + o netChange para animar a variação.
  const roundActive =
    phase === 'coinflip' ||
    phase === 'countdown' ||
    phase === 'dealing' ||
    phase === 'playerTurn' ||
    phase === 'opponentTurn' ||
    phase === 'dealerTurn' ||
    phase === 'settle' ||
    phase === 'roundEnd';
  const displayBalance = roundActive && match ? balance + match.stake : balance;
  const balanceDelta = phase === 'completed' && result ? result.netChange : null;

  return (
    // min-h-0: o viewport é fixo (#root overflow hidden) — a fase de
    // negociação rola DENTRO do chat, nunca estica a página.
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira
          (o recorte da cena sobe além do header) — o HUD flutua acima.
          No centro, os três círculos do melhor de 3 acompanham o duelo
          inteiro, do cara-ou-coroa ao veredito. */}
      <header className="relative z-20 mb-4 flex items-center justify-between">
        <span className="h-11 w-11" aria-hidden="true" />
        {/* Ancorados no meio REAL da tela: os flancos do header são
            desiguais (espaçador de 44px × pílula de ~110px), então em
            fluxo os círculos escorregariam do centro — e dançariam a
            cada dígito que o saldo ganha ou perde. O wrapper é FLEX de
            propósito: como bloco, o strut da linha de texto deixaria o
            wrapper mais alto que a pílula e ela penderia para cima.
            O placar só entra com as CARTAS em jogo — do countdown em
            diante; o cara-ou-coroa ainda é pré-jogo. */}
        {series && phase !== 'coinflip' ? (
          <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2">
            <SeriesDots series={series} cardColors={cardColors} />
          </span>
        ) : null}
        <BalancePill balance={displayBalance} delta={balanceDelta} />
      </header>

      {/* A TableScene fica FORA do AnimatePresence: o dealer e a mesa
          persistem entre as fases (só a reação muda, com blend). */}
      <TableScene reaction={dealerReaction} camera={cameraFor(phase)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={phaseGroup(phase)}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {phase === 'search' && <MatchmakingOverlay />}
            {phase === 'found' && match && <FoundSplash match={match} />}
            {phase === 'confirm' && match && <ConfirmPanel match={match} />}
            {phase === 'negotiate' && match && <NegotiationPanel match={match} />}
            {phase === 'coinflip' && coinFlip && match && (
              <CoinFlipOverlay
                coinFlip={coinFlip}
                opponentName={match.opponent.name}
                playerColor={cardColors.player}
                onChoose={chooseCardColor}
              />
            )}
            {phase === 'countdown' && <CountdownOverlay value={countdown} />}
            {ARENA_PHASES.includes(phase) && match && (
              // relative: os banners de rodada/resultado se sobrepõem à
              // mesa em vez de disputar o flex com as mãos — as cartas
              // não pulam de lugar quando o veredito entra.
              <div className="relative flex flex-1 flex-col">
                <HandsArena
                  phase={phase}
                  match={match}
                  round={round}
                  result={result}
                  onHit={hit}
                  onStand={stand}
                  actionPending={actionPending}
                />
                {phase === 'roundEnd' && result && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
                    <RoundEndBanner result={result} />
                  </div>
                )}
                {phase === 'completed' && result && <ResultBanner result={result} />}
              </div>
            )}
            {phase === 'error' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                {/* Tinta de vinho gravada, como o texto de erro abaixo. */}
                <Icon name="warning" size={52} className="text-[#7a1f28]" />
                <p
                  className="text-engraved text-lg font-extrabold text-[#123324]"
                  role="alert"
                  data-testid="error-message"
                >
                  {error ?? 'Algo deu errado.'}
                </p>
                <Button onClick={dismissError} data-testid="dismiss-error">
                  Tentar novamente
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </TableScene>
    </main>
  );
}

/**
 * Agrupa fases que compartilham o mesmo layout para a transição de tela
 * não desmontar as cartas entre dealing → playerTurn → … → completed.
 */
function phaseGroup(phase: GamePhase): string {
  return ARENA_PHASES.includes(phase) ? 'arena' : phase;
}

/**
 * Enquadramento por fase: câmera vertical sobre o feltro enquanto as
 * cartas são distribuídas, decididas e reveladas — inclusive no
 * veredito parcial da rodada; frontal em todo o resto, e em `completed`
 * a dealer volta ao quadro reagindo ao resultado.
 */
function cameraFor(phase: GamePhase): SceneCamera {
  return phase !== 'completed' && ARENA_PHASES.includes(phase) ? 'overhead' : 'front';
}
