import type { RoundOutcome } from '../../engine/types';
import type { GamePhase } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import type { DealerReaction } from './DealerController';

/**
 * Mapa fase → reação da crupiê (docs/scenario.md §9.1).
 *
 * A crupiê não joga: ela conduz a mesa. Distribui as cartas, acompanha
 * as vezes dos dois duelistas e reage ao showdown — no veredito
 * (settle/completed) o resultado da rodada sobrepõe a fase.
 */
const PHASE_TO_REACTION: Record<GamePhase, DealerReaction> = {
  idle: 'idle',
  search: 'idle',
  found: 'greet',
  confirm: 'present',
  // A crupiê "apresenta a mesa" enquanto os jogadores negociam o valor.
  negotiate: 'present',
  countdown: 'anticipate',
  // Distribuindo as cartas: as mãos dela trabalham.
  dealing: 'shake',
  // A vez dos duelistas: ela apresenta a mesa e aguarda os dois.
  turn: 'present',
  // Showdown: é ela quem vira as cartas ocultas.
  settle: 'reveal',
  completed: 'idle',
  error: 'apologize',
};

const OUTCOME_TO_REACTION: Record<RoundOutcome, DealerReaction> = {
  win: 'celebrate',
  lose: 'console',
  tie: 'shrug',
};

/** Resolve a reação da crupiê para a fase/resultado atuais (função pura). */
export function resolveDealerReaction(
  phase: GamePhase,
  outcome: RoundOutcome | null,
): DealerReaction {
  if ((phase === 'completed' || phase === 'settle') && outcome) {
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
