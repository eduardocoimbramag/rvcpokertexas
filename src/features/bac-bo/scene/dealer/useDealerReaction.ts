import type { RoundOutcome } from '../../engine/types';
import type { GamePhase } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import type { DealerReaction } from './DealerController';

/**
 * Mapa fase → reação do dealer (docs/scenario.md §9.1).
 * No veredito (settle/roundEnd/completed), o resultado da rodada
 * sobrepõe a fase.
 */
const PHASE_TO_REACTION: Record<GamePhase, DealerReaction> = {
  idle: 'idle',
  search: 'idle',
  found: 'greet',
  confirm: 'present',
  // A dealer "apresenta a mesa" enquanto os jogadores negociam o valor.
  negotiate: 'present',
  coinflip: 'anticipate',
  countdown: 'anticipate',
  // Distribuindo as cartas: as mãos da dealer trabalham.
  dealing: 'shake',
  // As vezes dos jogadores: a dealer apresenta a mesa e aguarda.
  playerTurn: 'present',
  opponentTurn: 'present',
  // A virada da fechada e as compras até 17 são o show da própria dealer.
  dealerTurn: 'reveal',
  settle: 'reveal',
  roundEnd: 'reveal',
  completed: 'idle',
  error: 'apologize',
};

const OUTCOME_TO_REACTION: Record<RoundOutcome, DealerReaction> = {
  win: 'celebrate',
  lose: 'console',
  tie: 'shrug',
};

/** Resolve a reação do dealer para a fase/resultado atuais (função pura). */
export function resolveDealerReaction(
  phase: GamePhase,
  outcome: RoundOutcome | null,
): DealerReaction {
  // No melhor de 3 a dealer também reage ao veredito PARCIAL da rodada
  // (settle/roundEnd) — celebra, consola ou dá de ombros no empate
  // re-distribuído.
  if ((phase === 'completed' || phase === 'roundEnd' || phase === 'settle') && outcome) {
    return OUTCOME_TO_REACTION[outcome];
  }
  return PHASE_TO_REACTION[phase];
}

/** Versão hook: lê fase e resultado direto do store do jogo. */
export function useDealerReaction(): DealerReaction {
  const phase = useGameStore((state) => state.phase);
  const outcome = useGameStore((state) => state.result?.outcome ?? null);
  return resolveDealerReaction(phase, outcome);
}
