import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { SHOW_CARDS_SECONDS } from '../../store/gameStore';
import type { CashShowPrompt as CashShowPromptState } from '../tournamentStore';

export interface CashShowPromptProps {
  prompt: CashShowPromptState;
  onAnswer: (show: boolean) => void;
  instant: boolean;
}

/**
 * O CONVITE PARA ABRIR A MÃO que ninguém pagou para ver, na mesa de seis.
 *
 * É o balão do duelo (`.show-prompt`, mesma moldura e mesma barra), com
 * duas diferenças que a mesa de anel obriga:
 *
 * - **ele só vai a QUEM LEVOU o pote.** No duelo os dois lados escolhem,
 *   porque são dois. Aqui, perguntar aos cinco que correram seria cinco
 *   balões por mão, e a mesa passaria mais tempo perguntando do que
 *   jogando;
 * - **ele não nomeia quem correu.** Numa mesa de seis correram vários, e
 *   uma frase com um nome só contaria a mão errada.
 *
 * ELE SEGURA A CENA. Enquanto a pergunta está no ar, o embate espera —
 * é essa pausa que faz a pergunta valer alguma coisa. Respondê-la com as
 * cartas já viradas na tela seria escolher uma porta aberta.
 *
 * Ele morava DENTRO da placa do desfecho, e saiu de lá quando o fim da
 * mão ganhou as três batidas do duelo: agora ele vem ANTES da placa, e
 * não junto dela.
 */
export function CashShowPrompt({ prompt, onAnswer, instant }: CashShowPromptProps) {
  return (
    <motion.div
      className="show-prompt"
      data-testid="cash-show-prompt"
      role="dialog"
      aria-label="Mostrar sua mão à mesa"
      initial={instant ? false : { opacity: 0, scale: 0.86, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.24 } }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
    >
      {/* O relógio como BARRA, e não como número: cinco segundos passam
          rápido demais para se ler um algarismo trocando, e o que a
          pessoa precisa saber é quanto ainda tem — não quanto exatamente.
          Uma varredura só, de cheia a vazia, pelos cinco segundos: as
          duas pontas são o mesmo instante do relógio que a gerou. */}
      <div className="show-prompt__clock" aria-hidden="true">
        <motion.span
          className="show-prompt__bar"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={instant ? { duration: 0 } : { duration: SHOW_CARDS_SECONDS, ease: 'linear' }}
        />
      </div>

      <p className="show-prompt__lead" data-testid="cash-show-lead">
        <strong>Ninguém pagou para ver</strong>
      </p>

      <p className="show-prompt__ask">Deseja mostrar sua mão à mesa?</p>

      <div className="show-prompt__actions">
        <Button size="md" fullWidth onClick={() => onAnswer(true)} data-testid="cash-show-yes">
          <Icon name="check" /> MOSTRAR
        </Button>
        <Button
          variant="ghost"
          size="md"
          fullWidth
          onClick={() => onAnswer(false)}
          data-testid="cash-show-no"
        >
          GUARDAR ({prompt.seconds}s)
        </Button>
      </div>
    </motion.div>
  );
}
