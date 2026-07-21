import { createId } from '@/shared/lib/ids';

import type { Bracket, BracketMatch, TournamentPlayer, TournamentSize } from './types';

/**
 * Lógica pura do chaveamento estilo mata-mata (copa do mundo). Sem efeito
 * colateral: recebe participantes/estado e devolve novos valores. O store
 * e a UI nunca recalculam nada disto por conta própria.
 */

/** Monta o chaveamento vazio: 1ª fase pareada, fases seguintes a preencher. */
export function createBracket(players: readonly TournamentPlayer[], size: TournamentSize): Bracket {
  const seeded = players.slice(0, size);
  const rounds: BracketMatch[][] = [];

  // Primeira fase: pares (0v1, 2v3, …).
  const first: BracketMatch[] = [];
  for (let slot = 0; slot < size / 2; slot += 1) {
    first.push({
      id: createId(),
      round: 0,
      slot,
      a: seeded[slot * 2] ?? null,
      b: seeded[slot * 2 + 1] ?? null,
      scoreA: null,
      scoreB: null,
      winnerId: null,
      played: false,
    });
  }
  rounds.push(first);

  // Fases seguintes: partidas vazias até os vencedores subirem.
  let count = first.length / 2;
  let round = 1;
  while (count >= 1) {
    const matches: BracketMatch[] = [];
    for (let slot = 0; slot < count; slot += 1) {
      matches.push({
        id: createId(),
        round,
        slot,
        a: null,
        b: null,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        played: false,
      });
    }
    rounds.push(matches);
    if (count === 1) break;
    count /= 2;
    round += 1;
  }

  return { size, rounds };
}

/** Vencedor de uma partida (ou null se não decidida). */
export function matchWinner(match: BracketMatch): TournamentPlayer | null {
  if (!match.winnerId) return null;
  return [match.a, match.b].find((p) => p?.id === match.winnerId) ?? null;
}

/** Índice da rodada em andamento: a primeira que ainda não terminou. */
export function activeRoundIndex(bracket: Bracket): number {
  const index = bracket.rounds.findIndex((round) => round.some((m) => !m.played));
  return index === -1 ? bracket.rounds.length - 1 : index;
}

/** Verdadeiro quando a rodada tem todas as partidas jogadas. */
export function isRoundComplete(round: readonly BracketMatch[]): boolean {
  return round.every((m) => m.played);
}

/**
 * Registra o resultado de uma partida (somas dos dados). Empate deve ter
 * sido desempatado antes (mata-mata não admite empate) — se ainda assim
 * vier igual, o lado A avança por critério de assento.
 */
export function recordMatchResult(
  bracket: Bracket,
  matchId: string,
  scoreA: number,
  scoreB: number,
): Bracket {
  const rounds = bracket.rounds.map((round) =>
    round.map((m) => {
      if (m.id !== matchId || !m.a || !m.b) return m;
      const winnerId = scoreB > scoreA ? m.b.id : m.a.id;
      return { ...m, scoreA, scoreB, winnerId, played: true };
    }),
  );
  return propagateWinners({ ...bracket, rounds });
}

/**
 * Sobe os vencedores das rodadas concluídas para preencher a próxima —
 * idempotente, pode ser chamada a cada resultado registrado.
 */
export function propagateWinners(bracket: Bracket): Bracket {
  const rounds = bracket.rounds.map((round) => round.map((m) => ({ ...m })));

  for (let r = 0; r < rounds.length - 1; r += 1) {
    const round = rounds[r];
    const next = rounds[r + 1];
    if (!round || !next || !isRoundComplete(round)) break;
    round.forEach((match, i) => {
      const winner = matchWinner(match);
      const target = next[Math.floor(i / 2)];
      if (!target) return;
      if (i % 2 === 0) target.a = winner;
      else target.b = winner;
    });
  }

  return { ...bracket, rounds };
}

/** Campeão do torneio, se a final já foi decidida. */
export function tournamentChampion(bracket: Bracket): TournamentPlayer | null {
  const final = bracket.rounds[bracket.rounds.length - 1]?.[0];
  return final ? matchWinner(final) : null;
}

/** A partida do jogador na rodada atual que ainda não foi jogada. */
export function yourPendingMatch(bracket: Bracket, youId: string): BracketMatch | null {
  const round = bracket.rounds[activeRoundIndex(bracket)] ?? [];
  return round.find((m) => !m.played && (m.a?.id === youId || m.b?.id === youId)) ?? null;
}

/** Partidas da rodada atual que não são suas e faltam jogar (para simular). */
export function otherPendingMatches(bracket: Bracket, youId: string): BracketMatch[] {
  const round = bracket.rounds[activeRoundIndex(bracket)] ?? [];
  return round.filter((m) => !m.played && m.a?.id !== youId && m.b?.id !== youId && m.a && m.b);
}

/** Verdadeiro se o jogador já foi eliminado (perdeu uma partida jogada). */
export function isEliminated(bracket: Bracket, youId: string): boolean {
  for (const round of bracket.rounds) {
    for (const m of round) {
      const inMatch = m.a?.id === youId || m.b?.id === youId;
      if (m.played && inMatch && m.winnerId !== youId) return true;
    }
  }
  return false;
}
