/**
 * Regras puras de créditos virtuais. Nenhuma função altera estado:
 * recebem saldo/stake e retornam novos valores ou vereditos.
 */

/** Stakes pré-definidos exibidos como fichas na UI. */
export const STAKE_PRESETS: readonly number[] = [10, 25, 50];

/** Menor stake permitido na mesa. */
export const MIN_STAKE = STAKE_PRESETS[0] ?? 10;

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

/** Fichas disponíveis para o saldo atual. */
export function availableStakes(balance: number): readonly number[] {
  return STAKE_PRESETS.filter((stake) => stake <= balance);
}

/** Verdadeiro quando o saldo não cobre nem o menor stake. */
export function isBroke(balance: number): boolean {
  return balance < MIN_STAKE;
}
