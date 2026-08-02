import type { Rng } from '@/shared/lib/random';

/**
 * A LABAREDA da casa — o modelo.
 *
 * Aqui não há desenho nenhum: só a física e a coreografia, em números
 * puros. Quem pinta é o BlazeBurst (canvas). A separação é o que deixa
 * a coisa testável — um efeito que só existe dentro de um
 * requestAnimationFrame não se verifica, e este tem regra demais para
 * ficar sem rede.
 *
 * A LINGUAGEM é fogo CARTOON, não fogo fotográfico: línguas com
 * silhueta clara (base larga, corpo curvo, ponta estreita), duas ou
 * três camadas de cor chapada por chama, partículas grandes o bastante
 * para se verem num celular. A versão anterior era feita de discos de
 * gradiente sobrepostos em composição aditiva — e o resultado era uma
 * NUVEM amarela desfocada, luz sem forma. Forma vem de contorno, e
 * contorno aqui é curva de Bézier preenchida.
 *
 * A forma é ENTRADA + REGIME: um estouro que bate uma vez (~0,9s) e um
 * estado que fica enquanto o motivo existir. Quem apaga o fogo é o
 * desmonte do componente, nunca o relógio. E o regime não é o clímax
 * congelado: menos línguas, núcleo claro recolhido, partículas em
 * conta-gotas.
 *
 * DUAS VARIANTES, dois desenhos:
 * - `blackjack`: a mão inteira coroada de labaredas — quinas
 *   inferiores, laterais e um respiro no vão entre as cartas.
 * - `double-button`: a coroa do botão da dobra — chamas na borda de
 *   CIMA e nas quinas superiores, nada embaixo (é o fim do viewport).
 *
 * O POTE NÃO TEM VARIANTE, por decisão de direção: nenhum efeito nas
 * fichas. A dobra aceita é comunicada exclusivamente pelo botão.
 *
 * Documentação completa: docs/labareda.md.
 */

/**
 * A paleta do fogo cartoon, na ordem da temperatura.
 *
 * O amarelo e o dourado DOMINAM; o creme é núcleo pequeno (e
 * praticamente só da entrada); o laranja define a silhueta externa; o
 * laranja profundo e a brasa são detalhe, nunca massa.
 */
export const BLAZE_PALETTE = {
  /** Creme quente #FFF2A6 — núcleo pequeno, nunca aura. */
  cream: '255, 242, 166',
  /** Amarelo vivo #FFD43B — o corpo da chama. */
  yellow: '255, 212, 59',
  /** Dourado #FFB000 — corpo e brilhos. */
  gold: '255, 176, 0',
  /** Laranja #FF7A00 — a camada externa, a silhueta. */
  orange: '255, 122, 0',
  /** Laranja profundo #E64A00 — detalhe de ponta. */
  deepOrange: '230, 74, 0',
  /** Brasa #9E2600 — partícula isolada. */
  ember: '158, 38, 0',
} as const;

/**
 * A coreografia, em milissegundos. Os beats se sobrepõem de propósito:
 * o flash já está morrendo quando as chamas chegam ao pico, e as
 * faíscas ainda sobem quando o impacto passou.
 *
 * O que é IMPACTO — flash, anel, raios, a linha de luz do botão —
 * acontece uma vez só. Um soco que se repetisse a cada dois segundos
 * viraria estroboscópio.
 */
export const BLAZE = {
  /** Flash: sobe quase instantâneo e some rápido. É o soco. */
  flashInMs: 55,
  flashOutMs: 400,
  /** Raios: entram junto do flash e apagam ANTES das chamas. */
  rayInMs: 70,
  rayLifeMinMs: 380,
  rayLifeMaxMs: 560,
  /** A linha de luz que percorre o botão, da esquerda para a direita. */
  edgeSweepMs: 650,
  /**
   * Chamas: crescem da base, seguram o pico e ASSENTAM no regime.
   * 140 + 260 + 480 = a explosão vira regime em ~880ms — a direção
   * pede o clímax resolvido perto dos 900ms.
   */
  flameInMs: 140,
  flameHoldMs: 260,
  flameOutMs: 480,
  /** Nível padrão do regime (as variantes podem sobrescrever). */
  flameSustain: 0.62,
  /** Partículas: nascem escalonadas e cada uma tem a sua vida. */
  particleStaggerMs: 320,
  particleLifeMinMs: 720,
  particleLifeMaxMs: 1580,
  /**
   * Fim da ENTRADA — quando o impacto passou e o fogo é só regime. É
   * DERIVADO, nunca escrito à mão: é ele que o renderizador usa para
   * baixar a cadência de 60 para ~30fps.
   */
  get entranceMs(): number {
    return Math.max(
      this.flashInMs + this.flashOutMs,
      this.rayInMs + this.rayLifeMaxMs,
      this.edgeSweepMs,
      this.flameInMs + this.flameHoldMs + this.flameOutMs,
      this.particleStaggerMs + this.particleLifeMaxMs,
    );
  },
} as const;

/** Os dois hospedeiros — dois desenhos, não duas escalas. */
export type BlazeVariant = 'blackjack' | 'double-button';

/** Que forma o impacto tem. */
export type BlazeFlashKind = 'radial' | 'horizontal';

/**
 * Onde o fogo nasce e que tamanho tem ali. As frações são da CAIXA do
 * hospedeiro (x da largura; y, len e halfW da altura) — é o que faz o
 * mesmo desenho servir à mão do duelo e à mão mini de um assento.
 */
export interface BlazeZone {
  kind: 'corner' | 'side' | 'base' | 'center' | 'top-corner' | 'top-edge';
  /** Fatia do sorteio — os pesos de uma variante somam 1. */
  weight: number;
  x: readonly [number, number];
  y: readonly [number, number];
  /** Altura da língua nascida aqui, em fração da ALTURA da caixa. */
  len: readonly [number, number];
}

type Range = readonly [min: number, max: number];

export interface BlazeVariantConfig {
  /** Onde o fogo nasce — e onde ele NÃO nasce (os vãos são a regra). */
  zones: readonly BlazeZone[];
  /** Línguas na ENTRADA. */
  tongues: Range;
  /** Quantas delas sobrevivem ao REGIME. */
  tonguesSustain: Range;
  /** Meia-largura da base da língua, em fração da altura da caixa. */
  tongueHalfW: Range;
  /** Nível em que a chama assenta. */
  flameSustain: number;
  /**
   * Peso do efeito na tela — a hierarquia entre variantes. O blackjack
   * é a conquista; o botão é um aviso permanente. Multiplica o alfa de
   * tudo o que a variante pinta.
   */
  intensity: number;
  flash: BlazeFlashKind;
  /** O anel de choque — só no impacto radial. */
  ring: boolean;
  /** Raios da explosão radial; `null` = variante sem raios. */
  rays: Range | null;
  /** A linha de luz que percorre o botão, uma vez. */
  edgeSweep: boolean;
  /** Faíscas da ENTRADA. */
  particles: Range;
  /** Quantas continuam renascendo no REGIME. */
  particlesSustain: Range;
  /** Quanto uma faísca sobe, em fração da altura da caixa. */
  particleClimb: Range;
  /** Raio da faísca, em fração da altura da caixa. */
  particleSize: Range;
  /** Descanso máximo antes de uma faísca renascer. */
  restMs: number;
}

/**
 * A tabela das variantes. Cada zona é uma decisão de direção:
 *
 * - **blackjack** coroa a mão como um GRUPO (a caixa é o container das
 *   duas cartas, nunca cada carta sozinha). As quinas inferiores levam
 *   a maior parte; as laterais sobem até ~45% da altura das cartas; o
 *   vão entre as cartas recebe chamas MENORES (para não esconder naipe)
 *   e o resto da base fica com vãos — uma linha contínua de fogo é
 *   exatamente o que produzia a massa amarela. Nada nasce no topo.
 *
 * - **double-button** é uma coroa na borda de CIMA: chamas maiores nas
 *   duas quinas superiores (~13–18px acima da borda), médias ao longo
 *   do topo, com espaços vazios entre elas. Nada na borda de baixo —
 *   ali é o fim do viewport, e chama cortada é pior que chama nenhuma.
 *   Os controles PEDIR CARTA/PARAR ficam ACIMA das pontas por z-index
 *   (ver HandsArena), então nenhuma labareda cobre texto.
 */
export const BLAZE_VARIANTS: Record<BlazeVariant, BlazeVariantConfig> = {
  blackjack: {
    zones: [
      { kind: 'corner', weight: 0.22, x: [-0.05, 0.16], y: [0.93, 1], len: [0.24, 0.4] },
      { kind: 'corner', weight: 0.22, x: [0.84, 1.05], y: [0.93, 1], len: [0.24, 0.4] },
      { kind: 'side', weight: 0.15, x: [-0.02, 0.02], y: [0.5, 0.9], len: [0.3, 0.45] },
      { kind: 'side', weight: 0.15, x: [0.98, 1.02], y: [0.5, 0.9], len: [0.3, 0.45] },
      { kind: 'base', weight: 0.09, x: [0.16, 0.4], y: [0.97, 1], len: [0.18, 0.3] },
      { kind: 'base', weight: 0.09, x: [0.6, 0.84], y: [0.97, 1], len: [0.18, 0.3] },
      // O vão entre as cartas: chamas curtas, para o fogo existir ali
      // sem esconder índice nem naipe.
      { kind: 'center', weight: 0.08, x: [0.44, 0.56], y: [0.95, 1], len: [0.1, 0.16] },
    ],
    tongues: [13, 18],
    tonguesSustain: [10, 14],
    tongueHalfW: [0.05, 0.095],
    flameSustain: BLAZE.flameSustain,
    intensity: 1,
    flash: 'radial',
    ring: true,
    rays: [6, 10],
    edgeSweep: false,
    particles: [20, 30],
    particlesSustain: [8, 11],
    particleClimb: [0.3, 0.7],
    particleSize: [0.022, 0.05],
    restMs: 2200,
  },
  'double-button': {
    zones: [
      // As quinas de cima: as chamas maiores da coroa. 0,30–0,40 de
      // 44px ≈ 13–18px acima da borda — o teto vem do viewport e do
      // gap de 12px até PEDIR CARTA/PARAR (as pontas que passam disso
      // somem ATRÁS dos controles, nunca por cima).
      { kind: 'top-corner', weight: 0.3, x: [0.01, 0.09], y: [0, 0.12], len: [0.3, 0.4] },
      { kind: 'top-corner', weight: 0.3, x: [0.91, 0.99], y: [0, 0.12], len: [0.3, 0.4] },
      // A borda superior: chamas médias, com vãos entre elas.
      { kind: 'top-edge', weight: 0.4, x: [0.12, 0.88], y: [0, 0.08], len: [0.16, 0.26] },
    ],
    tongues: [10, 14],
    tonguesSustain: [8, 12],
    tongueHalfW: [0.09, 0.15],
    flameSustain: 0.55,
    intensity: 0.8,
    flash: 'horizontal',
    ring: false,
    rays: null,
    edgeSweep: true,
    particles: [14, 22],
    particlesSustain: [6, 8],
    particleClimb: [0.15, 0.4],
    particleSize: [0.05, 0.09],
    restMs: 1000,
  },
};

/** Retângulo do hospedeiro dentro do canvas (CSS pixels). */
export interface BlazeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Uma língua de fogo cartoon. */
export interface BlazeTongue {
  /** Âncora da BASE — ela nunca se move; só o corpo e a ponta dançam. */
  x: number;
  y: number;
  /** Altura no pico do envelope. */
  len: number;
  /** Meia-largura da base. */
  halfW: number;
  /**
   * Desvio lateral da ponta em repouso, em px. Positivo para FORA do
   * centro: fogo em volta de um objeto abre, não sobe reto.
   */
  lean: number;
  /** As duas frequências do bamboleio (incomensuráveis entre si). */
  f1: number;
  f2: number;
  /** Fases próprias — é o que impede as línguas de dançarem juntas. */
  p1: number;
  p2: number;
  /** Amplitude da deformação da ponta e da curvatura, em px. */
  wobble: number;
  /** Atraso de entrada: a coroa não acende como um interruptor. */
  delayMs: number;
  /** De qual zona esta língua nasceu (usado por testes e pela cor). */
  zone: BlazeZone['kind'];
  /**
   * Esta língua sobrevive ao regime. As que não sobrevivem decaem a
   * ZERO passada a entrada — é o corte que troca a composição em vez
   * de apenas escurecer o clímax.
   */
  sustains: boolean;
}

/** Um raio fino da explosão radial. */
export interface BlazeRay {
  angle: number;
  len: number;
  grow: number;
  width: number;
  delayMs: number;
  lifeMs: number;
}

export type BlazeParticleKind = 'dot' | 'spark' | 'ember' | 'puff' | 'star';

/** Uma faísca. */
export interface BlazeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Constante de arrasto: é ela que faz a faísca PERDER velocidade. */
  drag: number;
  swayF: number;
  swayA: number;
  phase: number;
  /** Raio em px — grande o bastante para se ver num celular. */
  size: number;
  lifeMs: number;
  /**
   * O instante do estouro em que esta faísca nasceu. Na entrada é o
   * escalonamento da leva; no regime é quando ela renasceu.
   */
  bornAtMs: number;
  kind: BlazeParticleKind;
  /** Esta faísca renasce no regime. As demais são só da entrada. */
  recycles: boolean;
}

export interface BlazeBurstModel {
  variant: BlazeVariant;
  config: BlazeVariantConfig;
  tongues: readonly BlazeTongue[];
  rays: readonly BlazeRay[];
  particles: readonly BlazeParticle[];
  /** Origem e tamanho do impacto. */
  flash: { x: number; y: number; radius: number };
  /** Centro do hospedeiro — de onde os raios saem. */
  center: { x: number; y: number };
  /** A caixa do hospedeiro, para a linha de luz do botão. */
  rect: BlazeRect;
}

const lerp = (rng: Rng, min: number, max: number): number => min + rng.next() * (max - min);
const pick = (rng: Rng, range: Range): number => lerp(rng, range[0], range[1]);
const pickInt = (rng: Rng, range: Range, scale = 1): number =>
  Math.max(1, Math.round(pick(rng, range) * scale));

/** Sorteia uma zona pelo peso. Os pesos da variante somam 1. */
export function pickZone(rng: Rng, zones: readonly BlazeZone[]): BlazeZone {
  let roll = rng.next();
  for (const zone of zones) {
    if (roll < zone.weight) return zone;
    roll -= zone.weight;
  }
  return zones[zones.length - 1] as BlazeZone;
}

/**
 * Monta um estouro. `scale` é a régua do TAMANHO (a mão mini de um
 * assento é a mesma cena menor); quem decide o DESENHO é a variante.
 */
export function buildBurst(
  rng: Rng,
  rect: BlazeRect,
  variant: BlazeVariant = 'blackjack',
  scale = 1,
): BlazeBurstModel {
  const cfg = BLAZE_VARIANTS[variant];
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  const tongueCount = pickInt(rng, cfg.tongues, scale);
  const sustainCount = Math.min(tongueCount, pickInt(rng, cfg.tonguesSustain, scale));
  /* Sorteio ESTRATIFICADO: cada zona recebe a sua cota (peso × total)
     antes de qualquer sorteio livre. Com o sorteio todo livre, uma
     semente azarada acendia só um lado da mão — foi visto na captura
     dos 5s. A cota garante coroa dos dois lados; o resto continua
     aleatório para a composição variar de estouro a estouro. */
  const plan: BlazeZone[] = [];
  for (const zone of cfg.zones) {
    const quota = Math.floor(zone.weight * tongueCount);
    for (let q = 0; q < quota; q += 1) plan.push(zone);
  }
  const tongues: BlazeTongue[] = [];
  for (let i = 0; i < tongueCount; i += 1) {
    const zone = plan[i] ?? pickZone(rng, cfg.zones);
    const x = rect.x + rect.w * lerp(rng, zone.x[0], zone.x[1]);
    const y = rect.y + rect.h * lerp(rng, zone.y[0], zone.y[1]);
    const away = x < cx ? -1 : 1;
    const outward = zone.kind === 'side' || zone.kind === 'corner' || zone.kind === 'top-corner';
    tongues.push({
      x,
      y,
      len: rect.h * pick(rng, zone.len) * scale,
      halfW: rect.h * pick(rng, cfg.tongueHalfW) * scale,
      // Só quem mora na borda pende para fora; a base e o vão central
      // sobem quase retos.
      lean: away * rect.h * (outward ? lerp(rng, 0.05, 0.16) : lerp(rng, 0, 0.04)) * scale,
      f1: lerp(rng, 1.7, 2.9),
      f2: lerp(rng, 3.9, 6.7),
      p1: rng.next() * Math.PI * 2,
      p2: rng.next() * Math.PI * 2,
      wobble: rect.h * lerp(rng, 0.03, 0.08) * scale,
      delayMs: lerp(rng, 0, 130),
      zone: zone.kind,
      sustains: false,
    });
  }
  /* Quem sobrevive ao regime são as línguas MAIORES — decidido UMA vez
     aqui (por quadro seria ruído, não vida). Com as curtinhas do vão e
     da base saindo de cena, o que fica é uma coroa de chamas grandes e
     espaçadas; sorteado às cegas, o regime herdava os tocos e perdia
     as labaredas — foi medido na captura dos 5s. */
  [...tongues.keys()]
    .sort((a, b) => (tongues[b] as BlazeTongue).len - (tongues[a] as BlazeTongue).len)
    .slice(0, sustainCount)
    .forEach((i) => {
      (tongues[i] as BlazeTongue).sustains = true;
    });

  const rays: BlazeRay[] = [];
  if (cfg.rays) {
    const unit = Math.min(rect.w, rect.h);
    const rayCount = Math.max(cfg.rays[0], Math.round(pick(rng, cfg.rays) * scale));
    for (let i = 0; i < rayCount; i += 1) {
      // Passo regular + jitter: raios sorteados livremente colam dois a
      // dois e o resultado lê como desenho de sol torto.
      const angle = ((i + lerp(rng, -0.3, 0.3)) / rayCount) * Math.PI * 2;
      rays.push({
        angle,
        len: unit * lerp(rng, 0.55, 1.35) * scale,
        grow: unit * lerp(rng, 0.06, 0.16) * scale,
        width: lerp(rng, 0.9, 2.1) * scale,
        delayMs: lerp(rng, 0, 60),
        lifeMs: lerp(rng, BLAZE.rayLifeMinMs, BLAZE.rayLifeMaxMs),
      });
    }
  }

  const particleCount = pickInt(rng, cfg.particles, scale);
  const recycleCount = Math.min(particleCount, pickInt(rng, cfg.particlesSustain, scale));
  const particles: BlazeParticle[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    particles.push(
      respawnParticle(rng, rect, variant, scale, blankParticle(), {
        bornAtMs: rng.next() * BLAZE.particleStaggerMs,
        // No máximo DUAS estrelas, discretas, e só na entrada do
        // blackjack: no regime elas virariam pisca-pisca.
        allowStar: variant === 'blackjack' && i < 2,
        recycles: i < recycleCount,
      }),
    );
  }

  const flash =
    cfg.flash === 'horizontal'
      ? { x: cx, y: cy, radius: rect.w * 0.52 }
      : { x: cx, y: rect.y + rect.h * 0.92, radius: rect.w * 0.95 };

  return {
    variant,
    config: cfg,
    tongues,
    rays,
    particles,
    flash,
    center: { x: cx, y: cy },
    rect,
  };
}

/** Uma faísca vazia, para ser preenchida por `respawnParticle`. */
function blankParticle(): BlazeParticle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    drag: 1,
    swayF: 1,
    swayA: 0,
    phase: 0,
    size: 1,
    lifeMs: 1,
    bornAtMs: 0,
    kind: 'dot',
    recycles: false,
  };
}

/**
 * (Re)nasce uma faísca, MUTANDO o objeto recebido.
 *
 * Mutar em vez de criar é deliberado: no regime cada faísca que morre
 * renasce, e alocar a cada morte encheria de lixo um laço que roda
 * enquanto a mão durar. O pool tem tamanho fixo do começo ao fim.
 *
 * E ela renasce DIFERENTE — zona, velocidade, bamboleio e tipo são
 * sorteados de novo. Reciclar as mesmas trajetórias daria um punhado de
 * riscos idênticos repetindo em ciclo.
 */
export function respawnParticle(
  rng: Rng,
  rect: BlazeRect,
  variant: BlazeVariant,
  scale: number,
  particle: BlazeParticle,
  opts: { bornAtMs: number; allowStar?: boolean; recycles?: boolean },
): BlazeParticle {
  const cfg = BLAZE_VARIANTS[variant];
  const zone = pickZone(rng, cfg.zones);
  const roll = rng.next();
  /* A mistura: pontos dourados, riscos curtos, brasas laranja e uma ou
     outra partícula maior e macia (o `puff`). */
  particle.kind =
    opts.allowStar && rng.next() < 0.7
      ? 'star'
      : roll < 0.38
        ? 'dot'
        : roll < 0.62
          ? 'spark'
          : roll < 0.84
            ? 'ember'
            : 'puff';
  /* A faísca é definida pelo QUANTO ELA SOBE, não pela velocidade
     inicial: `vy = alcance × arrasto`. Com velocidade sorteada solta,
     as mais rápidas passavam do céu do canvas e eram CORTADAS na borda.
     Cada variante declara o seu alcance, e ele cabe no céu do CSS. */
  const drag = lerp(rng, 1.3, 2.4);
  const climb = rect.h * pick(rng, cfg.particleClimb) * scale;
  particle.x = rect.x + rect.w * lerp(rng, zone.x[0], zone.x[1]);
  particle.y = rect.y + rect.h * lerp(rng, zone.y[0], zone.y[1]);
  particle.vx = lerp(rng, -26, 26) * scale;
  particle.vy = -climb * drag;
  particle.drag = drag;
  particle.swayF = lerp(rng, 1.6, 3.9);
  particle.swayA = rect.h * lerp(rng, 0.02, 0.06) * scale;
  particle.phase = rng.next() * Math.PI * 2;
  particle.size = rect.h * pick(rng, cfg.particleSize) * scale;
  particle.lifeMs = lerp(rng, BLAZE.particleLifeMinMs, BLAZE.particleLifeMaxMs);
  particle.bornAtMs = opts.bornAtMs;
  if (opts.recycles !== undefined) particle.recycles = opts.recycles;
  return particle;
}

/** Aceleração de saída — o soco do flash e o encolher dos raios. */
export const easeOutCubic = (k: number): number => 1 - (1 - k) ** 3;

/**
 * O envelope das chamas: cresce da base, segura o pico e ASSENTA em
 * `sustain` — onde fica, sem nunca voltar a subir.
 *
 * `sustain` é por LÍNGUA, não global: as que não sobrevivem recebem 0 e
 * saem de cena passada a entrada. É esse corte que muda a composição do
 * regime em vez de só baixar o brilho do clímax.
 */
export function flameEnvelope(elapsedMs: number, sustain: number = BLAZE.flameSustain): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < BLAZE.flameInMs) return easeOutCubic(elapsedMs / BLAZE.flameInMs);
  const held = elapsedMs - BLAZE.flameInMs;
  if (held < BLAZE.flameHoldMs) return 1;
  const out = (held - BLAZE.flameHoldMs) / BLAZE.flameOutMs;
  if (out >= 1) return sustain;
  return sustain + (1 - sustain) * (1 - easeOutCubic(out));
}

/** O envelope do flash: quase instantâneo para cima, suave para baixo. */
export function flashEnvelope(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < BLAZE.flashInMs) return elapsedMs / BLAZE.flashInMs;
  const out = (elapsedMs - BLAZE.flashInMs) / BLAZE.flashOutMs;
  return out >= 1 ? 0 : 1 - easeOutCubic(out);
}

/**
 * Quanto o fogo já ASSENTOU: 0 no pico do estouro, 1 no regime.
 *
 * É a régua da troca de composição — o renderizador usa isto para
 * recolher o núcleo creme e deixar o amarelo/dourado assumirem. Sem
 * ela o regime seria o clímax com menos alfa, que é exatamente o que
 * fazia a base das cartas parecer uma lâmpada.
 */
export function settleProgress(elapsedMs: number): number {
  const start = BLAZE.flameInMs + BLAZE.flameHoldMs;
  if (elapsedMs <= start) return 0;
  return Math.min(1, (elapsedMs - start) / BLAZE.flameOutMs);
}

/**
 * Ruído barato de uma dimensão: duas senoides de frequências que não se
 * dividem. Não é Perlin, mas para o bamboleio da ponta de uma língua o
 * olho não distingue — e é CONTÍNUO por construção: nenhum ciclo
 * "reinicia", então não há salto de quadro.
 */
export function tongueNoise(tongue: BlazeTongue, seconds: number): number {
  return (
    Math.sin(seconds * tongue.f1 + tongue.p1) * 0.62 +
    Math.sin(seconds * tongue.f2 + tongue.p2) * 0.38
  );
}
