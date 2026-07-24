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
 * Menor valor que pode ir à mesa — o piso de qualquer aposta do jogo:
 * o lance da negociação do 1v1 e a taxa de entrada do torneio. Não
 * existem mais valores pré-definidos; quem digita o número é a pessoa.
 */
export const MIN_STAKE = 10;

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

/** Verdadeiro quando o saldo não cobre nem o menor stake. */
export function isBroke(balance: number): boolean {
  return balance < MIN_STAKE;
}
