import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';

import { useGameStore } from '../store/gameStore';
import { BalancePill } from './BalancePill';

export interface HomeScreenProps {
  onOpenTutorial: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

/** Tela inicial: logotipo, saldo e a chamada principal para jogar. */
export function HomeScreen({ onOpenTutorial, onOpenHistory, onOpenSettings }: HomeScreenProps) {
  const balance = useGameStore((state) => state.balance);
  const tutorialSeen = useGameStore((state) => state.settings.tutorialSeen);
  const goToStake = useGameStore((state) => state.goToStake);

  const handlePlay = () => {
    // Fluxo da especificação: Home → Tutorial → Stake (tutorial só na primeira vez).
    if (!tutorialSeen) {
      onOpenTutorial();
      return;
    }
    goToStake();
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-between px-6 py-8">
      <header className="flex w-full items-center justify-between">
        <BalancePill balance={balance} />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="grid h-11 w-11 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg active:brightness-125"
        >
          ⚙️
        </button>
      </header>

      <motion.div
        className="flex flex-col items-center gap-3 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.span
          className="text-6xl"
          aria-hidden="true"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.8 }}
        >
          🎲
        </motion.span>
        <h1 className="text-4xl font-black tracking-tight">
          BAC BO <span className="text-gold">ARENA</span>
        </h1>
        <p className="max-w-60 text-sm text-slate-400">
          Duelo de dados. Maior soma vence. Empate devolve seus créditos.
        </p>
      </motion.div>

      <div className="flex w-full flex-col gap-3">
        <Button onClick={handlePlay} fullWidth data-testid="play-button">
          JOGAR
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onOpenHistory}
            data-testid="history-button"
          >
            📜 Histórico
          </Button>
          <Button variant="secondary" size="md" onClick={onOpenTutorial}>
            ❓ Como jogar
          </Button>
        </div>
      </div>
    </main>
  );
}
