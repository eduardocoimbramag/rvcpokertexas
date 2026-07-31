import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { NEGOTIATION_SECONDS } from '../animations/timings';
import { MIN_STAKE } from '../engine/credits';
import type { Match } from '../engine/types';
import type { NegotiationProposal } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { AmountStepper } from './AmountStepper';
import { AvatarBadge } from './AvatarBadge';
import { GoldAnnounce } from './GoldAnnounce';
import { HudPill } from './HudPill';
import { ChipStack } from './table/ChipStack';

export interface NegotiationPanelProps {
  match: Match;
}

/**
 * Situação do rival na mesa, na ordem de precedência em que ela é lida
 * — o rótulo curto da pílula de HUD e a cor do ponto saem daqui.
 */
const HUD_LABELS = {
  ready: 'Fechado',
  offer: 'Proposta',
  thinking: 'Decidindo',
  idle: 'Esperando',
} as const;

/**
 * A pílula do rival no ALTO da tela, ao lado do saldo — acima da
 * dealer, que fica livre em cena. Uma linha só: medalhão e nome à
 * esquerda, situação e ponto de presença à direita.
 *
 * Ela vive no HUD (o GameScreen a monta no cabeçalho) e não no feltro:
 * a mesa é do letreiro, das fichas e dos balões. O nome trunca; a
 * situação nunca quebra linha.
 */
export function NegotiationHud({ match }: NegotiationPanelProps) {
  const negotiation = useGameStore((state) => state.negotiation);
  if (!negotiation) return null;

  const { proposal, starting } = negotiation;
  const state =
    starting || proposal?.status === 'accepted'
      ? 'ready'
      : proposal?.status !== 'pending'
        ? 'idle'
        : proposal.from === 'opponent'
          ? 'offer'
          : 'thinking';

  return (
    <HudPill
      variant="rival"
      state={state}
      data-testid="nego-hud"
      aria-label={`${match.opponent.name}: ${HUD_LABELS[state]}`}
      leading={<AvatarBadge name={match.opponent.name} />}
      trailing={
        <>
          <span className="hud-pill__state">{HUD_LABELS[state]}</span>
          <span className="hud-pill__dot" aria-hidden="true" />
        </>
      }
    >
      {match.opponent.name}
    </HudPill>
  );
}

interface ProposalBubbleProps {
  proposal: NegotiationProposal;
  opponentName: string;
  instant: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * O balão de proposta — o mesmo vocabulário da nuvem de dobra da
 * partida, agora na mesa de negociação. Um lance SEU mostra o retrato
 * da decisão do rival (o ✓ e o ✗ pulsando enquanto ele pensa); um lance
 * DELE põe as duas respostas NA SUA MÃO, como botões. Respondido, a
 * escolhida acende, a outra apaga e o balão sai um beat depois (quem
 * segura e solta é o store).
 */
function ProposalBubble({
  proposal,
  opponentName,
  instant,
  onAccept,
  onDecline,
}: ProposalBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const own = proposal.from === 'player';
  const accepted = proposal.status === 'accepted';
  const answered = accepted || proposal.status === 'declined';

  /* Responder troca os botões pelo retrato da decisão no mesmo render:
     sem isto, o elemento focado morre e o foco de teclado cai no body.
     O balão (tabIndex -1) segura o foco durante o beat da resposta. */
  const answer = (action: () => void) => {
    action();
    bubbleRef.current?.focus();
  };

  const title = accepted
    ? 'PROPOSTA ACEITA'
    : proposal.status === 'declined'
      ? 'PROPOSTA RECUSADA'
      : own
        ? 'SUA PROPOSTA'
        : `PROPOSTA DE ${opponentName}`;

  const pickClass = (yes: boolean) =>
    answered ? (yes === accepted ? 'is-picked' : 'is-muted') : '';

  return (
    <motion.div
      ref={bubbleRef}
      tabIndex={-1}
      className={`prop-bubble ${own ? 'prop-bubble--player' : 'prop-bubble--opponent'}`}
      data-testid="nego-proposal"
      data-status={proposal.status}
      data-from={proposal.from}
      role="status"
      initial={instant ? false : { opacity: 0, y: -14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 24 }}
    >
      <p className="prop-bubble__title">{title}</p>
      <p className="prop-bubble__amount" data-testid="nego-proposal-amount">
        <Icon name="chip" size="0.9em" /> {formatCredits(proposal.amount)}
      </p>

      {own || answered ? (
        /* Retrato da decisão do outro lado — não são botões seus. */
        <div className="prop-bubble__answers" aria-hidden="true">
          <span className={`double-answer double-answer--yes ${pickClass(true)}`}>
            <Icon name="check" size={18} />
          </span>
          <span className={`double-answer double-answer--no ${pickClass(false)}`}>
            <Icon name="close" size={18} />
          </span>
        </div>
      ) : (
        /* O lance é do rival: o martelo está NA SUA mão. */
        <div className="prop-bubble__answers">
          <motion.button
            type="button"
            className="double-answer double-answer--yes prop-bubble__choice"
            onClick={() => answer(onAccept)}
            data-testid="nego-accept"
            aria-label={`Cobrir a proposta de ${formatCredits(proposal.amount)} créditos`}
            whileTap={instant ? undefined : { scale: 0.88 }}
          >
            <Icon name="check" size={18} strokeWidth={2.6} />
          </motion.button>
          <motion.button
            type="button"
            className="double-answer double-answer--no prop-bubble__choice"
            onClick={() => answer(onDecline)}
            data-testid="nego-decline"
            aria-label="Recusar a proposta"
            whileTap={instant ? undefined : { scale: 0.88 }}
          >
            <Icon name="close" size={18} strokeWidth={2.6} />
          </motion.button>
        </div>
      )}

      <p className="prop-bubble__hint">
        {own
          ? answered
            ? opponentName
            : `${opponentName} está decidindo…`
          : answered
            ? 'Você decidiu'
            : 'Cobrir ou recusar?'}
      </p>
    </motion.div>
  );
}

/**
 * O relógio da rodada de negociação: os 20 s da mesa. A barra esvazia
 * como o relógio da vez e, nos últimos segundos, vira brasa. Ele PAUSA
 * (e avisa) enquanto um lance seu espera a resposta do rival.
 */
function NegoClock({ seconds, paused }: { seconds: number; paused: boolean }) {
  const urgent = seconds <= 5 && !paused;
  return (
    <div
      className={`nego-clock ${urgent ? 'is-urgent' : ''} ${paused ? 'is-paused' : ''}`}
      data-testid="nego-clock"
      role="timer"
      aria-label={
        paused ? 'Relógio pausado, aguardando resposta' : `${seconds} segundos de negociação`
      }
    >
      <Icon name="timer" size={13} />
      <span className="nego-clock__track">
        <span
          className="nego-clock__fill"
          style={{ width: `${Math.max(0, Math.min(1, seconds / NEGOTIATION_SECONDS)) * 100}%` }}
        />
      </span>
      <span className="nego-clock__value">{seconds}s</span>
    </div>
  );
}

/**
 * Fase Negotiate: a rodada de negociação sobre o próprio feltro — sem
 * chat, sem vidro. O título "RODADA DE NEGOCIAÇÃO" carimba o centro da
 * mesa, cede o palco à pilha de fichas da aposta padrão (100) e o
 * relógio de 20 s corre. Cada lado pode empurrar um lance novo: o
 * composer (valor + atalhos +10/+100 + ENVIAR PROPOSTA) fica na base, e
 * cada proposta vira um balão com ✓/✗ — os do rival decidem o seu
 * lance; os seus decidem o dele. Fechado (por aceite ou pelo relógio),
 * "HORA DO DUELO" entra e a partida começa na estrutura de sempre.
 */
export function NegotiationPanel({ match }: NegotiationPanelProps) {
  const negotiation = useGameStore((state) => state.negotiation);
  const balance = useGameStore((state) => state.balance);
  const sendProposal = useGameStore((state) => state.sendProposal);
  const acceptProposal = useGameStore((state) => state.acceptProposal);
  const declineProposal = useGameStore((state) => state.declineProposal);
  const abandonNegotiation = useGameStore((state) => state.abandonNegotiation);
  const instant = useReducedMotion() ?? false;

  const [draft, setDraft] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  if (!negotiation) return null;

  // Quem manda no letreiro é o STORE: é o mesmo beat que segura o
  // relógio da rodada, então a contagem nunca começa por baixo do
  // título (e o balão nunca abre sobre um feltro sem fichas).
  const { tableStake, announcing, secondsLeft, proposal, starting } = negotiation;

  const amount = draft === '' ? null : Number.parseInt(draft, 10);
  const overBalance = amount !== null && amount > balance;
  const belowMin = amount !== null && amount < MIN_STAKE;
  const validAmount = amount !== null && !overBalance && !belowMin;
  /** Um lance seu no ar: o martelo está com o rival. */
  const waitingReply = proposal?.status === 'pending' && proposal.from === 'player';
  /** Lance coberto = mesa selada: o aperto de mãos vale desde o ✓. */
  const sealed = proposal?.status === 'accepted';
  const canSend = validAmount && !starting && !waitingReply && !sealed;

  const hint = overBalance
    ? `Saldo insuficiente: você tem ${formatCredits(balance)} créditos.`
    : belowMin
      ? `O lance mínimo é ${MIN_STAKE} créditos.`
      : null;

  const submit = () => {
    if (!canSend || amount === null) return;
    sendProposal(amount);
    setDraft('');
    // O botão de enviar desabilita no mesmo tick — o foco volta ao
    // campo em vez de cair no body.
    amountRef.current?.focus();
  };

  return (
    <div className="nego-stage flex min-h-0 flex-1 flex-col" data-testid="negotiation-panel">
      {/* O centro do feltro: o título carimba, as fichas assumem e os
          balões de proposta entram por cima — tudo absoluto ou centrado,
          sem empurrar o layout. */}
      <div className="nego-felt relative flex min-h-0 flex-1 flex-col items-center justify-center">
        {/* Viés de centragem: leva as fichas ao eixo do brasão (e cede
            primeiro quando a tela é baixa) — ver .nego-felt__bias. */}
        <span className="nego-felt__bias" aria-hidden="true" />

        <AnimatePresence mode="wait">
          {starting ? (
            <GoldAnnounce key="duel" text="Hora do duelo" data-testid="nego-duel-announce" />
          ) : announcing ? (
            <GoldAnnounce key="open" text="Rodada de negociação" data-testid="nego-open-announce" />
          ) : null}
        </AnimatePresence>

        {/* key={tableStake}: cada valor novo re-monta a pilha — as
            fichas do acordo deslizam ao centro de novo.
            Nos dois ANÚNCIOS o feltro fica só com o letreiro: as fichas e
            a placa saem de cena para o título não dividir o palco com
            nada (nem com uma versão apagada delas). */}
        {/* `key={tableStake}`: a cada valor novo o pote inteiro volta a
            entrar — é o gesto de "fichas sendo postas na mesa" que a fase
            pede. No duelo é o contrário (ver HandsArena): lá as fichas
            que já estão na mesa ficam paradas e só as novas chegam. */}
        {!announcing && !starting && (
          <ChipStack
            key={tableStake}
            stake={tableStake}
            variant="nego"
            instant={instant}
            plate
            data-testid="nego-table"
            valueTestId="nego-table-stake"
          />
        )}

        <AnimatePresence>
          {proposal?.open && !starting && (
            <ProposalBubble
              key={proposal.id}
              proposal={proposal}
              opponentName={match.opponent.name}
              instant={instant}
              onAccept={acceptProposal}
              onDecline={declineProposal}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Composer + saída na faixa de segurança dos CTAs
          (docs/margemdeseguranca.md). O SLOT tem altura reservada em toda
          a fase — mesmo idioma da barra de ações da mesa 1v1
          (.arena-actions): o composer entra e sai sem que o feltro cresça
          ou encolha, então o letreiro de abertura e o da HORA DO DUELO
          caem exatamente no mesmo lugar. */}
      <div className="nego-actions">
        <AnimatePresence>
          {!starting && (
            <motion.div
              className="mx-auto flex w-[min(100%,80vw)] max-w-96 flex-col gap-2 pb-4 pt-3"
              initial={instant ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                instant ? { opacity: 0 } : { opacity: 0, y: 18, transition: { duration: 0.25 } }
              }
              transition={
                instant ? { duration: 0 } : { delay: 0.2, duration: 0.35, ease: 'easeOut' }
              }
            >
              <NegoClock seconds={secondsLeft} paused={waitingReply || sealed} />

              <form
                className="flex flex-col gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <AmountStepper
                  value={draft}
                  onChange={setDraft}
                  label="Valor da proposta em créditos"
                  placeholder={`Mín. ${MIN_STAKE}`}
                  max={balance}
                  disabled={starting || sealed}
                  data-testid="nego-input"
                  stepTestIdPrefix="nego-plus"
                  inputRef={amountRef}
                  describedBy={hint ? 'nego-hint' : undefined}
                  invalid={overBalance || belowMin}
                />
                <Button
                  type="submit"
                  size="md"
                  fullWidth
                  disabled={!canSend}
                  data-testid="nego-send"
                >
                  {sealed ? (
                    <>
                      <Icon name="check" /> ACORDO FECHADO
                    </>
                  ) : waitingReply ? (
                    <>
                      <Icon name="timer" /> AGUARDANDO RESPOSTA…
                    </>
                  ) : (
                    <>
                      <Icon name="send" /> ENVIAR PROPOSTA
                    </>
                  )}
                </Button>
              </form>

              {/* role="status": o motivo do bloqueio é ANUNCIADO quando
                entra — sem ele o leitor de tela só ouviria o enviar
                esmaecido, sem explicação. */}
              {hint && (
                <p className="nego-hint" id="nego-hint" role="status" data-testid="nego-hint">
                  {hint}
                </p>
              )}

              <Button
                variant="secondary"
                onClick={abandonNegotiation}
                size="md"
                fullWidth
                disabled={sealed}
                data-testid="nego-quit"
              >
                SAIR DA MESA
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
