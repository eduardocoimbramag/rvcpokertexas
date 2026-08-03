import type { ReactNode } from 'react';

import { Monogram } from './AvatarBadge';

export interface DuelistSeatProps {
  name: string;
  accent: 'player' | 'opponent';
  /**
   * Peças que ORBITAM o medalhão — o aro de prontidão, o selo de visto e
   * o flash da confirmação. Entram antes dele no DOM e são todas
   * absolutas, então continuam pintando por cima do disco; a
   * apresentação não passa nada aqui e fica só com o retrato.
   */
  children?: ReactNode;
}

/**
 * O ASSENTO DE UM DUELISTA — o retrato dele na mesa: um disco de 80 px
 * com o aro na cor do lado (azul você, vermelho o rival), o monograma
 * dentro e o nome gravado no feltro logo abaixo.
 *
 * Ele mora aqui, e não em cada tela, porque são DUAS telas mostrando a
 * mesma coisa em sequência — a confirmação de duelo e a apresentação —
 * e um jogador que vê as duas em oito segundos percebe na hora se uma
 * delas tiver um aro de espessura diferente ou um nome meio pixel mais
 * abaixo. Enquanto cada uma tinha o seu, a apresentação era um cartão de
 * vinho lapidado e a confirmação, um disco no feltro: pareciam telas de
 * jogos diferentes.
 *
 * A coluna tem largura fixa (`w-24`) de propósito: é ela que mantém os
 * dois assentos EXATAMENTE do mesmo tamanho, independentemente do nome —
 * nome comprido trunca, nunca empurra o medalhão do outro lado.
 */
export function DuelistSeat({ name, accent, children }: DuelistSeatProps) {
  const player = accent === 'player';
  const border = player ? 'border-player' : 'border-opponent';
  const ink = player ? 'text-[#1e3a8a]' : 'text-[#7f1d1d]';

  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div className="relative">
        {children}
        <span
          className={`grid h-20 w-20 place-items-center rounded-full border-2 ${border} bg-arena-800 text-4xl`}
          data-testid={`duelist-seat-${accent}`}
        >
          <Monogram name={name} you={player} />
        </span>
      </div>

      <span className={`text-engraved max-w-full truncate font-black ${ink}`}>{name}</span>
    </div>
  );
}
