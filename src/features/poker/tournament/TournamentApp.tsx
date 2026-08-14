import { AnimatePresence, motion } from 'framer-motion';

import { CashOutScreen } from './screens/CashOutScreen';
import { CashTableScreen } from './screens/CashTableScreen';
import { LobbyBrowseScreen } from './screens/LobbyBrowseScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { SeatingScreen } from './screens/SeatingScreen';
import { useTournamentStore } from './tournamentStore';

export interface TournamentAppProps {
  /** Fecha o torneio e volta à Home. */
  onExit: () => void;
}

/**
 * Raiz do modo Torneio: alterna as telas pela fase do fluxo. Quando o
 * fluxo fecha (`stage === 'closed'`), devolve o controle à Home.
 */
export function TournamentApp({ onExit }: TournamentAppProps) {
  const stage = useTournamentStore((s) => s.stage);

  // Quando o fluxo fecha, o App deixa de montar esta árvore (mostra a Home);
  // aqui só evitamos renderizar conteúdo órfão.
  if (stage === 'closed') return null;

  return (
    <AnimatePresence mode="wait">
      {/* min-h-0: o viewport é fixo (#root overflow hidden) — sem quebrar
          o mínimo automático aqui, telas cheias (o lobby de 16, as
          oitavas) EMPURRAM o conteúdo para fora da tela em vez de
          engatar as rolagens internas de assentos/chat/chaveamento. */}
      <motion.div
        key={stage}
        className="flex min-h-0 flex-1 flex-col"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.22 }}
      >
        {stage === 'browse' && <LobbyBrowseScreen onBack={onExit} />}
        {stage === 'lobby' && <LobbyScreen />}
        {/* Poker cash: as seis cadeiras vazias, antes da primeira mão. */}
        {stage === 'seating' && <SeatingScreen />}
        {/* Poker cash: a mesa de 6 montada. */}
        {stage === 'cash' && <CashTableScreen />}
        {/* Poker cash: o CAIXA — a MESMA tela de fecho do duelo, com a
            mesma comissão da casa (ver `CashOutScreen`). */}
        {stage === 'cashout' && <CashOutScreen />}
      </motion.div>
    </AnimatePresence>
  );
}
