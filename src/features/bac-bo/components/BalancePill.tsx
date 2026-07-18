import { formatCredits } from '@/shared/lib/format';

export interface BalancePillProps {
  balance: number;
}

/** Exibidor compacto do saldo de créditos virtuais. */
export function BalancePill({ balance }: BalancePillProps) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-arena-line bg-arena-800 px-4 py-2"
      aria-label={`Saldo: ${formatCredits(balance)} créditos`}
      data-testid="balance"
    >
      <span aria-hidden="true">🪙</span>
      <span className="font-bold tabular-nums text-gold">{formatCredits(balance)}</span>
    </div>
  );
}
