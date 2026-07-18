import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { GameEngineError } from '../engine/GameEngine';
import { LocalBacBoGameEngine } from '../engine/LocalBacBoGameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import { netChangeFor, payoutFor } from '../engine/rules';

/** Engine instantânea e determinística para os testes. */
function createTestEngine(seed = 1, allowForcedOutcomes = false) {
  return new LocalBacBoGameEngine({
    rng: new SeededRng(seed),
    matchmakingDelayMs: [0, 0],
    rollDelayMs: 0,
    allowForcedOutcomes,
  });
}

describe('LocalBacBoGameEngine.findMatch', () => {
  it('retorna uma partida com oponente e stake', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 50 });
    expect(match.stake).toBe(50);
    expect(match.id).toBeTruthy();
    expect(match.opponent.name).toBeTruthy();
    expect(match.opponent.rating).toBeGreaterThan(0);
  });

  it('rejeita stakes inválidos com código tipado', async () => {
    const engine = createTestEngine();
    await expect(engine.findMatch({ stake: -5 })).rejects.toMatchObject({
      name: 'GameEngineError',
      code: 'invalid-stake',
    });
  });

  it('pode ser cancelada via AbortSignal', async () => {
    const engine = new LocalBacBoGameEngine({
      rng: new SeededRng(1),
      matchmakingDelayMs: [50, 50],
    });
    const controller = new AbortController();
    const promise = engine.findMatch({ stake: 50, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('LocalBacBoGameEngine.playRound', () => {
  it('rejeita partidas inexistentes', async () => {
    const engine = createTestEngine();
    await expect(engine.playRound({ matchId: 'nao-existe' })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });

  it('resolve a rodada com totais, resultado e payout consistentes', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 100 });
    const result = await engine.playRound({ matchId: match.id });

    expect(result.playerTotal).toBe(result.playerDice[0] + result.playerDice[1]);
    expect(result.opponentTotal).toBe(result.opponentDice[0] + result.opponentDice[1]);

    if (result.playerTotal > result.opponentTotal) expect(result.outcome).toBe('win');
    else if (result.playerTotal < result.opponentTotal) expect(result.outcome).toBe('lose');
    else expect(result.outcome).toBe('tie');

    expect(result.stake).toBe(100);
    expect(result.payout).toBe(payoutFor(result.outcome, 100));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 100));
  });

  it('a mesma partida não pode ser jogada duas vezes', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 25 });
    await engine.playRound({ matchId: match.id });
    await expect(engine.playRound({ matchId: match.id })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });

  it('respeita o resultado forçado quando habilitado (DevTools)', async () => {
    for (const outcome of ['win', 'lose', 'tie'] as const) {
      const engine = createTestEngine(7, true);
      const match = await engine.findMatch({ stake: 50 });
      const result = await engine.playRound({ matchId: match.id, forcedOutcome: outcome });
      expect(result.outcome).toBe(outcome);
    }
  });

  it('ignora o resultado forçado quando desabilitado (produção)', async () => {
    // Mesma seed com e sem forcedOutcome: os dados devem ser idênticos,
    // provando que o pedido de forçar foi ignorado.
    const engineForced = createTestEngine(42, false);
    const engineNatural = createTestEngine(42, false);

    const matchA = await engineForced.findMatch({ stake: 50 });
    const matchB = await engineNatural.findMatch({ stake: 50 });

    const resultA = await engineForced.playRound({ matchId: matchA.id, forcedOutcome: 'tie' });
    const resultB = await engineNatural.playRound({ matchId: matchB.id });

    expect(resultA.playerDice).toEqual(resultB.playerDice);
    expect(resultA.opponentDice).toEqual(resultB.opponentDice);
  });
});

describe('createGameEngine', () => {
  it('cria engine local por padrão', () => {
    expect(createGameEngine()).toBeInstanceOf(LocalBacBoGameEngine);
  });

  it('modo api ainda não está disponível', () => {
    expect(() => createGameEngine({ mode: 'api' })).toThrow(/ApiBacBoGameEngine/);
  });
});

describe('GameEngineError', () => {
  it('carrega código estável', () => {
    const error = new GameEngineError('internal', 'boom');
    expect(error.code).toBe('internal');
    expect(error).toBeInstanceOf(Error);
  });
});
