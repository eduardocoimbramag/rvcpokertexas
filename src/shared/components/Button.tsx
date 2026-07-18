import type { HTMLMotionProps } from 'framer-motion';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/* Cascas premium definidas em index.css (bisel, brilho no hover, foco). */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn btn--primary',
  secondary: 'btn btn--secondary',
  ghost: 'btn btn--ghost',
  danger: 'btn btn--danger',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-14 px-6 text-base',
};

/**
 * Botão base do jogo: alvos de toque generosos (mín. 44px), feedback
 * imediato de escala no toque, brilho varrendo no hover (desktop) e
 * variantes de alto contraste com bisel.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      // Botões full-width já encostam na margem da casca: crescer no
      // hover estoura a tela. O feedback fica com o brilho/brightness do CSS.
      whileHover={disabled || fullWidth ? undefined : { scale: 1.015 }}
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-extrabold tracking-wide ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
