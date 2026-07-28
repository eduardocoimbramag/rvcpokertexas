import type { ReactNode } from 'react';

export interface PhaseTitleProps {
  children: ReactNode;
}

/**
 * Título das fases sobre a mesa ("Escolha sua aposta", "Confirmação de
 * duelo", "Que vença o melhor!"): a mesma placa do "Duelo encontrado"
 * do FoundSplash — pastilha de vinho, letra dourada em caixa alta —
 * promovida a título, com degradê de ouro e lustro a cada 5s.
 *
 * O <span> interno não é decorativo: o degradê da letra é um
 * `background-clip: text`, que recorta o fundo do PRÓPRIO elemento. Se
 * o ouro morasse no h2, a pastilha (pintada depois) cobriria as letras.
 * A pastilha fica no h2 e a tinta no span.
 */
export function PhaseTitle({ children }: PhaseTitleProps) {
  return (
    <h2 className="title-royal">
      <span className="title-royal__ink">{children}</span>
    </h2>
  );
}
