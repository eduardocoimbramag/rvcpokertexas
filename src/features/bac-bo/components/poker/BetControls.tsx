import { motion } from 'framer-motion';
import { useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import type { PokerRoundState } from '../../engine/poker/types';
import { ACTION_SECONDS } from '../../store/gameStore';
import { AmountStepper } from '../AmountStepper';

export interface BetControlsProps {
  round: PokerRoundState;
  /** Segundos restantes da sua vez — o relógio mora nesta barra. */
  seconds: number;
  /** Um lance do jogador está em trânsito na engine — trava a barra. */
  pending: boolean;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (to: number) => void;
  /**
   * LEVANTAR DA MESA já está liberado — a partir da segunda mão. Na
   * primeira o botão fica em cena e apagado: quem senta descobre a saída
   * antes de precisar dela, e descobre também que ela ainda não abriu.
   */
  canLeave: boolean;
  onLeave: () => void;
  instant: boolean;
}

/**
 * A BARRA DE APOSTAS — o único lugar da mesa em que o jogador decide
 * alguma coisa.
 *
 * Ela tem dois estados, e nunca os dois ao mesmo tempo:
 *
 * 1. A FILEIRA DE LANCES: desistir, passar/pagar, aumentar. Os rótulos
 *    dizem o VALOR junto com o verbo ("PAGAR 40") porque, no poker, a
 *    ação e o preço dela são a mesma decisão — um botão "PAGAR" sozinho
 *    obrigaria a procurar o número em outro canto da tela antes de tocar.
 *
 * 2. O PAINEL DE AUMENTO, que cobre a fileira: o valor digitado e a
 *    confirmação. Cobre em vez de somar porque a tela é de 360px e as
 *    duas coisas juntas espremeriam a mesa — e porque, com o painel
 *    aberto, a única decisão que resta é quanto.
 *
 * O VALOR SE DIGITA, no campo com +10/+100 que é o padrão de valor em
 * créditos da casa (`AmountStepper`), e é SÓ ele. O painel já teve
 * atalhos de ½ pote, ¾ pote, pote e all-in ao lado: quatro botões que
 * calculavam por quem joga, num painel onde a única pergunta é "quanto?"
 * e a resposta já estava a um toque de distância no próprio campo. O
 * all-in não se perdeu com eles — digitar o teto continua sendo ir com
 * tudo, e o teto está escrito ali em cima.
 *
 * O que a barra NUNCA faz é oferecer um lance ilegal: quem diz o que
 * pode ser feito é a engine (`legalActions`), e cada botão só existe se
 * o lance dele estiver lá.
 */
export function BetControls({
  round,
  seconds,
  pending,
  onFold,
  onCheck,
  onCall,
  onRaise,
  canLeave,
  onLeave,
  instant,
}: BetControlsProps) {
  const { legalActions, toCall, minRaiseTo, maxRaiseTo } = round;
  const canRaise = legalActions.includes('raise');

  /* O QUE SE DIGITA É O ACRÉSCIMO, não o total.
     A engine fala em TOTAIS ("aumentar para 260"), que é a conta certa
     para all-in e para fechar o pote — mas não é a conta que quem joga
     faz. Na mesa se diz "aposto 20", e 20 é o que o rival tem de cobrir
     para seguir. Pedir o total obrigava a somar a entrada já paga antes
     de digitar, e um erro nessa soma vira um lance que a mesa recusa.
     A tradução mora aqui, e só aqui: o painel pergunta em acréscimo e
     entrega em total. */
  const onTable = Math.max(round.committed.player, round.committed.opponent);
  const minBy = minRaiseTo - onTable;
  const maxBy = maxRaiseTo - onTable;

  /* O painel de aumento não precisa ser fechado quando a vez passa: a
     barra inteira só existe enquanto a palavra é sua (ver PokerArena), e
     desmontar leva o estado junto. Uma decisão pela metade não sobrevive
     ao lance do rival — os limites que ela usava já são outros. */
  const [raising, setRaising] = useState(false);
  /* O valor é uma STRING, como na mesa de negociação: o campo precisa
     poder ficar vazio enquanto a pessoa apaga para redigitar. */
  const [draft, setDraft] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const amount = Number.parseInt(draft, 10) || 0;
  const belowMin = draft !== '' && amount < minBy;
  const overMax = amount > maxBy;
  const valid = draft !== '' && !belowMin && !overMax;
  const allIn = valid && amount >= maxBy;

  /* O campo abre VAZIO. Ele já abria com um valor sugerido pela mesa, e
     o problema não era o número em si: um campo preenchido antes de a
     pessoa digitar responde à pergunta no lugar dela, e quem só queria
     ver os limites saía tendo apostado o que a casa escolheu. Os limites
     da rua estão escritos em cima do campo — a resposta é de quem joga. */
  const openRaise = (): void => {
    setDraft('');
    setRaising(true);
  };

  const confirmRaise = (): void => {
    if (!valid || pending) return;
    setRaising(false);
    // Aqui a tradução acontece: acréscimo → total, que é a língua da engine.
    onRaise(onTable + amount);
  };

  const hint = belowMin
    ? `Aposta mínima: ${formatCredits(minBy)}`
    : overMax
      ? `Máximo nesta mesa: ${formatCredits(maxBy)}`
      : null;

  return (
    <div className="bet-controls" data-testid="bet-controls">
      {/* Sem AnimatePresence: o painel TROCA a fileira, e a troca tem de
          ser instantânea. Com uma saída animada no meio, o toque em
          AUMENTAR ficaria 200 ms sem resposta — que num celular se lê
          como botão que não funcionou. Cada bloco entra com o próprio
          fade e pronto. */}
      {raising ? (
        <motion.form
          className="raise-panel"
          data-testid="raise-panel"
          initial={instant ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          onSubmit={(event) => {
            event.preventDefault();
            confirmRaise();
          }}
        >
          {/* Os limites da rua ficam em cena o tempo todo — são eles que
              explicam por que um valor seria recusado, e explicar DEPOIS
              do erro é tarde. Quando o valor sai da faixa, o MOTIVO ocupa
              o lugar deles: é a mesma informação, dita de outro jeito, e
              dividir as duas em duas linhas custava uma altura que a
              barra de ações não tem num aparelho de 640px.

              role="status": o motivo é ANUNCIADO, não só pintado de
              vermelho — quem usa leitor de tela também precisa saber por
              que o botão parou de responder. */}
          <ActionClock seconds={seconds} compact />

          <div className="raise-panel__head">
            {/* "AUMENTAR MAIS", e não "aumentar para": o número embaixo é
                o que se PÕE, que é como se fala numa mesa. */}
            <span className="raise-panel__label">
              {allIn ? 'ALL-IN' : toCall > 0 ? 'AUMENTAR MAIS' : 'APOSTAR'}
            </span>
            <span
              className={`raise-panel__range ${hint ? 'is-invalid' : ''}`}
              id="raise-hint"
              role="status"
              data-testid="raise-hint"
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
            disabled={pending}
            data-testid="raise-input"
            stepTestIdPrefix="raise-plus"
            inputRef={amountRef}
            describedBy={hint ? 'raise-hint' : undefined}
            invalid={belowMin || overMax}
          />

          {/* Enviar em cima, sair embaixo: a mesma ordem do resto da casa
              — a ação que se quer fazer fica sob o polegar, e a saída
              fica onde não se toca por engano. */}
          <Button
            type="submit"
            size="md"
            fullWidth
            disabled={pending || !valid}
            data-testid="raise-confirm"
          >
            {/* O PREÇO do lance, e não só o acréscimo: com aposta na
                frente, apostar mais 50 custa o pagamento mais os 50, e
                mostrar só o acréscimo esconderia metade da conta. */}
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
            data-testid="raise-cancel"
          >
            VOLTAR
          </Button>
        </motion.form>
      ) : (
        <motion.div
          className="bet-stack"
          initial={instant ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={instant ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
        >
          <ActionClock seconds={seconds} />

          {/* A ORDEM DA FILEIRA é fixa e vale para a mesa inteira:
              APOSTAR · PASSAR/PAGAR · CORRER · LEVANTAR.

              Ela vai do que mais se faz para o que menos se faz, e da
              decisão de jogo para a decisão de sair. Botão que muda de
              lugar conforme o que é legal obriga a LER a barra a cada
              vez; com o lugar fixo, o polegar aprende o caminho e a
              decisão fica só no valor. Por isso os lugares que não cabem
              na rua ficam VAZIOS em vez de encolher a fileira. */}
          <div className="bet-row">
            {canRaise ? (
              <Button
                size="md"
                fullWidth
                onClick={openRaise}
                disabled={pending}
                data-testid="action-raise"
              >
                <Icon name="chip" /> {toCall > 0 ? 'AUMENTAR' : 'APOSTAR'}
              </Button>
            ) : (
              <span className="bet-row__gap" aria-hidden="true" />
            )}

            {legalActions.includes('call') ? (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={onCall}
                disabled={pending}
                data-testid="action-call"
              >
                <Icon name="check" /> {formatCredits(toCall)}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={onCheck}
                disabled={pending || !legalActions.includes('check')}
                data-testid="action-check"
              >
                <Icon name="check" /> PASSAR
              </Button>
            )}

            {/* CORRER está sempre na mesa, e passou a estar quando o duelo
                virou SESSÃO: a entrada desta mão já está no meio, e
                largá-la é abrir mão de 100 fichas para guardar as outras.
                Numa mesa de mão única a decisão não existia — sem aposta
                na frente, desistir não custava nada e só atrasava. */}
            <Button
              variant="danger"
              size="md"
              fullWidth
              onClick={onFold}
              disabled={pending || !legalActions.includes('fold')}
              data-testid="action-fold"
            >
              <Icon name="close" /> CORRER
            </Button>

            <LeaveButton
              enabled={canLeave}
              onLeave={onLeave}
              disabled={pending}
              hint="Disponível a partir da 2ª mão"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * LEVANTAR DA MESA — a porta da sessão, no canto mais à direita da
 * fileira.
 *
 * Ela fica SEMPRE em cena, e na primeira mão fica apagada. Esconder um
 * botão que vai aparecer sozinho daqui a uma mão faria a fileira mudar de
 * forma no meio do jogo; apagado, ele ensina duas coisas de uma vez —
 * que a saída existe e que ela ainda não abriu. A primeira mão é o
 * compromisso de quem sentou: comprar fichas e sair antes de ela fechar
 * não é jogar, é olhar as cartas.
 *
 * NO MEIO DE UMA MÃO, levantar CORRE a mão junto. É o que uma sala faz
 * com quem se levanta: a mão é dada por perdida, não desfeita — as
 * fichas que já estão no meio ficaram no meio. O rótulo não esconde
 * isso, e o `title` diz por extenso.
 */
function LeaveButton({
  enabled,
  onLeave,
  disabled,
  hint,
}: {
  enabled: boolean;
  onLeave: () => void;
  disabled: boolean;
  hint: string;
}) {
  return (
    <Button
      variant="ghost"
      size="md"
      fullWidth
      className="bet-row__leave"
      onClick={onLeave}
      disabled={disabled || !enabled}
      title={enabled ? 'Correr a mão e levantar da mesa' : hint}
      data-testid="leave-table"
    >
      <Icon name="close" /> LEVANTAR
    </Button>
  );
}

/**
 * O RELÓGIO DA VEZ — os 20 s que você tem para decidir.
 *
 * Ele mora na barra de apostas, e não na mesa, porque é da DECISÃO que
 * ele fala: some junto com os botões quando a palavra passa para o
 * rival, e acompanha o painel de aumento para dentro quando ele abre —
 * escolher quanto apostar é justamente o momento em que o tempo pesa, e
 * seria o pior momento para esconder o relógio.
 *
 * Nos últimos segundos tudo vira brasa: é o aviso de que a mesa vai
 * jogar por você (passa se for de graça, desiste se houver aposta na
 * frente).
 */
function ActionClock({ seconds, compact = false }: { seconds: number; compact?: boolean }) {
  const urgent = seconds <= 5;
  return (
    <div
      className={`turn-clock ${compact ? 'turn-clock--compact' : ''} ${urgent ? 'is-urgent' : ''}`}
      data-testid="turn-clock"
      role="timer"
      aria-label={`${seconds} segundos para decidir`}
    >
      <span className="turn-clock__track">
        <span
          className="turn-clock__fill"
          style={{ width: `${Math.max(0, Math.min(1, seconds / ACTION_SECONDS)) * 100}%` }}
        />
      </span>
      <span className="turn-clock__value">{seconds}s</span>
    </div>
  );
}
