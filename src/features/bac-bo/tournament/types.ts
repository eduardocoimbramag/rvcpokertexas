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

/**
 * Resumo de uma sala anunciada no navegador. Privada NÃO é sinônimo de
 * escondida: a sala aparece na lista como qualquer outra, só que com
 * cadeado — quem não tiver a senha não passa da porta.
 */
export interface LobbyListing {
  id: string;
  name: string;
  hostName: string;
  size: TournamentSize;
  filled: number;
  /** Taxa de entrada por jogador; cobrada só de quem perde. */
  fee: number;
  visibility: LobbyVisibility;
  /** Senha de 4 dígitos da sala privada; vazia nas públicas. */
  password: string;
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
  /**
   * Disputa do 3º lugar entre os dois perdedores da semifinal. Fica fora
   * de `rounds` de propósito: não é um degrau da escada (ninguém sobe
   * dela para a final), é uma partida à parte que decide quem fica com o
   * bronze. Jogada ANTES da final, para o torneio fechar com o título.
   */
  thirdPlace: BracketMatch | null;
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
