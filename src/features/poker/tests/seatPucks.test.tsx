import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeededRng } from '@/shared/lib/random';

import { PokerSeat } from '../components/poker/PokerSeat';
import type { Card } from '../engine/types';
import { openCashTable } from '../tournament/cashTable';
import type { CashTableView } from '../tournament/cashTable';
import { CashArena } from '../tournament/screens/CashArena';
import type { TournamentPlayer } from '../tournament/types';

/**
 * OS DISCOS DE POSIÇÃO — D, SB e BB — nas duas mesas da casa.
 *
 * Três coisas se cobram aqui, e nenhuma delas é o desenho da peça:
 *
 * 1. QUEM CARREGA O QUÊ. O botão marca uma cadeira, o small a seguinte e
 *    o big a de depois — a mesma conta que a engine usa para COBRAR os
 *    blinds (`blindSeats`). Se as duas contas saírem de sincronia, a
 *    mesa passa a apontar para o assento errado e ninguém percebe: os
 *    dois números continuam plausíveis.
 * 2. ONDE ELE MORA. Na placa do RIVAL, no vão da SUA mão. É a diferença
 *    que tirou o disco dos 8px em que ele não se lia: do lado dos rivais
 *    não há pano sobrando, e enquanto ele andava ao lado do nome os dois
 *    dividiam a mesma largura.
 * 3. QUE NINGUÉM CARREGA DOIS. Numa mesa de anel o botão não paga blind,
 *    e essa é a regra que o disco duplicado quebraria em silêncio.
 */

const NOMES = ['Você', 'Otto', 'Luna', 'Dante', 'Rex', 'Helena'];
const jogadores: TournamentPlayer[] = NOMES.map((name, i) => ({
  id: i === 0 ? 'you' : `b${i}`,
  name,
  avatar: name[0] ?? '?',
  isYou: i === 0,
}));

/** Uma mesa de seis montada, com o botão onde o teste precisar dele. */
function mesa(button: number): CashTableView {
  const view = openCashTable({
    seats: jogadores,
    buyIn: 1000,
    blind: 20,
    youId: 'you',
    rng: new SeededRng(7),
  });
  return { ...view, button };
}

function renderMesa(button: number) {
  return render(
    <CashArena
      view={mesa(button)}
      youSeat={0}
      phase="hand"
      shown={false}
      onOpenProfile={vi.fn()}
    />,
  );
}

const carta = (rank: string, suit: string) => ({ rank, suit }) as Card;

/** Um assento do duelo, com ou sem o botão. */
function renderDuelo(side: 'player' | 'opponent', button: boolean) {
  return render(
    <PokerSeat
      side={side}
      name={side === 'player' ? 'Você' : 'Luna'}
      cards={[carta('A', 'spades'), carta('K', 'hearts')]}
      stack={900}
      button={button}
      toAct={false}
      allIn={false}
      dealDelayFor={() => 0}
      instant
    />,
  );
}

describe('mesa de seis — quem carrega cada disco', () => {
  it('o botão marca uma cadeira e os blinds marcam as DUAS seguintes', () => {
    /* Botão na 2 → small na 3, big na 4. É a conta de `blindSeats`, que é
       a mesma que a engine usa para cobrar: o disco aponta para quem
       pagou, não para quem a tela achou que pagou. */
    renderMesa(2);
    expect(
      within(screen.getByTestId('cash-seat-2')).getByTestId('cash-dealer-button'),
    ).toBeVisible();
    expect(within(screen.getByTestId('cash-seat-3')).getByTestId('cash-small-blind')).toBeVisible();
    expect(within(screen.getByTestId('cash-seat-4')).getByTestId('cash-big-blind')).toBeVisible();
  });

  it('cada disco existe UMA vez na mesa, e ninguém carrega dois', () => {
    /* Numa mesa de anel o botão não paga blind — quem paga é quem senta à
       esquerda dele. Um assento com dois discos seria a mesa dizendo uma
       regra de heads-up numa mesa de seis. */
    renderMesa(2);
    expect(screen.getAllByTestId('cash-dealer-button')).toHaveLength(1);
    expect(screen.getAllByTestId('cash-small-blind')).toHaveLength(1);
    expect(screen.getAllByTestId('cash-big-blind')).toHaveLength(1);
    const DISCOS = /^cash-(dealer-button|small-blind|big-blind)$/;
    for (const seat of [0, 1, 2, 3, 4, 5]) {
      const assento = screen.queryByTestId(`cash-seat-${seat}`);
      if (!assento) continue;
      expect(within(assento).queryAllByTestId(DISCOS)).toHaveLength(seat >= 2 && seat <= 4 ? 1 : 0);
    }
  });

  it('no assento do RIVAL o disco se apoia na placa do nome', () => {
    /* É a mudança que o tornou visível: fora da fileira, ele parou de
       dividir largura com o nome e voltou à escala da mesa. */
    renderMesa(2);
    const disco = screen.getByTestId('cash-dealer-button');
    expect(disco.closest('.seat-plate')).not.toBeNull();
    expect(disco.closest('.seat-puck-mount')).not.toBeNull();
  });

  it('no SEU assento ele continua solto, no vão à esquerda da sua mão', () => {
    /* Botão na 5 → o small cai na 0, que é você. O seu lado do feltro é o
       único com pano sobrando, e ali o disco fica onde ficaria numa mesa
       de verdade. */
    renderMesa(5);
    const meu = screen.getByTestId('cash-small-blind');
    expect(meu.closest('.cash-seat__gutter')).not.toBeNull();
    expect(meu.closest('.seat-plate')).toBeNull();
  });

  it('o disco do blind DIZ quanto custou — o do dealer não cobra nada', () => {
    renderMesa(2);
    expect(screen.getByTestId('cash-small-blind')).toHaveAccessibleName(/Small blind com Dante/);
    expect(screen.getByTestId('cash-small-blind')).toHaveAccessibleName(/10/);
    expect(screen.getByTestId('cash-big-blind')).toHaveAccessibleName(/20/);
    expect(screen.getByTestId('cash-dealer-button')).toHaveAccessibleName(/fala por último/);
  });
});

describe('duelo — o disco do dealer, de cada lado', () => {
  /**
   * O DUELO É ESPELHADO, e o espelho é o do tampo: gire a mesa meia volta
   * e um lado vira o outro. Nos DOIS lados o disco é a mesma peça solta,
   * no vão ao lado da mão — nenhum dos dois o pendura na placa do nome.
   *
   * Isso é o que separa esta mesa da de SEIS: lá o disco do rival sobe
   * para a placa porque cinco assentos na metade de cima de um telefone
   * não deixam vão nenhum (ver `PlatePuck`). Aqui deixam, e herdar aquela
   * solução custava justamente o espelho.
   */
  const vaoDe = (disco: HTMLElement) => disco.closest('.poker-seat__gutter');

  it('nos DOIS lados ele é a mesma peça, solta no vão — nunca na placa', () => {
    const { unmount } = renderDuelo('player', true);
    const meu = screen.getByTestId('dealer-button-player');
    expect(vaoDe(meu)).not.toBeNull();
    expect(meu.closest('.seat-plate')).toBeNull();
    unmount();

    renderDuelo('opponent', true);
    const dele = screen.getByTestId('dealer-button-opponent');
    expect(vaoDe(dele)).not.toBeNull();
    expect(dele.closest('.seat-plate')).toBeNull();
  });

  /**
   * O LADO em que cada disco cai, que é o ponto do espelho — e a razão de
   * a asserção olhar a POSIÇÃO do vão na grade, e não uma classe: a linha
   * é `1fr auto 1fr` (vão · cartas · vão), então o vão de índice 0 é o da
   * esquerda da tela e o de índice 2 é o da direita. Uma asserção por
   * classe passaria com os dois discos no mesmo lado.
   */
  const ladoDoDisco = (testId: string) => {
    const disco = screen.getByTestId(testId);
    const vao = vaoDe(disco);
    const linha = vao?.parentElement;
    if (!vao || !linha) throw new Error('o disco não está num vão da linha da mão');
    return [...linha.children].indexOf(vao) === 0 ? 'esquerda' : 'direita';
  };

  it('o SEU cai à ESQUERDA da tela — é a sua mão esquerda', () => {
    renderDuelo('player', true);
    expect(ladoDoDisco('dealer-button-player')).toBe('esquerda');
  });

  it('o do RIVAL cai à DIREITA da tela — que é a mão esquerda DELE', () => {
    /* Quem senta de frente para você tem a própria esquerda do lado de lá
       do feltro. Pôr o disco dele à esquerda da TELA seria desenhar os
       dois discos do mesmo lado do tampo — o oposto de espelhar. */
    renderDuelo('opponent', true);
    expect(ladoDoDisco('dealer-button-opponent')).toBe('direita');
  });

  it('sem o botão, nenhum dos dois lados desenha disco nenhum', () => {
    renderDuelo('opponent', false);
    expect(screen.queryByTestId('dealer-button-opponent')).not.toBeInTheDocument();
  });

  it('o duelo NÃO tem blinds, e por isso não tem SB nem BB', () => {
    /* Os dois lados pagam a mesma entrada a cada mão (`TABLE_ANTE`).
       Desenhar um small e um big ali seria a mesa mostrando uma regra que
       ela não joga — e a placa de posição é justamente o lugar onde uma
       regra inventada custaria fichas a quem acreditasse nela. */
    renderDuelo('opponent', true);
    expect(screen.queryByTestId('cash-small-blind')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cash-big-blind')).not.toBeInTheDocument();
  });
});
