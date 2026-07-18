import type { RoundOutcome } from '../../engine/types';
import type { GamePhase } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import type { DealerReaction } from './DealerController';

/**
 * Mapa fase → reação do dealer (docs/scenario.md §9.1).
 * Em `completed`, o resultado da rodada sobrepõe a fase.
 */
const PHASE_TO_REACTION: Record<GamePhase, DealerReaction> = {
  idle: 'idle',
  stake: 'present',
  search: 'idle',
  found: 'greet',
  confirm: 'present',
  countdown: 'anticipate',
  rolling: 'shake',
  reveal: 'reveal',
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
  if (phase === 'completed' && outcome) return OUTCOME_TO_REACTION[outcome];
  return PHASE_TO_REACTION[phase];
}

/** Versão hook: lê fase e resultado direto do store do jogo. */
export function useDealerReaction(): DealerReaction {
  const phase = useGameStore((state) => state.phase);
  const outcome = useGameStore((state) => state.result?.outcome ?? null);
  return resolveDealerReaction(phase, outcome);
}
