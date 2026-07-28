/**
 * Durações canônicas do fluxo de jogo, em milissegundos.
 * Store e animações leem daqui para permanecerem sincronizados.
 */

/** Intervalo entre cada carta que sai do baralho na distribuição. */
const DEAL_CARD_STAGGER_MS = 430;
/** Voo + acomodação de uma carta na mesa (duration do Card3D). */
const CARD_SETTLE_MS = 550;
/** Respiro entre a última carta assentar e a vez do jogador abrir. */
const DEAL_BREATH_MS = 500;
/** Cartas distribuídas na abertura: 2 para cada duelista. */
const OPENING_CARDS = 4;

export const TIMINGS = {
  /**
   * Apresentação de duelo (jogador → VS → oponente) antes da
   * confirmação, em ritmo de matchup de jogo de luta — cada beat
   * respira. Orçamento: última placa assenta em ~2.5s + respiro.
   */
  foundSplashMs: 3400,
  /** Janela em que o oponente simulado confirma o duelo (aleatório). */
  opponentConfirmMinMs: 900,
  opponentConfirmMaxMs: 2400,
  /**
   * Beat de "duelo travado" após ambos confirmarem: tempo da faixa
   * dourada subir e do flare no VS queimar antes da mesa de negociação.
   */
  confirmLockInMs: 1600,
  /**
   * Beat entre o toque em "Iniciar partida" (acordo fechado) e o
   * countdown: o selo de início respira antes do corte de cena.
   */
  negotiationStartMs: 1000,
  /** Intervalo entre os ticks do countdown (5 → 1). */
  countdownTickMs: 900,
  /** Intervalo entre cada carta da distribuição inicial. */
  dealCardMs: DEAL_CARD_STAGGER_MS,
  /**
   * Distribuição completa da rodada, derivada do stagger para nunca
   * dessincronizar: 4 cartas em fila + acomodação da última (Card3D) +
   * respiro antes de a vez do jogador abrir.
   */
  dealMs: OPENING_CARDS * DEAL_CARD_STAGGER_MS + CARD_SETTLE_MS + DEAL_BREATH_MS,
  /**
   * Beat após a última decisão do jogador (a carta final assenta, o
   * painel de ações recolhe) antes de a vez do rival começar.
   */
  actionResolveMs: 700,
  /** Cada carta que o rival pede na vez dele é um beat próprio. */
  opponentHitMs: 950,
  /**
   * Piso da vez do rival: mesmo sem pedir carta, ele "pensa" por um
   * instante — a vez dele nunca é um corte seco.
   */
  opponentTurnMinMs: 1200,
  /**
   * Showdown: as duas cartas ocultas viram ao mesmo tempo e o quadro
   * respira antes do veredito. É o momento clássico da mesa.
   */
  revealMs: 1500,
  /**
   * Veredito da rodada em tela (totais e situação lado a lado) antes do
   * desfecho da partida.
   */
  settleMs: 1800,
  /**
   * Beat do empate: no mata-mata do torneio ninguém pode empatar, então
   * o aviso respira em tela antes de a mesa distribuir de novo.
   */
  roundEndMs: 2600,
} as const;

/** Valor inicial do countdown falado (5 → 1) antes da distribuição. */
export const COUNTDOWN_START = 5;

/**
 * Intervalo mínimo entre propostas do jogador na mesa de negociação,
 * em segundos: cada proposta é um lance ponderado, não spam de valores.
 */
export const PROPOSAL_COOLDOWN_SECONDS = 10;

/** Máximo de partidas mantidas no histórico persistido. */
export const HISTORY_LIMIT = 50;
