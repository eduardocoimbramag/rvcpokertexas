import type { CSSProperties, ReactNode } from 'react';

/**
 * Brasão da casa — o mesmo arquivo do couro da mesa e do verso das
 * cartas. (Card3D e TableCrest declaram esta mesma constante; unificar as
 * três está fora do escopo desta mudança.)
 */
const CREST_SRC = `${import.meta.env.BASE_URL}brasaorvc.svg`;

export interface EmptyStateProps {
  /** A manchete, curta e sem drama: o que não existe ainda. */
  title: string;
  /** A explicação — e, quando faz sentido, o caminho de saída. */
  children: ReactNode;
  /** CTA opcional. Só entra quando NÃO houver um botão equivalente em
      cena: dois convites idênticos na mesma tela viram ruído. */
  action?: ReactNode;
  'data-testid'?: string;
}

/**
 * O vazio com a cara da casa.
 *
 * Um estado vazio é visto exatamente por quem acabou de instalar — a hora
 * em que o jogo tem uma chance só de parecer acabado. Um parágrafo cinza
 * centralizado lê como "produto sem conteúdo"; com o brasão em marca
 * d'água e um caminho de saída, o vazio vira convite.
 *
 * O brasão vem por `mask-image` do mesmo SVG do couro, então ele é
 * PRESENÇA e não ilustração: fica no limiar do perceptível, como o
 * relevo da mesa.
 */
export function EmptyState({ title, children, action, 'data-testid': testId }: EmptyStateProps) {
  return (
    <div className="empty-state" data-testid={testId}>
      <span
        className="empty-state__crest"
        style={{ '--crest-src': `url(${CREST_SRC})` } as CSSProperties}
        aria-hidden="true"
      />
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__text">{children}</p>
      {action}
    </div>
  );
}
