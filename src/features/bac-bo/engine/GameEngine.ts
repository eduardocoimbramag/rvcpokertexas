import type { BlackjackRoundState, Match, PlayerAction, RoundOutcome } from './types';

/**
 * Contrato da engine do jogo. A UI conversa apenas com esta interface —
 * hoje implementada por `LocalBlackjackGameEngine`, futuramente por
 * `ApiBlackjackGameEngine` sem nenhuma mudança na camada visual.
 *
 * Todos os métodos são assíncronos de propósito: o contrato já nasce
 * compatível com uma implementação remota. A rodada é INTERATIVA:
 * `beginRound` distribui as cartas e `act` avança a mão do jogador até a
 * rodada se resolver sozinha (o bot adversário joga dentro da engine no
 * fechamento, e é lá que a última carta de cada um vira).
 */
export interface GameEngine {
  /**
   * Procura um oponente para a partida.
   * @throws {GameEngineError} `invalid-stake` se o stake for inválido.
   * @throws {GameEngineError} `aborted` se o sinal for cancelado durante a busca.
   */
  findMatch(params: FindMatchParams): Promise<Match>;

  /**
   * Fixa o stake negociado de uma partida antes da rodada começar.
   * Chamado ao fim da mesa de negociação — o valor acordado passa a ser
   * a verdade da engine (payout, netChange e histórico derivam dele).
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `invalid-stake` se o stake for inválido.
   */
  setStake(params: SetStakeParams): Promise<Match>;

  /**
   * Distribui as cartas de uma nova rodada. Se o jogador receber um
   * blackjack natural não há o que decidir: a rodada volta já `settled`,
   * com o `result` completo.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   */
  beginRound(params: BeginRoundParams): Promise<BlackjackRoundState>;

  /**
   * Aplica uma ação do jogador à rodada em andamento. Quando a mão do
   * jogador termina (parou, estourou ou fez 21), a engine joga o bot
   * adversário e devolve o estado `settled` com o `result` — a UI nunca
   * calcula totais, vencedor ou payout: apenas exibe.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `illegal-action` se não houver rodada em
   *   andamento ou a rodada já estiver resolvida.
   */
  act(params: ActParams): Promise<BlackjackRoundState>;
}

export interface FindMatchParams {
  /**
   * Stake inicial da partida. Opcional desde a mesa de negociação: a
   * busca acontece ANTES de o valor existir — a engine abre a partida
   * com o stake mínimo e `setStake` grava o valor acordado depois.
   */
  stake?: number;
  /** Permite cancelar a busca (botão "cancelar" do matchmaking). */
  signal?: AbortSignal;
}

export interface SetStakeParams {
  matchId: string;
  /** Valor acordado na negociação (inteiro ≥ stake mínimo). */
  stake: number;
}

export interface BeginRoundParams {
  matchId: string;
  /**
   * Resultado forçado via cartas empilhadas — aceito apenas quando a
   * engine roda com `allowForcedOutcomes` (DevTools/testes). Ignorado em
   * produção.
   */
  forcedOutcome?: RoundOutcome;
}

export interface ActParams {
  matchId: string;
  action: PlayerAction;
}

export type GameEngineErrorCode =
  | 'invalid-stake'
  | 'match-not-found'
  | 'illegal-action'
  | 'aborted'
  | 'internal';

/** Erro tipado da engine, com código estável para a UI mapear mensagens. */
export class GameEngineError extends Error {
  readonly code: GameEngineErrorCode;

  constructor(code: GameEngineErrorCode, message: string) {
    super(message);
    this.name = 'GameEngineError';
    this.code = code;
  }
}
