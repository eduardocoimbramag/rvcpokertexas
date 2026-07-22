/**
 * Durações canônicas do fluxo de jogo, em milissegundos.
 * Store e animações leem daqui para permanecerem sincronizados.
 */

/** Acomodação do dado após o copo parar (duration do Die3D: 0.9s). */
const DIE_SETTLE_MS = 900;
/** Respiro entre o último dado assentar e o banner de resultado. */
const REVEAL_BREATH_MS = 700;
/**
 * Intervalo entre a parada de cada copo na revelação. Longo de
 * propósito: cada dado é um "beat" dramático próprio, com tempo para o
 * jogador refazer a conta antes do próximo parar.
 */
const REVEAL_STAGGER_MS = 1100;

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
   * dourada subir e do flare no VS queimar antes do cara-ou-coroa.
   */
  confirmLockInMs: 1600,
  /** Cara-ou-coroa: apresentação do lado sorteado para o jogador. */
  coinIntroMs: 1600,
  /** Voo completo da moeda: subida + giros + queda + quique. */
  coinTossMs: 2600,
  /** Veredito do sorteio na tela antes da escolha de cor. */
  coinResultMs: 1700,
  /** Oponente vencedor "pensando" e anunciando a cor escolhida. */
  coinBotPickMs: 2200,
  /** Respiro após a escolha (de qualquer lado) antes do countdown. */
  coinPickedMs: 1100,
  /** Intervalo entre os ticks do countdown (5 → 1). */
  countdownTickMs: 900,
  /** Duração do giro dos dados antes da revelação. */
  rollingMs: 2000,
  /**
   * Intervalo entre a parada de cada copo na revelação, na ordem
   * dramática: azul de baixo → vermelho de baixo → vermelho de cima →
   * azul de cima.
   */
  revealStaggerMs: REVEAL_STAGGER_MS,
  /**
   * Pausa entre a revelação e o resultado final, derivada do stagger
   * para nunca dessincronizar: 3 × stagger (último copo a parar) +
   * acomodação do dado (Die3D) + respiro antes do banner.
   */
  revealMs: 3 * REVEAL_STAGGER_MS + DIE_SETTLE_MS + REVEAL_BREATH_MS,
} as const;

/** Valor inicial do countdown falado (5 → 1) antes da rolagem. */
export const COUNTDOWN_START = 5;

/** Máximo de rodadas mantidas no histórico persistido. */
export const HISTORY_LIMIT = 50;
