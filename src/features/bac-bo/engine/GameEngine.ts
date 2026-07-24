import type { Match, RoundOutcome, RoundResult } from './types';

/**
 * Contrato da engine do jogo. A UI conversa apenas com esta interface —
 * hoje implementada por `LocalBacBoGameEngine`, futuramente por
 * `ApiBacBoGameEngine` sem nenhuma mudança na camada visual.
 *
 * Todos os métodos são assíncronos de propósito: o contrato já nasce
 * compatível com uma implementação remota.
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
   * Executa a rodada de uma partida e devolve o resultado resolvido.
   * A UI nunca calcula somas, vencedor ou payout — apenas exibe este objeto.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   */
  playRound(params: PlayRoundParams): Promise<RoundResult>;
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

export interface PlayRoundParams {
  matchId: string;
  /**
   * Resultado forçado — aceito apenas quando a engine roda com
   * `allowForcedOutcomes` (DevTools/testes). Ignorado em produção.
   */
  forcedOutcome?: RoundOutcome;
}

export type GameEngineErrorCode = 'invalid-stake' | 'match-not-found' | 'aborted' | 'internal';

/** Erro tipado da engine, com código estável para a UI mapear mensagens. */
export class GameEngineError extends Error {
  readonly code: GameEngineErrorCode;

  constructor(code: GameEngineErrorCode, message: string) {
    super(message);
    this.name = 'GameEngineError';
    this.code = code;
  }
}
