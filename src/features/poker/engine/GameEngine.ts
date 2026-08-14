/**
 * O que TODA engine de mesa compartilha: os parâmetros de entrada na
 * partida e o erro tipado que a UI sabe traduzir.
 *
 * Este arquivo já foi o contrato do duelo de 21 — a interface
 * `GameEngine` inteira, com `beginRound`/`commit`/`resolveTurn`. Aquele
 * jogo saiu do projeto, e o que sobrou é o que o poker também usa e
 * continua usando: entrar numa partida (`findMatch`), fixar o valor
 * acordado (`setStake`) e falhar de um jeito que a interface consiga
 * mapear (`GameEngineError`).
 *
 * O contrato do poker propriamente dito mora em `poker/PokerEngine.ts`,
 * que importa estes dois parâmetros daqui — é por isso que eles não
 * foram simplesmente movidos para lá: a próxima engine de mesa vai
 * precisar dos mesmos, e é aqui que ela os encontra.
 */

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
