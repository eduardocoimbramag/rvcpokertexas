import { createId } from '@/shared/lib/ids';
import type { Rng } from '@/shared/lib/random';
import { CryptoRng, pickRandom, randomInt } from '@/shared/lib/random';

import { validateStake } from './credits';
import type { FindMatchParams, GameEngine, PlayRoundParams } from './GameEngine';
import { GameEngineError } from './GameEngine';
import {
  netChangeFor,
  payoutFor,
  resolveOutcome,
  rollRound,
  rollRoundForOutcome,
  sumDicePair,
} from './rules';
import type { Match, Opponent, RoundResult } from './types';
import { matchSchema, roundResultSchema } from './types';

/** Perfis de oponentes simulados pelo matchmaking local. */
const OPPONENT_PROFILES: readonly Omit<Opponent, 'id'>[] = [
  { name: 'Luna', avatar: '🦊', rating: 1420 },
  { name: 'Rex', avatar: '🐺', rating: 1180 },
  { name: 'Maya', avatar: '🐯', rating: 1650 },
  { name: 'Dante', avatar: '🦁', rating: 1330 },
  { name: 'Iris', avatar: '🦉', rating: 1510 },
  { name: 'Bruno', avatar: '🐻', rating: 1240 },
  { name: 'Kira', avatar: '🐉', rating: 1770 },
  { name: 'Otto', avatar: '🐙', rating: 1090 },
];

export interface LocalEngineOptions {
  /** Fonte de aleatoriedade. Default: CryptoRng. */
  rng?: Rng;
  /** Janela [min, max] em ms para o delay simulado de matchmaking. */
  matchmakingDelayMs?: readonly [number, number];
  /** Delay simulado em ms para a resolução da rodada. */
  rollDelayMs?: number;
  /** Habilita `forcedOutcome` em playRound (DevTools/testes). */
  allowForcedOutcomes?: boolean;
}

/**
 * Engine local do Bac Bo: simula matchmaking com delay artificial e resolve
 * rodadas com dados honestos. Toda a lógica do jogo vive aqui — a UI apenas
 * apresenta os resultados retornados.
 */
export class LocalBacBoGameEngine implements GameEngine {
  private readonly rng: Rng;
  private readonly matchmakingDelayMs: readonly [number, number];
  private readonly rollDelayMs: number;
  private readonly allowForcedOutcomes: boolean;
  private readonly activeMatches = new Map<string, Match>();

  constructor(options: LocalEngineOptions = {}) {
    this.rng = options.rng ?? new CryptoRng();
    this.matchmakingDelayMs = options.matchmakingDelayMs ?? [1200, 2600];
    this.rollDelayMs = options.rollDelayMs ?? 350;
    this.allowForcedOutcomes = options.allowForcedOutcomes ?? false;
  }

  async findMatch(params: FindMatchParams): Promise<Match> {
    // O saldo é responsabilidade da camada de créditos; aqui validamos apenas a forma.
    const stakeCheck = validateStake(Number.MAX_SAFE_INTEGER, params.stake);
    if (!stakeCheck.ok) {
      throw new GameEngineError('invalid-stake', `Stake inválido: ${params.stake}`);
    }

    const [minDelay, maxDelay] = this.matchmakingDelayMs;
    await delay(randomInt(this.rng, minDelay, maxDelay), params.signal);

    const profile = pickRandom(this.rng, OPPONENT_PROFILES);
    const match = matchSchema.parse({
      id: createId(),
      opponent: { ...profile, id: createId() },
      stake: params.stake,
      createdAt: Date.now(),
    });

    this.activeMatches.set(match.id, match);
    return match;
  }

  async playRound(params: PlayRoundParams): Promise<RoundResult> {
    const match = this.activeMatches.get(params.matchId);
    if (!match) {
      throw new GameEngineError('match-not-found', `Partida não encontrada: ${params.matchId}`);
    }

    await delay(this.rollDelayMs);

    const forced = this.allowForcedOutcomes ? params.forcedOutcome : undefined;
    const { playerDice, opponentDice } = forced
      ? rollRoundForOutcome(this.rng, forced)
      : rollRound(this.rng);

    const playerTotal = sumDicePair(playerDice);
    const opponentTotal = sumDicePair(opponentDice);
    const outcome = resolveOutcome(playerTotal, opponentTotal);

    const result = roundResultSchema.parse({
      id: createId(),
      matchId: match.id,
      playerDice,
      opponentDice,
      playerTotal,
      opponentTotal,
      outcome,
      stake: match.stake,
      payout: payoutFor(outcome, match.stake),
      netChange: netChangeFor(outcome, match.stake),
      completedAt: Date.now(),
    });

    this.activeMatches.delete(match.id);
    return result;
  }
}

/** Espera `ms` milissegundos, rejeitando com `aborted` se o sinal disparar. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GameEngineError('aborted', 'Busca cancelada.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GameEngineError('aborted', 'Busca cancelada.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
