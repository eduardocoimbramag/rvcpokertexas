import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { FAN_OVERLAP, FAN_STEP_DEG } from '../animations/cards';
import { TIMINGS } from '../animations/timings';
import type { HandValue } from '../engine/rules';
import { handValue } from '../engine/rules';
import type { BlackjackRoundState, Card, Match, RoundResult } from '../engine/types';
import type { GamePhase } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { Card3D } from './Card3D';

export interface HandsArenaProps {
  phase: GamePhase;
  match: Match;
  /** Rodada interativa corrente (mãos visíveis pré-showdown). */
  round: BlackjackRoundState | null;
  /** Resultado resolvido (mãos completas); `null` até a engine fechar. */
  result: RoundResult | null;
  /** Ações da vez do jogador. O 1v1 passa as do gameStore; o torneio,
      as do seu próprio motor de partida — a mesa é uma só. */
  onHit: () => void;
  onStand: () => void;
  actionPending: boolean;
}

/**
 * A mesa do duelo de 21: o rival do outro lado do feltro, você embaixo,
 * e o brasão respirando na faixa livre entre as duas mãos. Não há casa
 * para bater — é mão contra mão.
 *
 * A REGRA DE POV manda na cena: cada duelista vê a mão do outro menos a
 * ÚLTIMA carta dela. Então o rival sempre tem uma carta virada para
 * baixo, e cada carta nova que ele pede empurra a anterior para cima —
 * a informação chega em conta-gotas, e a última só abre no showdown.
 *
 * Cada fase é uma cena:
 * - `dealing`: as quatro cartas voam do baralho em fila (som no
 *   assentamento de cada uma — o Card3D cuida do próprio beat).
 * - `playerTurn`: a barra PEDIR/PARAR abre; o total da sua mão acompanha
 *   ao vivo (soft mostra as duas leituras, "7/17") e o do rival mostra
 *   só o que está aberto, com um "+?" lembrando o que falta.
 * - `opponentTurn`: as cartas que o rival pediu entram uma a uma,
 *   revelando as anteriores no caminho.
 * - `settle`: showdown — as ocultas viram e os totais finais aparecem.
 * - `completed` (câmera frontal): o placar migra para as placas que
 *   flanqueiam a crupiê; com cenário desligado ele fica na faixa.
 */

/** Ordem de entrada das cartas na distribuição (jogador, rival, ...). */
const DEAL_SLOT = {
  player: [0, 2],
  opponent: [1, 3],
} as const;

/** Respiro antes da primeira carta que o rival pede na vez dele. */
const OPPONENT_LEAD_MS = 300;

/** Momento em que a carta `index` do rival pousa na vez dele. */
function opponentEntryMs(index: number): number {
  return index < 2 ? 0 : OPPONENT_LEAD_MS + (index - 2) * TIMINGS.opponentHitMs;
}

/** Leitura amigável de um total (soft mostra as duas contagens). */
function totalLabel(value: HandValue): string {
  return value.soft && value.total !== 21 ? `${value.total - 10}/${value.total}` : `${value.total}`;
}

interface HandFanProps {
  cards: readonly (Card | null)[];
  testid: string;
  /** Prefixo dos rótulos acessíveis ("Sua carta", "Carta de Luna"…). */
  labelPrefix: string;
  faceDownAt?: (index: number) => boolean;
  delayFor?: (index: number) => number;
}

/** Leque de uma mão: sobreposição + giro em torno do centro, como
 * cartas seguras sobre a mesa. As transformações são estáticas — quem
 * anima entrada e virada é o Card3D de cada carta. */
function HandFan({ cards, testid, labelPrefix, faceDownAt, delayFor }: HandFanProps) {
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

/** Placa de placar ao lado da crupiê: nome em cima, total embaixo. */
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

/** Selo de situação de uma mão no showdown. */
function verdictOf(bust: boolean, natural: boolean): { label: string; className: string } {
  if (bust) return { label: 'ESTOUROU', className: 'text-[#8f1616]' };
  if (natural) return { label: 'BLACKJACK!', className: 'text-[#7a4503]' };
  return { label: 'PAROU', className: 'text-[#26312a]' };
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

  const dealing = phase === 'dealing';
  const playerTurn = phase === 'playerTurn';
  const opponentTurn = phase === 'opponentTurn';
  // Só há o que decidir enquanto a engine oferecer ações: a mão que já
  // fechou trava os botões mesmo com a fase ainda em `playerTurn`.
  const canAct = playerTurn && !actionPending && (round?.legalActions.length ?? 0) > 0;
  // Showdown: só aqui as ocultas viram e os totais fecham.
  const revealed = phase === 'settle' || phase === 'completed';

  const playerCards: readonly Card[] = round?.playerHand ?? result?.playerHand ?? [];
  // Antes do showdown a mesa só conhece o que a engine deixou passar: as
  // cartas ABERTAS do rival mais o buraco da que segue virada.
  const opponentFull: readonly Card[] = result?.opponentHand ?? [];
  const opponentVisible: readonly Card[] = round?.opponentVisible ?? [];

  /* A mão exibida do rival por fase:
     - até o fim da SUA vez: exatamente as duas cartas da abertura — a
       primeira aberta e a outra virada. É fixo em 2 de propósito: num
       blackjack natural seu a engine já resolve a rodada na
       distribuição, e o estado que volta traz a mão do rival INTEIRA
       (ele já jogou). Ler `opponentVisible` aqui colocaria na mesa,
       antes da hora, cartas que ele só compraria no showdown;
     - da vez dele em diante: a mão inteira, com a ÚLTIMA carta ainda
       virada até o showdown. */
  const opponentCards: readonly (Card | null)[] =
    opponentTurn || revealed ? opponentFull : [opponentVisible[0] ?? null, null];

  if (playerCards.length === 0 || opponentCards.length === 0) return null;

  const playerValue = handValue(playerCards);
  // O total do rival é o das cartas ABERTAS enquanto houver oculta — com
  // o "+?" lembrando que falta carta para a conta fechar.
  const opponentKnown = revealed
    ? opponentFull
    : opponentCards.slice(0, Math.max(0, opponentCards.length - 1)).filter((c): c is Card => c !== null);
  const opponentValue = handValue(opponentKnown);
  const opponentPartial = !revealed;

  /* Atrasos de entrada e de virada por carta. Para uma carta já montada
     o `dealDelayMs` só governa a VIRADA — é assim que cada carta nova do
     rival revela a anterior no instante exato em que pousa. */
  const playerDelay = (index: number) =>
    dealing ? (DEAL_SLOT.player[index] ?? 0) * TIMINGS.dealCardMs : 0;

  const opponentDelay = (index: number) => {
    if (dealing) return (DEAL_SLOT.opponent[index] ?? 0) * TIMINGS.dealCardMs;
    if (opponentTurn) {
      const last = opponentCards.length - 1;
      // A oculta entra no próprio beat; as demais viram quando a
      // SUCESSORA pousa.
      return index === last ? opponentEntryMs(index) : opponentEntryMs(index + 1);
    }
    return 0; // showdown: tudo vira junto, sem atraso
  };

  /* Fase completed: a câmera volta ao frontal e a crupiê entra no
     quadro — o placar migra para as placas que a flanqueiam (padrão da
     casa). Sem cenário não há crupiê: os totais ficam na faixa. */
  if (phase === 'completed' && result) {
    if (scenery !== 'off') {
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
      {/* ---- O rival, do outro lado da mesa ---- */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label={`Mão de ${match.opponent.name}`}
        data-testid="hand-opponent"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-engraved text-xs font-black uppercase tracking-widest text-[#7f1d1d]">
            {match.opponent.name}
          </span>
          <span
            className={`text-engraved text-2xl font-black tabular-nums ${opponentValue.total > 21 ? 'text-[#8f1616]' : 'text-[#7f1d1d]'}`}
            data-testid="opponent-total"
          >
            {totalLabel(opponentValue)}
            {/* A conta do rival é sempre parcial até o showdown: o "+?"
                é a carta que ele guarda virada. */}
            {opponentPartial && <span className="opacity-70"> +?</span>}
          </span>
        </div>
        <HandFan
          cards={opponentCards}
          testid="hand-opponent-cards"
          labelPrefix={`Carta de ${match.opponent.name}`}
          faceDownAt={(index) => !revealed && index === opponentCards.length - 1}
          delayFor={opponentDelay}
        />
        {revealed && result && (
          <motion.span
            className={`text-engraved text-[0.65rem] font-black uppercase tracking-[0.18em] ${verdictOf(result.opponentBust, result.opponentNatural).className}`}
            data-testid="verdict-opponent"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {verdictOf(result.opponentBust, result.opponentNatural).label}
          </motion.span>
        )}
      </section>

      {/* Faixa livre do feltro: é aqui que o brasão da casa respira. */}
      <div aria-hidden className="w-full grow" />

      {/* ---- A sua mão ---- */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label="Sua mão"
        data-testid="hand-player"
      >
        {revealed && result && (
          <motion.span
            className={`text-engraved text-[0.65rem] font-black uppercase tracking-[0.18em] ${verdictOf(result.playerBust, result.playerNatural).className}`}
            data-testid="verdict-player"
            initial={reducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {verdictOf(result.playerBust, result.playerNatural).label}
          </motion.span>
        )}
        <HandFan
          cards={playerCards}
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
      </section>

      {/* ---- Barra de ações da sua vez ----
          Os botões seguem em cena durante o beat em que a última carta
          assenta, mas TRAVADOS: a mão já fechou (legalActions vazio) e
          um segundo toque só produziria uma ação ilegal. */}
      {playerTurn && (
        <motion.div
          className="action-stack mt-3"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
        >
          <div className="flex w-full gap-3">
            <Button
              onClick={onHit}
              disabled={!canAct}
              size="md"
              fullWidth
              data-testid="action-hit"
            >
              <Icon name="plus" /> PEDIR CARTA
            </Button>
            <Button
              variant="secondary"
              onClick={onStand}
              disabled={!canAct}
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
