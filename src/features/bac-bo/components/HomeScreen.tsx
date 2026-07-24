import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { isBroke } from '../engine/credits';
import { audioManager } from '../services/AudioManager';
import { useGameStore } from '../store/gameStore';
import { BalancePill } from './BalancePill';
import { BrandDie } from './BrandDie';

export interface HomeScreenProps {
  onOpenTutorial: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenTournament: () => void;
}

/** Tela inicial: logotipo, saldo e os dois modos de jogo. */
export function HomeScreen({
  onOpenTutorial,
  onOpenHistory,
  onOpenSettings,
  onOpenTournament,
}: HomeScreenProps) {
  const balance = useGameStore((state) => state.balance);
  const tutorialSeen = useGameStore((state) => state.settings.tutorialSeen);
  const startSearch = useGameStore((state) => state.startSearch);
  const refillCredits = useGameStore((state) => state.refillCredits);

  const broke = isBroke(balance);

  const handlePlay = () => {
    // Fluxo atualizado: Home → Tutorial → Busca direta (a aposta é
    // negociada com o oponente depois da confirmação do duelo).
    if (!tutorialSeen) {
      onOpenTutorial();
      return;
    }
    void startSearch();
  };

  const handleTournament = () => {
    // Único gesto garantido antes do torneio: o áudio nasce AQUI. O
    // fluxo de torneio não passa pela busca do 1v1 (startSearch), e o
    // WebKit só cria AudioContext dentro de um gesto do usuário — sem
    // isso a primeira partida seria muda no iOS/Safari.
    audioManager.playSfx('tap');
    onOpenTournament();
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-between px-6 py-8">
      <header className="flex w-full items-center justify-between">
        <BalancePill balance={balance} />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="grid h-11 w-11 place-items-center rounded-full border border-arena-line bg-arena-800 text-lg text-ivory active:brightness-125"
        >
          <Icon name="gear" />
        </button>
      </header>

      <motion.div
        className="flex flex-col items-center gap-4 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.8 }}
        >
          <BrandDie size={80} />
        </motion.span>
        <h1 className="flex flex-col items-center gap-1.5 text-6xl font-black leading-none tracking-tight">
          <span>BAC BO</span>
          {/* Letras distribuídas para que "ARENA" tenha a mesma largura de "BAC BO". */}
          <span className="flex w-full justify-between text-gold" aria-hidden="true">
            {['A', 'R', 'E', 'N', 'A'].map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </span>
          <span className="sr-only">ARENA</span>
        </h1>
      </motion.div>

      <div className="flex w-full flex-col gap-3">
        {broke ? (
          // Sem saldo para o menor lance da mesa: a recarga assume o
          // lugar do 1V1 (antes ela morava na tela de aposta, extinta).
          <Button onClick={refillCredits} fullWidth data-testid="refill-button">
            <Icon name="chip" /> RECARREGAR CRÉDITOS
          </Button>
        ) : (
          <Button onClick={handlePlay} fullWidth data-testid="play-button">
            <Icon name="dice" /> 1V1
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={handleTournament}
          fullWidth
          data-testid="tournament-button"
        >
          <Icon name="trophy" /> TORNEIO
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onOpenHistory}
            data-testid="history-button"
          >
            <Icon name="scroll" /> Histórico
          </Button>
          <Button variant="secondary" size="md" onClick={onOpenTutorial}>
            <Icon name="help" /> Como jogar
          </Button>
        </div>
      </div>
    </main>
  );
}
