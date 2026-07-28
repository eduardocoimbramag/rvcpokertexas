import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import type { GameEngine } from '../engine/GameEngine';
import { GameEngineError } from '../engine/GameEngine';
import { LocalBlackjackGameEngine } from '../engine/LocalBlackjackGameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import { handValue, netChangeFor, payoutFor } from '../engine/rules';
import type { RoundResult } from '../engine/types';

/** Engine instantânea e determinística para os testes. */
function createTestEngine(seed = 1, allowForcedOutcomes = false) {
  return new LocalBlackjackGameEngine({
    rng: new SeededRng(seed),
    matchmakingDelayMs: [0, 0],
    dealDelayMs: 0,
    allowForcedOutcomes,
  });
}

/** Joga uma rodada inteira parando na primeira oportunidade. */
async function playRoundToEnd(engine: GameEngine, matchId: string): Promise<RoundResult> {
  let state = await engine.beginRound({ matchId });
  while (state.phase === 'playerTurn') {
    state = await engine.act({ matchId, action: 'stand' });
  }
  if (!state.result) throw new Error('rodada resolvida sem resultado — contrato violado');
  return state.result;
}

describe('LocalBlackjackGameEngine.findMatch', () => {
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
    const engine = new LocalBlackjackGameEngine({
      rng: new SeededRng(1),
      matchmakingDelayMs: [50, 50],
    });
    const controller = new AbortController();
    const promise = engine.findMatch({ stake: 50, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });

  it('sem stake (fluxo de negociação), abre a partida no stake mínimo', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({});
    expect(match.stake).toBe(10);
  });
});

describe('LocalBlackjackGameEngine.setStake', () => {
  it('grava o valor negociado e o payout da rodada deriva dele', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({});
    const updated = await engine.setStake({ matchId: match.id, stake: 130 });
    expect(updated.stake).toBe(130);

    const result = await playRoundToEnd(engine, match.id);
    expect(result.stake).toBe(130);
    expect(result.payout).toBe(payoutFor(result.outcome, 130, result.playerNatural));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 130, result.playerNatural));
  });

  it('rejeita partidas inexistentes e stakes inválidos', async () => {
    const engine = createTestEngine();
    await expect(engine.setStake({ matchId: 'nao-existe', stake: 50 })).rejects.toMatchObject({
      code: 'match-not-found',
    });

    const match = await engine.findMatch({});
    await expect(engine.setStake({ matchId: match.id, stake: 7 })).rejects.toMatchObject({
      code: 'invalid-stake',
    });
  });
});

describe('LocalBlackjackGameEngine.beginRound', () => {
  it('rejeita partidas inexistentes', async () => {
    const engine = createTestEngine();
    await expect(engine.beginRound({ matchId: 'nao-existe' })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });

  it('distribui duas cartas por duelista e expõe só a aberta do dealer', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 100 });
    const state = await engine.beginRound({ matchId: match.id });

    expect(state.matchId).toBe(match.id);
    expect(state.playerHand).toHaveLength(2);
    expect(state.opponentHand).toHaveLength(2);
    expect(state.dealerUpCard).toBeTruthy();

    if (state.phase === 'playerTurn') {
      expect(state.legalActions).toEqual(['hit', 'stand']);
      expect(state.result).toBeUndefined();
    } else {
      // Só um blackjack natural resolve a rodada na distribuição.
      expect(handValue(state.playerHand).total).toBe(21);
      expect(state.result).toBeTruthy();
    }
  });

  it('a mesma partida joga várias rodadas (série melhor de 3)', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 25 });
    const first = await playRoundToEnd(engine, match.id);
    const second = await playRoundToEnd(engine, match.id);
    expect(first.matchId).toBe(match.id);
    expect(second.matchId).toBe(match.id);
    // Cada rodada é um resultado próprio, sempre com o stake da partida.
    expect(first.id).not.toBe(second.id);
    expect(second.stake).toBe(25);
  });

  it('uma nova busca descarta a partida anterior', async () => {
    const engine = createTestEngine();
    const old = await engine.findMatch({ stake: 25 });
    await engine.findMatch({ stake: 25 });
    await expect(engine.beginRound({ matchId: old.id })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });
});

describe('LocalBlackjackGameEngine.act', () => {
  it('rejeita ação sem rodada em andamento', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 50 });
    await expect(engine.act({ matchId: match.id, action: 'hit' })).rejects.toMatchObject({
      code: 'illegal-action',
    });
  });

  it('rejeita ação depois da rodada resolvida', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 50 });
    await playRoundToEnd(engine, match.id);
    await expect(engine.act({ matchId: match.id, action: 'hit' })).rejects.toMatchObject({
      code: 'illegal-action',
    });
  });

  it('pedir carta acrescenta exatamente uma carta à mão', async () => {
    // Busca uma distribuição que deixe o jogador na vez com mão baixa —
    // pedir uma carta em total ≤ 11 nunca resolve a rodada.
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createTestEngine(seed);
      const match = await engine.findMatch({ stake: 50 });
      const state = await engine.beginRound({ matchId: match.id });
      if (state.phase !== 'playerTurn' || handValue(state.playerHand).total > 11) continue;

      const after = await engine.act({ matchId: match.id, action: 'hit' });
      expect(after.playerHand).toHaveLength(3);
      expect(after.playerHand.slice(0, 2)).toEqual(state.playerHand);
      expect(after.phase).toBe('playerTurn');
      return;
    }
    throw new Error('nenhuma seed produziu mão baixa — ajuste o teste');
  });

  it('pedir até 21 ou estourar resolve a rodada sozinho', async () => {
    const engine = createTestEngine(3);
    const match = await engine.findMatch({ stake: 50 });
    let state = await engine.beginRound({ matchId: match.id });
    while (state.phase === 'playerTurn') {
      state = await engine.act({ matchId: match.id, action: 'hit' });
    }
    expect(state.result).toBeTruthy();
    expect(handValue(state.playerHand).total).toBeGreaterThanOrEqual(21);
  });

  it('o resultado fecha com totais, categorias e payout consistentes', async () => {
    const engine = createTestEngine(11);
    const match = await engine.findMatch({ stake: 100 });
    const result = await playRoundToEnd(engine, match.id);

    expect(result.playerTotal).toBe(handValue(result.playerHand).total);
    expect(result.opponentTotal).toBe(handValue(result.opponentHand).total);
    expect(result.dealerTotal).toBe(handValue(result.dealerHand).total);
    // O dealer sempre joga até pelo menos 17.
    expect(result.dealerTotal).toBeGreaterThanOrEqual(17);
    expect(result.dealerHand.length).toBeGreaterThanOrEqual(2);

    expect(result.stake).toBe(100);
    expect(result.payout).toBe(payoutFor(result.outcome, 100, result.playerNatural));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 100, result.playerNatural));
  });
});

describe('resultados forçados (DevTools)', () => {
  it('respeita o resultado forçado quando habilitado', async () => {
    for (const outcome of ['win', 'lose', 'tie'] as const) {
      const engine = createTestEngine(7, true);
      const match = await engine.findMatch({ stake: 50 });
      let state = await engine.beginRound({ matchId: match.id, forcedOutcome: outcome });
      while (state.phase === 'playerTurn') {
        state = await engine.act({ matchId: match.id, action: 'stand' });
      }
      expect(state.result?.outcome).toBe(outcome);
    }
  });

  it('vitória forçada vem com blackjack natural (paga 3:2)', async () => {
    const engine = createTestEngine(7, true);
    const match = await engine.findMatch({ stake: 50 });
    const state = await engine.beginRound({ matchId: match.id, forcedOutcome: 'win' });
    // Natural resolve na distribuição, sem vez do jogador.
    expect(state.phase).toBe('settled');
    expect(state.result?.playerNatural).toBe(true);
    expect(state.result?.payout).toBe(payoutFor('win', 50, true));
  });

  it('ignora o resultado forçado quando desabilitado (produção)', async () => {
    // Mesma seed com e sem forcedOutcome: as cartas devem ser idênticas,
    // provando que o pedido de forçar foi ignorado.
    const engineForced = createTestEngine(42, false);
    const engineNatural = createTestEngine(42, false);

    const matchA = await engineForced.findMatch({ stake: 50 });
    const matchB = await engineNatural.findMatch({ stake: 50 });

    const stateA = await engineForced.beginRound({ matchId: matchA.id, forcedOutcome: 'tie' });
    const stateB = await engineNatural.beginRound({ matchId: matchB.id });

    expect(stateA.playerHand).toEqual(stateB.playerHand);
    expect(stateA.opponentHand).toEqual(stateB.opponentHand);
    expect(stateA.dealerUpCard).toEqual(stateB.dealerUpCard);
  });
});

describe('createGameEngine', () => {
  it('cria engine local por padrão', () => {
    expect(createGameEngine()).toBeInstanceOf(LocalBlackjackGameEngine);
  });

  it('modo api ainda não está disponível', () => {
    expect(() => createGameEngine({ mode: 'api' })).toThrow(/ApiBlackjackGameEngine/);
  });
});

describe('GameEngineError', () => {
  it('carrega código estável', () => {
    const error = new GameEngineError('internal', 'boom');
    expect(error.code).toBe('internal');
    expect(error).toBeInstanceOf(Error);
  });
});
