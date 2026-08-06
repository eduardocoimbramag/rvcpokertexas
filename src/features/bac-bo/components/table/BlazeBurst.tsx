import { useEffect, useRef } from 'react';

import { CryptoRng } from '@/shared/lib/random';

import type { BlazeTongue, BlazeVariant } from '../../animations/blaze';
import {
  BLAZE,
  BLAZE_PALETTE as P,
  BLAZE_VARIANTS,
  buildBurst,
  easeOutCubic,
  flameEnvelope,
  flashEnvelope,
  respawnParticle,
  settleProgress,
} from '../../animations/blaze';

const TAU = Math.PI * 2;

/**
 * Teto do device pixel ratio. 1,5 e não 2 de propósito: medindo com a
 * CPU 4× mais lenta, era a área de preenchimento que custava os
 * quadros — e a 1,5 ninguém vê a diferença num efeito em movimento.
 */
const MAX_DPR = 1.5;

/** Cadência do regime permanente (~30fps). Ver a nota no laço. */
const SUSTAIN_FRAME_MS = 32;

export interface BlazeBurstProps {
  /**
   * QUAL desenho. Não é um tema da mesma cena: cada variante tem
   * zonas de nascimento, contagens, impacto e peso próprios — ver
   * BLAZE_VARIANTS.
   */
  variant?: BlazeVariant;
  /**
   * Régua do TAMANHO. Uma mão mini de assento é a mesma cena menor;
   * quem muda o desenho é a variante, não isto.
   */
  scale?: number;
}

/**
 * A LABAREDA — o renderizador.
 *
 * FOGO CARTOON: cada língua é uma FORMA — base larga, corpo curvo,
 * ponta estreita — desenhada com curvas de Bézier e preenchida em duas
 * ou três camadas de cor chapada (laranja fora, amarelo/dourado no
 * corpo, creme num núcleo pequeno na base). As camadas são pintadas em
 * `source-over`, não em aditivo: a versão anterior somava discos de
 * gradiente em `lighter` e o resultado era uma nuvem amarela sem
 * silhueta. Forma vem de contorno, e contorno não sobrevive à soma.
 *
 * A base de cada chama é ANCORADA. O que dança é o corpo: a ponta
 * bamboleia, a altura respira, a largura contrai, a curvatura muda —
 * cada língua com fases e frequências próprias, contínuas (nenhum
 * ciclo "reinicia"). O canvas inteiro nunca sobe nem desce.
 *
 * ENTRADA e REGIME são composições diferentes: a entrada tem flash,
 * raios e o núcleo creme aceso, a 60fps; o regime corta parte das
 * línguas, recolhe o creme e mantém o fogo amarelo fluido a ~30fps,
 * enquanto o componente viver. Quem apaga é o desmonte.
 *
 * O canvas mora ATRÁS do hospedeiro: no blackjack a luz nasce embaixo
 * das cartas e escapa em volta, sem cobrir número nem naipe; no botão
 * as chamas sobem por trás da pílula.
 *
 * Documentação completa: docs/labareda.md.
 */
export function BlazeBurst({ variant = 'blackjack', scale = 1 }: BlazeBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    // jsdom (e qualquer ambiente sem canvas) devolve null aqui: o
    // efeito simplesmente não acontece, e nada mais na mesa se importa.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* A preferência é lida por matchMedia AQUI, e não pelo
       `useReducedMotion` do framer: aquele hook devolve null no
       primeiro render e boolean no seguinte, e tê-lo nas dependências
       faria o estouro reiniciar do zero um quadro depois de começar. */
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const hostBox = stage.getBoundingClientRect();
    if (hostBox.width < 2 || hostBox.height < 2) return;

    /* O CÉU do estouro é medido AQUI, e não por `inset` no CSS:
       <canvas> é elemento SUBSTITUÍDO, e num substituído `width: auto`
       resolve pelo tamanho intrínseco do bitmap — não pelos inset.
       Deixar o CSS mandar dava uma caixa do tamanho do bitmap (e, como
       o bitmap é derivado da caixa, um laço que dobrava de tamanho a
       cada passagem). O CSS continua dono do DESENHO: as razões vivem
       lá, em custom properties. */
    const ratio = (name: string, fallback: number): number => {
      const raw = Number.parseFloat(getComputedStyle(stage).getPropertyValue(name));
      return Number.isFinite(raw) ? raw : fallback;
    };
    const padX = hostBox.width * ratio('--blaze-sky-x', 0.42);
    const padTop = hostBox.height * ratio('--blaze-sky-top', 0.9);
    const padBottom = hostBox.height * ratio('--blaze-sky-bottom', 0.5);

    const w = hostBox.width + padX * 2;
    const h = hostBox.height + padTop + padBottom;
    canvas.style.left = `${-padX}px`;
    canvas.style.top = `${-padTop}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* O hospedeiro dentro do canvas: o canvas é o palco (maior, para
       as faíscas subirem), e este retângulo é o objeto que queima. */
    const host = { x: padX, y: padTop, w: hostBox.width, h: hostBox.height };

    const cfg = BLAZE_VARIANTS[variant];
    const rng = new CryptoRng();
    const model = buildBurst(rng, host, variant, scale);

    /* SPRITE de brilho macio — usado só nos halos das faíscas, no
       `puff` e na cabeça da linha de luz. As CHAMAS não usam sprite
       nenhum: elas são caminho preenchido. */
    const glow = (rgb: string): HTMLCanvasElement => {
      const s = document.createElement('canvas');
      s.width = 64;
      s.height = 64;
      const sctx = s.getContext('2d');
      if (!sctx) return s;
      const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb}, 1)`);
      g.addColorStop(0.3, `rgba(${rgb}, 0.5)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 64, 64);
      return s;
    };
    const goldGlow = glow(P.gold);
    const creamGlow = glow(P.cream);

    /* O estado VIVO de cada língua neste quadro, pré-alocado: as três
       passadas de cor leem daqui sem recalcular o bamboleio — e sem
       alocar um objeto por quadro num laço que roda a mão inteira. */
    const n = model.tongues.length;
    const liveLen = new Float64Array(n);
    const liveW = new Float64Array(n);
    const liveSway = new Float64Array(n);
    const liveBend = new Float64Array(n);
    const liveAlpha = new Float64Array(n);

    /**
     * A SILHUETA de uma língua: base larga e arredondada, corpo que
     * pende e se curva, ponta estreita. Duas Bézier cúbicas (uma por
     * flanco) que convergem na ponta + uma quadrática fechando a base
     * por baixo — nada de triângulo rígido.
     */
    const flamePath = (
      t: BlazeTongue,
      len: number,
      halfW: number,
      sway: number,
      bend: number,
    ): void => {
      const tipX = t.x + t.lean * 0.8 + sway;
      const tipY = t.y - len;
      ctx.beginPath();
      ctx.moveTo(t.x - halfW, t.y);
      ctx.bezierCurveTo(
        t.x - halfW * 1.22 + bend * 0.4,
        t.y - len * 0.32,
        tipX - halfW * 0.5 + bend,
        t.y - len * 0.74,
        tipX,
        tipY,
      );
      ctx.bezierCurveTo(
        tipX + halfW * 0.5 + bend,
        t.y - len * 0.74,
        t.x + halfW * 1.22 + bend * 0.4,
        t.y - len * 0.32,
        t.x + halfW,
        t.y,
      );
      ctx.quadraticCurveTo(t.x, t.y + halfW * 0.55, t.x - halfW, t.y);
      ctx.closePath();
    };

    let raf = 0;
    let lastDrawnAt = Number.NEGATIVE_INFINITY;
    const start = performance.now();

    const draw = (elapsed: number): void => {
      ctx.clearRect(0, 0, w, h);
      /* A hierarquia entre variantes: multiplica o alfa de tudo. */
      const weight = cfg.intensity;
      /* Quanto o fogo já assentou — a régua da troca de composição. */
      const settled = settleProgress(elapsed);
      const tSec = elapsed / 1000;

      // ---- Impacto (aditivo): flash + anel + raios, só na entrada.
      ctx.globalCompositeOperation = 'lighter';

      const flash = flashEnvelope(elapsed);
      if (flash > 0.002) {
        const grow = easeOutCubic(Math.min(1, elapsed / (BLAZE.flashInMs + BLAZE.flashOutMs)));
        const r = model.flash.radius * (0.22 + 0.98 * grow);
        const g = ctx.createRadialGradient(
          model.flash.x,
          model.flash.y,
          0,
          model.flash.x,
          model.flash.y,
          r,
        );
        /* Creme só num miolo curto; o corpo do clarão é amarelo e
           dourado — flash dourado, não branco. */
        g.addColorStop(0, `rgba(${P.cream}, ${0.7 * flash * weight})`);
        g.addColorStop(0.14, `rgba(${P.yellow}, ${0.6 * flash * weight})`);
        g.addColorStop(0.4, `rgba(${P.gold}, ${0.4 * flash * weight})`);
        g.addColorStop(0.7, `rgba(${P.orange}, ${0.16 * flash * weight})`);
        g.addColorStop(1, `rgba(${P.orange}, 0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.save();
        if (cfg.flash === 'horizontal') {
          /* O soco do botão é achatado: um clarão circular numa pílula
             de 330×44 viraria uma bola de luz no meio. Achatado, ele
             corre a extensão como um filamento acendendo. */
          ctx.translate(model.flash.x, model.flash.y);
          ctx.scale(1, 0.3);
          ctx.translate(-model.flash.x, -model.flash.y);
        }
        ctx.beginPath();
        ctx.arc(model.flash.x, model.flash.y, r, 0, TAU);
        ctx.fill();
        ctx.restore();

        /* O ANEL, só no impacto radial: a frente de onda que o olho lê
           como soco. Corre mais rápido que o clarão e morre antes. */
        if (cfg.ring) {
          const ringK = Math.min(1, elapsed / 300);
          if (ringK < 1) {
            const rr = model.flash.radius * (0.1 + 1.05 * easeOutCubic(ringK));
            const shell = ctx.createRadialGradient(
              model.flash.x,
              model.flash.y,
              rr * 0.68,
              model.flash.x,
              model.flash.y,
              rr * 1.12,
            );
            const ringA = (1 - ringK) ** 1.5 * 0.5 * weight;
            shell.addColorStop(0, `rgba(${P.gold}, 0)`);
            shell.addColorStop(0.5, `rgba(${P.yellow}, ${ringA})`);
            shell.addColorStop(1, `rgba(${P.orange}, 0)`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = shell;
            ctx.beginPath();
            ctx.arc(model.flash.x, model.flash.y, rr * 1.12, 0, TAU);
            ctx.fill();
          }
        }
      }

      for (const ray of model.rays) {
        const lt = elapsed - ray.delayMs;
        if (lt < 0 || lt > ray.lifeMs) continue;
        const k = lt / ray.lifeMs;
        const alpha = k < 0.14 ? k / 0.14 : Math.max(0, 1 - easeOutCubic((k - 0.14) / 0.86));
        const len = ray.len + ray.grow * easeOutCubic(k);
        const cos = Math.cos(ray.angle);
        const sin = Math.sin(ray.angle);
        ctx.globalAlpha = alpha * 0.34 * weight;
        ctx.strokeStyle = `rgba(${P.yellow}, 1)`;
        ctx.lineWidth = ray.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(model.center.x + cos * len * 0.38, model.center.y + sin * len * 0.38);
        ctx.lineTo(model.center.x + cos * len, model.center.y + sin * len);
        ctx.stroke();
      }

      /* ---- As CHAMAS (source-over: cor chapada, silhueta nítida).
         O bamboleio de cada língua é calculado UMA vez e as três
         passadas de cor leem do scratch. Pintar por CAMADA — todos os
         laranjas, depois todos os amarelos, depois os cremes — funde
         as silhuetas vizinhas num contorno só, que é como fogo cartoon
         se desenha; por língua, cada chama cobriria o miolo da vizinha
         com a própria borda laranja. */
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < n; i += 1) {
        const tongue = model.tongues[i] as BlazeTongue;
        const env = flameEnvelope(elapsed - tongue.delayMs, tongue.sustains ? cfg.flameSustain : 0);
        if (env <= 0.004) {
          liveAlpha[i] = 0;
          continue;
        }
        const n1 = Math.sin(tSec * tongue.f1 + tongue.p1);
        const n2 = Math.sin(tSec * tongue.f2 + tongue.p2);
        /* As sobreviventes CRESCEM ao assentar (+45%): sem isso o
           regime somava três reduções — menos línguas, envelope menor,
           creme recolhido — e virava um sussurro. Crescer devolve a
           presença sem devolver a massa: chamas grandes e espaçadas. */
        const grown = tongue.sustains ? 1 + 0.45 * settled : 1;
        // A altura respira POUCO (±12%): quem dança é a ponta.
        liveLen[i] = tongue.len * env * grown * (0.88 + 0.08 * n1 + 0.04 * n2);
        // A largura contrai e expande fora de fase com a altura.
        liveW[i] = tongue.halfW * grown * (1 + 0.14 * n2);
        liveSway[i] = tongue.wobble * (0.65 * n1 + 0.35 * n2);
        // A curvatura do corpo muda devagar — o "S" da chama.
        liveBend[i] = tongue.wobble * 0.55 * Math.sin(tSec * tongue.f1 * 0.55 + tongue.p2);
        liveAlpha[i] = Math.min(1, env * 1.6) * weight;
      }

      // Camada externa: laranja — a silhueta.
      ctx.fillStyle = `rgba(${P.orange}, 1)`;
      for (let i = 0; i < n; i += 1) {
        if (liveAlpha[i] === 0 || (liveLen[i] as number) < 2) continue;
        const t = model.tongues[i] as BlazeTongue;
        ctx.globalAlpha = 0.82 * (liveAlpha[i] as number);
        flamePath(
          t,
          liveLen[i] as number,
          liveW[i] as number,
          liveSway[i] as number,
          liveBend[i] as number,
        );
        ctx.fill();
      }

      /* Camada do corpo: amarelo vivo (a cor dominante), com um terço
         das línguas em dourado para a coroa não sair monocromática. */
      for (let i = 0; i < n; i += 1) {
        if (liveAlpha[i] === 0 || (liveLen[i] as number) < 2) continue;
        const t = model.tongues[i] as BlazeTongue;
        ctx.fillStyle = i % 3 === 0 ? `rgba(${P.gold}, 1)` : `rgba(${P.yellow}, 1)`;
        ctx.globalAlpha = 0.92 * (liveAlpha[i] as number);
        // O corpo lê o MESMO bamboleio com um leve atraso de fase
        // (0,85): a camada de dentro persegue a de fora — fluidez.
        flamePath(
          t,
          (liveLen[i] as number) * 0.68,
          (liveW[i] as number) * 0.66,
          (liveSway[i] as number) * 0.85,
          (liveBend[i] as number) * 0.85,
        );
        ctx.fill();
      }

      /* Núcleo: creme, pequeno e SÓ na base — e recolhendo no regime.
         É o freio contra a massa branca: no clímax ele existe, cinco
         segundos depois é quase só amarelo. */
      const coreAlpha = 0.85 * (1 - 0.75 * settled);
      if (coreAlpha > 0.02) {
        ctx.fillStyle = `rgba(${P.cream}, 1)`;
        for (let i = 0; i < n; i += 1) {
          if (liveAlpha[i] === 0 || (liveLen[i] as number) < 3) continue;
          const t = model.tongues[i] as BlazeTongue;
          ctx.globalAlpha = coreAlpha * (liveAlpha[i] as number);
          flamePath(
            t,
            (liveLen[i] as number) * 0.3,
            (liveW[i] as number) * 0.42,
            (liveSway[i] as number) * 0.6,
            0,
          );
          ctx.fill();
        }
      }

      // ---- A linha de luz do botão (entrada, uma vez): percorre a
      //      borda superior da esquerda para a direita.
      ctx.globalCompositeOperation = 'lighter';
      if (cfg.edgeSweep && elapsed < BLAZE.edgeSweepMs) {
        const k = elapsed / BLAZE.edgeSweepMs;
        const headX = host.x + host.w * k;
        const tail = Math.min(52, host.w * 0.16);
        const y = host.y + 1.5;
        const fade = Math.sin(Math.PI * k) ** 0.6 * weight;
        const grad = ctx.createLinearGradient(headX - tail, y, headX, y);
        grad.addColorStop(0, `rgba(${P.gold}, 0)`);
        grad.addColorStop(1, `rgba(${P.cream}, ${0.9 * fade})`);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.max(host.x, headX - tail), y);
        ctx.lineTo(headX, y);
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.drawImage(creamGlow, headX - 9, y - 9, 18, 18);
      }

      // ---- Faíscas: sobem, perdem velocidade e apagam sem corte.
      for (const p of model.particles) {
        const lt = elapsed - p.bornAtMs;
        if (lt < 0) continue;
        if (lt > p.lifeMs) {
          /* Morreu. Só as marcadas renascem — é assim que o regime é
             um filete de brasa, não o chuveiro da entrada. E o pool
             não cresce: `respawnParticle` MUTA o que já existe. */
          if (!p.recycles) continue;
          respawnParticle(rng, host, variant, scale, p, {
            bornAtMs: elapsed + rng.next() * cfg.restMs,
          });
          continue;
        }
        const k = lt / p.lifeMs;
        const s = lt / 1000;
        /* Arrasto exponencial: v(t) = v₀·e^(−d·t). A posição é a
           integral disso — a faísca PERDE velocidade em vez de viajar
           reta até sumir. */
        const travel = (1 - Math.exp(-p.drag * s)) / p.drag;
        const px = p.x + p.vx * travel + Math.sin(s * p.swayF + p.phase) * p.swayA;
        const py = p.y + p.vy * travel;
        const fadeIn = k < 0.1 ? k / 0.1 : 1;
        const alpha = fadeIn * (1 - k) ** 1.5 * weight;
        if (alpha <= 0.004) continue;
        // A faísca encolhe ao subir — mas nunca a ponto de sumir.
        const r = p.size * (1 - 0.45 * k);

        if (p.kind === 'spark') {
          const speed = Math.exp(-p.drag * s);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = `rgba(${P.yellow}, 1)`;
          ctx.lineWidth = Math.max(1.2, r * 0.7);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - p.vx * speed * 0.022, py - p.vy * speed * 0.022);
          ctx.stroke();
        } else if (p.kind === 'star') {
          if (k > 0.45) continue;
          const arm = r * 3.6 * (1 - k / 0.45);
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = `rgba(${P.cream}, 1)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - arm, py);
          ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm);
          ctx.lineTo(px, py + arm);
          ctx.stroke();
        } else if (p.kind === 'puff') {
          // A partícula grande e macia: só halo, sem miolo.
          ctx.globalAlpha = alpha * 0.4;
          ctx.drawImage(goldGlow, px - r * 3, py - r * 3, r * 6, r * 6);
        } else {
          /* dot/ember: um DISCO nítido com um halo curto atrás — a
             faísca se vê, não é poeira. */
          const tint = p.kind === 'ember' ? P.orange : P.yellow;
          ctx.globalAlpha = alpha * 0.55;
          ctx.drawImage(goldGlow, px - r * 2.4, py - r * 2.4, r * 4.8, r * 4.8);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = `rgba(${tint}, 1)`;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.1, r), 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    if (still) {
      /* Movimento reduzido: nada de rAF. UM quadro, já no REGIME — a
         silhueta cartoon parada continua dizendo "em brasa". */
      draw(BLAZE.entranceMs + 400);
      return;
    }

    /* O laço não termina: quem apaga o fogo é o desmonte deste
       componente, quando o blackjack sai da mesa ou a dobra deixa de
       valer. Passada a ENTRADA a cadência cai para ~30fps — o regime
       dura a mão inteira, e é nele que o custo importa. */
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const elapsed = now - start;
      if (elapsed > BLAZE.entranceMs && now - lastDrawnAt < SUSTAIN_FRAME_MS) return;
      lastDrawnAt = now;
      draw(elapsed);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [variant, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="blaze-burst"
      aria-hidden="true"
      data-testid="blaze-burst"
      data-variant={variant}
    />
  );
}
