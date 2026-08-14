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
export type TournamentFormat = 'bracket' | 'table' | 'cash';

/** Opções de formato na folha de criação, na ordem de exibição. */
export const TOURNAMENT_FORMATS: readonly TournamentFormat[] = ['cash', 'bracket', 'table'];

/** Nome do formato como a interface o chama. */
/**
 * A DESCRIÇÃO DE UMA MESA DE POKER pelo número de lugares.
 *
 * "Mesa de 6" e não "6-max": quem senta quer saber contra quantos vai
 * jogar, e "max" é jargão de quem já sabe. O número muda o jogo de
 * verdade — numa mesa de três a mão média que se joga é muito mais larga
 * que numa de seis, porque há menos mãos para bater.
 */
export function seatsLabel(seats: number): string {
  return `Mesa de ${seats}`;
}

/** O que uma mesa de N lugares promete a quem lê a vitrine. */
export function seatsHint(seats: number): string {
  if (seats <= 3) return 'Mesa curta: poucas mãos entre as suas, muita mão jogada.';
  if (seats === 6) return 'Mesa cheia: seis lugares, mão após mão.';
  return `${seats} lugares, mão após mão.`;
}

export function formatLabel(format: TournamentFormat): string {
  if (format === 'cash') return 'Poker 6-max';
  return format === 'bracket' ? 'Chaveamento' : 'Mesa única';
}

/**
 * O CASH tem economia própria, e é por isso que ele não é "mais um
 * tamanho" dos formatos antigos:
 *
 * - nos dois formatos de torneio a taxa é cobrada de quem PERDE e vira
 *   prêmio para quem vence — há um campeão e a sala acaba;
 * - no cash cada um COMPRA fichas (o buy-in), paga o blind a cada mão e
 *   sai quando quiser levando o que sobrou. Não há prêmio nem campeão.
 *
 * Misturar os dois na mesma folha de criação faria a taxa significar
 * duas coisas na mesma tela.
 */
export function isCash(format: TournamentFormat): boolean {
  return format === 'cash';
}

/**
 * COMO A MESA TRATA QUEM CHEGA DEPOIS de a partida começar.
 *
 * - `open`   — a sala continua na vitrine e qualquer um senta a qualquer
 *   momento, comprando o mesmo buy-in de quem já estava.
 * - `closed` — fechada a jogadores NOVOS, não a quem já estava: uma
 *   cadeira que vaga por queda de conexão fica reservada (ver
 *   `SEAT_HOLD_MS`). Sendo cash, ela não tem campeão nem fim natural —
 *   cada um sai quando quiser, e a mesa encerra sozinha quando sobra
 *   menos de dois (ver `TABLE_MIN_ALIVE`).
 */
export type TableMode = 'open' | 'closed';

export const TABLE_MODES: readonly TableMode[] = ['open', 'closed'];

export function tableModeLabel(mode: TableMode): string {
  return mode === 'open' ? 'Mesa aberta' : 'Mesa fechada';
}

/** A frase que explica o modo na hora da escolha. */
export function tableModeHint(mode: TableMode): string {
  return mode === 'open'
    ? 'Fica na lista. Qualquer um senta a qualquer momento.'
    : 'Ninguém entra depois de começar. Você sai quando quiser.';
}

/** Assentos de uma mesa de cash: seis, e só seis. */
/**
 * Os tamanhos de mesa de poker: de três a seis lugares.
 *
 * O PISO É TRÊS, e é regra de jogo, não de layout. Com dois jogadores o
 * Hold'em vira heads-up, que é outro jogo: o botão paga a small blind, a
 * ordem da palavra inverte no pré-flop e a mão certa de se jogar muda por
 * completo (ver `blindSeatsOf` e `firstToActOn`). A máquina do anel sabe
 * jogar heads-up — e é testada nele —, mas uma MESA de cash que se abre
 * para dois é uma mesa que já acabou.
 *
 * O TETO É SEIS porque é quanto cabe no feltro com as mãos legíveis: com
 * sete assentos a carta do rival cai abaixo do tamanho em que se lê o
 * naipe num telefone.
 */
export const CASH_MIN_SEATS = 3;
export const CASH_MAX_SEATS = 6;

/**
 * O tamanho com que a folha de criação abre.
 *
 * Seis: é a mesa cheia, e é o que alguém que abre uma sala de poker
 * espera. Continua sendo o valor padrão das funções de geometria — elas
 * recebem o total como parâmetro, e o padrão só existe para quem chama
 * de um teste.
 */
export const CASH_SEATS = 6;

/**
 * Buy-in e blind pré-selecionados na folha de criação.
 *
 * A razão entre os dois não é estética: 1.000 de compra para um blind de
 * 20 são 50 blinds na frente, que é a profundidade em que o poker de
 * verdade acontece. Muito menos e toda mão vira all-in; muito mais e a
 * sessão não acaba nunca.
 */
export const CASH_DEFAULT_BUY_IN = 1000;
export const CASH_DEFAULT_BLIND = 20;

/** Piso do blind: abaixo disto ele não pressiona ninguém. */
export const CASH_MIN_BLIND = 5;

/**
 * Quantos blinds o buy-in precisa cobrir, no mínimo. Sentar com menos de
 * 20 blinds não é jogar poker — é esperar uma mão para ir de all-in.
 */
export const CASH_MIN_BLINDS_DEEP = 20;

/**
 * Quanto uma cadeira fica RESERVADA para quem caiu, em ms. Mesa fechada
 * é fechada a novos, não a quem já estava — sem isto, uma queda de sinal
 * esvazia a mesa. Ver docs/multiplayer.md §6.3.
 */
export const SEAT_HOLD_MS = 90_000;

/**
 * Abaixo disto a mesa encerra sozinha e liquida para quem ficou. Um cash
 * game não tem fim natural, então o fim precisa ser construído: ninguém
 * pode ficar sozinho no feltro esperando alguém que não vem.
 */
export const TABLE_MIN_ALIVE = 2;

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
/** O cash é sempre de seis: não há régua a escolher. */
/** De três a seis lugares — a régua da mesa de poker. */
export const CASH_SIZES: readonly TournamentSize[] = [3, 4, 5, 6];

/** Opções de tamanho válidas para um formato. */
export function sizesFor(format: TournamentFormat): readonly TournamentSize[] {
  if (format === 'cash') return CASH_SIZES;
  return format === 'bracket' ? BRACKET_SIZES : TABLE_SIZES;
}

/** Tamanho pré-selecionado ao trocar de formato na folha de criação. */
export function defaultSizeFor(format: TournamentFormat): TournamentSize {
  if (format === 'cash') return CASH_SEATS;
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
  /** Chaveamento, mesa única ou poker cash — o que se joga lá dentro. */
  format: TournamentFormat;
  size: TournamentSize;
  filled: number;
  /** Taxa de entrada por jogador; cobrada só de quem perde. NÃO vale no cash. */
  fee: number;
  visibility: LobbyVisibility;
  /** Senha de 4 dígitos da sala privada; vazia nas públicas. */
  password: string;
  /* ---- Só no formato `cash` ---- */
  /** Aberta ou fechada a quem chega depois de começar. */
  mode: TableMode;
  /** Fichas com que cada um SENTA. Anunciado no cartão da mesa aberta. */
  buyIn: number;
  /** O que se paga por mão. Anunciado no cartão da mesa aberta. */
  blind: number;
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
