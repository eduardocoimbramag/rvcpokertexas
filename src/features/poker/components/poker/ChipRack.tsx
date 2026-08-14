import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';

import { formatCredits } from '@/shared/lib/format';

import type { Duelist } from '../../engine/types';
import { RACK_PER_COLUMN, rackChips } from '../table/pot';

export interface ChipRackProps {
  side: Duelist;
  /** Fichas que este lado tem AGORA (o stack, sem o que já está no meio). */
  stack: number;
  /** Movimento reduzido: o montante aparece montado. */
  instant: boolean;
}

/**
 * O MONTANTE DE FICHAS de um duelista — o dinheiro dele, em cima do pano,
 * ao lado da mão.
 *
 * Ele existe porque a mesa virou SESSÃO. Numa mesa de mão única o stack
 * era um número na plaquinha e bastava: os dois entravam iguais, a mão
 * acabava e a conta se fechava. Numa sessão o stack é o ENREDO — ele
 * sobe, desce, e a distância entre os dois montantes é o placar que
 * interessa. Um número não dá essa leitura de relance; duas pilhas dão.
 *
 * AS FICHAS TÊM VALOR, e é isso que faz o montante caber na mesa. A
 * primeira versão contava fichas de valor único, e um stack de 5.000
 * virava uma parede de discos que transbordava a tela — e ainda por cima
 * miúdos, para caber. Com as quatro fichas da casa (ver
 * `CHIP_DENOMINATIONS`) o montante deixa de ser contado e passa a ser
 * LIDO: seis douradas são seis mil, e isso se vê sem contar nada. As
 * fichas voltam ao tamanho das do pote, porque uma ficha é uma ficha em
 * toda a mesa — o que muda é quanto ela vale.
 *
 * AS FICHAS VIAJAM. Cada uma tem `layout` e uma `key` estável por valor e
 * posição: quando o stack cai porque a pessoa apostou, a ficha do topo
 * não some — ela sai do montante em direção ao centro do feltro, que é
 * para onde o dinheiro foi. Quando o pote é recolhido e o stack cresce,
 * ela chega pelo mesmo caminho, na direção contrária.
 *
 * A bagunça da pilha (rotação, deriva) é DETERMINÍSTICA, derivada dos
 * índices: a mesma irregularidade natural de fichas empilhadas à mão, sem
 * `Math.random` — os testes e o movimento reduzido veem sempre a mesma
 * mesa.
 */
export function ChipRack({ side, stack, instant }: ChipRackProps) {
  const you = side === 'player';

  const columns = useMemo(() => {
    /* As fichas são despejadas na ordem dos VALORES, da mais alta para a
       mais baixa, e a coluna quebra quando enche. Duas fichas de valores
       diferentes convivem numa coluna sem estranheza: é assim que uma
       pilha real se forma quando o espaço da mesa aperta. */
    const flat = rackChips(stack).flatMap((group) =>
      Array.from({ length: group.count }, () => group.value),
    );

    const piles: { key: string; value: number; rotate: number }[][] = [];
    flat.forEach((value, index) => {
      const column = Math.floor(index / RACK_PER_COLUMN);
      piles[column] ??= [];
      piles[column].push({
        // A chave junta valor e posição: trocar uma dourada por duas roxas
        // move as fichas certas em vez de remontar o montante inteiro.
        key: `${value}-${index}`,
        value,
        rotate: ((index * 47) % 17) - 8,
      });
    });
    return piles;
  }, [stack]);

  return (
    <div
      className={`chip-rack chip-rack--${side}`}
      data-testid={`chip-rack-${side}`}
      /* role="img": o montante é um dado composto de discos decorativos;
         num elemento sem papel, o rótulo que o traduz seria descartado
         pela especificação ARIA. */
      role="img"
      aria-label={`Fichas de ${you ? 'você' : 'seu rival'}: ${formatCredits(stack)}`}
    >
      <div className="chip-rack__piles" aria-hidden="true">
        {columns.map((chips, column) => (
          <div key={column} className="chip-rack__pile">
            <AnimatePresence initial={false}>
              {chips.map((chip, index) => (
                <motion.span
                  key={chip.key}
                  layout={!instant}
                  className={`rvc-chip rvc-chip--${chip.value}`}
                  style={{ zIndex: index, bottom: `calc(var(--rack-step) * ${index})` }}
                  initial={
                    instant ? false : { opacity: 0, x: you ? -20 : 20, scale: 0.6, rotate: 0 }
                  }
                  animate={{ opacity: 1, x: 0, scale: 1, rotate: chip.rotate }}
                  /* A ficha que sai vai NA DIREÇÃO DO CENTRO do feltro —
                     é para lá que o dinheiro foi. Sumir no lugar faria a
                     aposta parecer um número que mudou. */
                  exit={
                    instant
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          x: you ? -34 : 34,
                          y: you ? -26 : 26,
                          scale: 0.5,
                          transition: { duration: 0.3, ease: 'easeIn' },
                        }
                  }
                  transition={
                    instant
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 340, damping: 24, delay: index * 0.03 }
                  }
                >
                  {/* O brasão da casa no miolo, como numa ficha de sala:
                      é o que a faz ler como peça de cassino e não como
                      disco colorido. Máscara, e não imagem — assim ele
                      herda a tinta da ficha e some junto com ela. */}
                  <span className="rvc-chip__crest" />
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
