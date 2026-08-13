import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEALER_REACTIONS } from '../scene/dealer/DealerController';
import { IDLE_BEATS } from '../scene/dealer/dealerBeats';
import { faceForReaction, tearsForReaction } from '../scene/dealer/dealerExpression';
import {
  CORTE_CABECA,
  CORTE_CORPO,
  PARTS,
  PIVOTS,
  RIG_ASPECT,
  RIG_VIEWBOX,
} from '../scene/dealer/dealerRig';
import { NovaDealer } from '../scene/dealer/NovaDealer';

/**
 * O rig da crupiê nova. O que se cobra aqui são as INVARIANTES que a
 * montagem não pode perder de vista — as que, quebradas, produzem uma
 * crupiê visivelmente errada e nenhum erro de compilação:
 * arquivo de peça que não existe, peça fora do enquadramento e o
 * recorte cabeça/corpo deixando de se sobrepor (o que abriria uma
 * fresta no pescoço na primeira vez que ela virasse a cabeça).
 */

const [VX, VY, VW, VH] = RIG_VIEWBOX.split(' ').map(Number) as [number, number, number, number];

describe('geometria do rig', () => {
  it('toda peça aponta para um SVG de dealernova', () => {
    // As peças moram em `public/` (servidas cruas, sem passar pelo
    // bundler): não há import que o compilador possa conferir, então o
    // que se cobra aqui é a FORMA do caminho — pasta conhecida, extensão
    // certa e nenhuma peça apontando para o arquivo de outra.
    const vistos = new Set<string>();
    for (const [nome, peca] of Object.entries(PARTS)) {
      expect(peca.src, nome).toMatch(/\/dealernova\/(semvar|varfeliz|vartriste)\/[\w-]+\.svg$/);
      // A lágrima é a única peça instanciada duas vezes (uma por olho).
      if (!nome.startsWith('lagrima')) {
        expect(vistos.has(peca.src), `${nome} repete ${peca.src}`).toBe(false);
        vistos.add(peca.src);
      }
    }
  });

  it('a proporção reservada no CSS é 1:2, a mesma do rig anterior', () => {
    // A crupiê nova tinha de entrar no MESMO lugar e no MESMO tamanho da
    // antiga: `.dealer-rig` reserva altura × proporção, e qualquer valor
    // que não seja 1:2 muda o enquadramento de toda a cena.
    expect(RIG_ASPECT).toBe('440 / 880');
    expect(VW / (VH ?? 1)).toBeCloseTo(0.5, 5);
  });

  it('toda peça tem tamanho positivo', () => {
    for (const [nome, peca] of Object.entries(PARTS)) {
      expect(peca.w, nome).toBeGreaterThan(0);
      expect(peca.h, nome).toBeGreaterThan(0);
    }
  });

  it('o corpo e a cabeça cabem no enquadramento', () => {
    // Braços em gesto podem sangrar para fora (o SVG é overflow:visible),
    // mas o TRONCO e a CABEÇA não: se saírem, a crupiê aparece cortada.
    for (const peca of [PARTS.corpo, PARTS.cabeloTras, PARTS.cabeloFrente]) {
      expect(peca.x).toBeGreaterThanOrEqual(VX);
      expect(peca.x + peca.w).toBeLessThanOrEqual(VX + VW);
      expect(peca.y).toBeGreaterThanOrEqual(VY);
    }
  });

  it('o recorte cabeça/corpo se sobrepõe (senão o pescoço abre fresta)', () => {
    expect(CORTE_CORPO).toBeLessThan(CORTE_CABECA);
    // O pivô da cabeça mora DENTRO da sobreposição: é girando ali que a
    // emenda fica escondida na sombra preta do queixo.
    expect(PIVOTS.cabeca.y).toBeGreaterThanOrEqual(CORTE_CORPO);
    expect(PIVOTS.cabeca.y).toBeLessThanOrEqual(CORTE_CABECA);
  });

  it('ombros e cotovelos ficam no mesmo eixo e na mesma altura', () => {
    const meioOmbros = (PIVOTS.ombroDir.x + PIVOTS.ombroEsq.x) / 2;
    const meioCotovelos = (PIVOTS.cotoveloDir.x + PIVOTS.cotoveloEsq.x) / 2;
    // Os dois pares têm de compartilhar o MESMO eixo: um braço pendurado
    // meia unidade fora do outro já lê como ombro torto.
    expect(meioOmbros).toBeCloseTo(meioCotovelos, 0);
    // E esse eixo tem de bater com o da cabeça — com folga de 1,5, porque
    // a própria arte não é simétrica ao pixel (o centro do rosto e o do
    // vestido, medidos, ficam a 1,5 um do outro).
    expect(Math.abs(meioOmbros - PIVOTS.cabeca.x)).toBeLessThan(1.5);
    expect(PIVOTS.ombroDir.y).toBe(PIVOTS.ombroEsq.y);
    expect(PIVOTS.cotoveloDir.y).toBe(PIVOTS.cotoveloEsq.y);
  });

  it('o antebraço começa ACIMA do pivô do cotovelo (a calota se sobrepõe)', () => {
    // É essa sobreposição que faz o contorno atravessar a articulação
    // sem degrau quando o cotovelo dobra.
    expect(PARTS.antebracoDir.y).toBeLessThan(PIVOTS.cotoveloDir.y);
    expect(PARTS.antebracoEsq.y).toBeLessThan(PIVOTS.cotoveloEsq.y);
  });
});

describe('rosto por reação', () => {
  it('lucro na mesa → rosto feliz; prejuízo → rosto triste com lágrima', () => {
    expect(faceForReaction('celebrate')).toBe('feliz');
    expect(faceForReaction('console')).toBe('triste');
    expect(tearsForReaction('console')).toBe(true);
  });

  it('só a derrota chora — o pedido de desculpas usa o rosto seco', () => {
    expect(faceForReaction('apologize')).toBe('triste');
    expect(tearsForReaction('apologize')).toBe(false);
    for (const reacao of DEALER_REACTIONS) {
      if (reacao !== 'console') expect(tearsForReaction(reacao)).toBe(false);
    }
  });

  it('as fases neutras do jogo não mexem no rosto', () => {
    for (const reacao of ['idle', 'present', 'anticipate', 'shake', 'reveal', 'shrug'] as const) {
      expect(faceForReaction(reacao)).toBe('neutra');
    }
  });
});

describe('NovaDealer', () => {
  it.each(DEALER_REACTIONS)('a reação "%s" leva o rosto correspondente', (reaction) => {
    render(<NovaDealer reaction={reaction} />);
    const rig = screen.getByTestId('dealer');
    expect(rig).toHaveAttribute('data-reaction', reaction);
    expect(rig).toHaveAttribute('data-face', faceForReaction(reaction));
  });

  it('as lágrimas só entram em cena na derrota', () => {
    const { unmount } = render(<NovaDealer reaction="console" />);
    expect(screen.getByTestId('dealer-lagrimas')).toBeInTheDocument();
    unmount();

    render(<NovaDealer reaction="celebrate" />);
    expect(screen.queryByTestId('dealer-lagrimas')).not.toBeInTheDocument();
  });

  it('em qualidade baixa a crupiê monta sem loops (e sem lágrima animada)', () => {
    render(<NovaDealer reaction="console" quality="low" />);
    expect(screen.getByTestId('dealer')).toHaveAttribute('data-beat', 'repouso');
    expect(screen.queryByTestId('dealer-lagrimas')).not.toBeInTheDocument();
  });

  it('fora do idle não há beat de ociosidade', () => {
    // O beat é um gesto de PREENCHIMENTO: em qualquer reação com
    // intenção própria ele só atrapalharia.
    render(<NovaDealer reaction="celebrate" />);
    expect(screen.getByTestId('dealer')).toHaveAttribute('data-beat', 'repouso');
  });
});

describe('beats de ociosidade', () => {
  it('o repouso é o primeiro da lista e há variações suficientes', () => {
    expect(IDLE_BEATS[0]).toBe('repouso');
    // Menos que isso e o ciclo vira reconhecível — que é justamente o
    // problema que os beats existem para resolver.
    expect(IDLE_BEATS.length - 1).toBeGreaterThanOrEqual(6);
    expect(new Set(IDLE_BEATS).size).toBe(IDLE_BEATS.length);
  });
});
