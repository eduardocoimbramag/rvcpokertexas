import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import type { ResultEffectOutcome } from './ResultOutcomeEffect';
import { ResultOutcomeEffect } from './ResultOutcomeEffect';

/**
 * Onde o palco assenta:
 *
 * - `felt`  — sobre o couro claro da mesa, com a crupiê em quadro e as
 *   placas de placar flanqueando-a. A tinta é GRAVADA (escura sobre
 *   claro) e o palco desconta em respiro a faixa que as placas ocupam.
 * - `overlay` — a cortina escura da mesa única, que cobre o feltro
 *   inteiro. Não há placas a descontar, e a tinta é luminosa.
 */
export type ResultSurface = 'felt' | 'overlay';

export type ResultTone = 'win' | 'lose' | 'tie';

export interface ResultStageProps {
  surface: ResultSurface;
  /**
   * Que placa pende sobre o palco — e, portanto, quanta altura ele
   * desconta em respiro para centrar o veredito abaixo dela.
   *
   * `score` são as duas do TORNEIO, flanqueando a crupiê; `winner` é a
   * única do DUELO, mais alta porque leva as cinco cartas da mão
   * vencedora deitadas ao lado. Só vale sobre o feltro: na cortina não
   * há placa a descontar.
   */
  plate?: 'score' | 'winner';
  tone: ResultTone;
  /** O veredito, em caixa alta: VITÓRIA!, DERROTA, EMPATE. */
  title: string;
  titleTestId?: string;
  /**
   * Veste o veredito com o efeito do desfecho (ouro que sobe, rubi que
   * cai — ver ResultOutcomeEffect). Ausente, o título fica na tinta
   * gravada de sempre: é o caso do empate, que não é notícia, e de quem
   * ainda não optou pelo tratamento.
   */
  effect?: ResultEffectOutcome;
  /** A consequência, logo abaixo do veredito ("Você avança de fase"). */
  subtitle?: ReactNode;
  subtitleTestId?: string;
  /** A linha do débito, abaixo do subtítulo. */
  note?: ReactNode;
  noteTestId?: string;
  /** A contagem regressiva, colada acima das ações. */
  footer?: ReactNode;
  footerTestId?: string;
  /** Confete, partículas — entram por trás do veredito. */
  decoration?: ReactNode;
  /** As ações do desfecho (entram na `.action-stack`). */
  children: ReactNode;
  /** Gap menor entre os botões, para quando são dois empilhados. */
  tightActions?: boolean;
  /**
   * Espelhar o que vem abaixo do título em cópias invisíveis acima dele,
   * para centrar o TÍTULO na faixa livre (ver o comentário do
   * componente). Ligado por padrão.
   *
   * Desligue quando o conteúdo abaixo do título for o assunto, e não um
   * aposto dele: um extrato de cinco linhas espelhado custa DUAS vezes a
   * própria altura, e não há tela de celular que pague isso. Sem
   * espelho, o grupo inteiro é que se centra — que é o enquadramento
   * certo quando o título é só o cabeçalho do que vem abaixo.
   */
  mirror?: boolean;
  /** Movimento reduzido: o palco aparece montado. */
  instant?: boolean;
  'data-testid'?: string;
}

/**
 * O PALCO DO DESFECHO — o mesmo nos três modos: duelo 1v1, partida do
 * torneio e mesa única.
 *
 * Ele existe por causa de uma conta de layout que ninguém acerta duas
 * vezes: o veredito precisa cair no MEIO EXATO da faixa livre entre o
 * que está acima (as placas de placar, ou a mesa) e o botão. Isso não sai
 * de `justify-content: center`, porque o grupo do veredito é assimétrico
 * — tem subtítulo e linha de débito embaixo do título e nada em cima.
 *
 * A saída é espelhar: acima do título entram CÓPIAS INVISÍVEIS de tudo o
 * que vem abaixo dele (e da linha de contagem, que mora lá embaixo). Com
 * a mesma altura dos dois lados, o título fica no centro do grupo — e o
 * grupo, entre dois espaçadores de `grow` iguais, no centro da faixa.
 * Tudo em fluxo normal, nada absoluto: em tela baixa comprime junto em
 * vez de sobrepor.
 *
 * As cópias saem daqui, do mesmo JSX das visíveis, e não de um bloco
 * escrito à mão — cópia invisível mantida a dedo desalinha na primeira
 * vez que alguém mexe numa classe da visível e esquece da outra.
 *
 * Antes disto eram três telas com três tipografias e três estruturas de
 * espaçador; a técnica de centragem existia só no torneio, e todo refino
 * do momento mais emocional do jogo custava três implementações — o que
 * na prática significava duas.
 */
export function ResultStage({
  surface,
  plate = 'score',
  tone,
  title,
  titleTestId,
  effect,
  subtitle,
  subtitleTestId,
  note,
  noteTestId,
  footer,
  footerTestId,
  decoration,
  children,
  tightActions = false,
  mirror = true,
  instant = false,
  'data-testid': testId,
}: ResultStageProps) {
  /** A mesma linha, sem tinta e fora do fluxo de leitura: só a altura. */
  const ghost = (className: string, content: ReactNode) => (
    <p aria-hidden className={`invisible ${className}`}>
      {content}
    </p>
  );

  /* O veredito é UM nó de texto, com ou sem efeito — o `data-word`
     alimenta as pseudocamadas de brilho (glow e varredura metálica) sem
     duplicar a palavra no DOM, que confundiria leitor de tela. */
  const heading = (
    <p
      className={`result-stage__title result-stage__title--${tone}${
        effect ? ' result-blaze__word' : ''
      }`}
      data-word={effect ? title : undefined}
      data-testid={titleTestId}
    >
      {title}
    </p>
  );

  return (
    <motion.div
      className={`result-stage result-stage--${surface}${
        surface === 'felt' && plate === 'winner' ? ' result-stage--plate-winner' : ''
      }`}
      data-testid={testId}
      initial={instant ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={instant ? { duration: 0 } : { type: 'spring', damping: 20, stiffness: 260 }}
    >
      {decoration}

      {/* Espaçador de cima: do que está acima até o veredito. */}
      <div aria-hidden className="w-full grow" />

      {/* Compensa, do lado de cima, a linha de contagem que mora embaixo. */}
      {mirror && footer != null && ghost('result-stage__footer', footer)}

      <div className="result-stage__group">
        {/* As cópias entram em ordem ESPELHADA (débito, subtítulo) para
            que a distância do título a cada extremo do grupo seja igual. */}
        {mirror && note != null && ghost('result-stage__note', note)}
        {mirror && subtitle != null && ghost('result-stage__subtitle', subtitle)}

        {/* O efeito envolve a palavra em vez de flutuar solto no palco:
            é o que ancora halo, feixe e partículas no centro EXATO do
            veredito sem medir nada em JavaScript. A caixa é `fit-content`
            como o <p> era, então nada se desloca. */}
        {effect ? (
          <ResultOutcomeEffect outcome={effect} instant={instant}>
            {heading}
          </ResultOutcomeEffect>
        ) : (
          heading
        )}

        {subtitle != null && (
          <p className="result-stage__subtitle" data-testid={subtitleTestId}>
            {subtitle}
          </p>
        )}
        {note != null && (
          <p className="result-stage__note" data-testid={noteTestId}>
            {note}
          </p>
        )}
      </div>

      {/* Espaçador de baixo: mesmo `grow` do de cima → veredito no meio. */}
      <div aria-hidden className="w-full grow" />

      {footer != null && (
        <p className="result-stage__footer" data-testid={footerTestId}>
          {footer}
        </p>
      )}

      <div className={`action-stack ${tightActions ? 'action-stack--tight' : ''}`}>{children}</div>
    </motion.div>
  );
}
