import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { GameEngineError } from '../engine/GameEngine';
import { LocalPokerEngine } from '../engine/poker/LocalPokerEngine';
import { TABLE_ANTE } from '../engine/credits';
import type { PokerRoundState } from '../engine/poker/types';

/** Engine determinística e sem espera — o relógio é dos testes. */
function engineWith(seed: number, allowForcedDeals = true) {
  return new LocalPokerEngine({
    rng: new SeededRng(seed),
    matchmakingDelayMs: [0, 0],
    dealDelayMs: 0,
    allowForcedDeals,
  });
}

async function openMatch(engine: LocalPokerEngine, stake = 1000) {
  const match = await engine.findMatch({ stake });
  return match;
}

/**
 * Deixa a mesa andar até a palavra voltar ao jogador. O rival pode
 * desistir no caminho: quem chama confere `phase` antes de agir.
 */
async function advanceToPlayer(
  engine: LocalPokerEngine,
  matchId: string,
  first: PokerRoundState,
): Promise<PokerRoundState> {
  let state = first;
  while (state.phase !== 'settled' && state.toAct !== 'player') {
    state = await engine.advance({ matchId });
  }
  return state;
}

/**
 * Leva a mão até o fim jogando SEMPRE o lance mais passivo possível
 * (passar quando é de graça, pagar quando não é). É a linha que garante
 * chegar ao showdown sem desistir de nada — o que os testes de desfecho
 * precisam.
 */
async function playToShowdown(
  engine: LocalPokerEngine,
  matchId: string,
  first: PokerRoundState,
): Promise<PokerRoundState> {
  let state = first;
  // Teto de segurança: uma mão de heads-up nunca chega perto disto.
  for (let step = 0; step < 200 && state.phase !== 'settled'; step += 1) {
    state =
      state.toAct === 'player'
        ? await engine.act({
            matchId,
            action: state.legalActions.includes('check') ? 'check' : 'call',
          })
        : await engine.advance({ matchId });
  }
  return state;
}

describe('LocalPokerEngine — abertura da mão', () => {
  it('distribui duas fechadas ao jogador e cobra a entrada dos DOIS lados', async () => {
    const engine = engineWith(11);
    const match = await openMatch(engine, 1000);
    const state = await engine.beginHand({ matchId: match.id });

    expect(state.playerHole).toHaveLength(2);
    expect(state.board).toHaveLength(0);
    expect(state.street).toBe('preflop');
    expect(state.phase).toBe('betting');

    // A entrada é IGUAL: os dois põem o mesmo antes de ver carta, e o
    // pote nasce com o dobro dela.
    expect(state.committed.player).toBe(TABLE_ANTE);
    expect(state.committed.opponent).toBe(TABLE_ANTE);
    expect(state.pot).toBe(TABLE_ANTE * 2);
    expect(state.stacks.player).toBe(1000 - TABLE_ANTE);
    expect(state.stacks.opponent).toBe(1000 - TABLE_ANTE);
    // Sem aposta desigual na frente, quem abre a rua pode passar.
    expect(state.toCall).toBe(0);
  });

  it('o botão fala primeiro no pré-flop', async () => {
    const engine = engineWith(3);
    const match = await openMatch(engine);
    const state = await engine.beginHand({ matchId: match.id });
    expect(state.toAct).toBe(state.button);
  });

  it('NÃO entrega uma única carta fechada do rival antes do showdown', async () => {
    const engine = engineWith(21);
    const match = await openMatch(engine);
    let state = await engine.beginHand({ matchId: match.id });
    expect(state.opponentHole).toEqual([]);

    // Nem no meio da mão, rua após rua.
    for (let step = 0; step < 30 && state.phase !== 'settled'; step += 1) {
      expect(state.opponentHole).toEqual([]);
      state =
        state.toAct === 'player'
          ? await engine.act({
              matchId: match.id,
              action: state.legalActions.includes('check') ? 'check' : 'call',
            })
          : await engine.advance({ matchId: match.id });
    }
  });

  it('recusa uma segunda mão por cima de uma em andamento', async () => {
    const engine = engineWith(5);
    const match = await openMatch(engine);
    await engine.beginHand({ matchId: match.id });
    await expect(engine.beginHand({ matchId: match.id })).rejects.toThrow(GameEngineError);
  });

  it('recusa uma partida que não existe', async () => {
    const engine = engineWith(5);
    await expect(engine.beginHand({ matchId: 'inexistente' })).rejects.toThrow(GameEngineError);
  });
});

describe('LocalPokerEngine — as ruas', () => {
  it('abre três no flop, uma no turn e uma no river', async () => {
    const engine = engineWith(17);
    const match = await openMatch(engine);
    let state = await engine.beginHand({ matchId: match.id });

    const seen = new Map<string, number>();
    for (let step = 0; step < 60 && state.phase !== 'settled'; step += 1) {
      seen.set(state.street, state.board.length);
      state =
        state.toAct === 'player'
          ? await engine.act({
              matchId: match.id,
              action: state.legalActions.includes('check') ? 'check' : 'call',
            })
          : await engine.advance({ matchId: match.id });
    }

    expect(seen.get('preflop')).toBe(0);
    if (seen.has('flop')) expect(seen.get('flop')).toBe(3);
    if (seen.has('turn')) expect(seen.get('turn')).toBe(4);
    if (seen.has('river')) expect(seen.get('river')).toBe(5);
  });

  it('do flop em diante o botão fala por ÚLTIMO', async () => {
    const engine = engineWith(29);
    const match = await openMatch(engine);
    let state = await engine.beginHand({ matchId: match.id });
    const button = state.button;

    while (state.phase !== 'settled' && state.street === 'preflop') {
      state =
        state.toAct === 'player'
          ? await engine.act({
              matchId: match.id,
              action: state.legalActions.includes('check') ? 'check' : 'call',
            })
          : await engine.advance({ matchId: match.id });
    }

    if (state.street === 'flop' && state.phase !== 'settled') {
      expect(state.toAct).toBe(button === 'player' ? 'opponent' : 'player');
    }
  });

  it('a mesa não anda enquanto a vez é do jogador', async () => {
    const engine = engineWith(13);
    const match = await openMatch(engine);
    let state = await engine.beginHand({ matchId: match.id });
    while (state.toAct !== 'player' && state.phase !== 'settled') {
      state = await engine.advance({ matchId: match.id });
    }
    await expect(engine.advance({ matchId: match.id })).rejects.toThrow(GameEngineError);
  });
});

describe('LocalPokerEngine — ações do jogador', () => {
  it('só oferece ações legais, e recusa qualquer outra', async () => {
    const engine = engineWith(31);
    const match = await openMatch(engine);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;

    expect(state.legalActions.length).toBeGreaterThan(0);
    const illegal = (['fold', 'check', 'call', 'raise'] as const).find(
      (action) => !state.legalActions.includes(action),
    );
    if (illegal) {
      await expect(engine.act({ matchId: match.id, action: illegal })).rejects.toThrow(
        GameEngineError,
      );
    }
  });

  it('recusa um aumento abaixo do mínimo da rua', async () => {
    const engine = engineWith(37);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    if (!state.legalActions.includes('raise')) return;

    await expect(
      engine.act({ matchId: match.id, action: 'raise', to: state.minRaiseTo - 1 }),
    ).rejects.toThrow(GameEngineError);
  });

  it('uma aposta de 10 sobre a entrada é legal, e o rival paga 10', async () => {
    /* O pedido, ao pé da letra: "tenho 100 da aposta base padrão da mesa,
       apostei mais 10, o montante vai para 110 — e a outra pessoa precisa
       colocar mais 10". Isso era recusado enquanto o piso da mesa foi a
       própria entrada: o mínimo pedido era +100. */
    const engine = engineWith(37);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled' || !state.legalActions.includes('raise')) return;

    const naMesa = Math.max(state.committed.player, state.committed.opponent);
    expect(state.minRaiseTo).toBe(naMesa + 1);

    const depois = await engine.act({ matchId: match.id, action: 'raise', to: naMesa + 10 });
    expect(depois.committed.player).toBe(naMesa + 10);
    // E é exatamente o acréscimo que o rival tem de cobrir.
    expect(depois.committed.player - depois.committed.opponent).toBe(10);
  });

  it('recusa um aumento acima do stack efetivo da mesa', async () => {
    const engine = engineWith(41);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    if (!state.legalActions.includes('raise')) return;

    await expect(
      engine.act({ matchId: match.id, action: 'raise', to: state.maxRaiseTo + 1 }),
    ).rejects.toThrow(GameEngineError);
  });

  it('um aumento tira as fichas do stack e as põe no pote', async () => {
    const engine = engineWith(43);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    if (!state.legalActions.includes('raise')) return;

    const before = state.stacks.player;
    const committedBefore = state.committed.player;
    const target = state.minRaiseTo;
    state = await engine.act({ matchId: match.id, action: 'raise', to: target });

    expect(state.committed.player).toBe(target);
    expect(state.stacks.player).toBe(before - (target - committedBefore));
    expect(state.lastMove).toMatchObject({ by: 'player', action: 'raise', to: target });
  });

  it('o all-in do jogador zera o stack dele e é marcado como tal', async () => {
    const engine = engineWith(47);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    if (!state.legalActions.includes('raise')) return;

    state = await engine.act({ matchId: match.id, action: 'raise', to: state.maxRaiseTo });
    expect(state.stacks.player).toBe(0);
    expect(state.lastMove?.allIn).toBe(true);
  });
});

describe('LocalPokerEngine — desistência', () => {
  it('desistir encerra a mão e custa só o que já estava no pote', async () => {
    const engine = engineWith(53);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    while (state.toAct !== 'player' || !state.legalActions.includes('fold')) {
      if (state.phase === 'settled') return;
      state =
        state.toAct === 'player'
          ? await engine.act({ matchId: match.id, action: 'check' })
          : await engine.advance({ matchId: match.id });
    }

    const stackBefore = state.stacks.player;
    state = await engine.act({ matchId: match.id, action: 'fold' });

    const result = state.result;
    expect(result).toBeDefined();
    expect(result?.outcome).toBe('lose');
    expect(result?.showdown).toBe(false);
    expect(result?.foldedBy).toBe('player');
    expect(result?.netChange).toBe(-(result?.contested ?? 0));
    // Desistir não põe mais nenhuma ficha na mesa: o que se perde é o que
    // já estava lá.
    expect(result?.committed.player).toBe(1000 - stackBefore);
  });

  it('CORRER no pré-flop custa a ENTRADA e nada mais', async () => {
    /* É o lance que a sessão trouxe: sem aposta na frente, largar a mão
       guarda todo o resto do stack para as próximas. Numa mesa de mão
       única a decisão nem existia. */
    const engine = engineWith(59);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    // Correr está na mesa desde a primeira palavra, sem aposta na frente.
    expect(state.legalActions).toContain('fold');
    expect(state.toCall).toBe(0);

    state = await engine.act({ matchId: match.id, action: 'fold' });
    const result = state.result;
    if (!result) throw new Error('a mão tinha de estar fechada');

    expect(state.phase).toBe('settled');
    expect(result.foldedBy).toBe('player');
    expect(result.contested).toBe(TABLE_ANTE);
    expect(result.netChange).toBe(-TABLE_ANTE);
    expect(result.session.stacks.player).toBe(1000 - TABLE_ANTE);
    // E as fichas não somem da mesa: elas foram para o outro lado.
    expect(result.session.stacks.player + result.session.stacks.opponent).toBe(2000);
    // A mesa CONTINUA: ninguém ficou sem fichas para a entrada seguinte.
    expect(result.session.over).toBe(false);
  });

  it('as duas mãos são LIDAS mesmo numa desistência', async () => {
    /* A leitura acontece sempre — é ela que deixa a mesa contar o que
       cada um tinha. O que MOSTRAR é outra coisa, e é escolha (abaixo). */
    const engine = engineWith(59);
    const match = await openMatch(engine, 1000);
    let state = await engine.beginHand({ matchId: match.id });
    state = await advanceToPlayer(engine, match.id, state);
    if (state.phase === 'settled') return;
    state = await engine.act({ matchId: match.id, action: 'fold' });

    expect(state.result?.playerRank.label).toBeTruthy();
    expect(state.result?.opponentRank.label).toBeTruthy();
    expect(state.result?.showdown).toBe(false);
  });

  it('as fechadas do rival só atravessam a fronteira se ELE as abriu', async () => {
    /* O sigilo da mão guardada é ESTRUTURAL, como o de durante a mão: ela
       não fica escondida na tela, ela não chega até lá. */
    for (let seed = 200; seed < 240; seed += 1) {
      const engine = engineWith(seed);
      const match = await openMatch(engine, 1000);
      let state = await engine.beginHand({ matchId: match.id });
      state = await advanceToPlayer(engine, match.id, state);
      if (state.phase === 'settled') continue;
      state = await engine.act({ matchId: match.id, action: 'fold' });

      const shown = state.result?.opponentShown ?? true;
      expect(state.opponentHole).toHaveLength(shown ? 2 : 0);
    }
  });

  it('o rival GUARDA a mão às vezes, e mostra às vezes', async () => {
    /* Era a via de mão única do sistema: as cartas dele abriam SEMPRE
       numa desistência e as suas só abriam se você quisesse. Toda vez que
       ele largava uma mão você aprendia como ele joga; ele nunca aprendia
       nada de você — e guardar, sem risco nenhum, deixava de ser jogada e
       virava o botão óbvio. */
    const decisions = new Set<boolean>();
    for (let seed = 300; seed < 360; seed += 1) {
      const engine = engineWith(seed);
      const match = await openMatch(engine, 1000);
      let state = await engine.beginHand({ matchId: match.id });
      state = await advanceToPlayer(engine, match.id, state);
      if (state.phase === 'settled') continue;
      state = await engine.act({ matchId: match.id, action: 'fold' });
      if (state.result) decisions.add(state.result.opponentShown);
    }
    // As duas respostas aparecem: não é uma constante disfarçada de sorteio.
    expect([...decisions].sort()).toEqual([false, true]);
  });

  it('num SHOWDOWN não há o que guardar: as duas mãos foram pagas', async () => {
    for (let seed = 400; seed < 430; seed += 1) {
      const engine = engineWith(seed);
      const match = await openMatch(engine, 1000);
      let state = await engine.beginHand({ matchId: match.id });
      for (let passo = 0; passo < 40 && state.phase !== 'settled'; passo += 1) {
        state =
          state.toAct === 'player'
            ? await engine.act({
                matchId: match.id,
                action: state.legalActions.includes('check') ? 'check' : 'call',
              })
            : await engine.advance({ matchId: match.id });
      }
      if (!state.result?.showdown) continue;
      expect(state.result.opponentShown).toBe(true);
      expect(state.opponentHole).toHaveLength(2);
    }
  });
});

describe('LocalPokerEngine — showdown', () => {
  it('abre as duas mãos e leva o que o rival pôs', async () => {
    const engine = engineWith(2);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'win' });
    const state = await playToShowdown(engine, match.id, first);

    expect(state.phase).toBe('settled');
    const result = state.result;
    expect(result?.showdown).toBe(true);
    expect(result?.outcome).toBe('win');
    expect(state.opponentHole).toHaveLength(2);
    expect(result?.playerRank?.label).toContain('Ases');
    /* O ganho é o que o rival pôs, INTEIRO: dentro da sessão as fichas só
       trocam de lado, e a comissão da casa incide uma vez só, no caixa
       (ver `cashOutValue`). Uma comissão por mão faria fichas evaporarem
       do feltro a cada pote. */
    expect(result?.netChange).toBe(result?.contested ?? 0);
    expect(result?.payout).toBe(1000 + (result?.netChange ?? 0));
    // E o stack do vencedor é o que o `payout` diz.
    expect(result?.session.stacks.player).toBe(result?.payout);
  });

  it('não explica o desempate quando as duas placas já dizem coisas diferentes', async () => {
    /* A mão empilhada dá par de Ases ao jogador e par de Reis ao rival:
       as placas leem diferente, e "decidiu no Ás" embaixo de "um par de
       Ases" repetiria o nome da mão com outras palavras. A carta que
       decidiu só é notícia quando as duas leituras saem IGUAIS. */
    const engine = engineWith(2);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'win' });
    const state = await playToShowdown(engine, match.id, first);

    const result = state.result;
    expect(result?.playerRank.label).not.toBe(result?.opponentRank.label);
    expect(result?.decidedBy).toBeUndefined();
    expect(result?.decidedCard).toBeUndefined();
  });

  it('a derrota no showdown custa exatamente o que foi disputado', async () => {
    const engine = engineWith(4);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'lose' });
    const state = await playToShowdown(engine, match.id, first);

    const result = state.result;
    expect(result?.outcome).toBe('lose');
    expect(result?.netChange).toBe(-(result?.contested ?? 0));
    expect(result?.payout).toBe(1000 - (result?.contested ?? 0));
  });

  it('duas mãos idênticas dividem o pote: ninguém ganha nem perde', async () => {
    const engine = engineWith(6);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'tie' });
    const state = await playToShowdown(engine, match.id, first);

    const result = state.result;
    expect(result?.outcome).toBe('tie');
    expect(result?.netChange).toBe(0);
    expect(result?.payout).toBe(1000);
    expect(result?.playerRank?.category).toBe(result?.opponentRank?.category);
  });

  it('o board vai até as cinco cartas quando a mão chega ao showdown', async () => {
    const engine = engineWith(8);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'win' });
    const state = await playToShowdown(engine, match.id, first);

    expect(state.result?.board).toHaveLength(5);
    expect(state.result?.playerRank?.cards).toHaveLength(5);
  });

  it('o que sobra do stack volta inteiro: perde-se o apostado, não o resto', async () => {
    const engine = engineWith(10);
    const match = await openMatch(engine, 1000);
    const first = await engine.beginHand({ matchId: match.id, forcedDeal: 'lose' });
    const state = await playToShowdown(engine, match.id, first);

    const result = state.result;
    expect(result?.contested).toBeLessThanOrEqual(1000);
    expect(result?.payout).toBeGreaterThanOrEqual(0);
    expect((result?.payout ?? 0) + (result?.contested ?? 0)).toBe(1000);
  });
});

describe('LocalPokerEngine — invariantes de mesa', () => {
  it('nenhuma ficha nasce nem some: stack + comprometido é sempre o stake', async () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const engine = engineWith(seed);
      const match = await openMatch(engine, 1000);
      let state = await engine.beginHand({ matchId: match.id });

      for (let step = 0; step < 80 && state.phase !== 'settled'; step += 1) {
        const potFromStacks = 2000 - state.stacks.player - state.stacks.opponent;
        expect(state.pot).toBe(potFromStacks);
        expect(state.stacks.player).toBeGreaterThanOrEqual(0);
        expect(state.stacks.opponent).toBeGreaterThanOrEqual(0);

        state =
          state.toAct === 'player'
            ? await engine.act({
                matchId: match.id,
                action: state.legalActions.includes('check') ? 'check' : 'call',
              })
            : await engine.advance({ matchId: match.id });
      }

      const result = state.result;
      expect(result).toBeDefined();
      // O pote disputado nunca passa do stack de ninguém.
      expect(result?.contested).toBeLessThanOrEqual(1000);
      expect(result?.pot).toBe((result?.contested ?? 0) * 2);
    }
  });

  it('a mão sempre termina — nenhuma mesa fica sem quem jogue', async () => {
    for (let seed = 100; seed < 140; seed += 1) {
      const engine = engineWith(seed, false);
      const match = await openMatch(engine, 500);
      let state = await engine.beginHand({ matchId: match.id });

      let steps = 0;
      while (state.phase !== 'settled' && steps < 100) {
        state =
          state.toAct === 'player'
            ? await engine.act({
                matchId: match.id,
                action: state.legalActions.includes('check') ? 'check' : 'call',
              })
            : await engine.advance({ matchId: match.id });
        steps += 1;
      }
      expect(state.phase).toBe('settled');
    }
  });

  it('a mão termina mesmo com aumentos de UM crédito a cada palavra', async () => {
    /* A regra do no-limit — o aumento vale ao menos o tamanho do último —
       saiu para que apostas pequenas fossem possíveis, e ela existia
       justamente para evitar a guerra de aumentos mínimos. Aqui a guerra
       é encenada de propósito: o jogador aumenta o mínimo em toda palavra
       que tem. A mesa tem de fechar assim mesmo — cada aumento tira
       fichas de um stack finito, e stack finito é o que garante o fim. */
    for (let seed = 300; seed < 320; seed += 1) {
      const engine = engineWith(seed, false);
      const match = await openMatch(engine, 500);
      let state = await engine.beginHand({ matchId: match.id });

      let steps = 0;
      while (state.phase !== 'settled' && steps < 2500) {
        state =
          state.toAct === 'player'
            ? await engine.act(
                state.legalActions.includes('raise')
                  ? { matchId: match.id, action: 'raise', to: state.minRaiseTo }
                  : {
                      matchId: match.id,
                      action: state.legalActions.includes('check') ? 'check' : 'call',
                    },
              )
            : await engine.advance({ matchId: match.id });
        steps += 1;
      }
      expect(state.phase).toBe('settled');
    }
  });

  it('a aposta que o rival não cobriu volta a quem a fez', async () => {
    // `contested` é o menor dos dois compromissos, sempre — é a garantia
    // de que ninguém leva um dinheiro que o outro não tinha como pôr.
    for (let seed = 200; seed < 220; seed += 1) {
      const engine = engineWith(seed, false);
      const match = await openMatch(engine, 300);
      const first = await engine.beginHand({ matchId: match.id });
      const state = await playToShowdown(engine, match.id, first);
      const result = state.result;
      expect(result?.contested).toBe(
        Math.min(result?.committed.player ?? 0, result?.committed.opponent ?? 0),
      );
    }
  });
});
