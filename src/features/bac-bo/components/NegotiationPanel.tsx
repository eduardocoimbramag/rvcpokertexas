import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { MIN_STAKE } from '../engine/credits';
import type { Match } from '../engine/types';
import { useGameStore } from '../store/gameStore';
import type { NegotiationMessage } from '../store/negotiation';
import { AmountStepper } from './AmountStepper';
import { AvatarBadge } from './AvatarBadge';
import { PhaseTitle } from './PhaseTitle';

export interface NegotiationPanelProps {
  match: Match;
}

const BUBBLE_SPRING = { type: 'spring', stiffness: 380, damping: 26 } as const;

/** Entrada padrão das mensagens do chat (sobe e assenta). */
function bubbleMotion(instant: boolean) {
  return {
    initial: instant ? false : ({ opacity: 0, y: 10, scale: 0.96 } as const),
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: instant ? ({ duration: 0 } as const) : BUBBLE_SPRING,
  };
}

interface ChatMessageProps {
  message: NegotiationMessage;
  opponentName: string;
  instant: boolean;
  onAccept: () => void;
}

/**
 * Uma entrada do chat: aviso do sistema (pastilha central), fala
 * (bolha vinho translúcida), proposta (cartão de lance com estado) ou
 * o aperto de mãos (faixa dourada de acordo).
 */
function ChatMessage({ message, opponentName, instant, onAccept }: ChatMessageProps) {
  const own = message.author === 'player';

  if (message.author === 'system') {
    return (
      <motion.p className="nego-system" role="status" {...bubbleMotion(instant)}>
        {message.text}
      </motion.p>
    );
  }

  if (message.kind === 'proposal') {
    const status = message.status ?? 'pending';
    return (
      <motion.div
        className={`nego-proposal ${own ? 'nego-proposal--player' : 'nego-proposal--opponent'} ${
          status === 'superseded' ? 'nego-proposal--superseded' : ''
        }`}
        data-testid={own ? 'nego-proposal-player' : 'nego-proposal-opponent'}
        {...bubbleMotion(instant)}
      >
        <span className="nego-proposal__kicker">
          {own ? 'Sua proposta' : `Proposta de ${opponentName}`}
        </span>
        <span className="nego-proposal__amount">
          <Icon name="chip" />
          {formatCredits(message.amount ?? 0)}
          <small>créditos</small>
        </span>

        {/* O selo é o único anúncio do acordo dentro do chat — a faixa
            de "acordo fechado" saiu para a conversa não mudar de cara. */}
        {status === 'accepted' && (
          <span className="nego-tag nego-tag--ok" data-testid="nego-accepted">
            <Icon name="check" size={11} strokeWidth={3} /> Aceita
          </span>
        )}
        {status === 'superseded' && <span className="nego-tag nego-tag--muted">Superada</span>}
        {status === 'pending' && own && (
          <span className="nego-tag nego-tag--wait">Aguardando resposta…</span>
        )}
        {status === 'pending' && !own && (
          <motion.button
            type="button"
            className="nego-accept"
            onClick={onAccept}
            data-testid="nego-accept"
            whileTap={instant ? undefined : { scale: 0.94 }}
          >
            <Icon name="check" strokeWidth={2.6} /> ACEITAR
          </motion.button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.p
      className={`nego-bubble ${own ? 'nego-bubble--player' : 'nego-bubble--opponent'}`}
      {...bubbleMotion(instant)}
    >
      {message.text}
    </motion.p>
  );
}

/**
 * Fase Negotiate: mesa de negociação da aposta sobre o mesmo salão.
 * Um chat translúcido registra a conversa — avisos da mesa, falas do
 * oponente, propostas de cada lado e o acordo. Abaixo do chat, o
 * composer de lances (valor + atalhos +10/+100 + enviar, sob relógio de
 * 10 s) e, no rodapé, "Iniciar partida" (só destrava com o acordo) e
 * "Desistir" (abandona a mesa e volta ao menu).
 */
export function NegotiationPanel({ match }: NegotiationPanelProps) {
  const negotiation = useGameStore((state) => state.negotiation);
  const balance = useGameStore((state) => state.balance);
  const sendProposal = useGameStore((state) => state.sendProposal);
  const acceptProposal = useGameStore((state) => state.acceptProposal);
  const startDuel = useGameStore((state) => state.startDuel);
  const abandonNegotiation = useGameStore((state) => state.abandonNegotiation);
  const instant = useReducedMotion() ?? false;

  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const messages = negotiation?.messages ?? [];
  const typing = negotiation?.opponentTyping ?? false;

  // O chat acompanha a conversa: toda mensagem (ou o "digitando…")
  // rola a janela até o fim, como qualquer mensageiro. O fallback de
  // scrollTop cobre ambientes sem scrollTo em elementos (jsdom).
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (typeof log.scrollTo === 'function') {
      log.scrollTo({ top: log.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
    } else {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, typing, instant]);

  if (!negotiation) return null;

  const agreed = negotiation.agreedStake !== null;
  const starting = negotiation.starting;
  const cooldown = negotiation.proposalCooldown;

  const amount = draft === '' ? null : Number.parseInt(draft, 10);
  const overBalance = amount !== null && amount > balance;
  const belowMin = amount !== null && amount < MIN_STAKE;
  const validAmount = amount !== null && !overBalance && !belowMin;
  const canSend = validAmount && cooldown === 0 && !starting;

  const hint = overBalance
    ? `Saldo insuficiente: você tem ${formatCredits(balance)} créditos.`
    : belowMin
      ? `O lance mínimo é ${MIN_STAKE} créditos.`
      : cooldown > 0
        ? `Nova proposta em ${cooldown}s.`
        : null;

  const submit = () => {
    if (!canSend || amount === null) return;
    sendProposal(amount);
  };

  return (
    <div className="nego-stage flex min-h-0 flex-1 flex-col" data-testid="negotiation-panel">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
        <PhaseTitle>{agreed ? 'Acordo fechado!' : 'Negocie a aposta'}</PhaseTitle>

        {/* Vidro vinho translúcido sobre o couro: o salão continua
            visível atrás da conversa. */}
        <section
          className="nego-chat mx-auto flex min-h-0 w-[min(100%,92vw)] max-w-[27rem] flex-1 flex-col"
          aria-label={`Negociação com ${match.opponent.name}`}
        >
          <header className="nego-chat__head">
            <AvatarBadge name={match.opponent.name} className="text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-ivory">{match.opponent.name}</p>
              <p className="nego-chat__status">
                {starting
                  ? 'preparando a mesa…'
                  : agreed
                    ? 'pronto para o duelo'
                    : typing
                      ? 'digitando…'
                      : 'negociando'}
              </p>
            </div>
            <span
              className={`nego-chat__presence ${agreed ? 'nego-chat__presence--ready' : ''}`}
              aria-hidden="true"
            />
          </header>

          <div
            ref={logRef}
            className="nego-chat__log"
            role="log"
            aria-live="polite"
            data-testid="nego-chat"
          >
            <div className="flex flex-col gap-2">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  opponentName={match.opponent.name}
                  instant={instant}
                  onAccept={acceptProposal}
                />
              ))}

              {typing && (
                <motion.p
                  className="nego-bubble nego-bubble--opponent nego-typing"
                  aria-label={`${match.opponent.name} está digitando`}
                  data-testid="nego-typing"
                  {...bubbleMotion(instant)}
                >
                  <span className="waiting-dots">
                    <span className="waiting-dot">●</span>
                    <span className="waiting-dot">●</span>
                    <span className="waiting-dot">●</span>
                  </span>
                </motion.p>
              )}
            </div>
          </div>

          {/* Composer de lances: some quando o acordo fecha — a mesa
              está selada, resta iniciar (ou desistir). */}
          {!agreed && (
            <form
              className="nego-composer"
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
                disabled={starting}
                data-testid="nego-input"
                stepTestIdPrefix="nego-plus"
                trailing={
                  <motion.button
                    type="submit"
                    className="nego-send"
                    disabled={!canSend}
                    aria-label="Enviar proposta"
                    data-testid="nego-send"
                    whileTap={!canSend || instant ? undefined : { scale: 0.94 }}
                  >
                    {cooldown > 0 ? (
                      <span className="nego-send__cooldown" data-testid="nego-cooldown">
                        <Icon name="timer" /> {cooldown}s
                      </span>
                    ) : (
                      <>
                        <Icon name="send" /> ENVIAR
                      </>
                    )}
                  </motion.button>
                }
              />
            </form>
          )}

          {/* A dica só fala quando há algo a corrigir — sem lembrete
              permanente de limites ocupando a base do vidro. */}
          {!agreed && hint && (
            <p className="nego-hint" data-testid="nego-hint">
              {hint}
            </p>
          )}
        </section>
      </div>

      {/* Mesma faixa de segurança dos CTAs (docs/margemdeseguranca.md). */}
      <div className="mx-auto flex w-[min(100%,80vw)] max-w-96 flex-col gap-1.5 pb-4 pt-3">
        {/* O convite ao início é um halo respirando (box-shadow no CSS):
            anima a luz, não a caixa — o botão fica parado e clicável. */}
        <Button
          onClick={startDuel}
          disabled={!agreed || starting}
          size="md"
          fullWidth
          data-testid="nego-start"
          className={agreed && !starting ? 'nego-start--ready' : ''}
        >
          <Icon name="swords" /> {starting ? 'INICIANDO…' : 'INICIAR PARTIDA'}
        </Button>
        <Button
          variant="secondary"
          onClick={abandonNegotiation}
          disabled={starting}
          size="md"
          fullWidth
          data-testid="nego-quit"
        >
          DESISTIR
        </Button>
      </div>
    </div>
  );
}
