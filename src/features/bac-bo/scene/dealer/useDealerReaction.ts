import type { PokerOutcome } from '../../engine/poker/types';
import type { GamePhase } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import type { DealerReaction } from './DealerController';

/**
 * Mapa fase → reação da crupiê (docs/scenario.md §9.1).
 *
 * A crupiê não joga: ela conduz a mesa. Distribui as cartas, acompanha
 * as apostas dos dois duelistas e reage ao showdown — no veredito
 * (settle/completed) o resultado sobrepõe a fase.
 */
const PHASE_TO_REACTION: Record<GamePhase, DealerReaction> = {
  idle: 'idle',
  search: 'idle',
  found: 'greet',
  confirm: 'present',
  countdown: 'anticipate',
  // Distribuindo as fechadas: as mãos dela trabalham.
  dealing: 'shake',
  // As apostas correndo: ela apresenta a mesa e aguarda os dois.
  betting: 'present',
  // Showdown: é ela quem vira as cartas fechadas.
  settle: 'reveal',
  // Entre as mãos ela recolhe o pote e prepara o baralho seguinte — o
  // desfecho da MÃO sobrepõe esta fase (ver OUTCOME_TO_REACTION).
  handover: 'shake',
  completed: 'idle',
  error: 'apologize',
};

const OUTCOME_TO_REACTION: Record<PokerOutcome, DealerReaction> = {
  win: 'celebrate',
  lose: 'console',
  tie: 'shrug',
};

/** Resolve a reação da crupiê para a fase/resultado atuais (função pura). */
export function resolveDealerReaction(
  phase: GamePhase,
  outcome: PokerOutcome | null,
): DealerReaction {
  if ((phase === 'completed' || phase === 'settle') && outcome) {
    return OUTCOME_TO_REACTION[outcome];
  }
  return PHASE_TO_REACTION[phase];
}

/**
 * Versão hook: lê fase e resultado direto do store do jogo.
 *
 * QUAL resultado depende da fase — e confundir os dois já pôs a crupiê
 * chorando ao lado de um "VOCÊ TERMINOU NO POSITIVO":
 *
 * - no `settle` (showdown), vale o desfecho da MÃO: é a ela que a mesa
 *   está reagindo;
 * - no `completed` (o caixa da sessão), vale o desfecho da SESSÃO —
 *   stack final contra o buy-in. A mesa é uma sessão: quem perdeu a
 *   última mão mas se levantou no lucro levou a noite, e é a NOITE que
 *   a crupiê comemora ou lamenta ali.
 */
export function useDealerReaction(): DealerReaction {
  const phase = useGameStore((state) => state.phase);
  const handOutcome = useGameStore((state) => state.result?.outcome ?? null);
  const sessionOutcome = useGameStore((state): PokerOutcome | null => {
    const session = state.session;
    if (!session) return null;
    if (session.stacks.player > session.buyIn) return 'win';
    if (session.stacks.player < session.buyIn) return 'lose';
    return 'tie';
  });
  const outcome = phase === 'completed' ? (sessionOutcome ?? handOutcome) : handOutcome;
  return resolveDealerReaction(phase, outcome);
}
