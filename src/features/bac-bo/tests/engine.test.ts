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

/**
 * Joga uma rodada inteira parando na primeira oportunidade. A vez é
 * SIMULTÂNEA, então o laço faz o que a UI faz: trava a escolha (quando
 * há uma a fazer) e fecha a vez.
 */
async function playRoundToEnd(engine: GameEngine, matchId: string): Promise<RoundResult> {
  return (await playRound(engine, matchId)).result;
}

/** Fecha a rodada a partir de um estado já aberto (parando na sua vez). */
async function settleFrom(
  engine: GameEngine,
  matchId: string,
  from: BlackjackRoundState,
): Promise<RoundResult> {
  let state = from;
  for (let guard = 0; state.phase !== 'settled' && guard < 40; guard += 1) {
    if (state.legalActions.length > 0) await engine.commit({ matchId, action: 'stand' });
    state = await engine.resolveTurn({ matchId });
  }
  const { result } = state;
  if (!result) throw new Error('rodada resolvida sem resultado — contrato violado');
  return result;
}

/** A rodada inteira mais o número de vezes que ela levou. */
async function playRound(
  engine: GameEngine,
  matchId: string,
  action: 'hit' | 'stand' = 'stand',
): Promise<{ result: RoundResult; turns: number }> {
  let state = await engine.beginRound({ matchId });
  let turns = 0;
  // Teto de segurança: uma rodada de 21 nunca passa disto, e um laço
  // infinito num teste de motor é pior do que uma falha clara.
  for (let guard = 0; state.phase !== 'settled' && guard < 40; guard += 1) {
    if (state.legalActions.length > 0) await engine.commit({ matchId, action });
    state = await engine.resolveTurn({ matchId });
    turns += 1;
  }
  const { result } = state;
  if (!result) throw new Error('rodada resolvida sem resultado — contrato violado');
  return { result, turns };
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

/** Distribuição que deixou uma escolha na mão do jogador. */
function isPlayerTurn(state: BlackjackRoundState): boolean {
  return state.legalActions.length > 0;
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
    expect(result.payout).toBe(payoutFor(result.outcome, 130));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 130));
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

  it('blackjack natural dos dois resolve a rodada na distribuição', async () => {
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

describe('LocalBlackjackGameEngine — a vez simultânea', () => {
  it('rejeita escolha sem rodada em andamento', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 50 });
    await expect(engine.commit({ matchId: match.id, action: 'hit' })).rejects.toMatchObject({
      code: 'illegal-action',
    });
  });

  it('rejeita escolha depois da rodada resolvida', async () => {
    const engine = createTestEngine();
    const match = await engine.findMatch({ stake: 50 });
    await playRoundToEnd(engine, match.id);
    await expect(engine.commit({ matchId: match.id, action: 'hit' })).rejects.toMatchObject({
      code: 'illegal-action',
    });
    await expect(engine.resolveTurn({ matchId: match.id })).rejects.toMatchObject({
      code: 'illegal-action',
    });
  });

  it('rejeita ação em partida inexistente', async () => {
    const engine = createTestEngine();
    await expect(engine.commit({ matchId: 'nao-existe', action: 'stand' })).rejects.toMatchObject({
      code: 'match-not-found',
    });
    await expect(engine.resolveTurn({ matchId: 'nao-existe' })).rejects.toMatchObject({
      code: 'match-not-found',
    });
  });

  it('travar a escolha NÃO mexe na mesa: a carta só sai quando a vez fecha', async () => {
    // Mão baixa (≤ 9): pedir uma carta nunca alcança 21, então a mão
    // continua viva e dá para medir o efeito isolado do lance.
    const { engine, matchId, state } = await findDeal(
      (s) => isPlayerTurn(s) && handValue(s.playerHand).total <= 9,
    );

    const committed = await engine.commit({ matchId, action: 'hit' });
    // Nada aconteceu ainda: mesma mão, mesma mesa. Só o martelo caiu.
    expect(committed.playerHand).toEqual(state.playerHand);
    expect(committed.playerChoice).toBe('hit');
    expect(committed.legalActions).toEqual([]);
    expect(committed.lastTurn).toBeUndefined();

    // Uma escolha por vez: a engine recusa a segunda.
    await expect(engine.commit({ matchId, action: 'stand' })).rejects.toMatchObject({
      code: 'illegal-action',
    });

    const after = await engine.resolveTurn({ matchId });
    expect(after.playerHand).toHaveLength(3);
    expect(after.playerHand.slice(0, 2)).toEqual(state.playerHand);
    expect(after.lastTurn?.player).toEqual({
      by: 'player',
      action: 'hit',
      closed: false,
      bust: false,
      timedOut: false,
    });
    // A vez do rival saiu JUNTO, na mesma revelação.
    expect(after.lastTurn?.opponent?.by).toBe('opponent');
    // A última carta dele continua virada, tenha ele pedido ou não.
    expect(after.opponentHidden).toBe(1);
  });

  it('sem escolha travada, a mesa PARA a mão de quem deixou o tempo passar', async () => {
    const { engine, matchId, state } = await findDeal(isPlayerTurn);

    // Fecha a vez sem nenhum commit: é o que o relógio zerado faz.
    const after = await engine.resolveTurn({ matchId });
    expect(after.lastTurn?.player).toEqual({
      by: 'player',
      action: 'stand',
      closed: true,
      bust: false,
      timedOut: true,
    });
    // Parar nunca estoura: a mão fica exatamente como estava.
    expect(after.playerHand).toEqual(state.playerHand);
    expect(after.playerClosed).toBe(true);
  });

  it('a mão que fecha sai das vezes seguintes e o outro segue sozinho', async () => {
    const { engine, matchId, state } = await findDeal(isPlayerTurn);
    await engine.commit({ matchId, action: 'stand' });
    const afterStand = await engine.resolveTurn({ matchId });

    expect(afterStand.playerClosed).toBe(true);
    // A mão do jogador não muda depois do stand; a do rival pode crescer.
    expect(afterStand.playerHand).toEqual(state.playerHand);

    // Com o jogador fora, toda vez restante é só do rival.
    let current = afterStand;
    while (current.phase !== 'settled') {
      expect(current.legalActions).toEqual([]);
      current = await engine.resolveTurn({ matchId });
      expect(current.lastTurn?.player).toBeUndefined();
      expect(current.lastTurn?.opponent?.by).toBe('opponent');
    }
    expect(current.result?.opponentHand.length).toBeGreaterThanOrEqual(2);
  });

  it('pedir até 21 ou estourar fecha a mão do jogador', async () => {
    const engine = createTestEngine(3);
    const match = await engine.findMatch({ stake: 50 });
    const { result } = await playRound(engine, match.id, 'hit');
    expect(handValue(result.playerHand).total).toBeGreaterThanOrEqual(21);
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
    expect(result.payout).toBe(payoutFor(result.outcome, 100));
    expect(result.netChange).toBe(netChangeFor(result.outcome, 100));
    expect(result.matchId).toBe(match.id);
    expect(result.completedAt).toBeGreaterThan(0);
  });
});

describe('estouro é público', () => {
  /**
   * O sigilo da última carta vale para decidir a mão, NÃO para esconder
   * uma derrota já consumada: quem estoura vira as cartas na hora, em
   * qualquer mesa. Sem isso o rival seguiria pedindo contra alguém que
   * já perdeu — e estouraria junto de vez em quando, transformando uma
   * derrota consumada em empate com a aposta de volta.
   *
   * O que a alternância de vezes NÃO garante (nem deve) é que ninguém
   * mais estoure junto: o rival pode ter estourado ANTES de você, no
   * lance dele, sem ter como saber o que você faria depois. Aí os dois
   * estouros empatam, como manda a regra da mesa.
   */
  it('depois de você estourar, o rival nunca pede outra carta', async () => {
    let busts = 0;
    // 25 seeds bastam: pedir carta até a mão fechar estoura na maioria
    // das vezes, e cada seed custa uma partida inteira de engine.
    for (let seed = 1; seed <= 25; seed += 1) {
      const engine = createTestEngine(seed);
      const match = await engine.findMatch({ stake: 50 });
      let state = await engine.beginRound({ matchId: match.id });
      let busted = false;
      for (let guard = 0; state.phase !== 'settled' && guard < 40; guard += 1) {
        // Pede até a mão fechar sozinha — o caminho mais curto para
        // produzir estouros de verdade.
        if (state.legalActions.length > 0) {
          await engine.commit({ matchId: match.id, action: 'hit' });
        }
        const bustedBefore = busted;
        state = await engine.resolveTurn({ matchId: match.id });
        busted = handValue(state.playerHand).total > 21;
        // Ele decide com a mesa como estava no INÍCIO da vez: só a
        // partir da vez SEGUINTE o estouro é informação dele.
        if (bustedBefore && state.lastTurn?.opponent) {
          expect(state.lastTurn.opponent.action).toBe('stand');
        }
      }
      if (!state.result?.playerBust) continue;
      busts += 1;
      // Estourado, você nunca LEVA a rodada.
      expect(state.result.outcome).not.toBe('win');
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

    await engine.commit({ matchId, action: 'stand' });
    let settled = await engine.resolveTurn({ matchId });
    while (settled.phase !== 'settled') {
      settled = await engine.resolveTurn({ matchId });
    }
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

  it('cada vez abre no máximo uma carta a mais da mão do rival', async () => {
    const { engine, matchId, state } = await findDeal(
      (s) => isPlayerTurn(s) && handValue(s.playerHand).total <= 9,
    );

    let openBefore = state.opponentVisible.length;
    let current = state;
    while (current.phase !== 'settled') {
      if (current.legalActions.length > 0) await engine.commit({ matchId, action: 'hit' });
      current = await engine.resolveTurn({ matchId });
      if (current.phase === 'settled') break;
      // A carta que estava escondida passa a ser a nova: no máximo uma
      // a mais fica aberta por vez.
      expect(current.opponentVisible.length).toBeLessThanOrEqual(openBefore + 1);
      expect(current.opponentHidden).toBe(1);
      openBefore = current.opponentVisible.length;
    }
  });
});

describe('resultados forçados (DevTools)', () => {
  it('respeita o resultado forçado quando habilitado', async () => {
    for (const outcome of ['win', 'lose', 'tie'] as const) {
      const engine = createTestEngine(7, true);
      const match = await engine.findMatch({ stake: 50 });
      const state = await engine.beginRound({ matchId: match.id, forcedOutcome: outcome });
      expect(await settleFrom(engine, match.id, state)).toMatchObject({ outcome });
    }
  });

  it('vitória forçada vem com blackjack natural', async () => {
    const engine = createTestEngine(7, true);
    const match = await engine.findMatch({ stake: 50 });
    const state = await engine.beginRound({ matchId: match.id, forcedOutcome: 'win' });
    // O natural já fecha a sua mão na distribuição: não sobra decisão
    // nenhuma para você — só o rival ainda tem lance a dar.
    expect(state.playerClosed).toBe(true);
    expect(state.legalActions).toEqual([]);

    const result = await settleFrom(engine, match.id, state);
    expect(result.playerNatural).toBe(true);
    expect(result.payout).toBe(payoutFor('win', 50));
    expect(result.netChange).toBe(netChangeFor('win', 50));
  });

  it('derrota forçada dá o natural ao rival e o jogador não escapa', async () => {
    const engine = createTestEngine(7, true);
    const match = await engine.findMatch({ stake: 50 });
    const state = await engine.beginRound({ matchId: match.id, forcedOutcome: 'lose' });
    expect(state.legalActions).toEqual(['hit', 'stand']);
    // O natural do rival fechou a mão dele: só você ainda escolhe.
    expect(state.opponentClosed).toBe(true);

    await engine.commit({ matchId: match.id, action: 'stand' });
    const settled = await engine.resolveTurn({ matchId: match.id });
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
