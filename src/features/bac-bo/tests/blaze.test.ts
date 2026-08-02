import { describe, expect, it } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import {
  BLAZE,
  buildBurst,
  flameEnvelope,
  flashEnvelope,
  perimeterPoint,
  respawnParticle,
  tongueNoise,
} from '../animations/blaze';

/** A mão do duelo, em tamanho de mesa real. */
const HAND = { x: 60, y: 90, w: 140, h: 96 };

describe('blaze — a coreografia da combustão', () => {
  it('o envelope das chamas sobe, segura e ASSENTA — nunca apaga', () => {
    expect(flameEnvelope(-10)).toBe(0);
    expect(flameEnvelope(0)).toBe(0);
    // Sobe rápido: na metade da subida já passou da metade da força.
    expect(flameEnvelope(BLAZE.flameInMs / 2)).toBeGreaterThan(0.5);
    expect(flameEnvelope(BLAZE.flameInMs)).toBeCloseTo(1, 5);
    expect(flameEnvelope(BLAZE.flameInMs + BLAZE.flameHoldMs - 1)).toBe(1);

    // E o ponto que importa: o decaimento vai ao REGIME, não ao chão. É
    // esta função que separa "o efeito some depois de um tempo" de uma
    // fogueira — quem apaga o fogo é o desmonte do componente.
    const end = BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs;
    expect(flameEnvelope(end)).toBeCloseTo(BLAZE.flameSustain, 5);
    expect(flameEnvelope(end + 60_000)).toBeCloseTo(BLAZE.flameSustain, 5);
    // Assentada, mas inconfundivelmente acesa — e abaixo do pico, para
    // não competir com as cartas pelo resto da mão.
    expect(BLAZE.flameSustain).toBeGreaterThan(0.3);
    expect(BLAZE.flameSustain).toBeLessThan(0.9);
  });

  it('o envelope do flash é um soco: pico quase imediato e some cedo', () => {
    expect(flashEnvelope(0)).toBe(0);
    expect(flashEnvelope(BLAZE.flashInMs)).toBeCloseTo(1, 5);
    // Some MUITO antes das chamas — é o beat de impacto, não iluminação.
    expect(flashEnvelope(BLAZE.flashInMs + BLAZE.flashOutMs)).toBe(0);
    expect(flashEnvelope(BLAZE.flameInMs + BLAZE.flameHoldMs)).toBe(0);
  });

  it('nenhuma chama nasce em cima da mão — só na base e nas laterais', () => {
    const bottom = HAND.y + HAND.h;
    for (let i = 0; i <= 200; i += 1) {
      const at = perimeterPoint(HAND, i / 200);
      // Nada acima do topo do retângulo: fogo não nasce em cima do que
      // está queimando.
      expect(at.y).toBeGreaterThanOrEqual(HAND.y);
      expect(at.y).toBeLessThanOrEqual(bottom + 0.001);
      const onBottom = Math.abs(at.y - bottom) < 0.001;
      const onSide = Math.abs(at.x - HAND.x) < 0.001 || Math.abs(at.x - (HAND.x + HAND.w)) < 0.001;
      expect(onBottom || onSide).toBe(true);
    }
  });

  it('a base leva a maior parte das chamas', () => {
    let onBottom = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (Math.abs(perimeterPoint(HAND, i / 1000).y - (HAND.y + HAND.h)) < 0.001) onBottom += 1;
    }
    expect(onBottom / 1000).toBeGreaterThan(0.5);
  });

  it('o estouro respeita as contagens pedidas pela direção', () => {
    const model = buildBurst(new SeededRng(7), HAND);

    expect(model.rays.length).toBeGreaterThanOrEqual(6);
    expect(model.rays.length).toBeLessThanOrEqual(10);
    expect(model.particles.length).toBeGreaterThanOrEqual(24);
    expect(model.particles.length).toBeLessThanOrEqual(32);

    // Os brilhos em estrela são TEMPERO: dois ou três, nunca uma chuva.
    const stars = model.particles.filter((p) => p.kind === 'star');
    expect(stars.length).toBeLessThanOrEqual(3);
    // E a cena tem os quatro tipos misturados, não um só.
    expect(new Set(model.particles.map((p) => p.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('toda faísca nasce COLADA na mão e sobe', () => {
    const model = buildBurst(new SeededRng(21), HAND);
    const margin = Math.min(HAND.w, HAND.h) * 0.2;
    for (const p of model.particles) {
      expect(p.x).toBeGreaterThan(HAND.x - HAND.w * 0.1 - margin);
      expect(p.x).toBeLessThan(HAND.x + HAND.w * 1.1 + margin);
      expect(p.y).toBeGreaterThan(HAND.y - margin);
      expect(p.y).toBeLessThan(HAND.y + HAND.h + margin);
      // Sobe (y para cima é negativo no canvas) e freia pelo caminho.
      expect(p.vy).toBeLessThan(0);
      expect(p.drag).toBeGreaterThan(0);
    }
  });

  it('as faíscas NÃO sobem todas juntas nem na mesma velocidade', () => {
    const model = buildBurst(new SeededRng(3), HAND);
    const speeds = new Set(model.particles.map((p) => Math.round(p.vy)));
    const delays = new Set(model.particles.map((p) => Math.round(p.bornAtMs / 20)));
    expect(speeds.size).toBeGreaterThan(8);
    expect(delays.size).toBeGreaterThan(4);
    // A leva da ENTRADA sobe inteira dentro da entrada: nenhuma faísca
    // do estouro fica pendurada no regime permanente.
    for (const p of model.particles) {
      expect(p.bornAtMs + p.lifeMs).toBeLessThanOrEqual(BLAZE.entranceMs);
    }
  });

  it('a ENTRADA cobre todos os beats de impacto — nada é cortado no ar', () => {
    // A invariante que o `entranceMs` derivado existe para garantir: é
    // nele que o renderizador baixa a cadência e começa a reciclar
    // faíscas, e um número solto cortaria o rastro no meio do voo.
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(BLAZE.flashInMs + BLAZE.flashOutMs);
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(BLAZE.rayInMs + BLAZE.rayLifeMaxMs);
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(
      BLAZE.flameInMs + BLAZE.flameHoldMs + BLAZE.flameOutMs,
    );
    expect(BLAZE.entranceMs).toBeGreaterThanOrEqual(
      BLAZE.particleStaggerMs + BLAZE.particleLifeMaxMs,
    );
  });

  it('a faísca reciclada renasce DIFERENTE, e o pool não cresce', () => {
    const rng = new SeededRng(31);
    const model = buildBurst(rng, HAND);
    const antes = model.particles.length;
    const p = model.particles[0];
    if (!p) throw new Error('o estouro precisa de faíscas');
    const retrato = { ...p };

    const devolvida = respawnParticle(rng, HAND, 1, p, { bornAtMs: 4000 });

    // MUTA o objeto que já existe: um `respawn` que alocasse encheria de
    // lixo um laço que roda enquanto a mão durar.
    expect(devolvida).toBe(p);
    expect(model.particles.length).toBe(antes);
    expect(p.bornAtMs).toBe(4000);
    // E renasce com outra trajetória — reciclar as mesmas daria trinta
    // riscos idênticos repetindo em ciclo.
    expect(p.x !== retrato.x || p.y !== retrato.y || p.vy !== retrato.vy).toBe(true);
    // Continua obedecendo à física: sobe e freia.
    expect(p.vy).toBeLessThan(0);
    expect(p.drag).toBeGreaterThan(0);
  });

  it('no regime permanente a estrela não volta — ela é da explosão', () => {
    const rng = new SeededRng(77);
    const model = buildBurst(rng, HAND);
    const p = model.particles[0];
    if (!p) throw new Error('o estouro precisa de faíscas');
    for (let i = 0; i < 200; i += 1) {
      respawnParticle(rng, HAND, 1, p, { bornAtMs: i * 50 });
      // Sem `allowStar`, o brilho em estrela nunca reaparece: no regime
      // ele viraria um pisca-pisca a cada poucos segundos.
      expect(p.kind).not.toBe('star');
    }
  });

  it('as chamas têm alturas diferentes e o desvio aponta para FORA', () => {
    const model = buildBurst(new SeededRng(11), HAND);
    const cx = HAND.x + HAND.w / 2;

    const lengths = new Set(model.tongues.map((t) => Math.round(t.len)));
    expect(lengths.size).toBeGreaterThan(6);

    for (const tongue of model.tongues) {
      expect(tongue.len).toBeGreaterThan(0);
      expect(tongue.halfW).toBeGreaterThan(0);
      // Fogo em volta de um objeto ABRE: quem nasce à esquerda do centro
      // pende para a esquerda, e vice-versa.
      if (tongue.x < cx) expect(tongue.lean).toBeLessThanOrEqual(0);
      if (tongue.x > cx) expect(tongue.lean).toBeGreaterThanOrEqual(0);
    }
  });

  it('a escala encolhe contagem E tamanho junto (mão mini do assento)', () => {
    const full = buildBurst(new SeededRng(5), HAND);
    const mini = buildBurst(new SeededRng(5), HAND, 0.5);

    expect(mini.particles.length).toBeLessThan(full.particles.length);
    expect(mini.tongues.length).toBeLessThan(full.tongues.length);
    const avg = (v: readonly { len: number }[]) =>
      v.reduce((sum, t) => sum + t.len, 0) / v.length;
    expect(avg(mini.tongues)).toBeLessThan(avg(full.tongues));
    // A explosão radial nunca cai abaixo do mínimo da direção, mesmo
    // numa mão mini: seis raios é o piso.
    expect(mini.rays.length).toBeGreaterThanOrEqual(6);
  });

  it('o ruído da língua é suave, limitado e não repete entre vizinhas', () => {
    const model = buildBurst(new SeededRng(13), HAND);
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
    const a = buildBurst(new SeededRng(99), HAND);
    const b = buildBurst(new SeededRng(99), HAND);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
