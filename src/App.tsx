import { useState } from 'react';

import { DevToolsPanel } from '@/features/bac-bo/components/DevToolsPanel';
import { GameScreen } from '@/features/bac-bo/components/GameScreen';
import { HistorySheet } from '@/features/bac-bo/components/HistorySheet';
import { HomeScreen } from '@/features/bac-bo/components/HomeScreen';
import { SettingsSheet } from '@/features/bac-bo/components/SettingsSheet';
import { TutorialSheet } from '@/features/bac-bo/components/TutorialSheet';
import { AmbientLayer } from '@/features/bac-bo/scene/ambient/AmbientLayer';
import { useGameStore } from '@/features/bac-bo/store/gameStore';
import { appEnv } from '@/shared/config/env';
import { formatDelta } from '@/shared/lib/format';

type OpenSheet = 'none' | 'tutorial' | 'history' | 'settings';

/** Raiz da aplicação: alterna Home/Jogo pela fase e hospeda os sheets. */
export default function App() {
  const phase = useGameStore((state) => state.phase);
  const result = useGameStore((state) => state.result);
  const [openSheet, setOpenSheet] = useState<OpenSheet>('none');
  // O tutorial aberto pelo botão JOGAR continua para a mesa ao terminar.
  const [tutorialContinues, setTutorialContinues] = useState(false);

  const closeSheet = () => setOpenSheet('none');

  return (
    <>
      <AmbientLayer />
      <div className="app-shell">
        {phase === 'idle' ? (
          <HomeScreen
            onOpenTutorial={() => {
              setTutorialContinues(!useGameStore.getState().settings.tutorialSeen);
              setOpenSheet('tutorial');
            }}
            onOpenHistory={() => setOpenSheet('history')}
            onOpenSettings={() => setOpenSheet('settings')}
          />
        ) : (
          <GameScreen />
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
