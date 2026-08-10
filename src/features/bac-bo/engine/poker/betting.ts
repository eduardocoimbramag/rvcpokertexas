import type { PokerAction } from './types';

/**
 * A ECONOMIA DE UMA RUA no no-limit de anel: quem paga blind, quanto se
 * pode aumentar e quando um aumento REABRE a rodada.
 *
 * Este módulo existe separado de `rules.ts` por um motivo deliberado, e
 * ele é o mesmo de `SeatId` (ver docs/multiplayer.md §3.3): o duelo 1v1
 * desta casa está no ar, afinado, e tem uma economia PRÓPRIA — entrada
 * igual dos dois lados, sem blind, e aumento mínimo de um crédito, que
 * foi uma decisão consciente de produto (ver `minRaiseTo` em rules.ts).
 * Reescrever aquelas regras para caber a mesa de 6 mudaria um jogo que já
 * funciona como efeito colateral de construir outro. Então a mesa de 6
 * ganha as regras dela aqui, e o duelo continua sendo o duelo.
 *
 * Tudo aqui é função pura: recebe a rua como ela está e devolve valores.
 * Nada guarda estado, nada conhece tela, nada conhece assento por nome —
 * só índices. É o que permite que a mesma regra rode no navegador hoje e
 * num servidor depois, sem uma linha de diferença.
 *
 * ---------------------------------------------------------------------
 * O VOCABULÁRIO, porque ele é a metade difícil:
 *
 * - **committed** — o que um assento já pôs NESTA rua. Zera a cada rua.
 * - **maxCommitted** — o maior committed da rua. É a "altura" da aposta.
 * - **toCall** — `maxCommitted − committed`: o que falta para igualar.
 * - **aumentar PARA x** (raise to) — deixar o seu committed em x, e não
 *   somar x ao que já está lá. É como uma mesa fala, e é como as contas
 *   deste arquivo funcionam: falar em "somar" faria o mesmo lance ter
 *   dois nomes dependendo de quem o diz.
 * - **lastRaiseSize** — o tamanho do último aumento COMPLETO da rua. É
 *   dele que sai o mínimo do próximo, e é a peça que o duelo desta casa
 *   não tem.
 */

/** O blind pago por um assento ao abrir a mão. */
export interface BlindPost {
  seat: number;
  /** O que foi efetivamente posto — pode ser menos que o blind devido. */
  posted: number;
  /** O blind DEVIDO, para a mesa saber que ele ficou curto. */
  due: number;
  /** O stack acabou no blind: ele entra na mão já com tudo no meio. */
  allIn: boolean;
}

export interface PostBlindsOptions {
  /** Stacks por assento, na ordem real da mesa. */
  stacks: readonly number[];
  /** Cadeira do small blind. */
  small: number;
  /** Cadeira do big blind. */
  big: number;
  smallBlind: number;
  bigBlind: number;
}

export interface PostedBlinds {
  posts: readonly BlindPost[];
  /** `committed` da rua depois dos blinds, por assento. */
  committed: readonly number[];
  /** Stacks depois de pagar. */
  stacks: readonly number[];
  /**
   * A altura da aposta com que o pré-flop começa. É o big blind — ou o
   * que o big conseguiu pagar, quando ele entrou curto e ninguém pôs
   * mais que isso.
   */
  maxCommitted: number;
  /**
   * O aumento mínimo que vale para o primeiro lance da mão.
   *
   * É o BIG BLIND CHEIO, mesmo quando o big blind entrou curto — e essa
   * é a regra que mais surpreende. O blind é uma aposta forçada, não um
   * aumento voluntário: um big blind que só conseguiu pagar 12 de 20 não
   * baixa o mínimo da mesa para 12. Quem quiser abrir continua tendo de
   * ir a 40.
   */
  lastRaiseSize: number;
}

/**
 * COBRA OS BLINDS. Quem não cobre o seu paga o que tem e entra all-in —
 * jamais fica devendo, porque uma mesa não dá crédito.
 *
 * Não decide QUEM paga: recebe as duas cadeiras prontas. Quem as escolhe
 * é o anel (o small à esquerda do botão, o big em seguida), e isso é
 * geometria de mesa, não economia de rua.
 */
export function postBlinds({
  stacks,
  small,
  big,
  smallBlind,
  bigBlind,
}: PostBlindsOptions): PostedBlinds {
  const committed = stacks.map(() => 0);
  const left = [...stacks];
  const posts: BlindPost[] = [];

  const cobra = (seat: number, due: number) => {
    const have = left[seat] ?? 0;
    const posted = Math.min(due, have);
    left[seat] = have - posted;
    committed[seat] = (committed[seat] ?? 0) + posted;
    posts.push({ seat, posted, due, allIn: posted > 0 && left[seat] === 0 });
  };

  cobra(small, smallBlind);
  cobra(big, bigBlind);

  return {
    posts,
    committed,
    stacks: left,
    maxCommitted: Math.max(...committed),
    lastRaiseSize: bigBlind,
  };
}

/**
 * O MENOR TOTAL a que se pode aumentar: a altura da aposta mais o último
 * aumento completo.
 *
 * É a regra do no-limit, e ela existe por um motivo prático que só
 * aparece em mesa de mais de dois: sem ela, um jogador aumenta de uma
 * ficha por vez para empurrar o relógio e cansar a mesa, e cinco pessoas
 * ficam reféns de uma. No duelo 1v1 desta casa não há o que empurrar — o
 * rival é a casa e o relógio é de 20 s —, e é por isso que lá a regra foi
 * removida de propósito. Aqui ela volta.
 *
 * Antes de qualquer aposta na rua, `lastRaiseSize` é o BIG BLIND: é ele
 * que define a menor aposta de abertura do flop em diante, e é por isso
 * que a abertura mínima do pré-flop é o dobro do big.
 */
export function minRaiseTo(maxCommitted: number, lastRaiseSize: number): number {
  return maxCommitted + lastRaiseSize;
}

export interface RaiseRangeOptions {
  /** Fichas que o assento ainda tem na frente. */
  stack: number;
  /** O que ele já pôs nesta rua. */
  committed: number;
  /** A altura da aposta na rua. */
  maxCommitted: number;
  /** O tamanho do último aumento completo. */
  lastRaiseSize: number;
  /** Ainda existe alguém com ficha para cobrir um aumento. */
  rivalHasChips: boolean;
}

/** Até onde um assento pode aumentar, e se ele pode. */
export interface RaiseRange {
  /** Pode aumentar. Falso não impede pagar nem correr. */
  can: boolean;
  /** O menor total legal. */
  min: number;
  /** O teto: tudo o que ele tem. */
  max: number;
  /**
   * O mínimo não cabe no stack: o único aumento possível é o ALL-IN, e
   * ele vale menos que um aumento completo.
   *
   * A tela precisa deste sinal porque um seletor que ofereça 40–37 é um
   * seletor quebrado; com ele, a mesa oferece o all-in como o lance que
   * de fato é.
   */
  allInOnly: boolean;
}

/**
 * A FAIXA DE AUMENTO de quem está na vez.
 *
 * O caso que faz esta função existir é o do stack curto: o mínimo legal
 * é 40, o jogador tem 37 no total. Ele NÃO fica proibido de aumentar —
 * toda mesa do mundo aceita o all-in por menos que o mínimo, porque a
 * alternativa seria obrigar alguém a pagar ou correr por não ter fichas
 * suficientes para o lance que queria fazer. O que esse all-in curto não
 * faz é REABRIR a rodada (ver `reopensBetting`).
 */
export function raiseRangeFor({
  stack,
  committed,
  maxCommitted,
  lastRaiseSize,
  rivalHasChips,
}: RaiseRangeOptions): RaiseRange {
  const max = committed + stack;
  const toCall = Math.max(0, maxCommitted - committed);
  const min = minRaiseTo(maxCommitted, lastRaiseSize);

  // Sem ficha depois de pagar, ou sem ninguém com o que cobrir, não há
  // aumento nenhum a fazer.
  if (stack <= 0 || stack <= toCall || !rivalHasChips) {
    return { can: false, min, max, allInOnly: false };
  }
  if (max < min) return { can: true, min: max, max, allInOnly: true };
  return { can: true, min, max, allInOnly: false };
}

/**
 * O aumento REABRE a rodada para quem já falou?
 *
 * Esta é a regra mais sutil do no-limit, e ela é de justiça, não de
 * contabilidade. Quem já pagou uma aposta e é surpreendido por um all-in
 * de 3 fichas acima dela não ganha o direito de aumentar de novo — senão
 * um jogador curto viraria uma ferramenta para reabrir a rodada de graça
 * a favor de quem vem depois dele. Ele pode PAGAR a diferença; não pode
 * aumentar.
 *
 * Só um aumento COMPLETO — de pelo menos o tamanho do último — devolve a
 * palavra a quem já falou.
 */
export function reopensBetting(
  raiseTo: number,
  maxCommitted: number,
  lastRaiseSize: number,
): boolean {
  return raiseTo - maxCommitted >= lastRaiseSize;
}

/**
 * O `lastRaiseSize` depois de um lance.
 *
 * Um all-in curto NÃO encolhe o mínimo da mesa: se o último aumento
 * completo foi de 40 e alguém vai all-in 3 acima, o próximo aumento
 * completo continua tendo de ser 40 acima da nova altura. Sem esta
 * trava, um jogador curto baixaria o mínimo da mesa para todo mundo.
 */
export function nextRaiseSize(
  raiseTo: number,
  maxCommitted: number,
  lastRaiseSize: number,
): number {
  const increment = raiseTo - maxCommitted;
  return increment >= lastRaiseSize ? increment : lastRaiseSize;
}

export interface RingActionOptions {
  stack: number;
  committed: number;
  maxCommitted: number;
  lastRaiseSize: number;
  rivalHasChips: boolean;
  /**
   * A palavra foi REABERTA para este assento depois de ele já ter
   * falado nesta rua? Quem já falou e não levou um aumento completo pode
   * pagar e correr, nunca aumentar (ver `reopensBetting`).
   */
  canReraise?: boolean;
}

/**
 * AS AÇÕES LEGAIS de quem está na vez, numa mesa de anel.
 *
 * A diferença para a mesa de dois desta casa está numa linha só, e ela é
 * a regra acima: `canReraise: false` tira o aumento da mesa sem tirar o
 * pagamento. Numa mesa de dois esse estado não existe — o rival é o
 * único que pode ter aumentado, e se ele aumentou você não "já falou".
 */
export function legalActionsFor({
  stack,
  committed,
  maxCommitted,
  lastRaiseSize,
  rivalHasChips,
  canReraise = true,
}: RingActionOptions): PokerAction[] {
  if (stack <= 0) return [];
  const toCall = Math.max(0, maxCommitted - committed);
  const actions: PokerAction[] = ['fold'];
  if (toCall === 0) actions.push('check');
  if (toCall > 0) actions.push('call');
  if (
    canReraise &&
    raiseRangeFor({ stack, committed, maxCommitted, lastRaiseSize, rivalHasChips }).can
  ) {
    actions.push('raise');
  }
  return actions;
}
