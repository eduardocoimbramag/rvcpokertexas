import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { potChips, potColumns } from './pot';

/**
 * A cena em que o pote está — o que muda é a DENSIDADE, nunca a
 * contagem:
 *
 * - `felt` — o duelo. O pote divide o feltro com duas mãos de cartas, e
 *   no aparelho mais baixo sobra uma faixa de 92px entre elas: fichas
 *   miúdas, colunas curtas, espalhadas.
 *
 * Houve uma segunda cena aqui, a da NEGOCIAÇÃO, com fichas grandes num
 * feltro vazio. Ela saiu com a rodada que a justificava: no Hold'em não
 * se combina o valor da mesa, entra-se com a entrada fixa.
 */
export type ChipStackVariant = 'felt';

/**
 * Densidade de cada cena.
 *
 * `stepPx` sai daqui para o CSS (via `--chip-step`) E para a animação,
 * porque os dois PRECISAM concordar: a caixa da coluna é dimensionada em
 * CSS a partir do degrau, e quem move cada ficha para o degrau dela é o
 * framer. Dois números soltos divergiriam no primeiro ajuste.
 *
 * `perColumn` é o que decide se o pote cresce para cima ou para os
 * lados, e o número foi escolhido MEDINDO o pior aparelho: a faixa livre
 * entre as duas mãos tem 92px de altura num telefone de 640px, e seis
 * fichas de ~31px dão uma coluna de 51px.
 *
 * `entryPx` é curto pelo mesmo motivo: a faixa é estreita, e uma ficha
 * vinda de 120px abaixo atravessaria a sua própria mão de cartas.
 */
const LAYOUT: Record<ChipStackVariant, { perColumn: number; stepPx: number; entryPx: number }> = {
  felt: { perColumn: 6, stepPx: 4, entryPx: 70 },
};

/** Quanto a chegada do pote inteiro pode durar, em segundos. */
const ARRIVAL_S = 0.9;
/** Intervalo entre duas fichas quando o pote é pequeno. */
const ARRIVAL_STEP_S = 0.07;

export interface ChipStackProps {
  /** Valor na mesa. É ele que manda na quantidade de fichas. */
  stake: number;
  variant: ChipStackVariant;
  /** Movimento reduzido: o pote aparece montado. */
  instant: boolean;
  /** A placa "<valor> na mesa" sob as fichas. */
  plate?: boolean;
  'data-testid'?: string;
  /** Testid da cifra dentro da placa. */
  valueTestId?: string;
}

/**
 * O POTE DE FICHAS no centro do feltro — o retrato físico do que a mesa
 * vale agora.
 *
 * É a MESMA peça na negociação e no duelo, e é isso que faz a cena
 * fechar: as fichas que você empurrou para a mesa na negociação são as
 * que continuam lá enquanto as cartas correm. Antes elas sumiam quando o
 * duelo começava, e o valor em jogo virava um número que ninguém via.
 *
 * As fichas se repartem em COLUNAS equilibradas (ver `potColumns`), como
 * um pote de verdade: dobrar a aposta dobra as fichas, e uma coluna
 * virar duas é uma leitura que o olho faz sem contar.
 *
 * Rotações, derivas e ordem de chegada são DETERMINÍSTICAS (derivadas
 * dos índices): a bagunça natural de uma pilha real, sem `Math.random` —
 * os testes e o movimento reduzido veem sempre a mesma mesa.
 */
export function ChipStack({
  stake,
  variant,
  instant,
  plate = false,
  'data-testid': testId,
  valueTestId,
}: ChipStackProps) {
  const { perColumn, stepPx, entryPx } = LAYOUT[variant];

  const columns = useMemo(() => {
    const total = potChips(stake);
    const heights = potColumns(total, perColumn);
    // O stagger encurta conforme o pote engorda: trinta fichas a 70ms
    // cada levariam dois segundos para assentar.
    const beat = total > 0 ? Math.min(ARRIVAL_STEP_S, ARRIVAL_S / total) : 0;

    return heights.map((height, column) =>
      Array.from({ length: height }, (_, index) => {
        const seed = column * 13 + index;
        return {
          rotate: ((seed * 47) % 25) - 12,
          drift: ((seed * 31) % 11) - 5,
          gold: seed % 3 === 2,
          /* As fichas caem POR CAMADA, atravessando as colunas — o fundo
             de todas primeiro, depois a segunda fileira. É assim que um
             pote se forma; coluna por coluna leria como gráfico de
             barras se desenhando. */
          delay: (index * heights.length + column) * beat,
        };
      }),
    );
  }, [stake, perColumn]);

  if (columns.length === 0) return null;

  return (
    <div
      className={`chip-stack chip-stack--${variant}`}
      data-testid={testId}
      // role="img": o pote é um dado composto de dezenas de discos
      // decorativos; num elemento sem papel, o rótulo que o traduz seria
      // descartado pela especificação ARIA.
      role="img"
      aria-label={`Pote na mesa: ${formatCredits(stake)} créditos`}
    >
      <div className="chip-stack__pot" aria-hidden="true">
        {columns.map((chips, column) => (
          <div
            key={column}
            className="chip-stack__pile"
            style={
              {
                '--chip-count': chips.length,
                '--chip-step': `${stepPx}px`,
              } as CSSProperties
            }
          >
            {chips.map((chip, index) => (
              <motion.span
                key={index}
                /* A MESMA ficha do montante: uma ficha é uma ficha em
                   toda a mesa. O pote se conta por unidade (dobrar a
                   aposta dobra as fichas) e o montante por valor — mas a
                   PEÇA é a da casa nos dois, e é isso que faz o dinheiro
                   ler como dinheiro de um lugar só. */
                className={`rvc-chip ${chip.gold ? 'rvc-chip--1000' : 'rvc-chip--100'}`}
                style={{ zIndex: index }}
                initial={
                  instant
                    ? false
                    : {
                        opacity: 0,
                        y: entryPx,
                        x: chip.drift * 7,
                        rotate: chip.rotate * 3,
                        scale: 0.6,
                      }
                }
                animate={{ opacity: 1, y: -index * stepPx, x: 0, rotate: chip.rotate, scale: 1 }}
                transition={
                  instant
                    ? { duration: 0 }
                    : { delay: chip.delay, type: 'spring', stiffness: 320, damping: 23 }
                }
              >
                {/* O brasão da casa no miolo, como no montante de cada
                    duelista: a ficha do pote e a da frente do jogador são
                    a MESMA peça, e uma delas sem a marca denunciava que
                    eram duas. */}
                <span className="rvc-chip__crest" />
              </motion.span>
            ))}
          </div>
        ))}
      </div>

      {/* aria-hidden: o rótulo do grupo já conta o valor — sem ele o
          leitor de tela ouviria a mesma cifra duas vezes. */}
      {plate && (
        <div className="chip-stack__plate" aria-hidden="true">
          <motion.span
            className="chip-stack__value"
            data-testid={valueTestId}
            initial={instant ? false : { scale: 1.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              instant
                ? { duration: 0 }
                : { type: 'spring', stiffness: 300, damping: 20, delay: 0.15 }
            }
          >
            <Icon name="chip" size="1em" /> {formatCredits(stake)}
          </motion.span>
          <span className="chip-stack__label">na mesa</span>
        </div>
      )}
    </div>
  );
}
