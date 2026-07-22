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
import { DiceArena } from './DiceArena';
import { FoundSplash } from './FoundSplash';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { ResultBanner } from './ResultBanner';
import { StakeSelector } from './StakeSelector';

/**
 * Tela de jogo: renderiza o conteúdo correspondente à fase atual da
 * máquina de estados. A navegação "voltar" só existe em fases seguras
 * (não é possível abandonar uma rodada em andamento).
 */
export function GameScreen() {
  const phase = useGameStore((state) => state.phase);
  const balance = useGameStore((state) => state.balance);
  const match = useGameStore((state) => state.match);
  const result = useGameStore((state) => state.result);
  const countdown = useGameStore((state) => state.countdown);
  const error = useGameStore((state) => state.error);
  const goHome = useGameStore((state) => state.goHome);
  const dismissError = useGameStore((state) => state.dismissError);
  const dealerReaction = useDealerReaction();

  const canGoBack = phase === 'stake';

  // Saldo segurado: enquanto a rodada corre (stake já debitado no
  // lock-in), a pílula continua exibindo o saldo PRÉ-rodada — o débito
  // fica invisível e só aparece na animação do resultado. No completed
  // a pílula recebe o saldo final + o netChange para animar a variação.
  const roundActive =
    phase === 'coinflip' || phase === 'countdown' || phase === 'rolling' || phase === 'reveal';
  const displayBalance = roundActive && match ? balance + match.stake : balance;
  const balanceDelta = phase === 'completed' && result ? result.netChange : null;

  return (
    <main className="flex flex-1 flex-col px-6 py-4">
      {/* relative z-20: na câmera vertical a mesa toma a tela inteira
          (o recorte da cena sobe além do header) — o HUD flutua acima. */}
      <header className="relative z-20 mb-4 flex items-center justify-between">
        {canGoBack ? (
          <button
            type="button"
            onClick={goHome}
            aria-label="Voltar para o início"
            data-testid="back-button"
            className="grid h-11 w-11 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
          >
            <Icon name="chevron-left" />
          </button>
        ) : (
          <span className="h-11 w-11" aria-hidden="true" />
        )}
        <BalancePill balance={displayBalance} delta={balanceDelta} />
      </header>

      {/* A TableScene fica FORA do AnimatePresence: o dealer e a mesa
          persistem entre as fases (só a reação muda, com blend). */}
      <TableScene reaction={dealerReaction} camera={cameraFor(phase)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={phaseGroup(phase)}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {phase === 'stake' && <StakeSelector />}
            {phase === 'search' && <MatchmakingOverlay />}
            {phase === 'found' && match && <FoundSplash match={match} />}
            {phase === 'confirm' && match && <ConfirmPanel match={match} />}
            {phase === 'coinflip' && <CoinFlipOverlay />}
            {phase === 'countdown' && <CountdownOverlay value={countdown} />}
            {(phase === 'rolling' || phase === 'reveal' || phase === 'completed') && match && (
              // Sem justify-between/gap: em completed o ResultBanner é
              // flex-1 e divide sozinho a faixa livre (veredito centrado
              // + ações no rodapé). Em rolling/reveal só há o DiceArena.
              <div className="flex flex-1 flex-col">
                <DiceArena phase={phase} match={match} result={result} />
                {phase === 'completed' && result && <ResultBanner result={result} />}
              </div>
            )}
            {phase === 'error' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
                {/* Tinta de vinho gravada, como o texto de erro abaixo. */}
                <Icon name="warning" size={52} className="text-[#7a1f28]" />
                <p
                  className="text-engraved text-lg font-extrabold text-[#33261a]"
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
 * não desmontar os dados entre rolling → reveal → completed.
 */
function phaseGroup(phase: GamePhase): string {
  if (phase === 'rolling' || phase === 'reveal' || phase === 'completed') return 'arena';
  return phase;
}

/**
 * Enquadramento por fase: câmera vertical sobre a mesa enquanto os
 * dados chacoalham e param; frontal em todo o resto — inclusive em
 * `completed`, quando a dealer volta ao quadro reagindo ao resultado.
 */
function cameraFor(phase: GamePhase): SceneCamera {
  return phase === 'rolling' || phase === 'reveal' ? 'overhead' : 'front';
}
