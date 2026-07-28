/**
 * Tipos do modo Torneio. Como todo o app é local/simulado, os "outros
 * jogadores" são bots convincentes; a estrutura, porém, espelha o que um
 * backend real entregaria — participantes, chaveamento, salas e chat.
 */

/**
 * Tamanhos de sala suportados. O quantitativo é escolhido na CRIAÇÃO da
 * sala e não muda mais: é o contrato com quem entrou (chaveamento,
 * premiação e taxa derivam dele).
 */
export type TournamentSize = 4 | 8 | 16;

/** Opções oferecidas na folha de criação, na ordem de exibição. */
export const TOURNAMENT_SIZES: readonly TournamentSize[] = [4, 8, 16];
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
 * A porta da sala privada: sem o código do anfitrião não se entra. É a
 * regra ÚNICA da senha — a usam tanto a folha que a pede quanto o
 * `joinLobby`, então nenhum caminho de UI consegue pular a checagem, e
 * perguntar "a senha confere?" (para só então confirmar a entrada) não
 * exige entrar na sala antes.
 */
export function lobbyPasswordMatches(lobby: LobbyListing, password: string): boolean {
  return lobby.visibility !== 'private' || password.trim() === lobby.password;
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
 * bem também no overlay de avanço ("Você avança para Quartas"). No
 * plural, como se fala: oitavas e quartas de final.
 */
export function roundLabel(matchesInRound: number): string {
  switch (matchesInRound) {
    case 8:
      return 'Oitavas';
    case 4:
      return 'Quartas';
    case 2:
      return 'Semi';
    case 1:
      return 'Final';
    default:
      return 'Fase';
  }
}
