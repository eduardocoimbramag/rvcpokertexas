import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';

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
 * Ele entra em toda mão morta por DESISTÊNCIA, e DOS DOIS LADOS —
 * mostrar é jogada dos dois lados, não vaidade, e é das poucas do poker
 * que não custam ficha nenhuma:
 *
 * - quem LEVOU o pote escolhe se conta com o que ganhou: abrir um par de
 *   Ases diz "eu aposto com mão feita" e faz o rival pagar mais barato
 *   nas próximas em que você tiver mão; abrir carta alta diz "eu blefo",
 *   e é o que faz a aposta seguinte valer o dobro — ele vai pagar para
 *   ver;
 * - quem CORREU escolhe se conta o que jogou fora: abrir um par de Reis
 *   largado diz "eu solto mão grande quando a mesa pede", e é a mesma
 *   moeda gasta na direção contrária. Era o lado que faltava — a mesa só
 *   perguntava a quem ganhava, como se largar a mão não fosse também uma
 *   história a contar.
 *
 * O RELÓGIO É CURTO de propósito. Cinco segundos é o tempo de uma decisão
 * de mesa — quem pensa muito já está contando a história que ia esconder.
 * O silêncio vale por NÃO MOSTRO, que é o que uma sala de verdade faz com
 * quem não diz nada: as cartas vão para o descarte de bruços.
 *
 * A LEITURA DA MÃO não mora mais aqui. Ela morava, porque a decisão
 * depende inteiramente do que se tem — mas a placa do assento passou a
 * trazê-la em cena o tempo todo, a dois dedos deste balão. Dizer a mesma
 * coisa duas vezes na mesma tela só alongava a única mensagem do jogo que
 * tem cinco segundos para ser lida.
 */
export function ShowCardsPrompt({
  prompt,
  opponentName,
  onAnswer,
  instant,
}: ShowCardsPromptProps) {
  const youFolded = prompt.foldedBy === 'player';

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
          pessoa precisa saber é quanto ainda tem — não quanto exatamente.

          UMA VARREDURA SÓ, de cheia a vazia, e não um degrau por segundo.
          A barra andava atrás do contador: o alvo de cada segundo era
          `sobra/total`, então no último tick ela mirava 1/5 e o balão
          fechava com um quinto de barra ainda aceso — o número zerava e o
          desenho dizia que ainda havia tempo. Uma animação contínua de 1 a
          0 pelos cinco segundos não tem como se desencontrar do relógio
          que a gerou: as duas pontas são o mesmo instante. */}
      <div className="show-prompt__clock" aria-hidden="true">
        <motion.span
          className="show-prompt__bar"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={
            instant ? { duration: 0 } : { duration: SHOW_CARDS_SECONDS, ease: 'linear' }
          }
        />
      </div>

      {/* DUAS LINHAS, e nada mais. Quem correu, e a pergunta. O balão já
          trouxe o pote, o sigilo e a leitura da mão em quatro linhas de
          texto — e um relógio de cinco segundos não paga leitura de
          parágrafo: a pessoa lia a explicação e perdia a decisão. */}
      <p className="show-prompt__lead" data-testid="show-prompt-lead">
        <strong>{youFolded ? 'Você' : opponentName}</strong> correu
      </p>

      <p className="show-prompt__ask">Deseja mostrar sua mão para ele?</p>

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
