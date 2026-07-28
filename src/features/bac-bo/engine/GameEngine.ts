import type { BlackjackRoundState, Match, PlayerAction, RoundOutcome } from './types';

/**
 * Contrato da engine do jogo. A UI conversa apenas com esta interface —
 * hoje implementada por `LocalBlackjackGameEngine`, futuramente por
 * `ApiBlackjackGameEngine` sem nenhuma mudança na camada visual.
 *
 * Todos os métodos são assíncronos de propósito: o contrato já nasce
 * compatível com uma implementação remota. A rodada é INTERATIVA e a vez
 * é SIMULTÂNEA: `beginRound` distribui as cartas, `commit` trava a
 * escolha do jogador sem mexer na mesa e `resolveTurn` executa os dois
 * lances de uma vez. Nenhum dos dois lados vê a escolha do outro antes
 * disso — e a última carta de cada um só vira no showdown.
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
   * Distribui as cartas de uma nova rodada e abre a PRIMEIRA vez. Um
   * blackjack natural do jogador fecha a mão dele na distribuição: a
   * rodada volta na vez do rival (ou já `settled`, se ninguém tiver o
   * que decidir).
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   */
  beginRound(params: BeginRoundParams): Promise<BlackjackRoundState>;

  /**
   * TRAVA a escolha do jogador para a vez corrente. Nada acontece na
   * mesa aqui: a carta só sai — e o rival só mostra o que escolheu — no
   * `resolveTurn`. É o que faz a vez ser simultânea de verdade.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `illegal-action` se a mão do jogador já
   *   fechou, se ele já travou uma escolha ou se a rodada acabou.
   */
  commit(params: CommitParams): Promise<BlackjackRoundState>;

  /**
   * Fecha a vez: executa os DOIS lances ao mesmo tempo e devolve o que
   * cada lado fez (`lastTurn`). Quem não travou escolha a tempo tem a
   * mão parada pela mesa — o desfecho seguro de um relógio que zerou.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `illegal-action` se a rodada já acabou.
   */
  resolveTurn(params: ResolveTurnParams): Promise<BlackjackRoundState>;
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

export interface CommitParams {
  matchId: string;
  action: PlayerAction;
}

export interface ResolveTurnParams {
  matchId: string;
}

export type GameEngineErrorCode =
  'invalid-stake' | 'match-not-found' | 'illegal-action' | 'aborted' | 'internal';

/** Erro tipado da engine, com código estável para a UI mapear mensagens. */
export class GameEngineError extends Error {
  readonly code: GameEngineErrorCode;

  constructor(code: GameEngineErrorCode, message: string) {
    super(message);
    this.name = 'GameEngineError';
    this.code = code;
  }
}
