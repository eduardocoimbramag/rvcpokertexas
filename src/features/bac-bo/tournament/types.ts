/**
 * Tipos do modo Torneio. Como todo o app é local/simulado, os "outros
 * jogadores" são bots convincentes; a estrutura, porém, espelha o que um
 * backend real entregaria — participantes, chaveamento, salas e chat.
 */

export type TournamentSize = 4 | 8;
export type LobbyVisibility = 'public' | 'private';

export interface TournamentPlayer {
  id: string;
  name: string;
  avatar: string;
  /** O jogador local. */
  isYou: boolean;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  /** Mensagens do sistema (entrou, saiu, iniciou) têm estilo próprio. */
  system: boolean;
  at: number;
}

/** Resumo de uma sala pública listada no navegador de salas. */
export interface PublicLobby {
  id: string;
  name: string;
  hostName: string;
  size: TournamentSize;
  filled: number;
  /** Buy-in por jogador; o campeão leva `stake × size`. */
  stake: number;
}

/**
 * Uma partida do chaveamento. `a`/`b` ficam nulos até os vencedores da
 * rodada anterior os preencherem. `scoreA`/`scoreB` são as somas dos
 * dados (2–12) quando a partida termina.
 */
export interface BracketMatch {
  id: string;
  round: number;
  slot: number;
  a: TournamentPlayer | null;
  b: TournamentPlayer | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  played: boolean;
}

export interface Bracket {
  size: TournamentSize;
  /** rounds[0] = primeira fase (Quartas em 8, Semifinal em 4) … Final. */
  rounds: BracketMatch[][];
}

/**
 * Rótulos das fases conforme o número de partidas restantes. Curtos de
 * propósito: cabem no stepper do chaveamento sem quebrar linha e leem
 * bem também no overlay de avanço ("Você avança para Semi").
 */
export function roundLabel(matchesInRound: number): string {
  switch (matchesInRound) {
    case 4:
      return 'Quarta';
    case 2:
      return 'Semi';
    case 1:
      return 'Final';
    default:
      return 'Fase';
  }
}
