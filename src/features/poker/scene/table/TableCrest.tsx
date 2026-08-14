import type { CSSProperties } from 'react';

/** Brasão da casa (Royal VIP Club) usado como marca d'água do couro. */
const CREST_SRC = `${import.meta.env.BASE_URL}brasaorvc.svg`;

export interface TableCrestProps {
  /**
   * Enquadramento em que a marca é aplicada: muda só a pose (o quanto o
   * brasão deita na superfície) e a posição no couro — o material é o
   * mesmo nas duas câmeras.
   */
  camera: 'front' | 'overhead';
  /** `clip-path` do couro, para a marca jamais invadir o trilho. */
  clipPath?: string;
}

/**
 * Marca d'água do brasão gravada no couro da mesa.
 *
 * Não é um adesivo colado: são duas silhuetas do mesmo brasão (uma de
 * sombra, deslocada para cima; outra de luz, deslocada para baixo) em
 * opacidade muito baixa — a leitura que o olho faz disso é um relevo
 * prensado a quente no couro, no mesmo tom da mesa. O desenho vem de
 * `mask-image`, então a cor de cada camada é controlada no CSS e o
 * arquivo do brasão continua sendo um SVG só.
 *
 * A superfície foge do olho, então a marca deita nela: na câmera frontal
 * leva perspectiva real (`rotateX`), acompanhando a curvatura do rebordo;
 * na vertical fica quase de frente, como quem olha a mesa de cima.
 */
export function TableCrest({ camera, clipPath }: TableCrestProps) {
  return (
    <div
      className={`table-crest table-crest--${camera}`}
      style={{ clipPath }}
      aria-hidden="true"
      data-testid="table-crest"
    >
      <div
        className="table-crest__stamp"
        style={{ '--crest-src': `url("${CREST_SRC}")` } as CSSProperties}
      >
        <span className="table-crest__shadow" />
        <span className="table-crest__light" />
      </div>
    </div>
  );
}
