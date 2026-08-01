import { useEffect, useRef, useState } from 'react';

import { Icon } from '@/shared/components/Icon';

/** O que o selo diz — a única frase, e ela mora aqui. */
export const VEIL_TEXT = 'Essa carta não está sendo visualizada pelo seu oponente';

export interface CardVeilProps {
  /** Selo de mão mini (cartas de assento): encolhe o disco e a legenda. */
  compact?: boolean;
}

/**
 * O selo da carta VELADA: o olho cortado, no canto de uma carta sua que o
 * rival ainda não vê.
 *
 * A regra de POV (ver ./pov) é a coisa menos óbvia da mesa — as suas
 * cartas estão todas abertas na SUA tela, então nada nelas denuncia que a
 * última delas continua virada do outro lado. Este selo é o único lugar
 * em que a mesa conta isso, e por isso ele é discreto mas nunca some: um
 * disco pequeno, na moeda do clube, encostado na quina da carta.
 *
 * Como a legenda abre, e por quê são três caminhos:
 * - MOUSE: `:hover` do CSS — sem estado nenhum, o comportamento que a
 *   mão do desktop espera;
 * - TECLADO: `:focus-visible` — o selo é um botão de verdade, então ele
 *   entra na ordem de tabulação e a legenda abre ao chegar nele;
 * - TOQUE: o clique ALTERNA (o estado `open` daqui). É o único caminho
 *   que precisa de JavaScript, porque no celular não existe hover — e
 *   por isso o hover mora no CSS e não neste estado: com os dois no
 *   mesmo lugar, o toque (que também dispara `pointerenter`) abriria e
 *   fecharia a legenda no mesmo gesto.
 *
 * Aberta por toque, ela se fecha no primeiro toque fora ou no Esc.
 */
export function CardVeil({ compact = false }: CardVeilProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={`card-veil ${compact ? 'card-veil--mini' : ''} ${open ? 'is-open' : ''}`}
    >
      <button
        type="button"
        className="card-veil__badge focus-ring"
        /* O rótulo é a frase inteira: para quem usa leitor de tela o selo
           JÁ é a informação, e a legenda visual seria repetição. */
        aria-label={VEIL_TEXT}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="card-veil"
      >
        <Icon name="eye-off" size="66%" strokeWidth={2.2} />
      </button>
      {/* Decorativa de propósito (ver o rótulo acima): é o mesmo texto. */}
      <span className="card-veil__tip" aria-hidden="true">
        {VEIL_TEXT}
      </span>
    </span>
  );
}
