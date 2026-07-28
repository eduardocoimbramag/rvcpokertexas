import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import type { GameEngine } from '../engine/GameEngine';
import { GameEngineError } from '../engine/GameEngine';
import { LocalBlackjackGameEngine } from '../engine/LocalBlackjackGameEngine';
import { createGameEngine } from '../engine/createGameEngine';
import { handValue, isNaturalBlackjack, netChangeFor, payoutFor } from '../engine/rules';
import type { BlackjackRoundState, RoundResult } from '../engine/types';

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
  const { result } = state;
  if (!result) throw new Error('rodada resolvida sem resultado — contrato violado');
  return result;
}

/** Uma partida já distribuída, achada por varredura de seeds. */
interface DealtRound {
  engine: GameEngine;
  matchId: string;
  state: BlackjackRoundState;
}

/**
 * Procura a primeira seed cuja distribuição satisfaz o predicado. O RNG é
 * determinístico, então a busca é estável entre execuções.
 */
async function findDeal(
  predicate: (state: BlackjackRoundState) => boolean,
  maxSeed = 300,
): Promise<DealtRound> {
  for (let seed = 1; seed <= maxSeed; seed += 1) {
    const engine = createTestEngine(seed);
    const match = await engine.findMatch({ stake: 50 });
    const state = await engine.beginRound({ matchId: match.id });
    if (predicate(state)) return { engine, matchId: match.id, state };
  }
  throw new Error('nenhuma seed produziu a distribuição pedida — ajuste o teste');
}

/** Distribuição que deixou a vez com o jogador. */
function isPlayerTurn(state: BlackjackRoundState): boolean {
  return state.phase === 'playerTurn';
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
    await expect(engine.findMatch({ stake: 10.5 })).rejects.toMatchObject({
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
    expect(updated.id).toBe(match.id);

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

  it('dá duas cartas ao jogador e abre só UMA carta do rival', async () => {
    const { state, matchId } = await findDeal(isPlayerTurn);

    expect(state.matchId).toBe(matchId);
    expect(state.playerHand).toHaveLength(2);
    expect(state.opponentVisible).toHaveLength(1);
    expect(state.opponentHidden).toBe(1);
    expect(state.legalActions).toEqual(['hit', 'stand']);
    expect(state.result).toBeUndefined();
  });

  it('blackjack natural do jogador resolve a rodada na distribuição', async () => {
    const { state } = await findDeal((s) => s.phase === 'settled');

    expect(state.playerHand).toHaveLength(2);
    expect(isNaturalBlackjack(state.playerHand)).toBe(true);
    expect(state.legalActions).toEqual([]);
    expect(state.opponentHidden).toBe(0);
    expect(state.result?.playerNatural).toBe(true);
    expect(state.result?.playerTotal).toBe(21);
  });

  it('a mesma partida joga várias rodadas seguidas', async () => {
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

  it('rejeita ação em partida inexistente', async () => {
    const engine = createTestEngine();
    await expect(engine.act({ matchId: 'nao-existe', action: 'stand' })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });

  it('pedir carta acrescenta exatamente uma carta à mão', async () => {
    // Mão baixa (≤ 9): pedir uma carta nunca alcança 21, então a vez
    // continua com o jogador e dá para medir o efeito isolado do hit.
    const { engine, matchId, state } = await findDeal(
      (s) => isPlayerTurn(s) && handValue(s.playerHand).total <= 9,
    );

    const after = await engine.act({ matchId, action: 'hit' });
    expect(after.playerHand).toHaveLength(3);
    expect(after.playerHand.slice(0, 2)).toEqual(state.playerHand);
    expect(after.phase).toBe('playerTurn');
    // O rival continua com a mesma carta aberta e a última escondida.
    expect(after.opponentVisible).toEqual(state.opponentVisible);
    expect(after.opponentHidden).toBe(1);
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
    expect(state.legalActions).toEqual([]);
  });

  it('parar entrega a vez ao bot, que joga dentro da engine', async () => {
    const { engine, matchId, state } = await findDeal(isPlayerTurn);
    const settled = await engine.act({ matchId, action: 'stand' });

    expect(settled.phase).toBe('settled');
    // A mão do jogador não muda depois do stand; a do rival pode crescer.
    expect(settled.playerHand).toEqual(state.playerHand);
    expect(settled.result?.opponentHand.length).toBeGreaterThanOrEqual(2);
  });

  it('o resultado fecha com totais, estouros, naturais e payout consistentes', async () => {
    const engine = createTestEngine(11);
    const match = await engine.findMatch({ stake: 100 });
    const result = await playRoundToEnd(engine, match.id);

    expect(result.playerTotal).toBe(handValue(result.playerHand).total);
    expect(result.opponentTotal).toBe(handValue(result.opponentHand).total);
    expect(result.playerBust).toBe(result.playerTotal > 21);
    expect(result.opponentBust).toBe(result.opponentTotal > 21);
    expect(result.playerNatural).toBe(isNaturalBlackjack(result.playerHand));
    expect(result.opponentNatural).toBe(isNaturalBlackjack(result.opponentHand));

    expect(result.stake).toBe(100);
    expect(result.payout).toBe(payoutFor(result.outcome, 100, result.playerNatural));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 100, result.playerNatural));
    expect(result.matchId).toBe(match.id);
    expect(result.completedAt).toBeGreaterThan(0);
  });
});

describe('estouro é público', () => {
  /**
   * O sigilo da última carta vale para decidir a mão, NÃO para esconder
   * uma derrota já consumada: quem estoura vira as cartas na hora, em
   * qualquer mesa. Sem isso o rival seguiria pedindo contra alguém que
   * já perdeu, estouraria junto de vez em quando, e o "dois estourados
   * empatam" devolveria a aposta de quem estourou primeiro.
   */
  it('quem estoura nunca empata: a rodada é sempre derrota', async () => {
    let busts = 0;
    // 25 seeds bastam: pedir carta até a mão fechar estoura na maioria
    // das vezes, e cada seed custa uma partida inteira de engine.
    for (let seed = 1; seed <= 25; seed += 1) {
      const engine = createTestEngine(seed);
      const match = await engine.findMatch({ stake: 50 });
      let state = await engine.beginRound({ matchId: match.id });
      // Pede até a mão fechar sozinha (estouro ou 21) — é o caminho
      // mais curto para produzir estouros de verdade.
      while (state.phase === 'playerTurn') {
        state = await engine.act({ matchId: match.id, action: 'hit' });
      }
      const { result } = state;
      if (!result || !result.playerBust) continue;
      busts += 1;
      expect(result.outcome).toBe('lose');
      expect(result.payout).toBe(0);
    }
    // O laço só prova alguma coisa se realmente houve estouros.
    expect(busts).toBeGreaterThan(0);
  });
});

describe('sigilo da última carta do rival', () => {
  it('durante a vez do jogador só a primeira carta do rival está na mesa', async () => {
    const { engine, matchId, state } = await findDeal(isPlayerTurn);

    expect(state.opponentVisible).toHaveLength(1);
    expect(state.opponentHidden).toBe(1);

    const settled = await engine.act({ matchId, action: 'stand' });
    const result = settled.result;
    if (!result) throw new Error('rodada resolvida sem resultado — contrato violado');

    // No showdown tudo vira: a mão do rival começa pelas cartas que já
    // estavam abertas e traz pelo menos mais uma, a que ficou escondida.
    expect(settled.opponentHidden).toBe(0);
    expect(result.opponentHand.length).toBeGreaterThanOrEqual(2);
    expect(result.opponentHand.slice(0, 1)).toEqual(state.opponentVisible);
    expect(result.opponentHand.length).toBeGreaterThan(state.opponentVisible.length);
    // A carta escondida (a segunda do rival) nunca esteve à vista — o
    // baralho é único, então basta comparar por valor.
    expect(state.opponentVisible).not.toContainEqual(result.opponentHand[1]);
  });

  it('nenhuma compra do jogador revela mais cartas do rival', async () => {
    const { engine, matchId, state } = await findDeal(
      (s) => isPlayerTurn(s) && handValue(s.playerHand).total <= 9,
    );

    let current = await engine.act({ matchId, action: 'hit' });
    while (current.phase === 'playerTurn') {
      expect(current.opponentVisible).toEqual(state.opponentVisible);
      expect(current.opponentHidden).toBe(1);
      current = await engine.act({ matchId, action: 'hit' });
    }
    expect(current.phase).toBe('settled');
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
    expect(state.result?.netChange).toBe(netChangeFor('win', 50, true));
  });

  it('derrota forçada dá o natural ao rival e o jogador não escapa', async () => {
    const engine = createTestEngine(7, true);
    const match = await engine.findMatch({ stake: 50 });
    const state = await engine.beginRound({ matchId: match.id, forcedOutcome: 'lose' });
    expect(state.phase).toBe('playerTurn');

    const settled = await engine.act({ matchId: match.id, action: 'stand' });
    expect(settled.result?.opponentNatural).toBe(true);
    expect(settled.result?.outcome).toBe('lose');
    expect(settled.result?.payout).toBe(0);
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
    expect(stateA.opponentVisible).toEqual(stateB.opponentVisible);
    expect(stateA.phase).toBe(stateB.phase);
  });
});

describe('createGameEngine', () => {
  it('cria engine local por padrão', () => {
    expect(createGameEngine()).toBeInstanceOf(LocalBlackjackGameEngine);
  });

  it('repassa as opções da engine local', () => {
    const engine = createGameEngine({ mode: 'local', local: { dealDelayMs: 0 } });
    expect(engine).toBeInstanceOf(LocalBlackjackGameEngine);
  });

  it('modo api ainda não está disponível', () => {
    expect(() => createGameEngine({ mode: 'api' })).toThrow(/ApiBlackjackGameEngine/);
  });
});

describe('GameEngineError', () => {
  it('carrega código estável', () => {
    const error = new GameEngineError('internal', 'boom');
    expect(error.code).toBe('internal');
    expect(error.name).toBe('GameEngineError');
    expect(error).toBeInstanceOf(Error);
  });
});
