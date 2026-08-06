import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import type { ShowPrompt } from '../../store/gameStore';
import { SHOW_CARDS_SECONDS } from '../../store/gameStore';

export interface ShowCardsPromptProps {
  prompt: ShowPrompt;
  opponentName: string;
  onAnswer: (show: boolean) => void;
  instant: boolean;
}

/**
 * O CONVITE PARA ABRIR A MÃO que ninguém pagou para ver.
 *
 * Ele entra quando o rival CORRE: o pote é seu sem comparação nenhuma, e
 * as suas cartas vão para o descarte sem que ele saiba o que você tinha.
 * Mostrá-las é jogada, não vaidade — e é das poucas do poker que não
 * custam ficha nenhuma:
 *
 * - abrir um par de Ases diz "eu aposto com mão feita", e faz o rival
 *   pagar mais barato nas próximas em que você tiver mão;
 * - abrir uma carta alta diz "eu blefo", e é o que faz a aposta seguinte
 *   valer o dobro — ele vai pagar para ver.
 *
 * Por isso o balão traz a LEITURA da mão: a decisão depende inteiramente
 * do que se tem, e obrigar a pessoa a lembrar das próprias cartas no
 * meio de um relógio de cinco segundos seria cobrar memória em vez de
 * estratégia.
 *
 * O RELÓGIO É CURTO de propósito. Cinco segundos é o tempo de uma decisão
 * de mesa — quem pensa muito já está contando a história que ia esconder.
 * O silêncio vale por NÃO MOSTRO, que é o que uma sala de verdade faz com
 * quem não diz nada: as cartas vão para o descarte de bruços.
 */
export function ShowCardsPrompt({
  prompt,
  opponentName,
  onAnswer,
  instant,
}: ShowCardsPromptProps) {
  const progress = prompt.seconds / SHOW_CARDS_SECONDS;

  return (
    <motion.div
      className="show-prompt"
      data-testid="show-prompt"
      role="dialog"
      aria-label="Mostrar suas cartas ao rival"
      initial={instant ? false : { opacity: 0, scale: 0.86, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.24 } }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
    >
      {/* O relógio como BARRA, e não como número: cinco segundos passam
          rápido demais para se ler um algarismo trocando, e o que a
          pessoa precisa saber é quanto ainda tem — não quanto exatamente. */}
      <div className="show-prompt__clock" aria-hidden="true">
        <motion.span
          className="show-prompt__bar"
          initial={false}
          animate={{ scaleX: progress }}
          transition={instant ? { duration: 0 } : { duration: 1, ease: 'linear' }}
        />
      </div>

      <p className="show-prompt__lead">
        {opponentName} correu — o pote é seu <strong>sem mostrar nada</strong>.
      </p>

      <p className="show-prompt__hand" data-testid="show-prompt-hand">
        <Icon name="chip" size="0.9em" /> {prompt.handLabel}
      </p>

      <p className="show-prompt__ask">Abrir a sua mão para ele ver?</p>

      <div className="show-prompt__actions">
        <Button size="md" fullWidth onClick={() => onAnswer(true)} data-testid="show-cards-yes">
          MOSTRAR
        </Button>
        <Button
          variant="ghost"
          size="md"
          fullWidth
          onClick={() => onAnswer(false)}
          data-testid="show-cards-no"
        >
          GUARDAR ({prompt.seconds}s)
        </Button>
      </div>
    </motion.div>
  );
}
