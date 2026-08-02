import { useEffect, useRef } from 'react';

import { CryptoRng } from '@/shared/lib/random';

import {
  BLAZE,
  BLAZE_PALETTE as P,
  buildBurst,
  easeOutCubic,
  flameEnvelope,
  flashEnvelope,
  respawnParticle,
  tongueNoise,
} from '../../animations/blaze';

const TAU = Math.PI * 2;

/**
 * Teto do device pixel ratio. 1,5 e não 2 de propósito: o estouro é
 * feito de brilhos MACIOS, e num efeito sem borda nítida ninguém vê a
 * diferença — mas a área a preencher por quadro cai ~45%, e medindo com
 * a CPU 4× mais lenta era ela que custava os quadros.
 */
const MAX_DPR = 1.5;

/** Cadência do regime permanente (~30fps). Ver a nota no laço. */
const SUSTAIN_FRAME_MS = 32;

export interface BlazeBurstProps {
  /**
   * Régua do hospedeiro: 1 na mão cheia do duelo, menos numa mão mini
   * de assento. Encolhe contagem E tamanho junto — 30 partículas numa
   * carta de 30px viram poeira, não faísca.
   */
  scale?: number;
}

/**
 * A COMBUSTÃO DOURADA — o renderizador.
 *
 * Um estouro de cassino atrás da mão, em CANVAS e não em DOM: são até
 * 40 línguas de fogo, 6 a 10 raios e até 38 faíscas com trajetória
 * própria, e cada uma delas como elemento seria uma camada para o
 * compositor gerenciar por quadro. Aqui é UM nó, uma textura, um
 * requestAnimationFrame.
 *
 * ENTRADA e REGIME. A entrada é o soco: flash, raios e as chamas no
 * pico, tudo a 60fps por ~1,9s (BLAZE.entranceMs). Depois o fogo
 * ASSENTA e fica queimando a ~30fps enquanto este componente viver —
 * quem apaga é o desmonte, quando a mão deixa de ser blackjack ou a
 * dobra sai de cena.
 *
 * Documentação completa, com números medidos: docs/labareda.md.
 *
 * O canvas mora ATRÁS das cartas (z-index abaixo da carta), e isso não é
 * detalhe de empilhamento: é o que faz o flash "não cobrir os números e
 * naipes". A luz nasce no centro inferior da mão, é ocultada pelo corpo
 * das cartas e só escapa em volta delas — que é como fogo atrás de um
 * objeto se comporta de verdade.
 *
 * A pintura toda roda em `lighter` (aditivo): duas chamas que se cruzam
 * CLAREIAM em vez de se cobrir, e é isso que dá o núcleo branco-quente
 * onde elas se juntam sem ninguém pintar branco.
 */
export function BlazeBurst({ scale = 1 }: BlazeBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    // jsdom (e qualquer ambiente sem canvas) devolve null aqui: o efeito
    // simplesmente não acontece, e nada mais na mesa se importa.
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* A preferência é lida por matchMedia AQUI, e não pelo
       `useReducedMotion` do framer: aquele hook devolve null no
       primeiro render e boolean no seguinte, e tê-lo nas dependências
       faria o estouro reiniciar do zero um quadro depois de começar. O
       efeito depende só de `scale`. */
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const handBox = stage.getBoundingClientRect();
    if (handBox.width < 2 || handBox.height < 2) return;

    /* O CÉU do estouro é medido AQUI, e não por `inset` no CSS, por uma
       razão específica: <canvas> é elemento SUBSTITUÍDO, e num
       substituído `width: auto` resolve pelo tamanho intrínseco do
       bitmap — não pelos inset. Deixar o CSS mandar dava uma caixa do
       tamanho do bitmap (e, como o bitmap é derivado da caixa, um laço
       que dobrava de tamanho a cada passagem). O CSS continua dono do
       DESENHO: as razões vivem lá, em custom properties. */
    const ratio = (name: string, fallback: number): number => {
      const raw = Number.parseFloat(getComputedStyle(stage).getPropertyValue(name));
      return Number.isFinite(raw) ? raw : fallback;
    };
    const padX = handBox.width * ratio('--blaze-sky-x', 0.46);
    const padTop = handBox.height * ratio('--blaze-sky-top', 0.95);
    const padBottom = handBox.height * ratio('--blaze-sky-bottom', 0.58);

    const w = handBox.width + padX * 2;
    const h = handBox.height + padTop + padBottom;
    canvas.style.left = `${-padX}px`;
    canvas.style.top = `${-padTop}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* A mão dentro do canvas: o canvas é o palco (bem maior, para as
       faíscas subirem), e este retângulo é o objeto que queima. */
    const hand = { x: padX, y: padTop, w: handBox.width, h: handBox.height };

    const rng = new CryptoRng();
    const model = buildBurst(rng, hand, scale);

    /* SPRITES: o brilho de uma faísca é um gradiente radial, e criar um
       por partícula por quadro seriam ~1900 gradientes por segundo. Ele
       é desenhado UMA vez aqui e depois só reaproveitado com drawImage —
       a diferença entre um efeito que cabe no orçamento e um que não. */
    const glow = (rgb: string, softness: number): HTMLCanvasElement => {
      const s = document.createElement('canvas');
      s.width = 64;
      s.height = 64;
      const sctx = s.getContext('2d');
      if (!sctx) return s;
      const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${rgb}, 1)`);
      g.addColorStop(softness, `rgba(${rgb}, 0.55)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, 64, 64);
      return s;
    };
    const coreSprite = glow(P.core, 0.26);
    const goldSprite = glow(P.gold, 0.3);
    const amberSprite = glow(P.amber, 0.32);
    const emberSprite = glow(P.deepOrange, 0.34);

    /* QUANTOS CARIMBOS formam uma língua. A primeira versão desenhou a
       língua como polígono preenchido com gradiente, e o resultado foi
       um caco de vidro amarelo: polígono tem borda DURA, e fogo não tem
       borda nenhuma. Aqui cada língua é uma pluma de discos macios
       carimbados ao longo de uma espinha curva, encolhendo e apagando
       da base para a ponta. Some com `lighter`, e onde muitos discos se
       cruzam — a base — a soma satura em branco-quente sozinha, sem
       ninguém pintar branco. */
    const STAMPS = 6;

    let raf = 0;
    let lastDrawnAt = Number.NEGATIVE_INFINITY;
    const start = performance.now();

    const draw = (elapsed: number): void => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      // ---- 3. Explosão radial: os raios saem primeiro e apagam antes de
      //         todo o resto, para não virarem desenho de sol.
      for (const ray of model.rays) {
        const lt = elapsed - ray.delayMs;
        if (lt < 0 || lt > ray.lifeMs) continue;
        const k = lt / ray.lifeMs;
        const alpha =
          k < 0.14 ? k / 0.14 : Math.max(0, 1 - easeOutCubic((k - 0.14) / 0.86));
        const len = ray.len + ray.grow * easeOutCubic(k);
        const cos = Math.cos(ray.angle);
        const sin = Math.sin(ray.angle);
        ctx.globalAlpha = alpha * 0.36;
        ctx.strokeStyle = `rgba(${P.lightGold}, 1)`;
        ctx.lineWidth = ray.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(model.center.x + cos * len * 0.38, model.center.y + sin * len * 0.38);
        ctx.lineTo(model.center.x + cos * len, model.center.y + sin * len);
        ctx.stroke();
      }

      // ---- 2. Chamas: nascem no perímetro e SOBEM. O que se move é a
      //         forma de cada língua (comprimento e desvio da ponta), não
      //         o efeito inteiro — subir e descer em bloco é o que fazia
      //         a versão anterior parecer um elemento flutuando.
      for (const tongue of model.tongues) {
        const env = flameEnvelope(elapsed - tongue.delayMs);
        if (env <= 0.002) continue;
        const n = tongueNoise(tongue, elapsed / 1000);
        const len = tongue.len * env * (0.7 + 0.36 * (0.5 + 0.5 * n));
        if (len < 1) continue;

        for (let i = 0; i < STAMPS; i += 1) {
          /* `u` anda da base (0) para a ponta (1). A espinha não é reta:
             ela pende para fora conforme sobe (u²) e recebe a deformação
             lateral do ruído no meio do caminho — é isso que dá a
             assimetria orgânica, e o que impede as 16 línguas de
             parecerem a mesma língua repetida. */
          const u = i / (STAMPS - 1);
          const sway = Math.sin(u * Math.PI) * n * tongue.wobble;
          const px = tongue.x + tongue.lean * u * u + sway + n * tongue.wobble * u * 0.7;
          const py = tongue.y - len * u;
          // O disco encolhe subindo — base concentrada, ponta fina.
          const r = tongue.halfW * (2.3 - 1.7 * u) * (1 + 0.12 * n);
          if (r <= 0.2) continue;
          /* A temperatura sobe de dentro para fora da chama: núcleo até
             pouco acima da base, ouro no corpo, âmbar já perto da ponta.
             O laranja profundo mora só na extremidade. */
          const alpha = env * (1 - u) ** 1.2 * 0.62;
          // Carimbo que não se vê não se paga: abaixo disto o disco não
          // muda um pixel e ainda assim custaria o preenchimento.
          if (alpha < 0.015) continue;
          const sprite = u < 0.13 ? coreSprite : u < 0.58 ? goldSprite : amberSprite;
          ctx.globalAlpha = alpha;
          ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
        }
      }

      // ---- 1. Impacto de luz: o soco, no centro INFERIOR da mão.
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
        g.addColorStop(0, `rgba(${P.core}, ${0.85 * flash})`);
        g.addColorStop(0.12, `rgba(${P.lightGold}, ${0.66 * flash})`);
        g.addColorStop(0.38, `rgba(${P.gold}, ${0.42 * flash})`);
        g.addColorStop(0.68, `rgba(${P.amber}, ${0.18 * flash})`);
        g.addColorStop(1, `rgba(${P.amber}, 0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(model.flash.x, model.flash.y, r, 0, TAU);
        ctx.fill();

        /* O ANEL. Sem ele o flash é um clarão que acende e apaga; com
           ele há uma FRENTE de onda saindo do ponto de impacto, e é a
           frente que o olho lê como soco. Ele corre mais rápido que o
           clarão e morre antes dele. */
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
          const ringA = (1 - ringK) ** 1.5 * 0.5;
          shell.addColorStop(0, `rgba(${P.gold}, 0)`);
          shell.addColorStop(0.5, `rgba(${P.lightGold}, ${ringA})`);
          shell.addColorStop(1, `rgba(${P.amber}, 0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = shell;
          ctx.beginPath();
          ctx.arc(model.flash.x, model.flash.y, rr * 1.12, 0, TAU);
          ctx.fill();
        }
      }

      // ---- 4. Partículas: sobem, perdem velocidade e apagam sem corte.
      for (const p of model.particles) {
        const lt = elapsed - p.bornAtMs;
        if (lt < 0) continue;
        if (lt > p.lifeMs) {
          /* Morreu: renasce no perímetro, com um descanso sorteado. É
             assim que o regime permanente vira um filete de brasa em
             vez do chuveiro da entrada — e o pool não cresce um objeto
             sequer, porque `respawnParticle` MUTA o que já existe. */
          respawnParticle(rng, hand, scale, p, {
            bornAtMs: elapsed + rng.next() * BLAZE.particleRestMs,
          });
          continue;
        }
        const k = lt / p.lifeMs;
        const s = lt / 1000;
        /* Arrasto exponencial: v(t) = v₀·e^(−d·t). A posição é a
           integral disso — é o que faz a faísca PERDER velocidade em vez
           de viajar reta até sumir. */
        const travel = (1 - Math.exp(-p.drag * s)) / p.drag;
        const px = p.x + p.vx * travel + Math.sin(s * p.swayF + p.phase) * p.swayA;
        const py = p.y + p.vy * travel;
        const fadeIn = k < 0.1 ? k / 0.1 : 1;
        const alpha = fadeIn * (1 - k) ** 1.5;
        if (alpha <= 0.004) continue;
        ctx.globalAlpha = alpha;

        if (p.kind === 'spark') {
          // Faísca alongada: o rastro deita na direção do movimento e
          // encolhe junto com a velocidade.
          const speed = Math.exp(-p.drag * s);
          ctx.strokeStyle = `rgba(${P.lightGold}, 1)`;
          ctx.lineWidth = Math.max(0.6, p.size * 0.8);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - p.vx * speed * 0.02, py - p.vy * speed * 0.02);
          ctx.stroke();
        } else if (p.kind === 'star') {
          /* Brilho em estrela: dois riscos cruzados, e só nos primeiros
             45% da vida. São dois ou três na cena inteira — tempero, não
             ingrediente. */
          if (k > 0.45) continue;
          const arm = p.size * 4.6 * (1 - k / 0.45);
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = `rgba(${P.core}, 1)`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(px - arm, py);
          ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm);
          ctx.lineTo(px, py + arm);
          ctx.stroke();
        } else {
          const sprite = p.kind === 'ember' ? emberSprite : goldSprite;
          const d = p.size * (p.kind === 'ember' ? 8 : 10);
          ctx.globalAlpha = alpha * (p.kind === 'ember' ? 0.7 : 1);
          ctx.drawImage(sprite, px - d / 2, py - d / 2, d, d);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    if (still) {
      /* Movimento reduzido: nada de rAF. UM quadro, no nível em que a
         chama assenta, e ele fica. O fogo continua dizendo o que tem de
         dizer — ele só não se mexe. */
      draw(BLAZE.entranceMs + 400);
      return;
    }

    /* O laço não termina: quem apaga o fogo é o desmonte deste
       componente, quando a mão deixa de ser blackjack ou a mão da mesa
       fecha. Enquanto ele vive, a chama queima.

       Passada a ENTRADA a cadência cai para ~30fps. O estouro merece
       cada quadro; o regime permanente, não — a chama é feita de
       brilhos macios, ninguém distingue 30 de 60 nela, e o custo cai
       pela metade justamente na parte que dura. */
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const elapsed = now - start;
      const settled = elapsed > BLAZE.entranceMs;
      if (settled && now - lastDrawnAt < SUSTAIN_FRAME_MS) return;
      lastDrawnAt = now;
      draw(elapsed);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scale]);

  return (
    <canvas
      ref={canvasRef}
      className="blaze-burst"
      aria-hidden="true"
      data-testid="blaze-burst"
    />
  );
}
