import type { Rng } from '@/shared/lib/random';

/**
 * A COMBUSTÃO DOURADA da casa — o modelo.
 *
 * Aqui não há desenho nenhum: só a FÍSICA e a coreografia do estouro,
 * em números puros. Quem pinta é o BlazeBurst (canvas). A separação
 * não é cerimônia — é o que deixa a coisa testável: um efeito que só
 * existe dentro de um requestAnimationFrame não se verifica, e este
 * tem regra demais (quantas línguas, com que envelope, partícula que
 * não pode nascer fora da mão) para ficar sem rede.
 *
 * O QUE ISTO NÃO É: um contorno de CSS acompanhando o retângulo da
 * carta. Isso foi a tentativa anterior e lia como sombra laranja colada
 * nela — porque era exatamente isso.
 *
 * A forma é ENTRADA + REGIME: um estouro que bate uma vez e uma
 * fogueira que fica queimando enquanto a mão for blackjack (ou enquanto
 * a mesa estiver dobrada). Quem apaga o fogo é o desmonte do
 * componente, nunca o relógio. Ver `flameEnvelope` e `entranceMs`.
 *
 * Documentação completa, com desenhos e números: docs/labareda.md.
 */

/**
 * A paleta do fogo, na ordem da temperatura. O DOURADO domina; o
 * laranja profundo só aparece nas extremidades, onde serve de
 * profundidade, e a brasa é ponto isolado — nunca massa.
 */
export const BLAZE_PALETTE = {
  /** Núcleo branco-quente. */
  core: '255, 248, 220',
  /** Dourado claro. */
  lightGold: '255, 215, 106',
  /** Ouro principal — a cor que manda na cena. */
  gold: '255, 184, 0',
  /** Âmbar. */
  amber: '255, 138, 0',
  /** Laranja profundo: só extremidade. */
  deepOrange: '232, 74, 0',
  /** Brasa: pontinho, nunca área. */
  ember: '140, 33, 0',
} as const;

/**
 * A coreografia, em milissegundos. Os beats se sobrepõem de propósito:
 * o flash já está morrendo quando as chamas chegam ao pico, e as
 * faíscas ainda sobem quando o impacto passou.
 *
 * A ENTRADA acaba; o FOGO não. Passada a entrada, as chamas assentam
 * num nível sustentado e ficam queimando enquanto a mão for blackjack
 * (ou enquanto a mesa estiver dobrada). O que é impacto — o flash e os
 * raios — acontece UMA vez: um soco que se repetisse a cada dois
 * segundos viraria estroboscópio, não fogueira.
 */
export const BLAZE = {
  /** Flash: sobe quase instantâneo e some rápido. É o soco. */
  flashInMs: 55,
  flashOutMs: 400,
  /** Raios: entram junto do flash e apagam ANTES das chamas. */
  rayInMs: 70,
  rayLifeMinMs: 380,
  rayLifeMaxMs: 560,
  /** Chamas: sobem rápido, seguram e ASSENTAM (não apagam). */
  flameInMs: 160,
  flameHoldMs: 520,
  flameOutMs: 640,
  /**
   * O nível em que a chama fica depois da entrada. Não é 1: uma
   * fogueira eternamente no pico do estouro cansa a vista e rouba a
   * mesa. Abaixo de ~0,6 ela vira um brilho tímido nas bordas (foi
   * medido: em 0,58 o fogo praticamente sumia aos 10s). 0,78 é o ponto
   * em que continua inconfundivelmente acesa sem competir com as
   * cartas.
   */
  flameSustain: 0.78,
  /** Partículas: nascem escalonadas e cada uma tem a sua vida. */
  particleStaggerMs: 320,
  particleLifeMinMs: 720,
  particleLifeMaxMs: 1580,
  /**
   * Descanso máximo entre a morte de uma faísca e o renascimento dela.
   * É o que separa a EXPLOSÃO do regime: na entrada as trinta sobem
   * juntas; depois, com um descanso sorteado até aqui, sobra menos da
   * metade viva a cada instante — brasa subindo de uma fogueira, e não
   * chuveiro de faíscas para sempre.
   */
  particleRestMs: 2200,
  /**
   * Fim da ENTRADA — o instante em que o impacto passou e o fogo vira
   * regime permanente. É DERIVADO, nunca escrito à mão: é ele que o
   * renderizador usa para baixar a cadência e para começar a reciclar
   * faíscas, e um número solto aqui cortaria o rastro no ar.
   */
  get entranceMs(): number {
    return Math.max(
      this.flashInMs + this.flashOutMs,
      this.rayInMs + this.rayLifeMaxMs,
      this.flameInMs + this.flameHoldMs + this.flameOutMs,
      this.particleStaggerMs + this.particleLifeMaxMs,
    );
  },
} as const;

/** Retângulo da mão dentro do canvas (coordenadas de CSS pixels). */
export interface BlazeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Uma língua de fogo, nascida num ponto do perímetro da mão. */
export interface BlazeTongue {
  /** Onde a língua encosta na mão. */
  x: number;
  y: number;
  /** Comprimento no pico do envelope. */
  len: number;
  /** Meia-largura da base. */
  halfW: number;
  /**
   * Inclinação lateral em repouso, em px de desvio no topo. Positiva
   * para fora do centro da mão: fogo em volta de um objeto abre, não
   * sobe reto.
   */
  lean: number;
  /** As duas frequências do ruído (incomensuráveis entre si). */
  f1: number;
  f2: number;
  /** Fases próprias — é o que impede as línguas de pulsarem juntas. */
  p1: number;
  p2: number;
  /** Quanto a ponta se deforma de lado. */
  wobble: number;
  /** Atraso próprio: a fileira não acende como um interruptor. */
  delayMs: number;
}

/** Um raio fino da explosão radial. */
export interface BlazeRay {
  angle: number;
  /** Comprimento inicial; ele cresce alguns px durante a vida. */
  len: number;
  grow: number;
  width: number;
  delayMs: number;
  lifeMs: number;
}

export type BlazeParticleKind = 'dot' | 'spark' | 'ember' | 'star';

/** Uma faísca. */
export interface BlazeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Constante de arrasto: é ela que faz a partícula PERDER velocidade. */
  drag: number;
  swayF: number;
  swayA: number;
  phase: number;
  size: number;
  lifeMs: number;
  /**
   * O instante do estouro em que esta faísca nasceu. Na entrada é o
   * escalonamento da leva; no regime permanente é quando ela renasceu
   * da última vez — por isso INSTANTE e não atraso.
   */
  bornAtMs: number;
  kind: BlazeParticleKind;
}

export interface BlazeBurstModel {
  tongues: readonly BlazeTongue[];
  rays: readonly BlazeRay[];
  particles: readonly BlazeParticle[];
  /** Origem do flash: centro INFERIOR da mão. */
  flash: { x: number; y: number; radius: number };
  /** Centro da mão — de onde os raios saem. */
  center: { x: number; y: number };
}

const lerp = (rng: Rng, min: number, max: number): number => min + rng.next() * (max - min);

/**
 * Onde uma chama nasce. O perímetro é percorrido com PESO: a base
 * pega a maior parte (é de baixo que o fogo sobe) e as laterais
 * dividem o resto. O topo fica de fora — chama não nasce em cima do
 * que ela está queimando.
 *
 * `t` é uma posição em [0,1) no perímetro ponderado.
 */
export function perimeterPoint(rect: BlazeRect, t: number): { x: number; y: number } {
  const bottomShare = 0.56;
  const sideShare = (1 - bottomShare) / 2;
  if (t < bottomShare) {
    // A base, varrida da esquerda para a direita, transbordando um
    // pouco nas duas pontas: é ali que a chama escapa da silhueta.
    const k = t / bottomShare;
    return { x: rect.x - rect.w * 0.08 + k * rect.w * 1.16, y: rect.y + rect.h };
  }
  if (t < bottomShare + sideShare) {
    const k = (t - bottomShare) / sideShare;
    // De baixo para cima, concentrando na metade de baixo (k²).
    return { x: rect.x, y: rect.y + rect.h * (1 - k * k * 0.92) };
  }
  const k = (t - bottomShare - sideShare) / sideShare;
  return { x: rect.x + rect.w, y: rect.y + rect.h * (1 - k * k * 0.92) };
}

/**
 * Monta um estouro para uma mão de `rect`. `scale` é a régua do
 * hospedeiro (1 na mão cheia do duelo, menos na mão mini de um assento)
 * e encolhe contagem E tamanho junto — uma mão de 30px com 30 partículas
 * vira poeira, não faísca.
 */
export function buildBurst(rng: Rng, rect: BlazeRect, scale = 1): BlazeBurstModel {
  const unit = Math.min(rect.w, rect.h);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  /* DENSIDADE POR PERÍMETRO. Uma contagem fixa serve a uma mão de
     cartas e some numa pílula de 330×44: o mesmo punhado de línguas
     espalhado por uma borda três vezes mais longa vira fogo ralo. A
     medida é o perímetro que realmente queima (base + laterais)
     dividido pelo de um hospedeiro quadrado — 1 na mão do duelo, ~3 no
     botão da dobra. O teto existe porque cada língua custa seis
     carimbos por quadro, e o regime permanente dura a mão inteira. */
  const burningEdge = rect.w * 1.16 + rect.h * 0.92 * 2;
  const density = burningEdge / (unit * 3.6);
  const tongueCount = Math.min(
    40,
    Math.max(8, Math.round(lerp(rng, 18, 23) * scale * density)),
  );
  const tongues: BlazeTongue[] = [];
  for (let i = 0; i < tongueCount; i += 1) {
    // Posição no perímetro com jitter: distribuir em passo regular e
    // depois bagunçar dá cobertura sem simetria — sortear tudo deixa
    // buracos e aglomerados.
    const t = (i + lerp(rng, -0.38, 0.38)) / tongueCount;
    const at = perimeterPoint(rect, ((t % 1) + 1) % 1);
    const away = at.x < cx ? -1 : 1;
    // Quem nasce longe do centro é mais alta: a chama que aparece é a
    // que escapa da silhueta, e essa é a das pontas.
    const edgeness = Math.min(1, Math.abs(at.x - cx) / (rect.w / 2));
    tongues.push({
      x: at.x,
      y: at.y,
      len: unit * lerp(rng, 0.55, 1.35) * (0.68 + edgeness * 0.52) * scale,
      halfW: unit * lerp(rng, 0.042, 0.088) * scale,
      lean: away * unit * lerp(rng, 0.03, 0.26) * edgeness * scale,
      f1: lerp(rng, 2.1, 3.4),
      f2: lerp(rng, 4.7, 7.9),
      p1: rng.next() * Math.PI * 2,
      p2: rng.next() * Math.PI * 2,
      wobble: unit * lerp(rng, 0.04, 0.15) * scale,
      delayMs: lerp(rng, 0, 130),
    });
  }

  const rayCount = Math.max(6, Math.round(lerp(rng, 6, 10) * scale));
  const rays: BlazeRay[] = [];
  for (let i = 0; i < rayCount; i += 1) {
    // Passo regular + jitter, de novo: raios sorteados livremente
    // colam dois a dois e o resultado lê como desenho de sol torto.
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

  const particleCount = Math.min(38, Math.round(lerp(rng, 24, 32) * scale * density));
  const particles: BlazeParticle[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    particles.push(
      respawnParticle(rng, rect, scale, blankParticle(), {
        bornAtMs: rng.next() * BLAZE.particleStaggerMs,
        // A entrada joga TODAS de uma vez: é a explosão. A estrela só
        // existe nessa leva — no regime permanente ela viraria um
        // pisca-pisca a cada poucos segundos.
        allowStar: i < 3,
      }),
    );
  }

  return {
    tongues,
    rays,
    particles,
    flash: { x: cx, y: rect.y + rect.h * 0.92, radius: rect.w * 0.95 },
    center: { x: cx, y: cy },
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
  };
}

/**
 * (Re)nasce uma faísca no perímetro da mão, MUTANDO o objeto recebido.
 *
 * Mutar em vez de criar é deliberado: no regime permanente cada faísca
 * que morre renasce, e alocar um objeto novo a cada morte encheria de
 * lixo o laço de animação que roda enquanto a mão durar. O pool tem
 * tamanho fixo do começo ao fim.
 *
 * E ela renasce DIFERENTE — posição, velocidade, bamboleio e tipo são
 * sorteados de novo. Reciclar as mesmas trajetórias daria trinta
 * riscos idênticos repetindo em ciclo, que é a assinatura de um efeito
 * barato.
 */
export function respawnParticle(
  rng: Rng,
  rect: BlazeRect,
  scale: number,
  particle: BlazeParticle,
  opts: { bornAtMs: number; allowStar?: boolean },
): BlazeParticle {
  const unit = Math.min(rect.w, rect.h);
  const at = perimeterPoint(rect, rng.next());
  const roll = rng.next();
  particle.kind =
    opts.allowStar && rng.next() < 0.7
      ? 'star'
      : roll < 0.5
        ? 'dot'
        : roll < 0.8
          ? 'spark'
          : 'ember';
  /* A faísca é definida pelo QUANTO ELA SOBE, não pela velocidade
     inicial: `vy = alcance × arrasto`. Com velocidade sorteada solta,
     as mais rápidas viajavam ~150px num céu de 90px e eram CORTADAS na
     borda do canvas — o oposto de "desaparecer sem corte abrupto". O
     alcance máximo (0,78 do lado menor da mão) cabe no céu que o
     BlazeBurst reserva, com folga para o bamboleio. */
  const drag = lerp(rng, 1.3, 2.4);
  const climb = unit * lerp(rng, 0.3, 0.78) * scale;
  particle.x = at.x + lerp(rng, -unit * 0.08, unit * 0.08);
  particle.y = at.y + lerp(rng, -unit * 0.06, unit * 0.06);
  particle.vx = lerp(rng, -34, 34) * scale;
  particle.vy = -climb * drag;
  particle.drag = drag;
  particle.swayF = lerp(rng, 1.6, 3.9);
  particle.swayA = unit * lerp(rng, 0.02, 0.075) * scale;
  particle.phase = rng.next() * Math.PI * 2;
  particle.size = unit * lerp(rng, 0.018, 0.05) * scale;
  particle.lifeMs = lerp(rng, BLAZE.particleLifeMinMs, BLAZE.particleLifeMaxMs);
  particle.bornAtMs = opts.bornAtMs;
  return particle;
}

/** Aceleração de saída — o soco do flash e o encolher dos raios. */
export const easeOutCubic = (k: number): number => 1 - (1 - k) ** 3;

/**
 * O envelope das chamas: sobe rápido, segura no pico do estouro e
 * ASSENTA em `flameSustain` — onde fica, sem nunca voltar a zero.
 *
 * É esta função que carrega a diferença entre um efeito que "some
 * depois de um tempo" e uma fogueira: o decaimento não vai ao chão, ele
 * vai ao regime. Quem apaga o fogo é o desmonte do componente, quando a
 * mão deixa de ser blackjack.
 */
export function flameEnvelope(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < BLAZE.flameInMs) return easeOutCubic(elapsedMs / BLAZE.flameInMs);
  const held = elapsedMs - BLAZE.flameInMs;
  if (held < BLAZE.flameHoldMs) return 1;
  const out = (held - BLAZE.flameHoldMs) / BLAZE.flameOutMs;
  if (out >= 1) return BLAZE.flameSustain;
  return BLAZE.flameSustain + (1 - BLAZE.flameSustain) * (1 - easeOutCubic(out));
}

/** O envelope do flash: quase instantâneo para cima, suave para baixo. */
export function flashEnvelope(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs < BLAZE.flashInMs) return elapsedMs / BLAZE.flashInMs;
  const out = (elapsedMs - BLAZE.flashInMs) / BLAZE.flashOutMs;
  return out >= 1 ? 0 : 1 - easeOutCubic(out);
}

/**
 * Ruído barato de uma dimensão: duas senoides de frequências que não
 * se dividem. Não é Perlin, mas para deformar a ponta de uma língua de
 * fogo o olho não distingue — e custa duas multiplicações em vez de uma
 * tabela de gradientes.
 */
export function tongueNoise(tongue: BlazeTongue, seconds: number): number {
  return (
    Math.sin(seconds * tongue.f1 + tongue.p1) * 0.62 +
    Math.sin(seconds * tongue.f2 + tongue.p2) * 0.38
  );
}
