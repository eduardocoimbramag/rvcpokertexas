import { useState } from 'react';

import { DevToolsPanel } from '@/features/bac-bo/components/DevToolsPanel';
import { GameScreen } from '@/features/bac-bo/components/GameScreen';
import { HistorySheet } from '@/features/bac-bo/components/HistorySheet';
import { HomeScreen } from '@/features/bac-bo/components/HomeScreen';
import { SettingsSheet } from '@/features/bac-bo/components/SettingsSheet';
import { TutorialSheet } from '@/features/bac-bo/components/TutorialSheet';
import { TournamentApp } from '@/features/bac-bo/tournament/TournamentApp';
import { useTournamentStore } from '@/features/bac-bo/tournament/tournamentStore';
import { AmbientLayer } from '@/features/bac-bo/scene/ambient/AmbientLayer';
import { useGameStore } from '@/features/bac-bo/store/gameStore';
import { appEnv } from '@/shared/config/env';
import { formatDelta } from '@/shared/lib/format';

type OpenSheet = 'none' | 'tutorial' | 'history' | 'settings';

/**
 * Raiz da aplicação: escolhe entre Home, o jogo 1v1 (dirigido pela fase do
 * gameStore) e o modo Torneio (fluxo próprio), e hospeda os sheets.
 */
export default function App() {
  const phase = useGameStore((state) => state.phase);
  const result = useGameStore((state) => state.result);
  const series = useGameStore((state) => state.series);
  const tournamentStage = useTournamentStore((state) => state.stage);
  const openBrowse = useTournamentStore((state) => state.openBrowse);
  const leaveTournament = useTournamentStore((state) => state.leaveTournament);
  const [openSheet, setOpenSheet] = useState<OpenSheet>('none');
  // O tutorial aberto pelo botão 1v1 continua para a mesa ao terminar.
  const [tutorialContinues, setTutorialContinues] = useState(false);

  const closeSheet = () => setOpenSheet('none');
  // O 1v1 tem prioridade: se uma rodada casual está em andamento, ela manda.
  const inTournament = phase === 'idle' && tournamentStage !== 'closed';

  return (
    <>
      <AmbientLayer />
      <div className="app-shell">
        {phase !== 'idle' ? (
          <GameScreen />
        ) : inTournament ? (
          <TournamentApp onExit={leaveTournament} />
        ) : (
          <HomeScreen
            onOpenTutorial={() => {
              setTutorialContinues(!useGameStore.getState().settings.tutorialSeen);
              setOpenSheet('tutorial');
            }}
            onOpenHistory={() => setOpenSheet('history')}
            onOpenSettings={() => setOpenSheet('settings')}
            onOpenTournament={openBrowse}
          />
        )}

        <TutorialSheet
          open={openSheet === 'tutorial'}
          onClose={closeSheet}
          continueToGame={tutorialContinues}
        />
        <HistorySheet open={openSheet === 'history'} onClose={closeSheet} />
        <SettingsSheet open={openSheet === 'settings'} onClose={closeSheet} />
        {appEnv.devToolsEnabled && <DevToolsPanel />}

        {/* Anúncio de status para leitores de tela. */}
        <div aria-live="polite" className="sr-only">
          {phase === 'search' && 'Procurando oponente.'}
          {phase === 'found' && 'Oponente encontrado.'}
          {phase === 'negotiate' && 'Mesa de negociação aberta. Proponham o valor da aposta.'}
          {phase === 'dealing' && 'Distribuindo as cartas.'}
          {phase === 'playerTurn' && 'Sua vez: peça carta ou pare.'}
          {phase === 'opponentTurn' && 'Vez do oponente.'}
          {phase === 'dealerTurn' && 'Vez do dealer.'}
          {phase === 'settle' && 'Veredito da rodada.'}
          {phase === 'roundEnd' &&
            result &&
            series &&
            (result.outcome === 'tie'
              ? 'Rodada empatada. Ela será jogada de novo.'
              : `Você ${result.outcome === 'win' ? 'levou' : 'perdeu'} a rodada. Série ${series.playerWins} a ${series.opponentWins}.`)}
          {phase === 'completed' &&
            result &&
            (result.outcome === 'win'
              ? `Você venceu. ${formatDelta(result.netChange)} créditos.`
              : result.outcome === 'lose'
                ? `Você perdeu. ${formatDelta(result.netChange)} créditos.`
                : 'Empate. Aposta devolvida.')}
        </div>
      </div>
    </>
  );
}
