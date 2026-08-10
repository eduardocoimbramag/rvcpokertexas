import type { Card } from '../types';
import { compareRanks, readHand } from './handRank';
import type { HandRank } from './handRank';
import { nextSeat } from './ringHand';
import type { RingHand, SeatId } from './ringHand';

/**
 * OS POTES LATERAIS — a peça mais delicada do projeto inteiro.
 *
 * O problema, em uma frase: quando alguém vai all-in por menos do que os
 * outros apostaram, ele não pode ganhar as fichas que não cobriu. O pote
 * se PARTE EM CAMADAS, e cada camada tem a sua própria lista de quem
 * pode levá-la.
 *
 * Num exemplo de mesa de 6, todo mundo all-in por valores diferentes:
 *
 * ```
 *   A pôs 100      D pôs 500
 *   B pôs 300      E pôs 500
 *   C pôs 300      F correu, tendo posto 50
 *
 *   camada 0–50    : 6 contribuintes × 50  = 300  → A B C D E   (F correu)
 *   camada 50–100  : 5 × 50                = 250  → A B C D E
 *   camada 100–300 : 4 × 200               = 800  →   B C D E   (A não cobriu)
 *   camada 300–500 : 2 × 200               = 400  →       D E
 * ```
 *
 * DUAS ARMADILHAS moram aqui, e as duas custam dinheiro de verdade:
 *
 * 1. **Quem correu CONTRIBUI mas não é elegível.** As fichas que ele pôs
 *    ficaram no meio e continuam valendo; o que ele perdeu foi o direito
 *    de levá-las. Esquecer a primeira metade some com fichas da mesa;
 *    esquecer a segunda paga quem desistiu.
 * 2. **A ficha ímpar.** Um pote de 75 dividido por dois dá 37,5, e não
 *    existe meia ficha. A regra de sala é: a sobra vai para o primeiro
 *    elegível À ESQUERDA DO BOTÃO. É arbitrária de propósito — o que
 *    importa é ser a MESMA sempre, porque qualquer outra escolha seria
 *    uma preferência escondida por alguém.
 *
 * O caso de dois jogadores que a mesa de duelo desta casa já resolve é o
 * caso degenerado deste algoritmo — uma camada só.
 *
 * Ver docs/multiplayer.md §3.2.
 */

/** Uma camada do pote, com quem pôs ficha nela e quem pode levá-la. */
export interface Pot {
  /** Fichas nesta camada. */
  amount: number;
  /** Cadeiras que ainda podem ganhá-la — nunca inclui quem correu. */
  eligible: readonly SeatId[];
  /**
   * Quem PÔS ficha nesta camada, incluindo quem correu depois.
   *
   * Não é decoração: é a lista para onde as fichas voltam se a camada
   * ficar sem ninguém que possa levá-la. Sem ela, o único destino
   * possível seria o pote evaporar — e ficha que some de uma mesa é o
   * pior defeito que um jogo destes pode ter.
   */
  contributors: readonly SeatId[];
}

export interface PotInput {
  /** O que cada cadeira pôs na MÃO inteira. */
  putIn: readonly number[];
  /** Cadeiras que correram. Contribuem, mas não levam. */
  folded: readonly SeatId[];
}

/**
 * PARTE O POTE EM CAMADAS a partir do que cada um pôs na mão.
 *
 * O passo que quase todo mundo erra é o primeiro: os níveis saem de TODO
 * MUNDO que pôs ficha, inclusive de quem correu. As fichas de quem
 * desistiu estão no meio e precisam ser distribuídas — o que ele perdeu
 * foi o direito de ganhá-las, não a obrigação de tê-las posto.
 */
export function splitPots({ putIn, folded }: PotInput): Pot[] {
  const correu = new Set(folded);
  const níveis = [...new Set(putIn.filter((v) => v > 0))].sort((a, b) => a - b);

  const potes: Pot[] = [];
  let anterior = 0;

  for (const nível of níveis) {
    const contribuintes = putIn
      .map((v, seat) => (v >= nível ? seat : -1))
      .filter((seat) => seat >= 0);
    const amount = (nível - anterior) * contribuintes.length;
    const eligible = contribuintes.filter((seat) => !correu.has(seat));
    anterior = nível;
    if (amount <= 0) continue;

    /* FUNDE camadas consecutivas com a MESMA lista de elegíveis. Sem
       isso, uma mesa em que ninguém vai all-in produziria quatro potes
       idênticos — um por rua — e a mesa anunciaria "pote principal e
       três laterais" onde há um pote só. */
    const último = potes[potes.length - 1];
    if (último && sameSeats(último.eligible, eligible)) {
      último.amount += amount;
      continue;
    }
    potes.push({ amount, eligible, contributors: contribuintes });
  }

  return potes;
}

function sameSeats(a: readonly SeatId[], b: readonly SeatId[]): boolean {
  return a.length === b.length && a.every((seat, i) => seat === b[i]);
}

/** Quanto cada cadeira recebe de volta do meio. */
export type Payouts = Record<SeatId, number>;

export interface AwardOptions {
  potes: readonly Pot[];
  /**
   * A leitura de cada cadeira que chegou ao showdown. Cadeira ausente
   * não disputa nada — é quem correu.
   */
  ranks: ReadonlyMap<SeatId, HandRank>;
  /** Para a ficha ímpar: ela vai ao primeiro elegível à esquerda dele. */
  button: SeatId;
  /** Cadeiras da mesa, para o anel dar a volta certo. */
  total: number;
}

/**
 * REPARTE as camadas entre quem as ganhou.
 *
 * Cada camada é decidida à parte: um jogador pode ganhar o pote principal
 * e perder o lateral, e isso é o normal numa mesa com all-in de tamanhos
 * diferentes — não é caso de borda.
 */
export function awardPots({ potes, ranks, button, total }: AwardOptions): Payouts {
  const pago: Payouts = {};
  const somar = (seat: SeatId, chips: number) => {
    pago[seat] = (pago[seat] ?? 0) + chips;
  };

  for (const pote of potes) {
    const disputantes = pote.eligible.filter((seat) => ranks.has(seat));

    /* Camada sem ninguém para levá-la. Não deveria acontecer: o nível
       mais alto sempre tem ao menos um contribuinte, e um assento que
       ainda tem fichas no meio ou correu (e então não é elegível) ou
       chegou ao fim (e então tem leitura). O guard existe porque a
       alternativa a ele é o pote EVAPORAR em silêncio, e ficha que some
       de uma mesa é o pior defeito que um jogo destes pode ter. */
    if (disputantes.length === 0) {
      const donos = pote.eligible.length > 0 ? pote.eligible : pote.contributors;
      repartir(pote.amount, donos, button, total, somar);
      continue;
    }

    let melhores: SeatId[] = [];
    let melhor: HandRank | null = null;
    for (const seat of disputantes) {
      const rank = ranks.get(seat);
      if (!rank) continue;
      const cmp = melhor === null ? 1 : compareRanks(rank, melhor);
      if (cmp > 0) {
        melhor = rank;
        melhores = [seat];
      } else if (cmp === 0) {
        melhores.push(seat);
      }
    }

    repartir(pote.amount, melhores, button, total, somar);
  }

  return pago;
}

/**
 * Divide `amount` entre `winners`, e entrega a SOBRA à primeira cadeira
 * à esquerda do botão que esteja entre elas.
 *
 * A regra da ficha ímpar é arbitrária, e é de propósito: o que uma mesa
 * precisa não é da divisão "justa" (ela não existe em número inteiro) e
 * sim da MESMA divisão sempre. Qualquer outro critério — o maior stack,
 * quem apostou primeiro — seria uma preferência escondida.
 */
function repartir(
  amount: number,
  winners: readonly SeatId[],
  button: SeatId,
  total: number,
  somar: (seat: SeatId, chips: number) => void,
): void {
  if (winners.length === 0 || amount <= 0) return;
  const cada = Math.floor(amount / winners.length);
  let sobra = amount - cada * winners.length;
  for (const seat of winners) somar(seat, cada);

  // Dá a volta a partir da esquerda do botão até achar um vencedor.
  let seat = nextSeat(button, total);
  for (let i = 0; i < total && sobra > 0; i += 1) {
    if (winners.includes(seat)) {
      somar(seat, 1);
      sobra -= 1;
    }
    seat = nextSeat(seat, total);
  }
  /* Sobra maior que o número de vencedores não deveria existir (a sobra
     de uma divisão é sempre menor que o divisor), mas se existisse, ela
     não pode evaporar: vai inteira ao primeiro vencedor. */
  if (sobra > 0) {
    const primeiro = winners[0];
    if (primeiro !== undefined) somar(primeiro, sobra);
  }
}

/** O desfecho de uma mão, pronto para a mesa aplicar. */
export interface HandSettlement {
  potes: readonly Pot[];
  /** Quanto cada cadeira recebe do meio. */
  payouts: Payouts;
  /** A leitura de cada mão que chegou ao showdown. */
  ranks: ReadonlyMap<SeatId, HandRank>;
  /** Stacks depois de repartir. */
  stacks: readonly number[];
  /** O que cada cadeira pôs na mão inteira — a régua do extrato. */
  putIn: readonly number[];
  /** Cadeiras que levaram alguma coisa. */
  winners: readonly SeatId[];
  /** A mão terminou no showdown (e não por desistência de todos). */
  showdown: boolean;
}

/**
 * FECHA A MÃO: parte o pote, lê as mãos que sobraram e reparte.
 *
 * Quando sobra UM jogador, não há leitura nenhuma a fazer — ele leva tudo
 * sem mostrar carta, que é o que uma mesa faz. É por isso que `ranks`
 * vem vazio nesse caminho: um showdown de um jogador só não é showdown, e
 * fingir que é entregaria a mão dele de graça.
 */
export function settleHand(hand: RingHand): HandSettlement {
  const total = hand.seats.length;
  const board = hand.board;
  const vivos = hand.seats.filter((s) => !s.folded && s.cards !== null);
  const showdown = vivos.length > 1;

  const ranks = new Map<SeatId, HandRank>();
  if (showdown) {
    for (const seat of vivos) {
      if (!seat.cards) continue;
      ranks.set(seat.id, readHand(seat.cards, board as readonly Card[]));
    }
  } else {
    /* Um só: ele leva sem mostrar. Entra no mapa com a leitura das
       próprias fechadas apenas para `awardPots` saber que ele existe —
       nada disso é mostrado a ninguém. */
    const único = vivos[0];
    if (único?.cards) ranks.set(único.id, readHand(único.cards, board as readonly Card[]));
  }

  const potes = splitPots({
    putIn: hand.seats.map((s) => s.putIn),
    folded: hand.seats.filter((s) => s.folded || s.cards === null).map((s) => s.id),
  });

  const payouts = awardPots({ potes, ranks, button: hand.button, total });
  const stacks = hand.seats.map((s) => s.stack + (payouts[s.id] ?? 0));
  const winners = hand.seats.filter((s) => (payouts[s.id] ?? 0) > 0).map((s) => s.id);

  return {
    potes,
    payouts,
    ranks: showdown ? ranks : new Map(),
    stacks,
    putIn: hand.seats.map((s) => s.putIn),
    winners,
    showdown,
  };
}
