import { motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { AmountStepper } from '../../components/AmountStepper';
import { LeaveButton, TurnClock } from '../../components/poker/TurnClock';
import type { PokerAction } from '../../engine/poker/types';

export interface CashActionsProps {
  /** O que a mesa permite agora. Vazio quando não é a sua vez. */
  legal: readonly PokerAction[];
  /** Quanto falta pagar para seguir na mão. */
  toCall: number;
  /** A faixa legal de um aumento; `null` quando não há aumento a fazer. */
  raise: { min: number; max: number; allInOnly: boolean } | null;
  /** O que você já pôs nesta rua — a base do "aumentar mais". */
  committed: number;
  /** Segundos restantes da sua vez — o relógio mora nesta barra. */
  seconds: number;
  /** A saída da mesa já abriu (a partir da 2ª mão). */
  canLeave: boolean;
  onLeave: () => void;
  onAct: (action: PokerAction, raiseTo?: number) => void;
  instant: boolean;
}

/**
 * A BARRA DE LANCES DA MESA DE SEIS.
 *
 * Ela é a mesma peça da barra do duelo — mesmo relógio (`TurnClock`),
 * mesma saída (`LeaveButton`), mesma ordem de fileira —, com uma
 * diferença que só a mesa de anel obriga:
 *
 * - **o ALL-IN CURTO tem nome.** Quando o stack não cobre o aumento
 *   mínimo, o único aumento possível é ir com tudo, e a faixa vira um
 *   ponto só. O painel de digitar não faz sentido ali — ele ofereceria
 *   escolher entre um valor e ele mesmo —, então o botão diz ALL-IN e
 *   faz o lance direto.
 *
 * O que a barra NUNCA faz é oferecer um lance ilegal: quem diz o que
 * pode ser feito é a engine, e cada botão só existe se o lance dele
 * estiver na lista.
 *
 * A ORDEM DA FILEIRA é fixa — APOSTAR · PASSAR/PAGAR · CORRER —, e os
 * lugares que não cabem na rua ficam VAZIOS em vez de encolher a
 * fileira. Botão que muda de lugar conforme o que é legal obriga a LER a
 * barra a cada vez; com o lugar fixo, o polegar aprende o caminho.
 */
export function CashActions({
  legal,
  toCall,
  raise,
  committed,
  seconds,
  canLeave,
  onLeave,
  onAct,
  instant,
}: CashActionsProps) {
  const [raising, setRaising] = useState(false);
  /* O valor é uma STRING: o campo precisa poder ficar vazio enquanto a
     pessoa apaga para redigitar. */
  const [draft, setDraft] = useState('');

  const canRaise = legal.includes('raise') && raise !== null;
  const allInOnly = raise?.allInOnly ?? false;

  /* O QUE SE DIGITA É O ACRÉSCIMO, não o total.
     A engine fala em TOTAIS ("aumentar para 260"), que é a conta certa
     para all-in e para fechar o pote — mas não é a conta que quem joga
     faz. Na mesa se diz "aposto 20", e 20 é o que os outros têm de
     cobrir. A tradução mora aqui, e só aqui. */
  const onTable = committed + toCall;
  const minBy = (raise?.min ?? 0) - onTable;
  const maxBy = (raise?.max ?? 0) - onTable;

  const amount = Number.parseInt(draft, 10) || 0;
  const belowMin = draft !== '' && amount < minBy;
  const overMax = amount > maxBy;
  const valid = draft !== '' && !belowMin && !overMax;
  const allIn = valid && amount >= maxBy;

  const hint = belowMin
    ? `Aumento mínimo: ${formatCredits(minBy)}`
    : overMax
      ? `Você tem ${formatCredits(maxBy)}`
      : null;

  if (raising && raise) {
    return (
      <div className="bet-controls" data-testid="cash-actions">
        <motion.form
          className="raise-panel"
          data-testid="cash-raise-panel"
          initial={instant ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            setRaising(false);
            setDraft('');
            // A tradução acontece aqui: acréscimo → total.
            onAct('raise', onTable + amount);
          }}
        >
          <TurnClock seconds={seconds} compact />

          <div className="raise-panel__head">
            <span className="raise-panel__label">
              {allIn ? 'ALL-IN' : toCall > 0 ? 'AUMENTAR MAIS' : 'APOSTAR'}
            </span>
            {/* Os limites da rua ficam em cena o tempo todo — são eles que
                explicam por que um valor seria recusado, e explicar
                DEPOIS do erro é tarde. role="status" porque o motivo é
                anunciado, não só pintado de vermelho. */}
            <span
              className={`raise-panel__range ${hint ? 'is-invalid' : ''}`}
              id="cash-raise-hint"
              role="status"
              data-testid="cash-raise-hint"
            >
              {hint ?? `${formatCredits(minBy)} – ${formatCredits(maxBy)}`}
            </span>
          </div>

          <AmountStepper
            value={draft}
            onChange={setDraft}
            label="Quanto apostar a mais, em créditos"
            placeholder={`Mín. ${minBy}`}
            max={maxBy}
            data-testid="cash-raise-input"
            stepTestIdPrefix="cash-raise-plus"
            describedBy={hint ? 'cash-raise-hint' : undefined}
            invalid={belowMin || overMax}
          />

          <Button type="submit" size="md" fullWidth disabled={!valid} data-testid="cash-raise-go">
            {/* O PREÇO do lance, e não só o acréscimo: com aposta na
                frente, apostar mais 50 custa o pagamento mais os 50. */}
            <Icon name="chip" />{' '}
            {!valid
              ? 'APOSTAR'
              : toCall > 0
                ? `PAGAR ${formatCredits(toCall)} + ${formatCredits(amount)}`
                : `APOSTAR ${formatCredits(amount)}`}
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => setRaising(false)}
            data-testid="cash-raise-cancel"
          >
            VOLTAR
          </Button>
        </motion.form>
      </div>
    );
  }

  return (
    <div className="bet-controls" data-testid="cash-actions">
      <motion.div
        className="bet-stack"
        initial={instant ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={instant ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
      >
        <TurnClock seconds={seconds} />

        <div className="bet-row">
          {canRaise ? (
            <Button
              size="md"
              fullWidth
              onClick={() => {
                /* Sem faixa a escolher, o painel de digitar ofereceria
                   escolher entre um valor e ele mesmo. O botão faz o
                   lance direto e diz o que ele é. */
                if (allInOnly) {
                  onAct('raise', raise.max);
                  return;
                }
                setDraft('');
                setRaising(true);
              }}
              data-testid="cash-raise"
            >
              <Icon name="chip" /> {allInOnly ? 'ALL-IN' : toCall > 0 ? 'AUMENTAR' : 'APOSTAR'}
            </Button>
          ) : (
            <span className="bet-row__gap" aria-hidden="true" />
          )}

          {legal.includes('call') ? (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => onAct('call')}
              data-testid="cash-pay"
            >
              <Icon name="check" /> {formatCredits(toCall)}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => onAct('check')}
              disabled={!legal.includes('check')}
              data-testid="cash-check"
            >
              <Icon name="check" /> PASSAR
            </Button>
          )}

          <Button
            variant="danger"
            size="md"
            fullWidth
            onClick={() => onAct('fold')}
            disabled={!legal.includes('fold')}
            data-testid="cash-fold"
          >
            <Icon name="close" /> CORRER
          </Button>

          <LeaveButton
            enabled={canLeave}
            onLeave={onLeave}
            disabled={false}
            hint="Disponível a partir da 2ª mão"
          />
        </div>
      </motion.div>
    </div>
  );
}
