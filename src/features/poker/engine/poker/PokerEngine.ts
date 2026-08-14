import type { FindMatchParams, SetStakeParams } from '../GameEngine';
import type { ForcedPokerDeal, PokerAction, PokerRoundState, PokerSession } from './types';
import type { Match } from '../types';

/**
 * Contrato da engine de TEXAS HOLD'EM 1v1. A UI conversa apenas com esta
 * interface — hoje implementada por `LocalPokerEngine`, futuramente por
 * uma `ApiPokerEngine` sem nenhuma mudança na camada visual.
 *
 * O matchmaking e a negociação do valor são os MESMOS do resto do clube
 * (`FindMatchParams`, `SetStakeParams` vêm de `../GameEngine`): procurar
 * rival e combinar quanto vale a mesa não depende do jogo que se joga
 * depois.
 *
 * A MESA É UMA SESSÃO, não uma mão: os stacks sobrevivem de uma para a
 * seguinte, o botão passa de lado a cada distribuição e a mesa só fecha
 * quando alguém não tem mais como pagar a entrada ou quando o jogador se
 * levanta (`leaveTable`). Quem informa qual dos dois aconteceu é a
 * `session` que volta dentro de cada resultado.
 *
 * A MÃO ANDA EM DOIS TEMPOS, e essa separação é o coração do contrato:
 *
 * - `act` é o lance DO JOGADOR, e só ele;
 * - `advance` é a MESA seguindo sozinha — o rival jogando a vez dele, o
 *   flop abrindo, o showdown virando as cartas.
 *
 * Separá-los é o que permite à UI dar um beat a cada acontecimento em vez
 * de receber meia mão pronta num objeto só. Quem chama `advance` decide
 * o RITMO da mesa; quem chama `act` decide o JOGO.
 */
export interface PokerEngine {
  /**
   * Procura um oponente para a partida.
   * @throws {GameEngineError} `invalid-stake` se o stake for inválido.
   * @throws {GameEngineError} `aborted` se o sinal for cancelado durante a busca.
   */
  findMatch(params: FindMatchParams): Promise<Match>;

  /**
   * Fixa o stake negociado — que no poker é o STACK com que os dois
   * entram na mão, e do qual saem os blinds.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `invalid-stake` se o stake for inválido.
   */
  setStake(params: SetStakeParams): Promise<Match>;

  /**
   * Embaralha, distribui as duas fechadas de cada lado, cobra a ENTRADA
   * dos dois e abre o pré-flop. Na primeira chamada a mesa se abre com o
   * buy-in dos dois lados; nas seguintes ela continua de onde parou.
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `illegal-action` se já houver mão em andamento
   *   ou se a mesa já tiver fechado.
   */
  beginHand(params: BeginHandParams): Promise<PokerRoundState>;

  /**
   * Executa o lance DO JOGADOR.
   * @throws {GameEngineError} `illegal-action` se não for a vez dele, se a
   *   ação não estiver entre as legais ou se o aumento estiver fora dos
   *   limites da rua.
   */
  act(params: ActParams): Promise<PokerRoundState>;

  /**
   * A MESA dá o próximo passo sozinha: o rival joga a vez dele (quando
   * `toAct === 'opponent'`) ou a mesa abre a rua seguinte / vai ao
   * showdown (quando `toAct === null`).
   * @throws {GameEngineError} `illegal-action` se a vez for do jogador —
   *   a mesa não joga por quem ainda tem uma decisão a tomar.
   */
  advance(params: AdvanceParams): Promise<PokerRoundState>;

  /**
   * O jogador LEVANTA DA MESA. Fecha a sessão e devolve o retrato final
   * dela — é com ele que o caixa é feito (ver `cashOutValue`).
   * @throws {GameEngineError} `match-not-found` se a partida não existir.
   * @throws {GameEngineError} `illegal-action` se houver mão em andamento:
   *   sair no meio de uma mão abandonaria fichas já postas no meio.
   */
  leaveTable(params: LeaveTableParams): Promise<PokerSession>;
}

export interface LeaveTableParams {
  matchId: string;
}

export interface BeginHandParams {
  matchId: string;
  /**
   * Mão empilhada — aceita apenas quando a engine roda com
   * `allowForcedDeals` (DevTools/testes). Ignorada em produção.
   */
  forcedDeal?: ForcedPokerDeal;
}

export interface ActParams {
  matchId: string;
  action: PokerAction;
  /**
   * Total a que o jogador aumenta NESTA rua (não o incremento). Só é lido
   * em `raise`; fora dos limites, a engine recusa.
   */
  to?: number;
  /** A mesa jogou por ele: o relógio da vez zerou. */
  timedOut?: boolean;
}

export interface AdvanceParams {
  matchId: string;
}
