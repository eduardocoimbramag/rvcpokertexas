import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import type { BlazeVariant } from '../animations/blaze';
import {
  BLAZE,
  BLAZE_VARIANTS,
  buildBurst,
  flameEnvelope,
  flashEnvelope,
  pickZone,
  respawnParticle,
  settleProgress,
  tongueNoise,
} from '../animations/blaze';

/** A mão do duelo, em tamanho de mesa real. */
const HAND = { x: 60, y: 90, w: 143, h: 95 };
/** A pílula da dobra, em tamanho de mesa real. */
const BUTTON = { x: 24, y: 700, w: 330, h: 44 };

const VARIANTS: readonly BlazeVariant[] = ['blackjack', 'double-button'];
const boxOf = (variant: BlazeVariant) => (variant === 'double-button' ? BUTTON : HAND);

describe('blaze — a coreografia', () => {
  it('o envelope das chamas cresce, segura e ASSENTA — nunca apaga sozinho', () => {
    expect(flameEnvelope(-10)).toBe(0);
    expect(flameEnvelope(0)).toBe(0);
    // Sobe rápido: na metade da subida já passou da metade da força.
    expect(flameEnvelope(BLAZE.flameInMs / 2)).toBeGreaterThan(0.5);
    expect(flameEnvelope(BLAZE.flameInMs)).toBeCloseTo(1, 5);
    expect(flameEnvelope(BLAZE.flameInMs + BLAZE.flameHoldMs - 1)).toBe(1);

    // O decaimento vai ao REGIME, não ao chão. Quem apaga o fogo é o
    // desmonte do componente.
    const end = BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs;
    expect(flameEnvelope(end)).toBeCloseTo(BLAZE.flameSustain, 5);
    expect(flameEnvelope(end + 60_000)).toBeCloseTo(BLAZE.flameSustain, 5);
  });

  it('o clímax resolve perto dos 900ms, como pede a direção', () => {
    const settleAt = BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs;
    expect(settleAt).toBeGreaterThanOrEqual(800);
    expect(settleAt).toBeLessThanOrEqual(1000);
  });

  it('o REGIME é menor que o PICO — não é o clímax congelado', () => {
    const peak = flameEnvelope(BLAZE.flameInMs + 10);
    const regime = flameEnvelope(BLAZE.entranceMs + 5_000);
    expect(regime).toBeLessThan(peak);
    // E é um estado vivo, não um resto: nem apagado, nem igual ao estouro.
    expect(regime).toBeGreaterThan(0.3);
    expect(regime).toBeLessThan(0.75);
  });

  it('a língua que não sobrevive assenta em ZERO', () => {
    // É o corte que troca a COMPOSIÇÃO do regime, em vez de apenas
    // baixar o brilho de todas.
    const late = BLAZE.entranceMs + 2_000;
    expect(flameEnvelope(late, 0)).toBe(0);
    expect(flameEnvelope(late, 0.62)).toBeCloseTo(0.62, 5);
    // Mas ela participa do estouro por inteiro, como as outras.
    expect(flameEnvelope(BLAZE.flameInMs, 0)).toBeCloseTo(1, 5);
  });

  it('o envelope do flash é um soco: pico quase imediato e some cedo', () => {
    expect(flashEnvelope(0)).toBe(0);
    expect(flashEnvelope(BLAZE.flashInMs)).toBeCloseTo(1, 5);
    expect(flashEnvelope(BLAZE.flashInMs + BLAZE.flashOutMs)).toBe(0);
    // E já não existe quando as chamas terminam de assentar.
    expect(flashEnvelope(BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs)).toBe(0);
  });

  it('`settleProgress` é a régua da troca de composição', () => {
    expect(settleProgress(0)).toBe(0);
    expect(settleProgress(BLAZE.flameInMs + BLAZE.flameHoldMs)).toBe(0);
    expect(settleProgress(BLAZE.entranceMs)).toBe(1);
    expect(settleProgress(BLAZE.entranceMs + 10_000)).toBe(1);
  });

  it('a ENTRADA cobre todos os beats de impacto — nada é cortado no ar', () => {
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(BLAZE.flashInMs + BLAZE.flashOutMs);
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(BLAZE.rayInMs + BLAZE.rayLifeMaxMs);
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(BLAZE.edgeSweepMs);
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(
      BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs,
    );
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(
      BLAZE.particleStaggerMs + BLAZE.particleLifeMaxMs,
    );
  });
});

describe('blaze — as duas variantes', () => {
  it('cada variante monta o SEU desenho, e o modelo diz qual é', () => {
    for (const variant of VARIANTS) {
      const model = buildBurst(new SeededRng(9), boxOf(variant), variant);
      expect(model.variant).toBe(variant);
      expect(model.config).toBe(BLAZE_VARIANTS[variant]);
    }
  });

  it('os pesos das zonas de cada variante somam 1 — o sorteio não tem sobra', () => {
    for (const variant of VARIANTS) {
      const total = BLAZE_VARIANTS[variant].zones.reduce((sum, z) => sum + z.weight, 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('blackjack: 13–18 línguas na entrada e 10–14 no regime', () => {
    const model = buildBurst(new SeededRng(4), HAND, 'blackjack');
    expect(model.tongues.length).toBeGreaterThanOrEqual(13);
    expect(model.tongues.length).toBeLessThanOrEqual(18);

    const staying = model.tongues.filter((t) => t.sustains);
    expect(staying.length).toBeGreaterThanOrEqual(10);
    expect(staying.length).toBeLessThanOrEqual(14);
    // O regime é MENOR que a entrada: é o que abre o espaço negativo.
    expect(staying.length).toBeLessThan(model.tongues.length);

    // E quem fica são as MAIORES: a coroa do regime é de labaredas,
    // não dos tocos do vão central.
    const dead = model.tongues.filter((t) => !t.sustains);
    const minAlive = Math.min(...staying.map((t) => t.len));
    const maxDead = Math.max(...dead.map((t) => t.len));
    expect(minAlive).toBeGreaterThanOrEqual(maxDead);
  });

  it('blackjack: o impacto tem flash radial, anel e raios', () => {
    const model = buildBurst(new SeededRng(4), HAND, 'blackjack');
    expect(model.config.flash).toBe('radial');
    expect(model.config.ring).toBe(true);
    expect(model.rays.length).toBeGreaterThanOrEqual(6);
    expect(model.rays.length).toBeLessThanOrEqual(10);
  });

  it('blackjack: nenhuma chama nasce no topo das cartas', () => {
    // A metade de cima é território das cartas: as laterais nascem no
    // máximo na metade da altura.
    for (let seed = 0; seed < 30; seed += 1) {
      const model = buildBurst(new SeededRng(seed), HAND, 'blackjack');
      for (const tongue of model.tongues) {
        expect(tongue.y).toBeGreaterThanOrEqual(HAND.y + HAND.h * 0.5);
      }
    }
  });

  it('blackjack: as alturas seguem a zona — lateral alta, base média, vão curto', () => {
    /* A direção em números: laterais a 30–45% da altura das cartas,
       base a 18–30%, e o vão entre as cartas MENOR que tudo (para não
       esconder índice nem naipe). */
    for (let seed = 0; seed < 20; seed += 1) {
      const model = buildBurst(new SeededRng(seed), HAND, 'blackjack');
      for (const t of model.tongues) {
        const frac = t.len / HAND.h;
        if (t.zone === 'side') {
          expect(frac).toBeGreaterThanOrEqual(0.3 - 1e-9);
          expect(frac).toBeLessThanOrEqual(0.45 + 1e-9);
        } else if (t.zone === 'base') {
          expect(frac).toBeGreaterThanOrEqual(0.18 - 1e-9);
          expect(frac).toBeLessThanOrEqual(0.3 + 1e-9);
        } else if (t.zone === 'center') {
          expect(frac).toBeLessThanOrEqual(0.16 + 1e-9);
        }
      }
    }
  });

  it('blackjack: a base NÃO é uma linha contínua de fogo', () => {
    /* O miolo da base é quase vazio de propósito — era a linha contínua
       ali que virava a massa amarela sob as cartas. Em 400 sorteios, o
       terço central da base fica bem abaixo da fatia proporcional. */
    const rng = new SeededRng(17);
    const zones = BLAZE_VARIANTS.blackjack.zones;
    const total = 400;
    let middleBottom = 0;
    for (let i = 0; i < total; i += 1) {
      const zone = pickZone(rng, zones);
      const x = zone.x[0] + rng.next() * (zone.x[1] - zone.x[0]);
      const y = zone.y[0] + rng.next() * (zone.y[1] - zone.y[0]);
      if (y > 0.9 && x > 0.33 && x < 0.67) middleBottom += 1;
    }
    expect(middleBottom / total).toBeLessThan(0.15);
  });

  it('double-button: a coroa é de CIMA — nada nasce na borda de baixo', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const model = buildBurst(new SeededRng(seed), BUTTON, 'double-button');
      for (const tongue of model.tongues) {
        expect(tongue.y).toBeLessThan(BUTTON.y + BUTTON.h * 0.2);
      }
      for (const p of model.particles) {
        expect(p.y).toBeLessThan(BUTTON.y + BUTTON.h * 0.2);
      }
    }
  });

  it('double-button: quinas maiores, meio com vãos, contagens da direção', () => {
    const model = buildBurst(new SeededRng(8), BUTTON, 'double-button');
    // Entrada com 10–14 chamas e regime com 8–12 — a coroa pedida.
    expect(model.tongues.length).toBeGreaterThanOrEqual(10);
    expect(model.tongues.length).toBeLessThanOrEqual(14);
    const staying = model.tongues.filter((t) => t.sustains).length;
    expect(staying).toBeGreaterThanOrEqual(8);
    expect(staying).toBeLessThanOrEqual(12);
    // 14–22 faíscas na entrada.
    expect(model.particles.length).toBeGreaterThanOrEqual(14);
    expect(model.particles.length).toBeLessThanOrEqual(22);
    // Sem fogueira radial: nem raios, nem anel — e com a linha de luz.
    expect(model.rays).toHaveLength(0);
    expect(model.config.ring).toBe(false);
    expect(model.config.edgeSweep).toBe(true);
    expect(model.config.flash).toBe('horizontal');

    // As chamas das quinas são maiores que as do meio da borda.
    const corner = model.tongues.filter((t) => t.zone === 'top-corner');
    const edge = model.tongues.filter((t) => t.zone === 'top-edge');
    expect(corner.length).toBeGreaterThan(0);
    expect(edge.length).toBeGreaterThan(0);
    const min = (v: readonly { len: number }[]) => Math.min(...v.map((t) => t.len));
    const max = (v: readonly { len: number }[]) => Math.max(...v.map((t) => t.len));
    expect(min(corner)).toBeGreaterThan(max(edge) * 0.6);
    expect(max(corner)).toBeGreaterThan(max(edge));
  });

  it('double-button: a coroa passa da borda o que a direção pede e cabe no céu', () => {
    /* As quinas passam ~13–18px da borda superior (0,30–0,40 de 44px);
       o céu do CSS é 0,45 × 44 ≈ 20px — nenhuma chama nem faísca é
       cortada pela borda do canvas. */
    const sky = BUTTON.h * 0.45;
    for (let seed = 0; seed < 25; seed += 1) {
      const model = buildBurst(new SeededRng(seed), BUTTON, 'double-button');
      for (const t of model.tongues) {
        if (t.zone === 'top-corner') {
          expect(t.len).toBeGreaterThanOrEqual(BUTTON.h * 0.3 - 1e-9);
          expect(t.len).toBeLessThanOrEqual(BUTTON.h * 0.4 + 1e-9);
        }
        expect(t.y - t.len).toBeGreaterThan(BUTTON.y - sky);
      }
      for (const p of model.particles) {
        // Alcance de uma faísca com arrasto exponencial: v₀ / arrasto.
        const climb = Math.abs(p.vy) / p.drag;
        expect(p.y - climb).toBeGreaterThan(BUTTON.y - sky);
      }
    }
  });

  it('double-button: a coroa nasce na parte RETA do topo, não na curva', () => {
    /* O botão é uma pílula com `border-radius: 1rem`. Numa largura de
       ~330px isso são ~4,85% de cada lado em que a borda de cima já
       desceu — chama nascida ali fica no vazio e lê como se estivesse
       flutuando ao lado do botão. A base de cada chama (e a folga da
       meia-largura dela) tem de cair na parte reta. */
    const radiusFrac = 16 / BUTTON.w;
    const halfWMax = BUTTON.h * BLAZE_VARIANTS['double-button'].tongueHalfW[1];
    for (let seed = 0; seed < 30; seed += 1) {
      const model = buildBurst(new SeededRng(seed), BUTTON, 'double-button');
      for (const t of model.tongues) {
        const left = (t.x - halfWMax - BUTTON.x) / BUTTON.w;
        const right = (t.x + halfWMax - BUTTON.x) / BUTTON.w;
        expect(left).toBeGreaterThanOrEqual(radiusFrac);
        expect(right).toBeLessThanOrEqual(1 - radiusFrac);
      }
    }
  });

  it('a hierarquia é explícita: o blackjack pesa mais que o botão', () => {
    expect(BLAZE_VARIANTS.blackjack.intensity).toBe(1);
    expect(BLAZE_VARIANTS['double-button'].intensity).toBeLessThan(
      BLAZE_VARIANTS.blackjack.intensity,
    );
  });
});

describe('blaze — faíscas', () => {
  it('toda faísca nasce numa zona do hospedeiro, sobe e freia', () => {
    for (const variant of VARIANTS) {
      const rect = boxOf(variant);
      const model = buildBurst(new SeededRng(21), rect, variant);
      for (const p of model.particles) {
        expect(p.x).toBeGreaterThan(rect.x - rect.w * 0.1);
        expect(p.x).toBeLessThan(rect.x + rect.w * 1.1);
        expect(p.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(rect.y + rect.h + 1e-9);
        expect(p.vy).toBeLessThan(0);
        expect(p.drag).toBeGreaterThan(0);
      }
    }
  });

  it('as faíscas se veem: nenhum raio abaixo de ~2px na mão cheia', () => {
    // "Evite partículas microscópicas" — o raio mínimo da mão é
    // 0,022 × 95px ≈ 2,1px, e o desenho ainda impõe piso de 1,1px
    // depois do encolhimento.
    const model = buildBurst(new SeededRng(3), HAND, 'blackjack');
    for (const p of model.particles) {
      expect(p.size).toBeGreaterThanOrEqual(HAND.h * 0.022 - 1e-9);
    }
  });

  it('a leva da ENTRADA sobe inteira dentro da entrada', () => {
    const model = buildBurst(new SeededRng(3), HAND, 'blackjack');
    for (const p of model.particles) {
      expect(p.bornAtMs + p.lifeMs).toBeLessThanOrEqual(BLAZE.entranceMs);
    }
    expect(new Set(model.particles.map((p) => Math.round(p.vy))).size).toBeGreaterThan(8);
  });

  it('no regime vivem POUCAS por vez — filete de brasa, não chuveiro', () => {
    /* A conta do que importa: vivas ao mesmo tempo = recicladas × ciclo
       de trabalho (vida ÷ vida+descanso médio). A direção pede ~4–8
       vivas no botão; a mão fica na mesma ordem. */
    const meanLife = (BLAZE.particleLifeMinMs + BLAZE.particleLifeMaxMs) / 2;
    for (const variant of VARIANTS) {
      const model = buildBurst(new SeededRng(5), boxOf(variant), variant);
      const recycling = model.particles.filter((p) => p.recycles).length;
      expect(recycling).toBeGreaterThan(0);
      expect(recycling).toBeLessThan(model.particles.length);

      const duty = meanLife / (meanLife + model.config.restMs / 2);
      const alive = recycling * duty;
      expect(alive).toBeGreaterThan(2);
      expect(alive).toBeLessThan(8);
    }
  });

  it('a faísca reciclada renasce DIFERENTE, e o pool não cresce', () => {
    const rng = new SeededRng(31);
    const model = buildBurst(rng, HAND, 'blackjack');
    const antes = model.particles.length;
    const p = model.particles[0];
    if (!p) throw new Error('o estouro precisa de faíscas');
    const retrato = { ...p };

    const devolvida = respawnParticle(rng, HAND, 'blackjack', 1, p, { bornAtMs: 4000 });

    expect(devolvida).toBe(p);
    expect(model.particles.length).toBe(antes);
    expect(p.bornAtMs).toBe(4000);
    expect(p.x !== retrato.x || p.y !== retrato.y || p.vy !== retrato.vy).toBe(true);
    expect(p.vy).toBeLessThan(0);
  });

  it('NENHUMA estrela é reciclada — ela é da explosão', () => {
    for (const variant of VARIANTS) {
      const rng = new SeededRng(77);
      const rect = boxOf(variant);
      const model = buildBurst(rng, rect, variant);
      const p = model.particles[0];
      if (!p) throw new Error('o estouro precisa de faíscas');
      for (let i = 0; i < 150; i += 1) {
        respawnParticle(rng, rect, variant, 1, p, { bornAtMs: i * 50 });
        expect(p.kind).not.toBe('star');
      }
    }
  });

  it('no máximo DUAS estrelas, discretas, e só na entrada do blackjack', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const bj = buildBurst(new SeededRng(seed), HAND, 'blackjack');
      expect(bj.particles.filter((p) => p.kind === 'star').length).toBeLessThanOrEqual(2);
      const btn = buildBurst(new SeededRng(seed), BUTTON, 'double-button');
      expect(btn.particles.filter((p) => p.kind === 'star')).toHaveLength(0);
    }
  });

  it('a mistura tem os tipos pedidos: pontos, riscos, brasas e as macias', () => {
    const kinds = new Set(
      buildBurst(new SeededRng(1), HAND, 'blackjack').particles.map((p) => p.kind),
    );
    expect(kinds.has('dot')).toBe(true);
    expect(kinds.has('spark')).toBe(true);
    expect(kinds.has('ember')).toBe(true);
  });
});

describe('blaze — geometria e determinismo', () => {
  it('as chamas têm alturas variadas e o desvio aponta para FORA', () => {
    const model = buildBurst(new SeededRng(11), HAND, 'blackjack');
    const cx = HAND.x + HAND.w / 2;
    expect(new Set(model.tongues.map((t) => Math.round(t.len))).size).toBeGreaterThan(5);
    for (const tongue of model.tongues) {
      expect(tongue.len).toBeGreaterThan(0);
      expect(tongue.halfW).toBeGreaterThan(0);
      if (tongue.x < cx) expect(tongue.lean).toBeLessThanOrEqual(0);
      if (tongue.x > cx) expect(tongue.lean).toBeGreaterThanOrEqual(0);
    }
  });

  it('a escala encolhe contagem E tamanho (mão mini do assento)', () => {
    const full = buildBurst(new SeededRng(5), HAND, 'blackjack');
    const mini = buildBurst(new SeededRng(5), HAND, 'blackjack', 0.5);
    expect(mini.particles.length).toBeLessThan(full.particles.length);
    expect(mini.tongues.length).toBeLessThan(full.tongues.length);
    const avg = (v: readonly { len: number }[]) =>
      v.reduce((sum, t) => sum + t.len, 0) / v.length;
    expect(avg(mini.tongues)).toBeLessThan(avg(full.tongues));
  });

  it('o bamboleio é limitado, contínuo e diferente entre vizinhas', () => {
    const model = buildBurst(new SeededRng(13), HAND, 'blackjack');
    const [a, b] = model.tongues;
    if (!a || !b) throw new Error('o estouro precisa de pelo menos duas línguas');
    let differed = false;
    for (let ms = 0; ms < 1500; ms += 25) {
      const na = tongueNoise(a, ms / 1000);
      expect(Math.abs(na)).toBeLessThanOrEqual(1.0001);
      if (Math.abs(na - tongueNoise(b, ms / 1000)) > 0.15) differed = true;
    }
    expect(differed).toBe(true);
  });

  it('mesma semente, mesmo estouro — o modelo é determinístico', () => {
    for (const variant of VARIANTS) {
      const a = buildBurst(new SeededRng(99), boxOf(variant), variant);
      const b = buildBurst(new SeededRng(99), boxOf(variant), variant);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
