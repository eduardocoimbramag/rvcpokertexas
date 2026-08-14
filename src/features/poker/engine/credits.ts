/**
 * Regras puras de créditos virtuais. Nenhuma função altera estado:
 * recebem saldo/stake e retornam novos valores ou vereditos.
 */

/**
 * Comissão da casa sobre o dinheiro GANHO — nunca sobre o que o jogador
 * já tinha. É a única saída de créditos do sistema e vale igual nas duas
 * modalidades: no 1v1 a vitória leva 90% do que o perdedor pôs na mesa;
 * no torneio, o bolo é distribuído já descontados estes 10%.
 */
export const HOUSE_EDGE = 0.1;

/** Parte do ganho que fica com quem venceu (90%). */
export function afterHouseEdge(amount: number): number {
  // Arredonda para baixo: a casa nunca cria crédito que não existe.
  return Math.floor(amount * (1 - HOUSE_EDGE));
}

/**
 * Menor valor que pode ir à mesa — hoje o piso da taxa de entrada do
 * torneio, onde quem digita o número é a pessoa. O 1v1 não usa este
 * piso: lá a entrada é fixa (ver `TABLE_ANTE`).
 */
export const MIN_STAKE = 10;

/**
 * ENTRADA OBRIGATÓRIA da mesa de Hold'em: o que cada duelista põe no
 * pote antes de ver a primeira carta. Os dois pagam o mesmo, sempre —
 * não há blinds desiguais nem valor a combinar.
 *
 * Ela substituiu a rodada de negociação, e a troca foi de propósito: o
 * valor negociado era uma segunda partida antes da partida, e o que
 * decidia o duelo era a conversa, não as cartas. Com entrada fixa toda
 * mão começa igual, e o que varia é o que se faz DENTRO dela.
 */
export const TABLE_ANTE = 100;

/**
 * O MENOR LANCE que a mesa aceita: um crédito.
 *
 * A aposta mínima já foi a própria entrada (100), e isso tinha a lógica
 * do no-limit — um piso alto impede o aumento de um crédito usado só
 * para empurrar o relógio. Mas neste duelo o relógio é de 20 s e o rival
 * é a casa: não há o que empurrar, e o piso alto tirava do jogador a
 * única coisa que a barra de apostas existe para dar, que é escolher o
 * tamanho. Com ele, quem quisesse apostar 20 no flop ouvia da mesa que o
 * mínimo era 100.
 *
 * O valor que se digita é o ACRÉSCIMO — o que o rival tem de cobrir para
 * seguir na mão. Apostar 10 sobre uma entrada de 100 leva o seu total a
 * 110, e o rival paga 10.
 */
export const TABLE_MIN_BET = 1;

/**
 * O BUY-IN da mesa: o stack com que cada duelista senta, e o teto do que
 * ele pode perder na sessão inteira.
 *
 * Ele cresceu de 1.000 para 5.000 quando a mesa deixou de ser UMA MÃO e
 * virou uma SESSÃO. Com uma mão só, 1.000 era dez entradas — fundo o
 * bastante para uma decisão de all-in valer alguma coisa. Numa sessão que
 * corre até alguém quebrar, o stack é a distância entre sentar e sair da
 * mesa: com 1.000 essa distância era de dez entradas, e duas mãos ruins
 * acabavam a noite. Com 5.000 são cinquenta, que é o fôlego de uma
 * sessão de verdade.
 */
export const TABLE_MAX_STACK = 5000;

/**
 * Quantas fichas o vencedor de uma sessão leva embora. A comissão da casa
 * incide UMA VEZ, no caixa, e só sobre o LUCRO — nunca sobre o buy-in que
 * a pessoa trouxe.
 *
 * Ela já foi cobrada mão a mão, e com uma mesa de mão única isso dava no
 * mesmo. Numa sessão, não: uma comissão por mão faz fichas evaporarem do
 * feltro a cada pote, os dois stacks encolherem juntos e "jogar até
 * alguém quebrar" virar "jogar até os dois quebrarem". As fichas da mesa
 * são conservadas — elas só trocam de lado —, e a casa cobra na porta de
 * saída.
 */
export function cashOutValue(buyIn: number, finalStack: number): number {
  const profit = finalStack - buyIn;
  return profit > 0 ? buyIn + afterHouseEdge(profit) : finalStack;
}

/**
 * O stack com que se senta: o teto da mesa, ou o que o saldo permitir.
 *
 * O corte pelo saldo não é detalhe: sem ele, sentar exigiria ter os
 * 5.000 inteiros, e uma única sessão perdida deixaria o jogador de fora
 * da própria mesa. Com o corte, quem tem 300 senta com 300 e joga — o que
 * ele arrisca é o que ele tem, que é como funciona em qualquer sala.
 */
export function tableStackFor(balance: number): number {
  return Math.min(TABLE_MAX_STACK, balance);
}

export type StakeValidation =
  { ok: true } | { ok: false; reason: 'invalid-stake' | 'insufficient-balance' };

/** Verifica se um stake pode ser apostado com o saldo atual. */
export function validateStake(balance: number, stake: number): StakeValidation {
  if (!Number.isInteger(stake) || stake < MIN_STAKE) {
    return { ok: false, reason: 'invalid-stake' };
  }
  if (stake > balance) {
    return { ok: false, reason: 'insufficient-balance' };
  }
  return { ok: true };
}

/** Debita o stake do saldo. Lança se a aposta for inválida. */
export function debitStake(balance: number, stake: number): number {
  const validation = validateStake(balance, stake);
  if (!validation.ok) {
    throw new RangeError(
      `Aposta inválida (${validation.reason}): stake=${stake}, saldo=${balance}`,
    );
  }
  return balance - stake;
}

/** Credita o payout de volta ao saldo. */
export function creditPayout(balance: number, payout: number): number {
  if (!Number.isInteger(payout) || payout < 0) {
    throw new RangeError(`Payout inválido: ${payout}`);
  }
  return balance + payout;
}

/**
 * Verdadeiro quando o saldo não cobre nem a entrada da mesa — sem ela
 * não há mão a jogar, porque a entrada é o que abre o pote.
 */
export function isBroke(balance: number): boolean {
  return balance < TABLE_ANTE;
}
