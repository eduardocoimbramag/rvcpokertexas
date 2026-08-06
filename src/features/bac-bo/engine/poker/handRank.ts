import type { Card, CardRank } from '../types';

/**
 * O JUÍZO DAS MÃOS do Texas Hold'em — a única fonte de verdade sobre
 * quem ganha um showdown. Funções puras, sem estado e sem RNG: recebem
 * cartas e devolvem um veredito comparável.
 *
 * A regra do jogo é uma só: cada duelista monta a MELHOR mão de cinco
 * cartas entre as sete disponíveis (as duas fechadas dele + as cinco da
 * mesa). Não há escolha a fazer — a melhor combinação é sempre a que
 * vale, e é esta função que a encontra.
 *
 * O caminho é a força bruta sobre as 21 combinações de C(7,5), e isso é
 * uma decisão, não uma preguiça: um avaliador de tabela perfeita seria
 * mais rápido e ninguém aqui precisa dele — são duas mãos por rodada, uma
 * vez por rodada. O que este código precisa ser é ÓBVIO, porque é ele que
 * decide quem leva o pote.
 */

/** Valor de poker de uma face: o Ás é a carta mais alta (14), não 11. */
const POKER_RANK_VALUE: Record<CardRank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** O valor de poker de uma carta (Ás alto). */
export function pokerValue(rank: CardRank): number {
  return POKER_RANK_VALUE[rank];
}

/**
 * As categorias de mão, da pior para a melhor. A ordem do array É a
 * ordem de força: o índice de cada uma é o primeiro número do `score`.
 */
export const HAND_CATEGORIES = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

/** Força de uma categoria (0 = carta alta, 8 = straight flush). */
export function categoryStrength(category: HandCategory): number {
  return HAND_CATEGORIES.indexOf(category);
}

/**
 * O NOME da categoria, sozinho — o "DOIS PARES" que a mesa grita no
 * showdown, sem as faces que o completam.
 *
 * Existe separado do `label` porque as duas leituras têm empregos
 * diferentes: a placa do desfecho precisa da mão inteira ("Dois pares,
 * Reis e 9") e o embate do showdown precisa do TÍTULO grande com o
 * detalhe embaixo. Montar um a partir do outro exigiria desmontar texto,
 * e texto desmontado por regex é a primeira coisa que quebra quando
 * alguém traduz o jogo.
 */
export const CATEGORY_NAME: Record<HandCategory, string> = {
  'high-card': 'Carta alta',
  pair: 'Um par',
  'two-pair': 'Dois pares',
  trips: 'Trinca',
  straight: 'Sequência',
  flush: 'Flush',
  'full-house': 'Full house',
  quads: 'Quadra',
  'straight-flush': 'Straight flush',
};

/**
 * A FORÇA da mão numa escala de 1 a 9 — carta alta é 1, straight flush
 * é 9. É a categoria contada como as pessoas a contam, e é o número que
 * o embate do showdown põe na frente dos dois blocos.
 *
 * É honesto e é grosso ao mesmo tempo: ele ordena as CATEGORIAS, não as
 * mãos. Dois pares de Ases e dois pares de Reis marcam 3 os dois — quem
 * decide entre eles é o detalhe, que o bloco mostra logo abaixo.
 */
export function categoryLevel(category: HandCategory): number {
  return categoryStrength(category) + 1;
}

/** A leitura final de uma mão de cinco cartas. */
export interface HandRank {
  category: HandCategory;
  /**
   * A força inteira da mão, do desempate mais grosso ao mais fino:
   * `[categoria, ...critérios]`. Duas mãos se comparam número a número
   * (ver `compareRanks`) — é o mesmo que um crupiê faz ao ler duas mãos
   * lado a lado, só que escrito.
   */
  score: readonly number[];
  /** As CINCO cartas que formaram a mão (as outras duas ficam de fora). */
  cards: readonly Card[];
  /** Nome da mão em português, pronto para a mesa ("Dois pares, Reis e 9"). */
  label: string;
  /**
   * O que COMPLETA a categoria — "Reis e 9" em "Dois pares, Reis e 9".
   * É o que decide entre duas mãos da mesma categoria, e por isso é a
   * linha que o embate do showdown acende quando as forças empatam.
   * Vazio no royal flush, que não tem o que completar.
   */
  detail: string;
}

/** Nome de uma face para o rótulo da mesa. */
const RANK_LABEL: Record<CardRank, string> = {
  A: 'Ás',
  K: 'Rei',
  Q: 'Dama',
  J: 'Valete',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
};

/** Plural das faces com nome próprio ("Ases", "Reis"); números não flexionam. */
const RANK_LABEL_PLURAL: Record<CardRank, string> = {
  A: 'Ases',
  K: 'Reis',
  Q: 'Damas',
  J: 'Valetes',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
};

/** Nome do naipe por extenso, para o rótulo do flush. */
const SUIT_LABEL = {
  spades: 'espadas',
  hearts: 'copas',
  diamonds: 'ouros',
  clubs: 'paus',
} as const;

/** A face correspondente a um valor de poker (14 → A, 5 → '5'). */
function rankOfValue(value: number): CardRank {
  // A roda (A-2-3-4-5) lê o Ás como 1: o nome dele continua sendo Ás.
  const target = value === 1 ? 14 : value;
  for (const [rank, rankValue] of Object.entries(POKER_RANK_VALUE)) {
    if (rankValue === target) return rank as CardRank;
  }
  throw new RangeError(`Valor de poker fora do baralho: ${value}`);
}

function nameOf(value: number): string {
  return RANK_LABEL[rankOfValue(value)];
}

function pluralOf(value: number): string {
  return RANK_LABEL_PLURAL[rankOfValue(value)];
}

/**
 * Avalia UMA mão de exatamente cinco cartas.
 *
 * O `score` de cada categoria segue o mesmo princípio: primeiro a
 * categoria, depois os critérios de desempate na ordem em que a mesa os
 * lê. Numa trinca, por exemplo, ninguém compara o kicker antes de
 * comparar a trinca — e é por isso que a trinca vem primeiro no array.
 */
export function rankFiveCards(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) {
    throw new RangeError(`Uma mão de poker tem cinco cartas, não ${cards.length}.`);
  }

  const values = cards.map((card) => pokerValue(card.rank)).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straightHigh = straightHighOf(values);

  /** Quantas vezes cada valor aparece, do grupo maior para o menor e,
   *  dentro do mesmo tamanho, do valor mais alto para o mais baixo. */
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const build = (
    category: HandCategory,
    tiebreak: number[],
    label: string,
    detail: string,
  ): HandRank => ({
    category,
    score: [categoryStrength(category), ...tiebreak],
    cards: [...cards],
    label,
    detail,
  });

  if (flush && straightHigh !== null) {
    // O straight flush até o Ás tem nome próprio na mesa.
    const royal = straightHigh === 14;
    const detail = royal ? '' : `ao ${nameOf(straightHigh)}`;
    const label = royal ? 'Royal flush' : `Straight flush ${detail}`;
    return build('straight-flush', [straightHigh], label, detail);
  }

  const [first, second] = groups;
  if (first?.count === 4 && second) {
    const detail = `de ${pluralOf(first.value)}`;
    return build('quads', [first.value, second.value], `Quadra ${detail}`, detail);
  }
  if (first?.count === 3 && second?.count === 2) {
    const detail = `${pluralOf(first.value)} com ${pluralOf(second.value)}`;
    return build('full-house', [first.value, second.value], `Full house, ${detail}`, detail);
  }
  if (flush) {
    const suit = cards[0]?.suit;
    const detail = suit ? `de ${SUIT_LABEL[suit]}` : '';
    return build('flush', values, `Flush ${detail}`.trim(), detail);
  }
  if (straightHigh !== null) {
    const detail = `ao ${nameOf(straightHigh)}`;
    return build('straight', [straightHigh], `Sequência ${detail}`, detail);
  }
  if (first?.count === 3) {
    const kickers = groups.slice(1).map((group) => group.value);
    const detail = `de ${pluralOf(first.value)}`;
    return build('trips', [first.value, ...kickers], `Trinca ${detail}`, detail);
  }
  if (first?.count === 2 && second?.count === 2) {
    const kicker = groups[2]?.value ?? 0;
    const detail = `${pluralOf(first.value)} e ${pluralOf(second.value)}`;
    return build('two-pair', [first.value, second.value, kicker], `Dois pares, ${detail}`, detail);
  }
  if (first?.count === 2) {
    const kickers = groups.slice(1).map((group) => group.value);
    const detail = `de ${pluralOf(first.value)}`;
    return build('pair', [first.value, ...kickers], `Par ${detail}`, detail);
  }
  const high = nameOf(values[0] ?? 0);
  return build('high-card', values, `Carta alta: ${high}`, high);
}

/**
 * O valor mais alto de uma sequência de cinco cartas, ou `null` se elas
 * não formam uma.
 *
 * A RODA (A-2-3-4-5) é a exceção clássica do jogo: ali o Ás desce a 1 e
 * a sequência vale 5 no topo — é a sequência mais fraca do baralho, e
 * tratá-la como "ao Ás" a faria ganhar de todas as outras.
 *
 * @param values Valores da mão, já ordenados do maior para o menor.
 */
function straightHighOf(values: readonly number[]): number | null {
  const unique = [...new Set(values)];
  if (unique.length !== 5) return null;
  const [high] = unique;
  if (high === undefined) return null;
  if (high - (unique[4] ?? 0) === 4) return high;
  // A roda: A-5-4-3-2 chega aqui como [14, 5, 4, 3, 2].
  if (high === 14 && unique[1] === 5 && unique[4] === 2) return 5;
  return null;
}

/**
 * Compara duas leituras: > 0 se `a` for mais forte, < 0 se `b` for, 0 no
 * empate exato (mãos de mesma força — o pote se divide).
 */
export function compareRanks(a: HandRank, b: HandRank): number {
  const length = Math.max(a.score.length, b.score.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a.score[index] ?? 0) - (b.score[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * A leitura das DUAS CARTAS FECHADAS, antes de existir uma comunitária
 * na mesa.
 *
 * Ela existe porque no pré-flop não há mão de cinco a avaliar — e mesmo
 * assim o jogador tem uma decisão a tomar, que é a decisão mais tomada
 * do Hold'em. Deixar a placa vazia até o flop seria calar justamente no
 * momento em que ela é mais útil.
 *
 * O que a placa diz é a COMBINAÇÃO, no mesmo vocabulário do resto da
 * mão: duas cartas iguais são um par; duas cartas diferentes não formam
 * combinação nenhuma, e o que se tem é carta alta. Ela já disse "Ás-Rei
 * do mesmo naipe", que descrevia as cartas em vez de dizer o que elas
 * VALIAM — e obrigava quem lê a traduzir sozinho de uma língua (as
 * cartas) para a outra (a mão), que é justamente o trabalho que a placa
 * existe para fazer.
 *
 * O `score` sai na mesma escala do resto: categoria primeiro, faces
 * depois. Duas mãos fechadas se comparam por ele como qualquer outra —
 * é o que permite pôr lado a lado, num pré-flop desistido, o que cada um
 * tinha.
 */
export function readHoleCards(first: Card, second: Card): HandRank {
  const a = pokerValue(first.rank);
  const b = pokerValue(second.rank);
  const cards = [first, second];

  if (a === b) {
    const detail = `de ${pluralOf(a)}`;
    return {
      category: 'pair',
      score: [categoryStrength('pair'), a],
      cards,
      label: `Par ${detail}`,
      detail,
    };
  }

  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const detail = nameOf(high);
  return {
    category: 'high-card',
    score: [categoryStrength('high-card'), high, low],
    cards,
    label: `Carta alta: ${detail}`,
    detail,
  };
}

/**
 * A leitura da mão AGORA, seja qual for o momento em que a mesa parou.
 *
 * É a porta única para "o que esta mão é": com comunitárias abertas, a
 * melhor de cinco entre as sete; sem elas, as duas fechadas. Ter uma
 * porta só importa porque a mesa pergunta isso em três situações
 * diferentes — a placa que acompanha a mão, o showdown e a desistência
 * — e uma resposta que variasse de forma entre elas seria três verdades
 * sobre a mesma mão.
 */
export function readHand(hole: readonly [Card, Card], board: readonly Card[]): HandRank {
  if (board.length < 3) return readHoleCards(hole[0], hole[1]);
  return bestHand([...hole, ...board]);
}

/**
 * A CARTA QUE DECIDIU entre duas mãos — o que responde à pergunta que a
 * mesa provoca quando as duas leituras saem iguais: "os dois tinham par
 * de Damas, como é que um ganhou?".
 *
 * Ganhou pelo kicker, e é isso que esta função nomeia. Ela compara as
 * duas forças número a número (é o mesmo caminho do `compareRanks`) e
 * devolve a carta da posição em que elas se separaram, pelo lado do
 * vencedor. Quando as categorias já diferem, não há o que explicar: o
 * nome das mãos basta, e ela devolve `undefined`.
 *
 * É informação que só existe com as DUAS mãos à mesa, e por isso ela
 * mora aqui e não no rótulo de cada uma: nenhuma mão sabe sozinha o que
 * a fez ganhar.
 */
export function decidingCard(winner: HandRank, loser: HandRank): Card | undefined {
  const value = decidingValue(winner, loser);
  if (value === undefined) return undefined;
  return winner.cards.find((card) => pokerValue(card.rank) === value);
}

/** O nome de uma face na língua da mesa: "Ás", "Rei", "9". */
export function rankName(rank: CardRank): string {
  return RANK_LABEL[rank];
}

/**
 * A posição em que as duas forças se separaram, em VALOR de poker. É o
 * caminho por onde o `decidingCard` acha a carta, e vive separado dele
 * porque comparar é uma coisa e apontar a carta é outra.
 */
export function decidingValue(winner: HandRank, loser: HandRank): number | undefined {
  if (winner.category !== loser.category) return undefined;
  const length = Math.max(winner.score.length, loser.score.length);
  for (let index = 1; index < length; index += 1) {
    const mine = winner.score[index] ?? 0;
    const theirs = loser.score[index] ?? 0;
    if (mine !== theirs) return mine;
  }
  return undefined;
}

/**
 * As cartas que FORMAM a categoria — o par, os dois pares, a trinca, a
 * quadra. Nas mãos de cinco (sequência, flush, full house) são todas,
 * porque ali as cinco fazem parte da combinação; na carta alta é uma só.
 *
 * O que fica de fora são os KICKERS: cartas que estão na mão de cinco
 * porque a mão de poker tem cinco cartas, e não porque fazem parte da
 * combinação. Um par de Reis é KK — mostrar KK937 ao lado do nome "um
 * par de Reis" faz o olho procurar a combinação dentro do monte, que é
 * exatamente o trabalho que a placa existe para poupar.
 */
function categoryCards(category: HandCategory, cards: readonly Card[]): Card[] {
  const sorted = [...cards].sort((a, b) => pokerValue(b.rank) - pokerValue(a.rank));

  /* Os valores que se REPETEM, do grupo maior para o menor — é assim que
     par, dois pares, trinca e quadra se distinguem uns dos outros sem
     precisar do `score`. A leitura sai das próprias cartas, e isso
     importa: quem chama isto é a placa, que recebe a mão resumida (sem
     score) do outro lado da fronteira da engine. */
  const repeated = [...new Set(sorted.map((card) => pokerValue(card.rank)))]
    .map((value) => ({ value, count: sorted.filter((c) => pokerValue(c.rank) === value).length }))
    .filter((group) => group.count > 1)
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const of = (value: number | undefined): Card[] =>
    value === undefined ? [] : sorted.filter((card) => pokerValue(card.rank) === value);

  switch (category) {
    case 'straight-flush':
    case 'flush':
    case 'full-house':
    case 'straight':
      return sorted;
    case 'quads':
    case 'trips':
    case 'pair':
      return of(repeated[0]?.value);
    case 'two-pair':
      return [...of(repeated[0]?.value), ...of(repeated[1]?.value)];
    case 'high-card':
      return sorted.slice(0, 1);
  }
}

/**
 * O que a PLACA DO DESFECHO mostra: a combinação, mais a carta que
 * decidiu quando houve uma.
 *
 * As duas coisas juntas são a resposta inteira a "por que este ganhou" —
 * e nada além delas: um par de Reis que venceu no 9 são três cartas
 * (K K 9), e um par de Valetes levado por desistência são duas. O resto
 * da mão de cinco não participou da decisão e só disputaria a atenção
 * com o que participou.
 *
 * O kicker que decidiu pode já estar na combinação (num flush, por
 * exemplo, as cinco cartas são a mão inteira) — nesse caso ele não entra
 * duas vezes.
 */
export function decidingHand(
  rank: { category: HandCategory; cards: readonly Card[] },
  deciding?: Card,
): readonly Card[] {
  const core = categoryCards(rank.category, rank.cards);
  if (!deciding) return core;
  const repeated = core.some(
    (card) => card.rank === deciding.rank && card.suit === deciding.suit,
  );
  return repeated ? core : [...core, deciding];
}

/**
 * A MELHOR mão de cinco entre as cartas disponíveis — o veredito que a
 * mesa usa no showdown.
 *
 * Aceita de cinco a sete cartas: sete no river, seis no turn e cinco no
 * flop. É o que permite mostrar ao jogador o que a mão dele JÁ é a cada
 * carta que a mesa abre, sem esperar o river.
 */
export function bestHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) {
    throw new RangeError(`A melhor mão sai de 5 a 7 cartas, não de ${cards.length}.`);
  }

  let best: HandRank | null = null;
  for (const combination of combinationsOfFive(cards)) {
    const rank = rankFiveCards(combination);
    if (best === null || compareRanks(rank, best) > 0) best = rank;
  }
  // Inalcançável: com 5 a 7 cartas há sempre ao menos uma combinação.
  if (best === null) throw new RangeError('Nenhuma combinação de cinco cartas.');
  return best;
}

/** Todas as combinações de cinco cartas (C(7,5) = 21 no pior caso). */
function combinationsOfFive(cards: readonly Card[]): Card[][] {
  const result: Card[][] = [];
  const current: Card[] = [];

  const walk = (start: number): void => {
    if (current.length === 5) {
      result.push([...current]);
      return;
    }
    // Poda: sem cartas suficientes à frente para fechar cinco, desiste.
    for (let index = start; index < cards.length; index += 1) {
      const card = cards[index];
      if (card === undefined) continue;
      current.push(card);
      walk(index + 1);
      current.pop();
    }
  };

  walk(0);
  return result;
}
