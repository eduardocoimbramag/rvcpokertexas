import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Campo de créditos com atalhos de incremento (+10 / +100) — o padrão
 * de digitar valor da casa, nascido na mesa de negociação do 1v1 e
 * reaproveitado na taxa de entrada do torneio.
 *
 * O valor é uma STRING, não um número: o campo precisa poder ficar
 * vazio enquanto a pessoa apaga para redigitar, e um `number` obrigaria
 * a inventar um 0 nesse intervalo (que o teclado então teria de apagar
 * de novo). Quem consome converte e decide o que "vazio" significa.
 */
export interface AmountStepperProps {
  /** Texto do campo — só dígitos; vazio = sem valor. */
  value: string;
  onChange: (next: string) => void;
  /** Rótulo acessível do campo (não é exibido). */
  label: string;
  /** Incrementos rápidos, na ordem em que aparecem. */
  steps?: readonly number[];
  /** Teto do valor: os atalhos nunca somam além dele. */
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  /** Ação colada à direita do campo (ex.: "Enviar proposta"). */
  trailing?: ReactNode;
  className?: string;
  'data-testid'?: string;
  /** Prefixo dos testids dos atalhos: `nego-plus` → `nego-plus-10`. */
  stepTestIdPrefix?: string;
}

const DEFAULT_STEPS = [10, 100] as const;

/** Teto de dígitos do campo — 6 cobre qualquer saldo do jogo. */
const MAX_DIGITS = 6;

export function AmountStepper({
  value,
  onChange,
  label,
  steps = DEFAULT_STEPS,
  max = 999_999,
  disabled = false,
  placeholder,
  trailing,
  className = '',
  'data-testid': testId,
  stepTestIdPrefix = 'amount-plus',
}: AmountStepperProps) {
  const instant = useReducedMotion() ?? false;

  const bump = (delta: number) => {
    const base = Number.parseInt(value, 10) || 0;
    onChange(String(Math.min(base + delta, max)));
  };

  return (
    <div className={`amount-stepper ${className}`}>
      <input
        className="amount-stepper__input"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS))}
      />

      {steps.map((step) => (
        <motion.button
          key={step}
          type="button"
          className="amount-stepper__bump"
          onClick={() => bump(step)}
          disabled={disabled}
          aria-label={`Somar ${step} créditos`}
          data-testid={`${stepTestIdPrefix}-${step}`}
          whileTap={instant || disabled ? undefined : { scale: 0.92 }}
        >
          +{step}
        </motion.button>
      ))}

      {trailing}
    </div>
  );
}
