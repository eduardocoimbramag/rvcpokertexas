import { useState } from 'react';

import { DevToolsPanel } from '@/features/poker/components/DevToolsPanel';
import { GameScreen } from '@/features/poker/components/GameScreen';
import { HistorySheet } from '@/features/poker/components/HistorySheet';
import { HomeScreen } from '@/features/poker/components/HomeScreen';
import { SettingsSheet } from '@/features/poker/components/SettingsSheet';
import { TutorialSheet } from '@/features/poker/components/TutorialSheet';
import { TournamentApp } from '@/features/poker/tournament/TournamentApp';
import { useTournamentStore } from '@/features/poker/tournament/tournamentStore';
import { AmbientLayer } from '@/features/poker/scene/ambient/AmbientLayer';
import { useGameStore } from '@/features/poker/store/gameStore';
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
  const tournamentStage = useTournamentStore((state) => state.stage);
  const openBrowse = useTournamentStore((state) => state.openBrowse);
  const leaveTournament = useTournamentStore((state) => state.leaveTournament);
  const [openSheet, setOpenSheet] = useState<OpenSheet>('none');

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
            onOpenTutorial={() => setOpenSheet('tutorial')}
            onOpenHistory={() => setOpenSheet('history')}
            onOpenSettings={() => setOpenSheet('settings')}
            onOpenTournament={openBrowse}
          />
        )}

        {/* O tutorial é uma FOLHA DE CONSULTA e nada mais: quem o abriu
            pediu por ele, e ao fechar volta para onde estava. Ele já
            oferecia "continuar para a mesa" porque era interceptado no
            caminho de quem só queria jogar — o desvio acabou, e a oferta
            de consertar o desvio acabou com ele. */}
        <TutorialSheet open={openSheet === 'tutorial'} onClose={closeSheet} />
        <HistorySheet open={openSheet === 'history'} onClose={closeSheet} />
        <SettingsSheet open={openSheet === 'settings'} onClose={closeSheet} />
        {appEnv.devToolsEnabled && <DevToolsPanel />}

        {/* Anúncio de status para leitores de tela. */}
        <div aria-live="polite" className="sr-only">
          {phase === 'search' && 'Procurando oponente.'}
          {phase === 'found' && 'Oponente encontrado.'}
          {phase === 'dealing' && 'Distribuindo as cartas fechadas.'}
          {phase === 'betting' && 'Rodada de apostas em andamento.'}
          {phase === 'settle' && 'Showdown: as cartas fechadas viram.'}
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
