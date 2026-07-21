import { describe, expect, it } from 'vitest';

import {
  activeRoundIndex,
  createBracket,
  isEliminated,
  otherPendingMatches,
  recordMatchResult,
  tournamentChampion,
  yourPendingMatch,
} from '../tournament/bracket';
import type { BracketMatch, TournamentPlayer } from '../tournament/types';

function players(n: number): TournamentPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    avatar: '🤖',
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

  it('marca eliminação quando o jogador perde', () => {
    let b = createBracket(players(4), 4);
    b = recordMatchResult(b, match(b.rounds, 0, 0).id, 5, 9); // p0 (você) perde
    expect(isEliminated(b, 'p0')).toBe(true);
    expect(yourPendingMatch(b, 'p0')).toBeNull();
  });
});
