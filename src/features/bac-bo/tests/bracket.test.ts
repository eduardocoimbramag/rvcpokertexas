import { describe, expect, it } from 'vitest';

import {
  activeRoundIndex,
  createBracket,
  currentMatches,
  isEliminated,
  otherPendingMatches,
  placementOf,
  recordMatchResult,
  tournamentChampion,
  yourPendingMatch,
} from '../tournament/bracket';
import type { BracketMatch, TournamentPlayer } from '../tournament/types';

function players(n: number): TournamentPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    avatar: 'B',
    isYou: i === 0,
  }));
}

/** Acesso indexado seguro nos testes (evita non-null assertion). */
function must<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('esperava valor definido');
  return value;
}

function match(rounds: BracketMatch[][], round: number, slot: number): BracketMatch {
  return must(must(rounds[round])[slot]);
}

describe('createBracket', () => {
  it('monta 3 fases (4/2/1) para 8 jogadores, primeira fase pareada', () => {
    const b = createBracket(players(8), 8);
    expect(b.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(match(b.rounds, 0, 0).a?.id).toBe('p0');
    expect(match(b.rounds, 0, 0).b?.id).toBe('p1');
    expect(match(b.rounds, 0, 3).b?.id).toBe('p7');
    expect(match(b.rounds, 1, 0).a).toBeNull();
  });

  it('monta 2 fases (2/1) para 4 jogadores (semifinal → final)', () => {
    const b = createBracket(players(4), 4);
    expect(b.rounds.map((r) => r.length)).toEqual([2, 1]);
  });
});

describe('resultados e propagação', () => {
  it('sobe o vencedor para a próxima fase ao concluir a rodada', () => {
    let b = createBracket(players(4), 4);
    b = recordMatchResult(b, match(b.rounds, 0, 0).id, 9, 5); // p0 vence p1
    b = recordMatchResult(b, match(b.rounds, 0, 1).id, 4, 10); // p3 vence p2
    expect(match(b.rounds, 1, 0).a?.id).toBe('p0');
    expect(match(b.rounds, 1, 0).b?.id).toBe('p3');
    expect(activeRoundIndex(b)).toBe(1);
  });

  it('joga o torneio inteiro até coroar um campeão', () => {
    let b = createBracket(players(8), 8);
    for (const m of must(b.rounds[0])) b = recordMatchResult(b, m.id, 10, 6);
    for (const m of must(b.rounds[1])) b = recordMatchResult(b, m.id, 11, 7);
    b = recordMatchResult(b, match(b.rounds, 2, 0).id, 12, 9);
    expect(tournamentChampion(b)?.id).toBe('p0');
  });
});

describe('perspectiva do jogador', () => {
  it('encontra a partida pendente do jogador e as demais a simular', () => {
    const b = createBracket(players(8), 8);
    expect(yourPendingMatch(b, 'p0')?.a?.id).toBe('p0');
    expect(otherPendingMatches(b, 'p0')).toHaveLength(3);
  });

  it('perder a semi não elimina: cai na disputa do 3º lugar', () => {
    let b = createBracket(players(4), 4);
    b = recordMatchResult(b, match(b.rounds, 0, 0).id, 5, 9); // p0 (você) perde
    // A outra semi ainda não terminou: ninguém é eliminado no vácuo.
    expect(isEliminated(b, 'p0')).toBe(false);

    b = recordMatchResult(b, match(b.rounds, 0, 1).id, 10, 4); // p2 vence p3
    // Os dois perdedores da semi se enfrentam pelo bronze.
    expect(b.thirdPlace?.a?.id).toBe('p0');
    expect(b.thirdPlace?.b?.id).toBe('p3');
    expect(isEliminated(b, 'p0')).toBe(false);
    expect(yourPendingMatch(b, 'p0')?.id).toBe(b.thirdPlace?.id);

    // A disputa do 3º corre ANTES da final.
    expect(currentMatches(b).map((m) => m.id)).toEqual([b.thirdPlace?.id]);
  });

  it('perder a disputa do 3º lugar elimina e define 3º e 4º', () => {
    let b = createBracket(players(4), 4);
    b = recordMatchResult(b, match(b.rounds, 0, 0).id, 5, 9); // p1 vence p0
    b = recordMatchResult(b, match(b.rounds, 0, 1).id, 10, 4); // p2 vence p3
    const third = b.thirdPlace;
    if (!third) throw new Error('sem disputa de 3º lugar');

    b = recordMatchResult(b, third.id, 4, 11); // p3 leva o bronze
    expect(isEliminated(b, 'p0')).toBe(true);
    expect(yourPendingMatch(b, 'p0')).toBeNull();
    expect(placementOf(b, 'p3')).toBe(3);
    expect(placementOf(b, 'p0')).toBe(4);

    // Com o bronze decidido, a final volta a ser a partida em jogo.
    expect(currentMatches(b).map((m) => m.id)).toEqual([match(b.rounds, 1, 0).id]);
  });

  it('a final define campeão e vice', () => {
    let b = createBracket(players(4), 4);
    b = recordMatchResult(b, match(b.rounds, 0, 0).id, 9, 5); // p0 vence
    b = recordMatchResult(b, match(b.rounds, 0, 1).id, 10, 4); // p2 vence
    b = recordMatchResult(b, must(b.thirdPlace).id, 9, 5);
    b = recordMatchResult(b, match(b.rounds, 1, 0).id, 12, 8); // p0 campeão

    expect(placementOf(b, 'p0')).toBe(1);
    expect(placementOf(b, 'p2')).toBe(2);
    // Quem caiu antes da semi não pontua — em 4 jogadores, ninguém.
    expect(placementOf(b, 'inexistente')).toBeNull();
  });
});
