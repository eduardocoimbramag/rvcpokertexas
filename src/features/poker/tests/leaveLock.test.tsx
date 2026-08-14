import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BetControls } from '../components/poker/BetControls';
import type { Card, CardRank, CardSuit } from '../engine/types';
import type { PokerRoundState } from '../engine/poker/types';
import { CashActions } from '../tournament/screens/CashActions';

/**
 * AS DUAS CARAS DA PORTA — nas duas mesas da casa.
 *
 * O LEVANTAR da fileira de lances é o único botão do clube que muda de
 * casca conforme a mesa, e são três estados que não podem se confundir:
 *
 * - ABERTA: a MESMA peça do PASSAR (`btn--secondary`). Não uma cópia da
 *   aparência dele — a variante dele, para que não existam duas cascas
 *   a manter em dia.
 * - GRAFITE (`is-locked`): a saída ainda não abriu. Ela abre sozinha na
 *   segunda mão — a primeira é o compromisso de quem sentou.
 * - VINHO APAGADO (o `:disabled` comum da casa): um lance está em
 *   trânsito e a fileira inteira apagou junto. Não diz nada sobre a
 *   saída.
 *
 * Pintar os dois últimos iguais fazia a tranca da primeira mão ler como
 * falha do botão. O teste guarda os três nas DUAS mesas porque elas
 * montam a fileira com o mesmo `LeaveButton`, e uma regressão ali quebra
 * as duas de uma vez — sem que nenhum teste de mesa perceba.
 */

const card = (rank: CardRank, suit: CardSuit): Card => ({ rank, suit });

/**
 * A CASCA de um botão: tudo que ele veste, menos os ganchos que só a
 * porta tem (`bet-row__leave`, `is-locked`). É por esta lista que se
 * compara a porta com o PASSAR — variante, tamanho e largura de uma vez,
 * e não só a cor, que é o que "mesma aparência" quer dizer.
 */
const casca = (el: HTMLElement): string[] =>
  [...el.classList].filter((c) => c !== 'bet-row__leave' && c !== 'is-locked').sort();

/** O duelo no meio de uma rua, com a saída aberta ou trancada. */
function round(handsPlayed: number): PokerRoundState {
  return {
    matchId: 'm1',
    street: 'flop',
    phase: 'betting',
    button: 'player',
    playerHole: [card('A', 'spades'), card('A', 'hearts')],
    opponentHole: [],
    board: [card('2', 'clubs'), card('7', 'diamonds'), card('9', 'hearts')],
    stacks: { player: 900, opponent: 900 },
    committed: { player: 0, opponent: 0 },
    pot: 200,
    toCall: 0,
    minRaiseTo: 1,
    maxRaiseTo: 900,
    legalActions: ['fold', 'check', 'raise'],
    toAct: 'player',
    playerHandLabel: 'Par de Ases',
    session: {
      matchId: 'm1',
      buyIn: 1000,
      stacks: { player: 900, opponent: 900 },
      handsPlayed,
      button: 'player',
      over: false,
    },
  };
}

/** A barra do DUELO. `canLeave` é o que a arena calcula da sessão. */
function renderDuelo(canLeave: boolean, pending = false) {
  render(
    <BetControls
      round={round(canLeave ? 1 : 0)}
      seconds={20}
      pending={pending}
      onFold={vi.fn()}
      onCheck={vi.fn()}
      onCall={vi.fn()}
      onRaise={vi.fn()}
      canLeave={canLeave}
      onLeave={vi.fn()}
      instant
    />,
  );
  return {
    porta: screen.getByTestId('leave-table'),
    passar: screen.getByTestId('action-check'),
  };
}

/** A barra da MESA DE SEIS — mesma fileira, mesma porta. */
function renderMesaDeSeis(canLeave: boolean) {
  render(
    <CashActions
      legal={['fold', 'check', 'raise']}
      toCall={0}
      raise={{ min: 20, max: 900, allInOnly: false }}
      committed={0}
      seconds={20}
      canLeave={canLeave}
      onLeave={vi.fn()}
      onAct={vi.fn()}
      instant
    />,
  );
  return {
    porta: screen.getByTestId('leave-table'),
    passar: screen.getByTestId('cash-check'),
  };
}

describe('LEVANTAR na fileira de lances — a tranca da primeira mão', () => {
  it('DUELO: na primeira mão a porta fica em cena, apagada e em grafite', () => {
    const { porta } = renderDuelo(false);
    expect(porta).toBeDisabled();
    expect(porta).toHaveClass('is-locked');
  });

  it('DUELO: a partir da segunda mão ela volta ao normal', () => {
    const { porta } = renderDuelo(true);
    expect(porta).toBeEnabled();
    expect(porta).not.toHaveClass('is-locked');
  });

  it('DUELO: lance em trânsito apaga a fileira, mas não TRANCA a porta', () => {
    /* Os dois "não" da mesa não são o mesmo: aqui a saída já abriu, e o
       botão está apenas esperando a engine — o cinza mentiria dizendo
       que ela voltou a fechar. */
    const { porta } = renderDuelo(true, true);
    expect(porta).toBeDisabled();
    expect(porta).not.toHaveClass('is-locked');
  });

  it('MESA DE SEIS: a mesma tranca, na mesma peça', () => {
    const { porta } = renderMesaDeSeis(false);
    expect(porta).toBeDisabled();
    expect(porta).toHaveClass('is-locked');
  });

  it('MESA DE SEIS: aberta a saída, o grafite sai junto', () => {
    const { porta } = renderMesaDeSeis(true);
    expect(porta).toBeEnabled();
    expect(porta).not.toHaveClass('is-locked');
  });

  it('trancada, ela DIZ por que — o motivo vai no nome acessível', () => {
    /* Botão apagado não abre balão de `title` em navegador nenhum: sem
       isto, quem usa leitor de tela ouviria "LEVANTAR, indisponível" e
       ficaria sem a metade que importa, que é o "por enquanto". */
    const { porta } = renderDuelo(false);
    expect(porta).toHaveAccessibleName('Levantar da mesa — Disponível a partir da 2ª mão');
  });
});

describe('LEVANTAR aberta — a mesma peça do PASSAR', () => {
  /* A porta veste a VARIANTE do PASSAR, e não uma cópia da tinta dele
     escrita ao lado. Comparar as duas cascas inteiras (e não uma classe
     escolhida a dedo) é o que faz este teste falhar no dia em que uma
     das duas ganhar um tamanho, uma largura ou uma variante nova e a
     outra ficar para trás — que é exatamente o custo que a cópia teria
     cobrado, um pouco mais tarde. */
  it('DUELO: a casca da porta é a casca do PASSAR', () => {
    const { porta, passar } = renderDuelo(true);
    expect(porta).toHaveClass('btn--secondary');
    expect(casca(porta)).toEqual(casca(passar));
  });

  it('MESA DE SEIS: a casca da porta é a casca do PASSAR', () => {
    const { porta, passar } = renderMesaDeSeis(true);
    expect(porta).toHaveClass('btn--secondary');
    expect(casca(porta)).toEqual(casca(passar));
  });

  it('o grafite da primeira mão é a MESMA peça, com a tranca por cima', () => {
    /* A porta trancada não é uma terceira variante: é o vinho do PASSAR
       com `is-locked` em cima, e é só a tranca que sai quando a segunda
       mão começa. Se um dia ela virar variante própria, a casca deixa de
       bater com a do vizinho e este teste avisa. */
    const { porta, passar } = renderDuelo(false);
    expect(casca(porta)).toEqual(casca(passar));
    expect(porta).toHaveClass('is-locked');
    expect(porta).toBeDisabled();
  });
});
