import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import type { SceneCamera } from '../scene/TableScene';
import { TableScene } from '../scene/TableScene';
import { useDealerReaction } from '../scene/dealer/useDealerReaction';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { BalancePill } from './BalancePill';
import { ConfirmPanel } from './ConfirmPanel';
import { CountdownOverlay } from './CountdownOverlay';
import { FoundSplash } from './FoundSplash';
import { GoldAnnounce } from './GoldAnnounce';
import { HandsArena } from './HandsArena';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { NegotiationHud, NegotiationPanel } from './NegotiationPanel';
import { ResultBanner } from './ResultBanner';

/** Fases em que a rodada está sobre a mesa (grupo arena). */
const ARENA_PHASES: readonly GamePhase[] = ['dealing', 'turn', 'settle', 'completed'];

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
  const hit = useGameStore((state) => state.hit);
  const stand = useGameStore((state) => state.stand);
  const doubleBet = useGameStore((state) => state.doubleBet);
  const requestDouble = useGameStore((state) => state.requestDouble);
  const reveal = useGameStore((state) => state.reveal);
  const turn = useGameStore((state) => state.turn);
  const countdown = useGameStore((state) => state.countdown);
  const duelAnnounce = useGameStore((state) => state.duelAnnounce);
  const error = useGameStore((state) => state.error);
  const dismissError = useGameStore((state) => state.dismissError);
  const dealerReaction = useDealerReaction();

  // Saldo segurado: enquanto a rodada corre (stake já debitado no início
  // do duelo), a pílula continua exibindo o saldo PRÉ-duelo — o débito
  // fica invisível e só aparece na animação do resultado. No completed a
  // pílula recebe o saldo final + o netChange para animar a variação.
  const roundActive =
    phase === 'countdown' || phase === 'dealing' || phase === 'turn' || phase === 'settle';
  const displayBalance = roundActive && match ? balance + match.stake : balance;
  const balanceDelta = phase === 'completed' && result ? result.netChange : null;

  // Dobrar custa outro tanto do que já está na mesa, e vale uma vez por
  // mão: sem saldo para cobrir a diferença — ou com o pedido já feito —
  // o botão fica em cena, apagado, em vez de sumir do nada.
  const canRequestDouble = doubleBet.status === 'idle' && match !== null && balance >= match.stake;

  return (
    // min-h-0: o viewport é fixo (#root overflow hidden) — a fase de
    // negociação rola DENTRO do chat, nunca estica a página.
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira
          (o recorte da cena sobe além do header) — o HUD flutua acima. */}
      {/* HUD: à esquerda quem está do outro lado da mesa (só enquanto a
          aposta se negocia), à direita o seu saldo. A faixa fica ACIMA
          da dealer — nada da negociação cobre a cena. */}
      <header className="relative z-20 mb-4 flex items-center justify-between gap-3">
        {phase === 'negotiate' && match ? (
          <NegotiationHud />
        ) : (
          <span className="h-11 w-11" aria-hidden="true" />
        )}
        <BalancePill balance={displayBalance} delta={balanceDelta} />
      </header>

      {/* A TableScene fica FORA do AnimatePresence: a crupiê e a mesa
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
            {phase === 'confirm' && match && <ConfirmPanel />}
            {phase === 'negotiate' && match && <NegotiationPanel />}
            {/* A fase da APRESENTAÇÃO tem duas cenas, e o store diz qual
                está no ar: a placa do rival — que aqui, com a aposta já
                fechada, enfim traz o nome dele (ver opponentIdentity.ts)
                — e, na sequência, o carimbo que abre o duelo. */}
            {phase === 'found' && match && (
              <div className="relative flex min-h-0 flex-1 flex-col">
                {duelAnnounce ? (
                  <GoldAnnounce text="Hora do duelo" data-testid="duel-announce" />
                ) : (
                  <FoundSplash match={match} />
                )}
              </div>
            )}
            {phase === 'countdown' && <CountdownOverlay value={countdown} />}
            {ARENA_PHASES.includes(phase) && match && (
              // relative: o banner de resultado se sobrepõe à mesa em vez
              // de disputar o flex com as mãos — as cartas não pulam de
              // lugar quando o veredito entra.
              <div className="relative flex flex-1 flex-col">
                <HandsArena
                  phase={phase}
                  match={match}
                  round={round}
                  result={result}
                  onHit={hit}
                  onStand={stand}
                  actionPending={actionPending}
                  onRequestDouble={requestDouble}
                  doubleBet={doubleBet}
                  canRequestDouble={canRequestDouble}
                  reveal={reveal}
                  turn={turn}
                />
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
 * cartas são distribuídas, decididas e reveladas; frontal em todo o
 * resto, e em `completed` a crupiê volta ao quadro reagindo ao
 * resultado.
 */
function cameraFor(phase: GamePhase): SceneCamera {
  return phase !== 'completed' && ARENA_PHASES.includes(phase) ? 'overhead' : 'front';
}
