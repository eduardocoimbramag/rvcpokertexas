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
   * Apresentação de duelo (jogador → VS → oponente) depois da
   * confirmação, em ritmo de matchup de jogo de luta — cada beat
   * respira. Orçamento: última placa assenta em ~2.5s + respiro.
   */
  foundSplashMs: 3400,
  /** Janela em que o oponente simulado confirma o duelo (aleatório). */
  opponentConfirmMinMs: 900,
  opponentConfirmMaxMs: 2400,
  /**
   * Beat de "duelo travado" após ambos confirmarem: tempo da faixa
   * dourada subir e do flare no VS queimar antes da apresentação.
   */
  confirmLockInMs: 1600,
  /**
   * Beat entre a apresentação e o countdown: é o tempo do título "HORA
   * DO DUELO" entrar, assentar e respirar antes do corte de cena.
   */
  duelAnnounceMs: 2400,
  /** Intervalo entre os ticks do countdown (5 → 1). */
  countdownTickMs: 900,
  /** Intervalo entre cada carta da distribuição inicial. */
  dealCardMs: DEAL_CARD_STAGGER_MS,
  /** Quanto uma carta leva do voo até assentar (ver Card3D). */
  settleCardMs: CARD_SETTLE_MS,
  /**
   * O respiro entre a última carta assentar e a vez abrir.
   *
   * Ele já vivia dentro de `dealMs`; virou número público quando a mesa
   * de 6 precisou remontar a mesma conta com doze cartas em vez de
   * quatro (ver `dealDurationMs`). Duas contas com o mesmo respiro
   * escrito de dois jeitos sairiam de sincronia no primeiro ajuste.
   */
  dealBreathMs: DEAL_BREATH_MS,
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
  /**
   * Beat da REVELAÇÃO de uma vez: os dois lances saem juntos e ficam em
   * cena até a vez seguinte abrir. São duas linhas para ler (o seu lance
   * e o dele), então precisa de mais fôlego que um anúncio de um só.
   */
  turnRevealMs: 1900,
  /** Quanto a revelação fica em cena (um pouco além do beat). */
  revealHoldMs: 2300,
  /**
   * Janela em que o rival bate o martelo dentro dos 20 s da vez.
   * Sorteada: um adversário que decide sempre no mesmo tempo denuncia
   * que é máquina — e o suspense de não saber quando ele fecha é metade
   * da tensão de uma vez simultânea.
   */
  opponentChoiceMinMs: 1400,
  opponentChoiceMaxMs: 6000,
  /** Cada carta que o rival pede na vez dele é um beat próprio. */
  opponentHitMs: 950,
  /**
   * Janela em que o rival responde ao pedido de dobra: ele lê a mesa,
   * pesa o lance e bate o martelo. A mão do jogador fica travada nesse
   * intervalo — nada acontece na mesa enquanto a dobra está no ar.
   */
  doubleAnswerMinMs: 1300,
  doubleAnswerMaxMs: 2600,
  /** Quanto a resposta (o ✓ ou o ✗ aceso) fica em cena antes de sair. */
  doubleAnswerHoldMs: 1500,

  /* ---------- O ritmo da mão de Texas Hold'em ---------- */

  /**
   * Beat depois do lance do RIVAL. É uma notícia — "AUMENTOU PARA 240" —
   * e o jogador precisa lê-la antes de a palavra voltar para ele.
   */
  pokerMoveMs: 1250,
  /**
   * Beat depois do SEU próprio lance. Curto de propósito: você já sabe o
   * que fez, e esperar aqui só faria a mesa parecer travada.
   */
  pokerOwnMoveMs: 450,
  /** Quanto o anúncio de um lance fica no alto-falante da mesa. */
  moveHoldMs: 1800,
  /**
   * O BEAT ENTRE AS MÃOS: a placa do vencedor em cena, o pote assentando
   * nos stacks, e a mesa se preparando para distribuir de novo.
   *
   * É o respiro que separa uma mão da seguinte numa sessão. Curto demais
   * e a mesa atropela quem ainda está lendo quem levou o pote; longo
   * demais e a sessão vira uma sequência de esperas.
   *
   * Este beat é o do CAIXA: quando a mesa fecha, é o tempo de a placa da
   * última mão respirar antes de o extrato entrar. O intervalo entre uma
   * mão e a seguinte não mora aqui — ele é um relógio de segundos, com a
   * porta de saída aberta ao lado (ver `HANDOVER_SECONDS`).
   */
  handoverCloseMs: 2600,
  /**
   * Beat de uma RUA que acabou de abrir: o mais longo da mão, e a soma
   * de três tempos que acontecem em ordem, nunca juntos:
   *
   *   letreiro (`streetAnnounceMs`) → foco voltando (`streetRevealMs`)
   *   → as cartas caindo e assentando.
   *
   * A ordem é a de uma mesa de verdade — o crupiê anuncia, todos olham,
   * e só então ele vira as cartas. Virá-las por trás do desfoque
   * escondia justamente o acontecimento que a rua É.
   */
  pokerStreetMs: 2700,
  /**
   * Quanto o letreiro da rua fica em cena, do início do desfoque ao fim
   * dele. Menor que o beat de propósito: a mesa volta ao foco ANTES de a
   * palavra voltar ao jogador, senão estaria borrada justamente na hora
   * de olhar para ela.
   *
   * A conta que sustenta o número: ~0,3 s de desfoque entrando, 0,24 s
   * de respiro, a coreografia do letreiro assentando por volta de 1,0 s
   * e meio segundo de leitura antes da saída.
   */
  streetAnnounceMs: 1500,
  /**
   * O respiro entre o letreiro sair e as cartas da rua caírem: é o tempo
   * do desfoque se dissolver. Sem ele as comunitárias virariam com a
   * tela ainda embaçada, e a virada — que é o acontecimento da rua —
   * aconteceria fora de foco.
   */
  streetRevealMs: 420,
  /**
   * Espera antes de a mesa virar as comunitárias da rua seguinte — o
   * tempo de um crupiê recolher as apostas e queimar a carta.
   */
  pokerDealStreetMs: 800,
  /**
   * Janela em que o rival pensa antes de bater o martelo. Sorteada: um
   * adversário que decide sempre no mesmo tempo denuncia que é máquina,
   * e no poker o TEMPO de decisão é informação — um rival que responde
   * instantaneamente a qualquer aposta não estaria decidindo nada.
   */
  pokerThinkMinMs: 900,
  pokerThinkMaxMs: 2600,
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

  /* ---------- O EMBATE DO SHOWDOWN ---------- */

  /*
   * As três batidas do embate, encadeadas. Elas somam `settleMs` de
   * propósito: o showdown inteiro é `revealMs` (as fechadas virando) +
   * `settleMs` (o embate), e é esse total que o store agenda antes de
   * chamar o veredito. Mexer numa destas sem mexer no total deixaria a
   * placa vencedora sendo cortada no meio da comemoração — ou a mesa
   * parada esperando um beat que já acabou.
   */
  /** As duas placas entram das bordas e vêm uma contra a outra. */
  clashEnterMs: 900,
  /** A colisão: o impacto, o tranco e as fagulhas. */
  clashImpactMs: 480,
  /** O veredito: a perdedora é jogada fora, a vencedora assume o centro. */
  clashVerdictMs: 1620,
  /**
   * Veredito da rodada em tela antes do desfecho da partida. No 1v1 é
   * exatamente o tempo do EMBATE do showdown (ver `clashEnterMs` e
   * seguintes) — as duas placas entrando, colidindo e a vencedora
   * assumindo o centro.
   *
   * Ele foi ALONGADO depois de ver a cena rodando: em 1,8s o embate
   * acontecia, mas não dava tempo de LER as duas mãos antes de uma
   * delas sair de cena — e ler as duas mãos é a única razão de a cena
   * existir. Os 3s de agora deixam cada batida respirar.
   */
  settleMs: 3000,

  /* ---------- O desfecho de uma mão morta por DESISTÊNCIA ----------
   *
   * Ela não teve comparação: quem correu perdeu por ter largado, não por
   * ter carta pior. Dar a ela o mesmo cerimonial de um showdown de river
   * fazia uma mão de UM lance custar quase vinte segundos de cena — e na
   * quinta repetição a sessão inteira parece parada.
   *
   * O embate continua rodando (ver ShowdownClash: ver o que o outro
   * largou é a única leitura que este duelo dá dele), mas comprimido:
   * as placas entram mais rápido e o veredito respira menos, porque não
   * há duas mãos a ler e comparar — há uma notícia a dar.
   */
  /** Entrada das placas numa desistência. */
  foldClashEnterMs: 620,
  /** Veredito numa desistência. */
  foldClashVerdictMs: 900,
  /** O embate inteiro numa desistência (620 + 480 + 900). */
  foldSettleMs: 2000,
  /**
   * Beat do empate: no mata-mata do torneio ninguém pode empatar, então
   * o aviso respira em tela antes de a mesa distribuir de novo.
   */
  roundEndMs: 2600,
} as const;

/** Valor inicial do countdown falado (5 → 1) antes da distribuição. */
export const COUNTDOWN_START = 5;

/**
 * Máximo de MESAS mantidas no histórico persistido.
 *
 * O teto já contou mãos, e as cinquenta cabiam numa sessão só — uma noite
 * comprida apagava do extrato tudo o que veio antes dela. Contando mesas,
 * as mesmas cinquenta linhas guardam meses de jogo.
 */
export const HISTORY_LIMIT = 50;
