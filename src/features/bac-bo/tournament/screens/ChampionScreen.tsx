import { motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { AvatarBadge } from '../../components/AvatarBadge';
import { Confetti } from '../../components/Confetti';
import { audioManager } from '../../services/AudioManager';
import { placementOf } from '../bracket';
import { PODIUM_METALS } from '../podium';
import { tableStandingsOrder } from '../tableRules';
import {
  prizeFor,
  tablePrize,
  tournamentSelectors,
  useTournamentStore,
} from '../tournamentStore';
import type { TournamentPlayer } from '../types';
import { TABLE_TARGET_WINS } from '../types';

const PLACE_LABEL = ['1º', '2º', '3º'] as const;

/** Coroação do torneio: campeão, pódio premiado e retorno ao início. */
export function ChampionScreen() {
  const bracket = useTournamentStore((s) => s.bracket);
  const series = useTournamentStore((s) => s.tableSeries);
  const format = useTournamentStore((s) => s.format);
  const bracketChampion = useTournamentStore(tournamentSelectors.champion);
  const seriesChampion = useTournamentStore(tournamentSelectors.tableChampion);
  const placement = useTournamentStore(tournamentSelectors.placement);
  const entryFee = useTournamentStore((s) => s.entryFee);
  const size = useTournamentStore((s) => s.size);
  const leave = useTournamentStore((s) => s.leaveTournament);
  const reducedMotion = useReducedMotion() ?? false;

  const champion = format === 'table' ? seriesChampion : bracketChampion;
  const youWon = !!champion && champion.id === tournamentSelectors.youId;

  // A coroação do próprio jogador entra com a plateia de pé — uma vez
  // só, na montagem da tela.
  useEffect(() => {
    if (youWon) audioManager.playSfx('applause');
  }, [youWon]);

  /* MESA ÚNICA: não há pódio a montar — a mesa tem um campeão e o resto
     pagou para jogar. O quadro final é o PLACAR da série, na ordem das
     vitórias, com o que o campeão levou. */
  if (format === 'table') {
    if (!champion || !series) return null;
    const order = tableStandingsOrder(
      series.seats.map((seat) => seat.player.id),
      Object.fromEntries(series.seats.map((seat) => [seat.player.id, seat.wins])),
    );
    const prize = tablePrize(entryFee, size);

    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        {youWon && !reducedMotion && <Confetti count={72} />}
        <motion.p
          className="text-xs font-black uppercase tracking-[0.4em] text-copper"
          initial={reducedMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Royal VIP Club · Mesa única
        </motion.p>

        <motion.div
          className="my-5 grid place-items-center"
          initial={reducedMotion ? false : { scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 14, delay: 0.15 }}
        >
          <span className="champion-trophy" aria-hidden="true">
            <Icon name="trophy" size="1em" strokeWidth={1.5} />
          </span>
        </motion.div>

        <motion.h1
          className="font-display text-4xl font-bold tracking-wide text-gold [text-shadow:0_4px_20px_rgba(0,0,0,0.5)]"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {youWon ? 'A MESA É SUA!' : `${champion.name} FECHOU A MESA`}
        </motion.h1>

        {/* Placar da série: as rodadas que cada um venceu. */}
        <motion.ol
          className="podium"
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          data-testid="table-scoreboard"
        >
          {order.map((id, index) => {
            const seat = series.seats.find((s) => s.player.id === id);
            if (!seat) return null;
            const isYou = id === tournamentSelectors.youId;
            const isChampion = id === champion.id;
            return (
              <li
                key={id}
                className={`podium__row ${isChampion ? 'podium__row--gold' : ''} ${isYou ? 'podium__row--you' : ''}`}
              >
                <span className="podium__place">
                  {isChampion ? (
                    <Icon name="crown" size="0.95em" className="mr-1 inline align-[-0.15em]" />
                  ) : null}
                  {index + 1}º
                </span>
                <AvatarBadge name={seat.player.name} you={isYou} className="text-[0.95rem]" />
                <span className="podium__name">{seat.player.name}</span>
                <span className="podium__prize">
                  {seat.wins}/{TABLE_TARGET_WINS}
                  {isChampion ? ` · +${formatCredits(prize)}` : ''}
                </span>
              </li>
            );
          })}
        </motion.ol>

        <motion.p
          className="mt-4 text-sm font-bold text-lavender"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          data-testid="champion-prize"
        >
          {youWon ? (
            <>
              Você venceu {TABLE_TARGET_WINS} rodadas e levou{' '}
              <span className="font-black text-gold">{formatCredits(prize)} créditos</span>
            </>
          ) : (
            <>
              A mesa era de {formatCredits(prize)} — a taxa de{' '}
              <span className="font-black text-ivory">{formatCredits(entryFee)}</span> saiu do seu
              saldo
            </>
          )}
        </motion.p>

        <div className="action-stack mt-8">
          <Button onClick={leave} size="md" fullWidth data-testid="champion-home">
            VOLTAR AO INÍCIO
          </Button>
        </div>
      </main>
    );
  }

  if (!champion || !bracket) return null;

  // Pódio na ordem: campeão, vice e bronze — cada um com o que levou.
  const podium: (TournamentPlayer | null)[] = [1, 2, 3].map(
    (place) =>
      [...bracket.rounds.flat(), ...(bracket.thirdPlace ? [bracket.thirdPlace] : [])]
        .flatMap((m) => [m.a, m.b])
        .find((p) => p && placementOf(bracket, p.id) === place) ?? null,
  );

  const yourPrize = placement ? prizeFor(placement, entryFee, size) : 0;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      {/* A coroação é a maior vitória: rajada mais longa de confetes. */}
      {youWon && !reducedMotion && <Confetti count={72} />}
      <motion.p
        className="text-xs font-black uppercase tracking-[0.4em] text-copper"
        initial={reducedMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Royal VIP Club · Torneio
      </motion.p>

      <motion.div
        className="my-5 grid place-items-center"
        initial={reducedMotion ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 14, delay: 0.15 }}
      >
        <span className="champion-trophy" aria-hidden="true">
          <Icon name="trophy" size="1em" strokeWidth={1.5} />
        </span>
      </motion.div>

      <motion.h1
        className="font-display text-4xl font-bold tracking-wide text-gold [text-shadow:0_4px_20px_rgba(0,0,0,0.5)]"
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {youWon ? 'VOCÊ É O CAMPEÃO!' : `${champion.name} É O CAMPEÃO`}
      </motion.h1>

      {/* Pódio premiado: 50% / 30% / 20% do bolo dos derrotados. */}
      <motion.ol
        className="podium"
        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        data-testid="podium"
      >
        {podium.map((player, i) => {
          const place = i + 1;
          const you = player?.id === tournamentSelectors.youId;
          const { label, icon, metal } = PODIUM_METALS[i] ?? PODIUM_METALS[0];
          return (
            <li
              key={label}
              className={`podium__row podium__row--${metal} ${you ? 'podium__row--you' : ''}`}
            >
              <span className="podium__place">
                <Icon name={icon} size="0.95em" className="mr-1 inline align-[-0.15em]" />
                {label}
              </span>
              {player ? (
                <>
                  <AvatarBadge name={player.name} you={you} className="text-[0.95rem]" />
                  <span className="podium__name">{player.name}</span>
                </>
              ) : (
                <span className="podium__name">—</span>
              )}
              <span className="podium__prize">+{formatCredits(prizeFor(place, entryFee, size))}</span>
            </li>
          );
        })}
      </motion.ol>

      <motion.p
        className="mt-4 text-sm font-bold text-lavender"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        data-testid="champion-prize"
      >
        {placement && yourPrize > 0 ? (
          <>
            Você terminou em{' '}
            <span className="font-black text-gold">{PLACE_LABEL[placement - 1] ?? `${placement}º`}</span>{' '}
            e levou <span className="font-black text-gold">{formatCredits(yourPrize)} créditos</span>
          </>
        ) : placement ? (
          <>
            Você terminou em <span className="font-black text-ivory">{placement}º</span> — fora do
            pódio premiado
          </>
        ) : (
          <>Você não chegou ao pódio desta vez</>
        )}
      </motion.p>

      <div className="action-stack mt-8">
        <Button onClick={leave} size="md" fullWidth data-testid="champion-home">
          VOLTAR AO INÍCIO
        </Button>
      </div>
    </main>
  );
}
