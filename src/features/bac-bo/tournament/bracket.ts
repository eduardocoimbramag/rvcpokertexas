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

  // Disputa do 3º lugar: nasce vazia e recebe os perdedores da semi.
  const thirdPlace: BracketMatch = {
    id: createId(),
    round: rounds.length - 1,
    slot: 1,
    a: null,
    b: null,
    scoreA: null,
    scoreB: null,
    winnerId: null,
    played: false,
  };

  return { size, rounds, thirdPlace };
}

/** Índice da rodada da semifinal (a que precede a final). */
function semifinalIndex(bracket: Bracket): number {
  return bracket.rounds.length - 2;
}

/** Todas as partidas do torneio, inclusive a do 3º lugar. */
function allMatches(bracket: Bracket): BracketMatch[] {
  return bracket.thirdPlace
    ? [...bracket.rounds.flat(), bracket.thirdPlace]
    : bracket.rounds.flat();
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
  const decide = (m: BracketMatch): BracketMatch => {
    if (m.id !== matchId || !m.a || !m.b) return m;
    const winnerId = scoreB > scoreA ? m.b.id : m.a.id;
    return { ...m, scoreA, scoreB, winnerId, played: true };
  };
  const rounds = bracket.rounds.map((round) => round.map(decide));
  const thirdPlace = bracket.thirdPlace ? decide(bracket.thirdPlace) : null;
  return propagateWinners({ ...bracket, rounds, thirdPlace });
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

  // A semi despacha os vencedores para a final e os PERDEDORES para a
  // disputa do 3º lugar — a única partida do torneio que se preenche
  // por derrota.
  let thirdPlace = bracket.thirdPlace ? { ...bracket.thirdPlace } : null;
  const semi = rounds[rounds.length - 2];
  if (thirdPlace && semi && isRoundComplete(semi) && semi.length === 2) {
    const losers = semi.map((m) => [m.a, m.b].find((p) => p && p.id !== m.winnerId) ?? null);
    thirdPlace = { ...thirdPlace, a: losers[0] ?? null, b: losers[1] ?? null };
  }

  return { ...bracket, rounds, thirdPlace };
}

/**
 * Partidas em jogo AGORA. Entre a semifinal e a final entra a disputa do
 * 3º lugar: ela é resolvida antes, para o torneio terminar no título e
 * não numa partida sobrando depois da coroação.
 */
export function currentMatches(bracket: Bracket): BracketMatch[] {
  const index = activeRoundIndex(bracket);
  const round = bracket.rounds[index] ?? [];
  const third = bracket.thirdPlace;
  const atFinal = index === bracket.rounds.length - 1;
  if (atFinal && third && third.a && third.b && !third.played) return [third];
  return round;
}

/** Verdadeiro quando a partida é a disputa do 3º lugar. */
export function isThirdPlaceMatch(bracket: Bracket, matchId: string): boolean {
  return bracket.thirdPlace?.id === matchId;
}

/** Campeão do torneio, se a final já foi decidida. */
export function tournamentChampion(bracket: Bracket): TournamentPlayer | null {
  const final = bracket.rounds[bracket.rounds.length - 1]?.[0];
  return final ? matchWinner(final) : null;
}

/** A partida do jogador em jogo agora que ainda não foi jogada. */
export function yourPendingMatch(bracket: Bracket, youId: string): BracketMatch | null {
  return (
    currentMatches(bracket).find((m) => !m.played && (m.a?.id === youId || m.b?.id === youId)) ??
    null
  );
}

/** Partidas em jogo que não são suas e faltam jogar (para simular). */
export function otherPendingMatches(bracket: Bracket, youId: string): BracketMatch[] {
  return currentMatches(bracket).filter(
    (m) => !m.played && m.a?.id !== youId && m.b?.id !== youId && m.a && m.b,
  );
}

/**
 * Eliminado = perdeu e não tem mais partida marcada. Perder a SEMI não
 * elimina ninguém: os dois derrotados caem na disputa do 3º lugar, que
 * ainda vale bronze (e prêmio).
 */
export function isEliminated(bracket: Bracket, youId: string): boolean {
  const inMatch = (m: BracketMatch): boolean => m.a?.id === youId || m.b?.id === youId;
  const matches = allMatches(bracket);

  const lost = matches.some((m) => m.played && inMatch(m) && m.winnerId !== youId);
  if (!lost) return false;

  // Ainda com partida marcada (a do 3º lugar já preenchida): segue vivo.
  if (matches.some((m) => !m.played && inMatch(m))) return false;

  // Acabou de perder a semi e a disputa do 3º ainda não foi montada:
  // sem esta guarda, o jogador piscaria "eliminado" entre o fim da sua
  // semifinal e o fim da outra.
  const semi = bracket.rounds[semifinalIndex(bracket)] ?? [];
  const lostSemi = semi.some((m) => m.played && inMatch(m) && m.winnerId !== youId);
  if (lostSemi && bracket.thirdPlace && !bracket.thirdPlace.played) return false;

  return true;
}

/**
 * Colocação final: 1º campeão, 2º vice, 3º e 4º pela disputa do bronze.
 * Quem cai antes da semifinal não tem colocação premiada (`null`).
 */
export function placementOf(bracket: Bracket, playerId: string): number | null {
  const final = bracket.rounds[bracket.rounds.length - 1]?.[0];
  if (final?.played) {
    if (final.winnerId === playerId) return 1;
    if (final.a?.id === playerId || final.b?.id === playerId) return 2;
  }
  const third = bracket.thirdPlace;
  if (third?.played) {
    if (third.winnerId === playerId) return 3;
    if (third.a?.id === playerId || third.b?.id === playerId) return 4;
  }
  return null;
}
