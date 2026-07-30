import type { MotionProps } from 'framer-motion';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Onde a pílula mora, e portanto o quanto ela ocupa:
 *
 * - `rival` — o adversário na negociação, no alto da tela ao lado do
 *   saldo. Medalhão + nome + situação + ponto de presença.
 * - `tag`   — os selos da mesa única (rodada, bolo): caixa alta espaçada,
 *   miúda, sobre o feltro.
 * - `value` — o saldo: número grande em algarismos tabulares.
 * - `seat`  — a cabeça de um assento de rival na mesa única. Única sem
 *   casca própria: ela já mora DENTRO do cartão do assento, e uma pílula
 *   dentro de outra leria como caixa dupla.
 */
export type HudPillVariant = 'rival' | 'tag' | 'value' | 'seat';

export interface HudPillProps {
  variant: HudPillVariant;
  /** Situação, que tinge o rótulo de estado e o ponto (vira `data-state`). */
  state?: string;
  /** Peça da esquerda: o medalhão de quem é, ou o ícone do que é. */
  leading?: ReactNode;
  /**
   * Peça(s) da direita: rótulo de estado, ponto de presença, coroa.
   *
   * Entra CRU, sem embrulho: são quase sempre dois elementos que precisam
   * do gap da própria pílula entre si, e um contêiner no meio quebraria
   * esse ritmo.
   */
  trailing?: ReactNode;
  /** O rótulo principal. É ele que cede espaço primeiro (reticências). */
  children: ReactNode;
  className?: string;
  /**
   * Papel ARIA. Só passe se `img` não servir — ver o porquê do padrão
   * na implementação.
   */
  role?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  animate?: MotionProps['animate'];
  transition?: MotionProps['transition'];
}

/**
 * A pílula de HUD do jogo.
 *
 * Toda informação de contexto do jogo tem a mesma forma: IDENTIDADE à
 * esquerda, RÓTULO no meio, ESTADO à direita. Saldo, adversário da
 * negociação, rodada e bolo da mesa única, cabeça de assento — quatro
 * telas diferentes contando a mesma coisa.
 *
 * Enquanto cada uma tinha o seu desenho, o topo da tela mudava de língua
 * embaixo do jogador a cada fase. Aqui a casca é uma só e o que varia é
 * a DENSIDADE (ver `HudPillVariant`) — o que também dá um lugar único
 * para os tokens de cor e a escala tipográfica quando chegarem.
 *
 * É um `motion.div` porque o saldo pulsa no instante da variação; sem
 * `animate`, é um div comum.
 */
export function HudPill({
  variant,
  state,
  leading,
  trailing,
  children,
  className = '',
  role,
  animate,
  transition,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: HudPillProps) {
  /* Um `aria-label` num <div> sem papel é PROIBIDO pela especificação
     ARIA: o leitor de tela descarta o rótulo e lê o conteúdo cru — "K
     Kira ESPERANDO" no lugar de "Kira: esperando". A pílula é um dado
     composto (identidade + rótulo + estado) que só faz sentido lido de
     uma vez, então `img` é o papel certo: ele substitui a subárvore pelo
     rótulo. Fica no COMPONENTE, e não em cada chamada, porque é
     exatamente o tipo de detalhe que se esquece — e a falha é silenciosa
     para quem enxerga. */
  const resolvedRole = role ?? (ariaLabel != null ? 'img' : undefined);

  return (
    <motion.div
      className={`hud-pill hud-pill--${variant} ${className}`}
      data-state={state}
      data-testid={testId}
      role={resolvedRole}
      aria-label={ariaLabel}
      animate={animate}
      transition={transition}
    >
      {leading != null && <span className="hud-pill__lead">{leading}</span>}
      <span className="hud-pill__label">{children}</span>
      {trailing}
    </motion.div>
  );
}
