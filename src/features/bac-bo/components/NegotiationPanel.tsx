import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

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

export interface NegotiationPanelProps {
  match: Match;
}

/** Quanto o título "RODADA DE NEGOCIAÇÃO" segura o centro do feltro
 *  antes de ceder o palco às fichas da aposta padrão. */
const ANNOUNCE_MS = 2600;

/** Altura de um degrau da pilha de fichas, em px. */
const CHIP_STEP_PX = 7;

/**
 * A pilha de fichas no centro do feltro: o retrato físico do valor que
 * a mesa vale agora. As fichas DESLIZAM do lado do jogador ao centro em
 * mola, uma a uma — e a pilha inteira volta a entrar a cada mudança de
 * valor (o componente é re-montado por `key={stake}` no pai), que é o
 * gesto de "fichas sendo postas na mesa" pedido pela fase.
 *
 * Rotações e derivas são DETERMINÍSTICAS (derivadas do índice): a
 * bagunça natural de uma pilha real, sem Math.random — os testes e o
 * reduced motion veem sempre a mesma mesa.
 */
function ChipStack({ stake, instant }: { stake: number; instant: boolean }) {
  const chips = useMemo(() => {
    const count = Math.min(9, Math.max(3, 2 + Math.round(stake / 50)));
    return Array.from({ length: count }, (_, index) => ({
      rotate: ((index * 47) % 25) - 12,
      drift: ((index * 31) % 11) - 5,
      gold: index % 3 === 2,
    }));
  }, [stake]);

  return (
    <div
      className="chip-stack"
      data-testid="nego-table"
      aria-label={`Aposta na mesa: ${stake} créditos`}
    >
      <div className="chip-stack__pile" aria-hidden="true">
        {chips.map((chip, index) => (
          <motion.span
            key={index}
            className={`chip ${chip.gold ? 'chip--gold' : ''}`}
            style={{ zIndex: index }}
            initial={
              instant
                ? false
                : { opacity: 0, y: 120, x: chip.drift * 7, rotate: chip.rotate * 3, scale: 0.6 }
            }
            animate={{ opacity: 1, y: -index * CHIP_STEP_PX, x: 0, rotate: chip.rotate, scale: 1 }}
            transition={
              instant
                ? { duration: 0 }
                : { delay: index * 0.07, type: 'spring', stiffness: 320, damping: 23 }
            }
          />
        ))}
      </div>
      <div className="chip-stack__plate">
        <motion.span
          className="chip-stack__value"
          data-testid="nego-table-stake"
          initial={instant ? false : { scale: 1.35, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            instant
              ? { duration: 0 }
              : { type: 'spring', stiffness: 300, damping: 20, delay: 0.15 }
          }
        >
          <Icon name="chip" size="1em" /> {formatCredits(stake)}
        </motion.span>
        <span className="chip-stack__label">na mesa</span>
      </div>
    </div>
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
  const own = proposal.from === 'player';
  const accepted = proposal.status === 'accepted';
  const answered = accepted || proposal.status === 'declined';

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
      className={`prop-bubble ${own ? 'prop-bubble--player' : 'prop-bubble--opponent'}`}
      data-testid="nego-proposal"
      data-status={proposal.status}
      data-from={proposal.from}
      role="status"
      initial={instant ? false : { opacity: 0, y: -14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
      transition={
        instant ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 24 }
      }
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
            onClick={onAccept}
            data-testid="nego-accept"
            aria-label={`Cobrir a proposta de ${proposal.amount} créditos`}
            whileTap={instant ? undefined : { scale: 0.88 }}
          >
            <Icon name="check" size={18} strokeWidth={2.6} />
          </motion.button>
          <motion.button
            type="button"
            className="double-answer double-answer--no prop-bubble__choice"
            onClick={onDecline}
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
  const [announcing, setAnnouncing] = useState(true);

  // O título abre a rodada e cede o centro às fichas.
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncing(false), instant ? 1200 : ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [instant]);

  if (!negotiation) return null;

  const { tableStake, secondsLeft, proposal, starting } = negotiation;

  const amount = draft === '' ? null : Number.parseInt(draft, 10);
  const overBalance = amount !== null && amount > balance;
  const belowMin = amount !== null && amount < MIN_STAKE;
  const validAmount = amount !== null && !overBalance && !belowMin;
  /** Um lance seu no ar: o martelo está com o rival. */
  const waitingReply = proposal?.status === 'pending' && proposal.from === 'player';
  const canSend = validAmount && !starting && !waitingReply;

  const hint = overBalance
    ? `Saldo insuficiente: você tem ${formatCredits(balance)} créditos.`
    : belowMin
      ? `O lance mínimo é ${MIN_STAKE} créditos.`
      : null;

  const status = starting
    ? 'duelo fechado'
    : waitingReply
      ? 'pensando…'
      : proposal?.status === 'pending'
        ? 'esperando você'
        : 'na mesa';

  const submit = () => {
    if (!canSend || amount === null) return;
    sendProposal(amount);
    setDraft('');
  };

  return (
    <div className="nego-stage flex min-h-0 flex-1 flex-col" data-testid="negotiation-panel">
      {/* O rival na cabeceira: identidade + situação da mesa. */}
      <header className="nego-head" aria-label={`Mesa de negociação com ${match.opponent.name}`}>
        <AvatarBadge name={match.opponent.name} className="text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-ivory">{match.opponent.name}</p>
          <p className="nego-head__status">{status}</p>
        </div>
        <span
          className={`nego-head__presence ${starting ? 'nego-head__presence--ready' : ''}`}
          aria-hidden="true"
        />
      </header>

      {/* O centro do feltro: o título carimba, as fichas assumem e os
          balões de proposta entram por cima — tudo absoluto ou centrado,
          sem empurrar o layout. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {starting ? (
            <GoldAnnounce key="duel" text="Hora do duelo" data-testid="nego-duel-announce" />
          ) : announcing ? (
            <GoldAnnounce
              key="open"
              text="Rodada de negociação"
              data-testid="nego-open-announce"
            />
          ) : null}
        </AnimatePresence>

        {/* key={tableStake}: cada valor novo re-monta a pilha — as
            fichas do acordo deslizam ao centro de novo. */}
        {!announcing && <ChipStack key={tableStake} stake={tableStake} instant={instant} />}

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
          (docs/margemdeseguranca.md); some inteiro na HORA DO DUELO. */}
      <AnimatePresence>
        {!starting && (
          <motion.div
            className="mx-auto flex w-[min(100%,80vw)] max-w-96 flex-col gap-2 pb-4 pt-3"
            initial={instant ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={instant ? { opacity: 0 } : { opacity: 0, y: 18, transition: { duration: 0.25 } }}
            transition={instant ? { duration: 0 } : { delay: 0.2, duration: 0.35, ease: 'easeOut' }}
          >
            <NegoClock seconds={secondsLeft} paused={waitingReply} />

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
                disabled={starting}
                data-testid="nego-input"
                stepTestIdPrefix="nego-plus"
              />
              <Button
                type="submit"
                size="md"
                fullWidth
                disabled={!canSend}
                data-testid="nego-send"
              >
                {waitingReply ? (
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

            {hint && (
              <p className="nego-hint" data-testid="nego-hint">
                {hint}
              </p>
            )}

            <Button
              variant="secondary"
              onClick={abandonNegotiation}
              size="md"
              fullWidth
              data-testid="nego-quit"
            >
              SAIR DA MESA
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
