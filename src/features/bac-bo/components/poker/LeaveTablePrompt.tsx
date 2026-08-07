import { motion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

export interface LeaveTablePromptProps {
  /** Fichas que você já pôs no meio NESTA mão — o que fica lá. */
  committed: number;
  /** O pote que vai para o rival se você levantar agora. */
  pot: number;
  /** O que sobra no seu montante e vira crédito no caixa. */
  stack: number;
  opponentName: string;
  onConfirm: () => void;
  onCancel: () => void;
  instant: boolean;
}

/**
 * LEVANTAR NO MEIO DE UMA MÃO — a confirmação.
 *
 * O botão LEVANTAR fica na mesma fileira de APOSTAR, PASSAR e CORRER, e
 * é o quarto de quatro alvos do tamanho de um polegar. Sem esta pergunta
 * ele era o único da fileira que não tinha volta: um toque fora de mira
 * corria a mão E fechava a mesa, e não havia como desfazer nem como
 * saber, antes de tocar, que uma coisa vinha grudada na outra.
 *
 * O QUE ELA PRECISA DIZER não é "tem certeza?" — isso não é informação,
 * é um pedágio. É a CONTA: quanto já está no meio (e fica lá), para
 * quem vai o pote, e com quanto você sai. Com os três números na tela a
 * decisão é de quem joga; sem eles, a pergunta só transfere a dúvida.
 *
 * ELA NÃO PAUSA O RELÓGIO DA VEZ, de propósito. Os 20 s continuam
 * correndo por baixo, como numa sala de verdade — pensar custa tempo, e
 * um diálogo que congelasse a mesa viraria um jeito de comprar tempo de
 * graça no meio de uma decisão. Se o relógio vencer com a pergunta
 * aberta, a mesa joga o lance seguro e a pergunta sai de cena junto com
 * a vez (ver PokerArena).
 */
export function LeaveTablePrompt({
  committed,
  pot,
  stack,
  opponentName,
  onConfirm,
  onCancel,
  instant,
}: LeaveTablePromptProps) {
  return (
    <motion.div
      className="show-prompt leave-prompt"
      data-testid="leave-prompt"
      role="alertdialog"
      aria-label="Levantar da mesa com uma mão em andamento"
      initial={instant ? false : { opacity: 0, scale: 0.86, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.24 } }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
    >
      <p className="show-prompt__lead">
        Você tem uma <strong>mão em andamento</strong>.
      </p>

      <p className="show-prompt__ask">
        Levantar agora <strong>corre a mão</strong>: o pote vai para {opponentName}.
      </p>

      {/* A CONTA, em três linhas — é ela que transforma a pergunta numa
          decisão. O que fica no meio, para quem vai, e com quanto se sai. */}
      <dl className="leave-prompt__ledger" data-testid="leave-ledger">
        <div className="leave-prompt__row">
          <dt>Já no meio</dt>
          <dd data-testid="leave-committed">{formatCredits(committed)}</dd>
        </div>
        <div className="leave-prompt__row">
          <dt>Pote para {opponentName}</dt>
          <dd data-testid="leave-pot">{formatCredits(pot)}</dd>
        </div>
        <div className="leave-prompt__row leave-prompt__row--total">
          <dt>Você sai com</dt>
          <dd data-testid="leave-stack">
            <Icon name="chip" size="0.9em" /> {formatCredits(stack)}
          </dd>
        </div>
      </dl>

      {/* CONTINUAR em cima e sob o polegar; a saída embaixo. É a ordem do
          resto da casa, e aqui ela pesa mais: a ação destrutiva não pode
          ficar no lugar em que o dedo já estava indo. */}
      <div className="show-prompt__actions">
        <Button size="md" fullWidth onClick={onCancel} data-testid="leave-cancel">
          <Icon name="check" /> CONTINUAR NA MÃO
        </Button>
        <Button
          variant="danger"
          size="md"
          fullWidth
          onClick={onConfirm}
          data-testid="leave-confirm"
        >
          <Icon name="close" /> CORRER E LEVANTAR
        </Button>
      </div>
    </motion.div>
  );
}
