/**
 * Tipos do modo Torneio. Como todo o app é local/simulado, os "outros
 * jogadores" são bots convincentes; a estrutura, porém, espelha o que um
 * backend real entregaria — participantes, chaveamento, salas e chat.
 */

/**
 * Formato da sala, escolhido na CRIAÇÃO e imutável dali em diante:
 *
 * - `bracket` — chaveamento mata-mata: duelos 1v1 em escada até a final,
 *   com pódio premiado (50/30/20).
 * - `table`   — MESA ÚNICA: todos sentados na mesma mesa, rodada após
 *   rodada de 21, melhor de 3 (o primeiro a vencer 3 rodadas leva 90%
 *   do bolo). Não há pódio: é o campeão e o resto.
 */
export type TournamentFormat = 'bracket' | 'table';

/** Opções de formato na folha de criação, na ordem de exibição. */
export const TOURNAMENT_FORMATS: readonly TournamentFormat[] = ['bracket', 'table'];

/** Nome do formato como a interface o chama. */
export function formatLabel(format: TournamentFormat): string {
  return format === 'bracket' ? 'Chaveamento' : 'Mesa única';
}

/**
 * Tamanhos do chaveamento: potências de 2, porque a escada precisa
 * pares exatos em toda rodada.
 */
export type BracketSize = 4 | 8 | 16;

/**
 * Tamanhos da mesa única: de 3 a 6 assentos. O teto é 6 porque é quanto
 * cabe no feltro com as mãos legíveis (ver TableArena); o piso é 3 —
 * com 2 a mesa seria um duelo, que é o que o chaveamento já faz.
 */
export type TableSize = 3 | 4 | 5 | 6;

/**
 * Tamanho de sala. O quantitativo é escolhido na CRIAÇÃO da sala e não
 * muda mais: é o contrato com quem entrou (formato, premiação e taxa
 * derivam dele).
 */
export type TournamentSize = BracketSize | TableSize;

export const BRACKET_SIZES: readonly BracketSize[] = [4, 8, 16];
export const TABLE_SIZES: readonly TableSize[] = [3, 4, 5, 6];

/** Opções de tamanho válidas para um formato. */
export function sizesFor(format: TournamentFormat): readonly TournamentSize[] {
  return format === 'bracket' ? BRACKET_SIZES : TABLE_SIZES;
}

/** Tamanho pré-selecionado ao trocar de formato na folha de criação. */
export function defaultSizeFor(format: TournamentFormat): TournamentSize {
  return format === 'bracket' ? 8 : 4;
}

/**
 * Rodadas que um jogador precisa vencer para levar a MESA ÚNICA. É o
 * "melhor de 3" da casa: quem chega a 3 primeiro fecha a série.
 */
export const TABLE_TARGET_WINS = 3;

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
  /** Chaveamento ou mesa única — o que se vai jogar lá dentro. */
  format: TournamentFormat;
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
  size: BracketSize;
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
