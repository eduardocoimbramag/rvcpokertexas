import { motion, useReducedMotion } from 'framer-motion';
import { Fragment } from 'react';

export interface GoldAnnounceProps {
  /** Texto do anúncio ("Rodada de negociação", "Hora do duelo"). */
  text: string;
  /**
   * Atraso, em segundos, antes de a coreografia começar.
   *
   * Serve a quem prepara a CENA antes do letreiro: o anúncio das ruas
   * desfoca a mesa primeiro e só então carimba a palavra, e sem este
   * atraso as duas coisas aconteceriam juntas — o desfoque deixaria de
   * ser a respirada que antecede e viraria ruído simultâneo.
   */
  delay?: number;
  'data-testid'?: string;
}

/** Entrada das palavras: sobe do feltro, desborra e assenta em mola. */
const WORD_SPRING = { type: 'spring', stiffness: 260, damping: 24 } as const;

/**
 * Anúncio de mesa em ouro: o título gigante que carimba o centro do
 * feltro nas viradas de cena ("RODADA DE NEGOCIAÇÃO", "HORA DO DUELO").
 *
 * A coreografia é a da casa (FoundSplash): um anel de impacto abre o
 * beat, as palavras entram uma a uma — subindo, desborrando e
 * assentando em mola — e os filetes com losango se estendem por cima e
 * por baixo, como a moldura de um letreiro de cassino. A tinta é o
 * mesmo degradê de metal do "VS" e do title-royal (marfim → champagne →
 * âmbar → terracota), recortado letra a letra.
 *
 * O componente é um overlay absoluto: entra e sai sem mexer um
 * milímetro no layout da fase que o exibe. Com reduced motion tudo
 * aparece de uma vez.
 */
export function GoldAnnounce({ text, delay = 0, 'data-testid': testId }: GoldAnnounceProps) {
  const instant = useReducedMotion() ?? false;
  const words = text.split(' ');

  return (
    <motion.div
      className="gold-announce"
      role="status"
      data-testid={testId}
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={
        instant
          ? { opacity: 0 }
          : { opacity: 0, scale: 1.08, filter: 'blur(4px)', transition: { duration: 0.35 } }
      }
    >
      {/* Anel de impacto: abre o beat e some — o mesmo gesto do "VS". */}
      <motion.span
        className="gold-announce__ring"
        aria-hidden="true"
        initial={instant ? false : { scale: 0.35, opacity: 0 }}
        animate={instant ? { opacity: 0 } : { scale: 2.4, opacity: [0, 0.65, 0] }}
        transition={instant ? { duration: 0 } : { delay, duration: 0.9, ease: 'easeOut' }}
      />

      <motion.span
        className="gold-announce__rule"
        aria-hidden="true"
        initial={instant ? false : { scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={
          instant ? { duration: 0 } : { delay: delay + 0.08, duration: 0.55, ease: 'easeOut' }
        }
      />

      {/* O espaço entre os spans é um nó de texto que o flex NÃO vira
          item (whitespace puro não gera item anônimo): o vão visual é
          do column-gap, mas o textContent segue legível para leitores
          de tela e testes. */}
      <span className="gold-announce__text">
        {words.map((word, index) => (
          <Fragment key={`${word}-${index}`}>
            {index > 0 && ' '}
            <motion.span
              className="gold-announce__word"
              initial={instant ? false : { opacity: 0, y: 30, scale: 0.82, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={
                instant ? { duration: 0 } : { ...WORD_SPRING, delay: delay + 0.14 + index * 0.13 }
              }
            >
              {word}
            </motion.span>
          </Fragment>
        ))}
      </span>

      <motion.span
        className="gold-announce__rule"
        aria-hidden="true"
        initial={instant ? false : { scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={
          instant ? { duration: 0 } : { delay: delay + 0.24, duration: 0.55, ease: 'easeOut' }
        }
      />
    </motion.div>
  );
}
