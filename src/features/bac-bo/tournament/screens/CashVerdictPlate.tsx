import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits, formatDelta } from '@/shared/lib/format';

import { Card3D } from '../../components/Card3D';
import type { CashShowPrompt, CashVerdict } from '../tournamentStore';

/**
 * O DESFECHO DA MÃO na mesa de seis — uma placa só, com quem levou, com
 * o quê, e o que ela fez com o SEU stack.
 *
 * É a mesma peça de espírito da placa do duelo (ver WinnerPlate), e
 * diferente onde a mesa de seis obriga: no duelo há um vencedor e um
 * perdedor, e a placa pinta o vencedor. Aqui pode haver DOIS vencedores
 * na mesma mão — um leva o pote principal e outro o lateral — e a placa
 * precisa saber dizer isso sem virar uma tabela.
 *
 * A COR É DA SUA SORTE, não da do vencedor. Numa mesa de seis, saber que
 * "a Zara levou" é notícia de terceiro; o que se procura na tela é se
 * SOBROU ou FALTOU ficha na sua frente. Por isso o balanço vem grande e
 * em cima, e o nome de quem levou vem embaixo, em texto.
 *
 * AS CARTAS QUE DECIDIRAM ficam deitadas ao lado, e é o que responde
 * "por quê": uma quadra de setes ou um flush de espadas deixam de ser um
 * nome e viram a mão que qualquer um reconhece de relance. Sem showdown
 * não há o que mostrar — ninguém pagou para ver.
 */

export interface CashVerdictPlateProps {
  verdict: CashVerdict;
  /** O convite para abrir a mão que ninguém pagou para ver. */
  show: CashShowPrompt;
  /** Você já abriu a mão desta rodada. */
  shown: boolean;
  onAnswerShow: (show: boolean) => void;
  instant: boolean;
}

export function CashVerdictPlate({
  verdict,
  show,
  shown,
  onAnswerShow,
  instant,
}: CashVerdictPlateProps) {
  const { winners, label, highlight, showdown, netChange } = verdict;
  const ganhou = netChange > 0;
  const tom = ganhou ? 'win' : netChange < 0 ? 'lose' : 'tie';
  const nomes = winners.map((w) => w.name).join(' e ');

  return (
    <motion.div
      className={`cash-verdict cash-verdict--${tom}`}
      role="status"
      data-testid="cash-verdict"
      initial={instant ? false : { opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="cash-verdict__head">
        {/* O BALANÇO primeiro, e grande: é a única linha que fala de
            você. O resto da placa fala da mesa. */}
        <span className="cash-verdict__delta" data-testid="cash-verdict-delta">
          <Icon name="chip" size="0.85em" /> {formatDelta(netChange)}
        </span>
        <span className="cash-verdict__who" data-testid="cash-verdict-who">
          {winners.length > 1 ? `${nomes} dividiram` : `${nomes} levou`}
          {label ? ` com ${label}` : ''}
        </span>
      </div>

      {/* AS CARTAS QUE DECIDIRAM. Só com showdown: sem ele ninguém pagou
          para ver, e a mesa não conta o que não foi comprado. */}
      {showdown && highlight.length > 0 && (
        <div className="cash-verdict__cards" data-testid="cash-verdict-cards">
          {highlight.map((card, index) => (
            <span
              key={`${card.rank}${card.suit}`}
              style={{ '--card-size': 'var(--verdict-card-w)' } as CSSProperties}
            >
              <Card3D
                card={card}
                size="var(--verdict-card-w)"
                dealDelayMs={instant ? 0 : index * 70}
                silent
                label={`Carta ${index + 1} da mão vencedora`}
              />
            </span>
          ))}
        </div>
      )}

      {winners.length > 1 && (
        <ul className="cash-verdict__split" data-testid="cash-verdict-split">
          {winners.map((w) => (
            <li key={w.seat}>
              {w.name} <strong>{formatCredits(w.won)}</strong>
            </li>
          ))}
        </ul>
      )}

      {/* O CONVITE PARA ABRIR A MÃO que ninguém pagou para ver.
          Ele mora DENTRO da placa, e não num balão à parte: é a mesma
          notícia — a mão acabou — e dividir em duas peças faria a
          segunda cobrir a primeira nos cinco segundos em que as duas
          precisam ser lidas. */}
      {show.open && (
        <div className="cash-verdict__show" data-testid="cash-show-prompt">
          <p className="cash-verdict__ask">
            Ninguém pagou para ver. <strong>Mostrar sua mão?</strong>
            <span className="cash-verdict__timer"> {show.seconds}s</span>
          </p>
          <div className="cash-verdict__answers">
            <Button
              size="md"
              fullWidth
              onClick={() => onAnswerShow(true)}
              data-testid="cash-show-yes"
            >
              <Icon name="check" /> MOSTRAR
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => onAnswerShow(false)}
              data-testid="cash-show-no"
            >
              GUARDAR
            </Button>
          </div>
        </div>
      )}

      {shown && !show.open && (
        <p className="cash-verdict__shownflag" data-testid="cash-shown">
          Você mostrou a mão.
        </p>
      )}
    </motion.div>
  );
}
