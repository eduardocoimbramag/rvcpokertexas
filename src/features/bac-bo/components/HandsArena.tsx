import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { FAN_OVERLAP, FAN_STEP_DEG } from '../animations/cards';
import { TIMINGS } from '../animations/timings';
import type { HandValue } from '../engine/rules';
import { handValue } from '../engine/rules';
import type {
  BlackjackRoundState,
  Card,
  DuelistCategory,
  Match,
  RoundResult,
} from '../engine/types';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import type { CardColorId } from '../store/cardColors';
import { Card3D } from './Card3D';

export interface HandsArenaProps {
  phase: GamePhase;
  match: Match;
  /** Rodada interativa corrente (mãos visíveis pré-veredito). */
  round: BlackjackRoundState | null;
  /** Resultado resolvido (mãos finais); `null` até a engine fechar. */
  result: RoundResult | null;
  /** Ações da vez do jogador. O 1v1 passa as do gameStore; o torneio,
      as do seu próprio motor de partida — a mesa é uma só. */
  onHit: () => void;
  onStand: () => void;
  actionPending: boolean;
}

/**
 * A mesa de blackjack em jogo: o dealer no alto (carta aberta + a
 * fechada aguardando a virada), o brasão respirando na faixa livre do
 * feltro e as duas mãos dos duelistas na base — a sua à esquerda com o
 * verso da sua cor, a do rival à direita. Cada fase da rodada é uma
 * cena:
 *
 * - `dealing`: as seis cartas voam do sapato em fila (stagger por carta,
 *   som no assentamento de cada uma — Card3D cuida do próprio beat).
 * - `playerTurn`: a barra PEDIR/PARAR abre; cada carta pedida entra na
 *   hora, e o total da mão acompanha ao vivo (soft mostra as duas
 *   leituras, "7/17").
 * - `opponentTurn`: as cartas que o bot pediu entram uma a uma.
 * - `dealerTurn`: a fechada VIRA (o momento clássico) e as compras até
 *   17 entram em beats próprios.
 * - `settle`/`roundEnd`: totais finais + categoria de cada duelista
 *   contra o dealer (quem venceu a rodada é assunto dos banners).
 * - `completed` (câmera frontal, dealer de volta ao quadro): o placar
 *   migra para as placas que flanqueiam a dealer — mesmo padrão da mesa
 *   antiga; com cenário desligado, os totais ficam na própria faixa.
 */

/** Posição de cada carta inicial na ordem da distribuição (jogador,
 * oponente, jogador, oponente, dealer aberta, dealer fechada). */
const DEAL_SLOT = {
  player: [0, 2],
  opponent: [1, 3],
} as const;

/** Rótulo da categoria de um duelista contra o dealer, no veredito. */
const CATEGORY_COPY: Record<DuelistCategory, { label: string; className: string }> = {
  blackjack: { label: 'BLACKJACK!', className: 'text-[#7a4503]' },
  win: { label: 'VENCEU O DEALER', className: 'text-[#7a4503]' },
  push: { label: 'EMPATOU', className: 'text-[#26312a]' },
  lose: { label: 'PERDEU', className: 'text-[#8f1616]' },
  bust: { label: 'ESTOUROU', className: 'text-[#8f1616]' },
};

/** Leitura amigável de um total (soft mostra as duas contagens). */
function totalLabel(value: HandValue): string {
  return value.soft && value.total !== 21 ? `${value.total - 10}/${value.total}` : `${value.total}`;
}

interface HandFanProps {
  cards: readonly (Card | null)[];
  back: CardColorId | 'house';
  testid: string;
  /** Prefixo dos rótulos acessíveis ("Sua carta", "Carta do dealer"…). */
  labelPrefix: string;
  faceDownAt?: (index: number) => boolean;
  delayFor?: (index: number) => number;
}

/** Leque de uma mão: sobreposição + giro em torno do centro, como
 * cartas seguras sobre a mesa. As transformações são estáticas — quem
 * anima entrada e virada é o Card3D de cada carta. */
function HandFan({ cards, back, testid, labelPrefix, faceDownAt, delayFor }: HandFanProps) {
  const count = cards.length;
  return (
    <div className="flex items-center justify-center" data-testid={testid}>
      {cards.map((card, index) => {
        const offCenter = index - (count - 1) / 2;
        return (
          <div
            key={index}
            data-testid={`${testid}-card-${index + 1}`}
            style={
              {
                marginLeft: index > 0 ? `calc(var(--card-w) * -${FAN_OVERLAP})` : undefined,
                zIndex: index,
                rotate: `${offCenter * FAN_STEP_DEG}deg`,
                translate: `0 ${Math.abs(offCenter) * 3}px`,
              } as CSSProperties
            }
          >
            <Card3D
              card={card}
              faceDown={faceDownAt?.(index) ?? false}
              back={back}
              dealDelayMs={delayFor?.(index) ?? 0}
              label={`${labelPrefix} ${index + 1}`}
            />
          </div>
        );
      })}
    </div>
  );
}

interface ScorePlateProps {
  side: 'player' | 'opponent';
  name: string;
  total: number;
  winner: boolean;
  instant: boolean;
}

/** Placa de placar ao lado da dealer: nome em cima, total embaixo. */
function ScorePlate({ side, name, total, winner, instant }: ScorePlateProps) {
  const player = side === 'player';
  return (
    <motion.div
      className={`score-plate ${player ? 'score-plate--player' : 'score-plate--opponent'} ${winner ? 'score-plate--winner' : ''}`}
      data-testid={`score-plate-${side}`}
      initial={instant ? false : { opacity: 0, x: player ? -28 : 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        instant ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22, delay: 0.35 }
      }
    >
      {winner && (
        <motion.span
          className="score-plate__crown"
          aria-hidden="true"
          initial={instant ? false : { opacity: 0, y: 8, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            instant ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 15, delay: 0.7 }
          }
        >
          <Icon name="crown" className="text-gold" size={17} />
        </motion.span>
      )}
      <span className="score-plate__name">{name}</span>
      <span className="score-plate__total" data-testid={`${player ? 'player' : 'opponent'}-total`}>
        {total}
      </span>
    </motion.div>
  );
}

export function HandsArena({
  phase,
  match,
  round,
  result,
  onHit,
  onStand,
  actionPending,
}: HandsArenaProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);
  // Cores do cara-ou-coroa: no 1v1 o vencedor do sorteio muda a sua; no
  // torneio (mesmo store, sorteio próprio) valem as que ele fixou.
  const cardColors = useGameStore((state) => state.cardColors);

  const dealing = phase === 'dealing';
  // Antes do fim da vez do jogador, o rival e o dealer só mostram o que
  // uma mesa real mostraria: as 2 iniciais dele e a aberta da casa — o
  // `result` já existe no estado, mas não vaza para a mesa.
  const preSettleView = dealing || phase === 'playerTurn';
  const dealerRevealed =
    phase === 'dealerTurn' || phase === 'settle' || phase === 'roundEnd' || phase === 'completed';
  const showCategories = phase === 'settle' || phase === 'roundEnd' || phase === 'completed';

  const playerCards: readonly Card[] = round?.playerHand ?? result?.playerHand ?? [];
  const opponentFull: readonly Card[] = result?.opponentHand ?? round?.opponentHand ?? [];
  const opponentCards = preSettleView ? opponentFull.slice(0, 2) : opponentFull;
  const dealerFull: readonly Card[] | null = result?.dealerHand ?? null;
  const upCard = round?.dealerUpCard ?? dealerFull?.[0] ?? null;
  const dealerCards: readonly (Card | null)[] =
    dealerRevealed && dealerFull ? dealerFull : [upCard, null];

  if (!upCard || playerCards.length === 0) return null;

  const playerValue = handValue(playerCards);
  const opponentValue = handValue(opponentCards);
  // O total do dealer só abre com a mão fechada: durante a virada e as
  // compras, o show é das cartas — o número chega no veredito.
  const dealerValue =
    (phase === 'settle' || phase === 'roundEnd' || phase === 'completed') && dealerFull
      ? handValue(dealerFull)
      : handValue([upCard]);
  // A vez do oponente é das cartas entrando; o total abre depois dela.
  const showOpponentTotal = phase !== 'opponentTurn';

  /* Atrasos de entrada por zona (só valem no instante da montagem —
     cartas já assentadas não re-animam quando a fase muda). */
  const playerDelay = (index: number) =>
    dealing ? (DEAL_SLOT.player[index] ?? 0) * TIMINGS.dealCardMs : 0;
  const opponentDelay = (index: number) => {
    if (dealing) return (DEAL_SLOT.opponent[index] ?? 0) * TIMINGS.dealCardMs;
    if (phase === 'opponentTurn' && index >= 2) return (index - 2) * TIMINGS.opponentHitMs;
    return 0;
  };
  const dealerDelay = (index: number) => {
    if (dealing) return (4 + Math.min(index, 1)) * TIMINGS.dealCardMs;
    if (dealerRevealed && index >= 2)
      return TIMINGS.holeFlipMs + (index - 2) * TIMINGS.dealerDrawMs;
    return 0;
  };

  /* Fase completed: a câmera volta ao frontal e a dealer entra no
     quadro — o placar migra para as placas que a flanqueiam (padrão da
     casa). Sem cenário não há dealer: os totais ficam na faixa. */
  if (phase === 'completed' && result) {
    const flank = scenery !== 'off';
    if (flank) {
      return (
        <>
          <ScorePlate
            side="player"
            name="Você"
            total={result.playerTotal}
            winner={result.outcome === 'win'}
            instant={reducedMotion}
          />
          <ScorePlate
            side="opponent"
            name={match.opponent.name}
            total={result.opponentTotal}
            winner={result.outcome === 'lose'}
            instant={reducedMotion}
          />
        </>
      );
    }
    return (
      <div className="flex items-baseline justify-center gap-8 pt-2">
        <div className="flex items-baseline gap-2">
          <span className="text-engraved text-sm font-black uppercase tracking-widest text-[#1e3a8a]">
            Você
          </span>
          <span
            className="text-engraved text-3xl font-black tabular-nums text-[#1e3a8a]"
            data-testid="player-total"
          >
            {result.playerTotal}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-engraved text-sm font-black uppercase tracking-widest text-[#7f1d1d]">
            {match.opponent.name}
          </span>
          <span
            className="text-engraved text-3xl font-black tabular-nums text-[#7f1d1d]"
            data-testid="opponent-total"
          >
            {result.opponentTotal}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center pt-1">
      {/* ---- Dealer no alto da mesa ---- */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label="Mão do dealer"
        data-testid="hand-dealer"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-engraved text-xs font-black uppercase tracking-widest text-[#14291d]">
            Dealer
          </span>
          <span
            className="text-engraved text-xl font-black tabular-nums text-[#14291d]"
            data-testid="dealer-total"
          >
            {totalLabel(dealerValue)}
          </span>
        </div>
        <HandFan
          cards={dealerCards}
          back="house"
          testid="hand-dealer-cards"
          labelPrefix="Carta do dealer"
          faceDownAt={(index) => index === 1 && !dealerRevealed}
          delayFor={dealerDelay}
        />
      </section>

      {/* Faixa livre do feltro: é aqui que o brasão da casa respira. */}
      <div aria-hidden className="w-full grow" />

      {/* ---- Duelistas na base ---- */}
      <div className="grid w-full grid-cols-2 items-end gap-x-4">
        <section
          className="flex flex-col items-center gap-1.5"
          aria-label="Sua mão"
          data-testid="hand-player"
        >
          <HandFan
            cards={playerCards}
            back={cardColors.player}
            testid="hand-player-cards"
            labelPrefix="Sua carta"
            delayFor={playerDelay}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-engraved text-xs font-black uppercase tracking-widest text-[#1e3a8a]">
              Você
            </span>
            <span
              className={`text-engraved text-2xl font-black tabular-nums ${playerValue.total > 21 ? 'text-[#8f1616]' : 'text-[#1e3a8a]'}`}
              data-testid="player-total"
            >
              {totalLabel(playerValue)}
            </span>
          </div>
          {showCategories && result && (
            <motion.span
              className={`text-engraved text-[0.65rem] font-black uppercase tracking-[0.18em] ${CATEGORY_COPY[result.playerCategory].className}`}
              data-testid="category-player"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {CATEGORY_COPY[result.playerCategory].label}
            </motion.span>
          )}
        </section>

        <section
          className="flex flex-col items-center gap-1.5"
          aria-label={`Mão de ${match.opponent.name}`}
          data-testid="hand-opponent"
        >
          <HandFan
            cards={opponentCards}
            back={cardColors.opponent}
            testid="hand-opponent-cards"
            labelPrefix={`Carta de ${match.opponent.name}`}
            delayFor={opponentDelay}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-engraved text-xs font-black uppercase tracking-widest text-[#7f1d1d]">
              {match.opponent.name}
            </span>
            {showOpponentTotal && (
              <span
                className={`text-engraved text-2xl font-black tabular-nums ${opponentValue.total > 21 ? 'text-[#8f1616]' : 'text-[#7f1d1d]'}`}
                data-testid="opponent-total"
              >
                {totalLabel(opponentValue)}
              </span>
            )}
          </div>
          {showCategories && result && (
            <motion.span
              className={`text-engraved text-[0.65rem] font-black uppercase tracking-[0.18em] ${CATEGORY_COPY[result.opponentCategory].className}`}
              data-testid="category-opponent"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {CATEGORY_COPY[result.opponentCategory].label}
            </motion.span>
          )}
        </section>
      </div>

      {/* ---- Barra de ações da vez do jogador ---- */}
      {phase === 'playerTurn' && (
        <motion.div
          className="action-stack mt-3"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
        >
          <div className="flex w-full gap-3">
            <Button
              onClick={onHit}
              disabled={actionPending}
              size="md"
              fullWidth
              data-testid="action-hit"
            >
              <Icon name="plus" /> PEDIR CARTA
            </Button>
            <Button
              variant="secondary"
              onClick={onStand}
              disabled={actionPending}
              size="md"
              fullWidth
              data-testid="action-stand"
            >
              <Icon name="check" /> PARAR
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
