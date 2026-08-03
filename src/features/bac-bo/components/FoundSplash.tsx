import { motion, useReducedMotion } from 'framer-motion';

import type { Match } from '../engine/types';
import { DuelistSeat } from './DuelistSeat';

export interface FoundSplashProps {
  match: Match;
}

/**
 * Fase Found: apresentação de duelo em três tempos, como tela de
 * matchup de jogo de luta — o assento do jogador entra pela esquerda,
 * o "VS" carimba no centro com um anel de impacto e o assento do
 * oponente responde pela direita, fechando a sequência.
 * O orçamento total é TIMINGS.foundSplashMs (a store troca de fase
 * sozinha ao fim). Com reduced motion tudo aparece de uma vez.
 *
 * Os duelistas são os MESMOS assentos da confirmação (DuelistSeat):
 * medalhão redondo com o aro do lado e o nome gravado embaixo. As duas
 * telas correm em sequência com poucos segundos entre elas, então
 * qualquer diferença de acabamento entre uma e outra salta aos olhos —
 * antes a apresentação era um cartão de vinho lapidado e a confirmação,
 * um disco no feltro.
 *
 * É AQUI que o rival do 1v1 ganha nome: a cena entra depois do acordo
 * fechado, quando o sigilo do pareamento já cumpriu o papel dele (ver
 * opponentIdentity.ts) — e é essa revelação que dá o clima de matchup à
 * cena. No torneio o nome nunca foi segredo: o chaveamento já o tinha
 * dito.
 */

/**
 * Tempos (s) de entrada de cada elemento dentro do splash — em ritmo
 * lento de apresentação: cada beat tem tempo de assentar antes do
 * próximo. O último beat + respiro cabem em TIMINGS.foundSplashMs.
 */
const BEATS = { kicker: 0, player: 0.35, vs: 1.15, opponent: 1.9 } as const;

const SPRING = { type: 'spring', stiffness: 220, damping: 22 } as const;

interface EntranceProps {
  name: string;
  accent: 'player' | 'opponent';
  fromX: number;
  delay: number;
  instant: boolean;
}

/**
 * A ENTRADA de um assento: ele voa da borda para o centro, levemente
 * torto, e assenta em mola. O assento em si é o da casa (DuelistSeat) —
 * aqui mora só o gesto.
 */
function SeatEntrance({ name, accent, fromX, delay, instant }: EntranceProps) {
  return (
    <motion.div
      initial={instant ? false : { x: fromX, opacity: 0, rotate: fromX < 0 ? -5 : 5 }}
      animate={{ x: 0, opacity: 1, rotate: 0 }}
      transition={instant ? { duration: 0 } : { ...SPRING, delay }}
    >
      <DuelistSeat name={name} accent={accent} />
    </motion.div>
  );
}

export function FoundSplash({ match }: FoundSplashProps) {
  const instant = useReducedMotion() ?? false;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6" role="status">
      <motion.p
        className="rounded-full bg-arena-900/75 px-4 py-1 text-xs font-black uppercase tracking-[0.3em] text-gold"
        initial={instant ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={instant ? { duration: 0 } : { delay: BEATS.kicker, duration: 0.45 }}
      >
        Partida confirmada
      </motion.p>

      {/* `items-start` + a altura do medalhão no VS: os dois retratos
          ficam na MESMA linha e o "VS" se centra contra eles, não contra
          a coluna inteira — o mesmo alinhamento da confirmação. */}
      <div className="flex w-full items-start justify-center gap-3">
        <SeatEntrance
          name="Você"
          accent="player"
          fromX={-90}
          delay={BEATS.player}
          instant={instant}
        />

        {/* Carimbo VS com anel de impacto */}
        <div className="relative grid h-20 place-items-center">
          <motion.span
            className="absolute h-20 w-20 rounded-full border-2 border-gold"
            initial={instant ? false : { scale: 0.3, opacity: 0 }}
            animate={instant ? { opacity: 0 } : { scale: 2.1, opacity: [0, 0.8, 0] }}
            transition={instant ? { duration: 0 } : { delay: BEATS.vs, duration: 0.8 }}
            aria-hidden="true"
          />
          <motion.span
            className="vs-mark text-[clamp(2.25rem,10vw,3rem)]"
            initial={instant ? false : { scale: 3, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            transition={
              instant
                ? { duration: 0 }
                : { delay: BEATS.vs, type: 'spring', stiffness: 340, damping: 18 }
            }
          >
            VS
          </motion.span>
        </div>

        <SeatEntrance
          name={match.opponent.name}
          accent="opponent"
          fromX={90}
          delay={BEATS.opponent}
          instant={instant}
        />
      </div>
    </div>
  );
}
