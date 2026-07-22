import type { Easing } from 'framer-motion';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { TIMINGS } from '../animations/timings';
import type { DiceColorId } from '../store/diceColors';
import { DICE_COLORS, DICE_COLOR_LIST } from '../store/diceColors';
import type { CoinSide } from '../store/gameStore';
import { useGameStore } from '../store/gameStore';
import { Die3D } from './Die3D';
import { PhaseTitle } from './PhaseTitle';

/**
 * Fase Coinflip em duas cenas, encadeadas por AnimatePresence:
 *
 * 1. O LANÇAMENTO — a ficha do clube gira no ar e pousa na face
 *    sorteada, com o título "Cara ou coroa" ancorado embaixo dela.
 * 2. A ESCOLHA — a cena do lançamento sai inteira de quadro e entram os
 *    dois dados da mesa; o vencedor toca um e confirma.
 *
 * Nada aqui decide o resultado: a face sorteada e o vencedor vêm
 * prontos do store (`coinFlip`), e este componente só coreografa.
 */

/** Voltas completas da ficha no ar antes de assentar. */
const TOSS_SPINS = 5;

/**
 * Marcos do voo, em fração da duração: agacha (antecipação), sobe,
 * toca a mesa, quica e assenta. Todos os canais animados (altura,
 * escala e sombra) compartilham estes tempos E o mesmo easing — é o
 * que mantém a sombra colada à ficha dentro de cada trecho, em vez de
 * ela chegar antes na queda.
 *
 * A altura vai em PORCENTAGEM da própria ficha (não em px): o arco
 * fica proporcional ao tamanho dela em qualquer tela e cabe exato na
 * reserva da .coin-stage (2,2× a ficha).
 */
const FLIGHT_TIMES = [0, 0.05, 0.44, 0.78, 0.87, 1];
const FLIGHT_LIFT = ['0%', '9%', '-100%', '0%', '-15%', '0%'];
/** Sobe e AFASTA da câmera: encolher no ápice é o que dá altura. */
const FLIGHT_SCALE = [1, 0.98, 0.86, 1, 0.96, 1];
const FLIGHT_SHADOW_X = [1, 1.05, 0.4, 1.04, 0.72, 1];
const FLIGHT_SHADOW_O = [0.85, 0.9, 0.25, 1, 0.5, 0.85];
/** Sobe desacelerando, cai com gravidade, quica e pousa. */
const FLIGHT_EASE: Easing[] = ['easeOut', 'easeOut', 'easeIn', 'easeOut', 'easeIn'];

/**
 * Giro: quase toda a volta acontece na subida e desacelera até a
 * batida (a curva longa), e o último trecho é o balanço da ficha
 * assentando — ela passa 16° do repouso e volta.
 */
const SPIN_EASE: Easing[] = [[0.08, 0.62, 0.24, 1], 'easeOut'];
const SPIN_TIMES = [0, 0.86, 1];

/** Ângulo de repouso que deixa a face pedida para cima. */
const restAngle = (side: CoinSide): number => (side === 'cara' ? 0 : 180);

const SIDE_LABEL: Record<CoinSide, string> = { cara: 'CARA', coroa: 'COROA' };
const SIDE_ICON: Record<CoinSide, 'user' | 'crown'> = { cara: 'user', coroa: 'crown' };

/**
 * Discos que formam a parede do cilindro, em frações da meia-espessura
 * (--coin-t). Param em ±0.85 — as TAMPAS ocupam ±1, e dois planos no
 * mesmo Z brigariam por profundidade (z-fighting) com a moeda deitada.
 * Nove discos deixam o vão entre eles menor que um pixel, então de
 * perfil a parede lê como metal maciço em vez de persiana.
 */
const RIM_LAYERS = Array.from({ length: 9 }, (_, i) => -0.85 + (i * 1.7) / 8);

export function CoinFlipOverlay() {
  const coinFlip = useGameStore((state) => state.coinFlip);
  const match = useGameStore((state) => state.match);
  const diceColors = useGameStore((state) => state.diceColors);
  const chooseDiceColor = useGameStore((state) => state.chooseDiceColor);
  const reducedMotion = useReducedMotion() ?? false;
  const [selected, setSelected] = useState<DiceColorId | null>(null);

  if (!coinFlip || !match) return null;
  const { playerSide, result, winner, stage, chosenColor } = coinFlip;

  const choosing = stage === 'pick' || stage === 'botPick' || stage === 'picked';

  return (
    <div className="flex flex-1 flex-col items-center pb-4" data-testid="coinflip-overlay">
      <AnimatePresence mode="wait">
        {choosing ? (
          <motion.div
            key="choice"
            className="flex flex-1 flex-col items-center"
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <DiceChoiceScene
              winner={winner}
              opponentName={match.opponent.name}
              stage={stage}
              chosenColor={chosenColor}
              playerColor={diceColors.player}
              selected={selected}
              onSelect={setSelected}
              onConfirm={() => selected && chooseDiceColor(selected)}
              instant={reducedMotion}
            />
          </motion.div>
        ) : (
          <motion.div
            key="toss"
            className="flex flex-1 flex-col items-center"
            initial={false}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -12 }}
            transition={{ duration: 0.26, ease: 'easeIn' }}
          >
            <TossScene
              playerSide={playerSide}
              result={result}
              winner={winner}
              tossing={stage === 'toss'}
              landed={stage === 'result'}
              opponentName={match.opponent.name}
              instant={reducedMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface TossSceneProps {
  playerSide: CoinSide;
  result: CoinSide | null;
  winner: 'player' | 'opponent' | null;
  tossing: boolean;
  landed: boolean;
  opponentName: string;
  instant: boolean;
}

/** Cena 1: a ficha no ar, o título embaixo e o veredito do sorteio. */
function TossScene({
  playerSide,
  result,
  winner,
  tossing,
  landed,
  opponentName,
  instant,
}: TossSceneProps) {
  const tossSec = TIMINGS.coinTossMs / 1000;
  const flying = tossing && !instant;

  // Antes do voo a ficha descansa no lado sorteado para o jogador; o
  // voo acumula voltas inteiras e para exatamente na face do resultado.
  const from = restAngle(playerSide);
  const to = TOSS_SPINS * 360 + restAngle(result ?? playerSide);
  // Sem o voo (movimento reduzido) a face só vira no beat do POUSO, e
  // não na largada: revelar no início deixaria o desfecho na tela
  // durante os 2,6s de voo que o usuário não vê, com o veredito
  // chegando depois — spoiler seguido de espera morta.
  const showResult = instant ? landed : tossing || landed;

  const spin = flying ? { rotateX: [from, to + 16, to] } : { rotateX: showResult ? to : from };
  const spinTransition = flying
    ? { duration: tossSec, times: SPIN_TIMES, ease: SPIN_EASE }
    : { duration: instant ? 0.3 : 0.45, ease: 'easeOut' as const };

  return (
    <>
      {/* Lado sorteado: a mesma pastilha de vinho com letra dourada que
          anuncia "Duelo encontrado" — a insígnia padrão das fases. */}
      <motion.p
        className="flex items-center gap-2 rounded-full bg-arena-900/80 px-4 py-1.5 text-xs font-black uppercase tracking-[0.3em] text-gold shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.1)]"
        initial={instant ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        data-testid="coin-side"
      >
        <Icon name={SIDE_ICON[playerSide]} size="1.15em" />
        Seu lado · {SIDE_LABEL[playerSide]}
      </motion.p>

      <div aria-hidden className="w-full grow" />

      {/* A reserva do arco vive na .coin-stage; a ficha nunca invade a
          insígnia acima nem o título abaixo. */}
      <div className="coin-stage [--coin-size:clamp(5.5rem,27vw,8.5rem)]">
        <div
          className="coin-scene"
          role="img"
          aria-label={
            landed && result ? `A moeda caiu em ${result}` : 'Moeda de cara ou coroa girando'
          }
        >
          <motion.div
            className="coin-flight"
            animate={
              flying
                ? { y: FLIGHT_LIFT, scale: FLIGHT_SCALE }
                : { y: '0%', scale: 1 }
            }
            transition={
              flying
                ? { duration: tossSec, times: FLIGHT_TIMES, ease: FLIGHT_EASE }
                : { duration: 0.3 }
            }
          >
            <motion.div className="coin" animate={spin} transition={spinTransition}>
              {/* Parede do cilindro: sem ela a ficha sumiria de perfil. */}
              {RIM_LAYERS.map((depth) => (
                <div
                  key={depth}
                  className="coin__rim"
                  aria-hidden="true"
                  style={{ transform: `translateZ(calc(var(--coin-t) * ${depth}))` }}
                />
              ))}
              <CoinFace side="cara" />
              <CoinFace side="coroa" />
            </motion.div>
          </motion.div>
          <motion.span
            className="coin-shadow"
            aria-hidden="true"
            animate={
              flying
                ? { scaleX: FLIGHT_SHADOW_X, opacity: FLIGHT_SHADOW_O }
                : { scaleX: 1, opacity: 0.85 }
            }
            transition={
              flying
                ? { duration: tossSec, times: FLIGHT_TIMES, ease: FLIGHT_EASE }
                : { duration: 0.3 }
            }
          />
        </div>
      </div>

      {/* O título ancora a peça: fica logo abaixo da ficha. */}
      <div className="mt-5">
        <PhaseTitle>Cara ou coroa</PhaseTitle>
      </div>

      <div aria-hidden className="w-full grow" />

      <div className="flex min-h-14 flex-col items-center justify-start" aria-live="polite">
        <AnimatePresence>
          {landed && result && (
            <motion.div
              className="flex flex-col items-center gap-0.5"
              initial={instant ? false : { opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              data-testid="coin-verdict"
            >
              <p className="font-display text-engraved text-3xl font-bold tracking-wide text-[#7a4503]">
                Deu {SIDE_LABEL[result]}!
              </p>
              <p className="text-engraved text-sm font-extrabold text-[#33261a]">
                {winner === 'player' ? 'Você venceu o sorteio' : `${opponentName} venceu o sorteio`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Face cunhada: aro de ouro, denticulado e medalhão de vinho. */
function CoinFace({ side }: { side: CoinSide }) {
  return (
    <div className={`coin__face ${side === 'coroa' ? 'coin__face--back' : ''}`} aria-hidden="true">
      <span className="coin__core">
        <Icon name={SIDE_ICON[side]} size="42%" strokeWidth={1.5} />
        <span className="coin__label">{SIDE_LABEL[side]}</span>
      </span>
    </div>
  );
}

interface DiceChoiceSceneProps {
  winner: 'player' | 'opponent' | null;
  opponentName: string;
  stage: 'pick' | 'botPick' | 'picked';
  chosenColor: DiceColorId | null;
  playerColor: DiceColorId;
  selected: DiceColorId | null;
  onSelect: (color: DiceColorId) => void;
  onConfirm: () => void;
  instant: boolean;
}

/**
 * Cena 2: os dois dados da mesa. Vencendo o sorteio, o jogador toca um
 * deles e confirma; perdendo, os cartões só mostram o que o adversário
 * levou. A cor não escolhida fica automaticamente com o outro lado.
 */
function DiceChoiceScene({
  winner,
  opponentName,
  stage,
  chosenColor,
  playerColor,
  selected,
  onSelect,
  onConfirm,
  instant,
}: DiceChoiceSceneProps) {
  const picking = stage === 'pick';
  const headline = picking
    ? 'Escolha seus dados'
    : stage === 'picked'
      ? `Você joga com os dados ${DICE_COLORS[playerColor].label}`
      : `${opponentName} escolheu os dados ${chosenColor ? DICE_COLORS[chosenColor].label : ''}`;

  return (
    <>
      <motion.p
        className="flex items-center gap-2 rounded-full bg-arena-900/80 px-4 py-1.5 text-xs font-black uppercase tracking-[0.3em] text-gold shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.1)]"
        initial={instant ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Icon name={winner === 'player' ? 'crown' : 'user'} size="1.15em" />
        {winner === 'player' ? 'Você venceu o sorteio' : `${opponentName} venceu`}
      </motion.p>

      <div aria-hidden className="w-full grow" />

      <div data-testid="coin-headline" aria-live="polite">
        <PhaseTitle>{headline}</PhaseTitle>
      </div>

      <div
        className="mt-8 flex items-start justify-center gap-5"
        data-testid="dice-color-picker"
        role={picking ? 'radiogroup' : undefined}
        aria-label={picking ? 'Cor dos seus dados' : undefined}
      >
        {DICE_COLOR_LIST.map((color, index) => {
          const on = picking ? selected === color.id : chosenColor === color.id;
          // O cartão preterido recua (escala e brilho) para o escolhido
          // ficar sozinho em evidência — nos dois caminhos: enquanto o
          // jogador escolhe e depois de o vencedor bater o martelo.
          const decided = picking ? selected !== null : chosenColor !== null;
          const dim = decided && !on;
          const Tag = picking ? motion.button : motion.div;

          return (
            <Tag
              key={color.id}
              className={`dice-choice ${on ? 'dice-choice--on' : ''} ${dim ? 'dice-choice--dim' : ''}`}
              style={{ '--dice-choice-accent': color.gradientA } as React.CSSProperties}
              initial={instant ? false : { opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: on ? 1.06 : dim ? 0.95 : 1 }}
              transition={
                instant
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 300, damping: 20, delay: 0.12 + index * 0.1 }
              }
              {...(picking
                ? {
                    type: 'button' as const,
                    role: 'radio',
                    'aria-checked': selected === color.id,
                    'aria-label': `Dados ${color.label}`,
                    onClick: () => onSelect(color.id),
                    whileTap: { scale: 0.94 },
                    'data-testid': `dice-color-${color.id}`,
                  }
                : { 'data-testid': `dice-color-${color.id}` })}
            >
              {on && (
                <motion.span
                  className="dice-choice__seal"
                  aria-hidden="true"
                  initial={instant ? false : { scale: 0, y: 6 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                >
                  <Icon name="check" size={13} strokeWidth={2.6} />
                </motion.span>
              )}
              <Die3D
                value={5}
                side="player"
                color={color.id}
                rolling={false}
                size="clamp(3.5rem,17vw,4.5rem)"
                label={`Dado ${color.label}`}
              />
              <span className="dice-choice__name">{color.label}</span>
            </Tag>
          );
        })}
      </div>

      <div aria-hidden className="w-full grow" />

      {picking && (
        <motion.div
          className="action-stack"
          initial={instant ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={instant ? { duration: 0 } : { delay: 0.4, duration: 0.35 }}
        >
          <Button
            onClick={onConfirm}
            size="md"
            fullWidth
            disabled={selected === null}
            data-testid="confirm-dice-color"
          >
            <Icon name="check" /> CONFIRMAR
          </Button>
        </motion.div>
      )}
    </>
  );
}
