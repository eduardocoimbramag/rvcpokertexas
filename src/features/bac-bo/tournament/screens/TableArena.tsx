import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { AvatarBadge } from '../../components/AvatarBadge';
import { HudPill } from '../../components/HudPill';
import { HandRow } from '../../components/table/HandRow';
import { HandTotal } from '../../components/table/HandTotal';
import { povHand } from '../../components/table/pov';
import { TIMINGS } from '../../animations/timings';
import { isNaturalBlackjack } from '../../engine/rules';
import { TURN_SECONDS } from '../../store/gameStore';
import { laneSlices } from '../tableLayout';
import type { TableSeatHand } from '../tableRound';
import type { TableSeriesSeat } from '../tournamentStore';
import { TABLE_TARGET_WINS } from '../types';

/**
 * A MESA ÚNICA do torneio: de 3 a 6 jogadores no mesmo feltro.
 *
 * A geometria é assimétrica de propósito, e é o que o diretor pediu: as
 * SUAS cartas ficam em tamanho cheio na cabeceira de baixo (é a sua mão,
 * a que você precisa ler para decidir), e os rivais ocupam a metade de
 * cima em assentos compactos — carta mini, placa miúda, total miúdo. Uma
 * mesa real também é assim: você vê a sua mão de perto e as dos outros
 * de longe.
 *
 * Os assentos de rival se distribuem em fileiras que CENTRAM (flex-wrap
 * com base calculada), no máximo três por fileira: 2 rivais → uma
 * fileira de 2; 3 → uma de 3; 4 → duas de 2; 5 → 3 + 2. Nada de
 * posicionamento absoluto — em tela baixa as fileiras encolhem junto,
 * sem sobrepor nem estourar o viewport.
 *
 * A REGRA DE POV vale para todos: de cada rival você vê a mão MENOS a
 * última carta. No showdown todas viram de uma vez.
 */

export interface TableArenaProps {
  /** Assentos da série, na ordem da mesa (com o contador de vitórias). */
  seats: readonly TableSeriesSeat[];
  /** Mãos da rodada corrente; vazio antes da distribuição. */
  hands: readonly TableSeatHand[];
  /** Quem está jogando esta rodada (os de fora assistem). */
  playingIds: readonly string[];
  /** Id do jogador local. */
  youId: string;
  /** As ocultas já viraram (showdown). */
  revealed: boolean;
  /** Ids que venceram a rodada revelada — ganham a coroa no assento. */
  winnerIds: readonly string[];
  /** A rodada corrente é de desempate. */
  tiebreak: boolean;
  /** Você ainda tem escolha a fazer nesta vez. */
  yourTurn: boolean;
  /** Rivais que já bateram o martelo desta vez. */
  readyIds: readonly string[];
  /** Segundos no relógio da vez. */
  seconds: number;
  /** Ações travadas na engine (botões apagados). */
  actionPending: boolean;
  onHit: () => void;
  onStand: () => void;
}

/** O contador da série: três pastilhas que acendem a cada rodada ganha. */
function WinPips({ wins, testid }: { wins: number; testid?: string }) {
  return (
    <span
      className="win-pips"
      data-testid={testid}
      // role="img": as pastilhas são decorativas, então o contador só
      // existe para o leitor de tela através deste rótulo — e um
      // aria-label num span sem papel seria descartado.
      role="img"
      aria-label={`${wins} de ${TABLE_TARGET_WINS} rodadas vencidas`}
    >
      {Array.from({ length: TABLE_TARGET_WINS }, (_, i) => (
        <span key={i} className={`win-pip ${i < wins ? 'win-pip--on' : ''}`} aria-hidden="true" />
      ))}
    </span>
  );
}

interface RivalSeatProps {
  seat: TableSeriesSeat;
  hand: TableSeatHand | undefined;
  spectator: boolean;
  revealed: boolean;
  winner: boolean;
  ready: boolean;
  choosing: boolean;
}

/**
 * Assento de rival: medalhão, nome, contador da série e a mão em cartas
 * mini. Quem está fora da rodada (desempate alheio) aparece apagado, com
 * o selo de quem assiste — está na mesa, mas não nesta mão.
 */
function RivalSeat({
  seat,
  hand,
  spectator,
  revealed,
  winner,
  ready,
  choosing,
}: RivalSeatProps) {
  const cards = hand?.cards ?? [];
  /* POV: tudo menos a última carta. O corte vale até no showdown — quem
     revela é a fase, não a chegada das cartas. É o MESMO `povHand` do
     duelo (ver components/table/pov): a regra é uma só. */
  const pov = povHand(cards, revealed);

  return (
    <div
      className={`rival-seat ${spectator ? 'rival-seat--out' : ''} ${winner ? 'rival-seat--winner' : ''} ${choosing && !ready ? 'is-turn' : ''}`}
      data-testid={`table-seat-${seat.player.id}`}
      data-spectator={spectator}
    >
      <HudPill
        variant="seat"
        leading={<AvatarBadge name={seat.player.name} />}
        trailing={
          winner && (
            <span className="rival-seat__crown" aria-label="Venceu a rodada">
              <Icon name="crown" size={10} strokeWidth={2.4} />
            </span>
          )
        }
      >
        {seat.player.name}
      </HudPill>

      <WinPips wins={seat.wins} testid={`table-wins-${seat.player.id}`} />

      {spectator ? (
        <span className="rival-seat__out" data-testid={`table-out-${seat.player.id}`}>
          Assiste
        </span>
      ) : cards.length > 0 ? (
        <>
          {/* Casa de aposta do assento: o disco gravado no feltro onde a
              mão dele assenta — é o que faz a fileira ler como cadeira
              em volta da mesa, e não como linha de placar. */}
          <span className="rival-seat__spot" aria-hidden="true" />
          <HandRow
            cards={pov.shown}
            cardSize="var(--card-mini)"
            mini
            align="end"
            faceDownAt={(index) => !revealed && index === pov.shown.length - 1}
            labelPrefix={`Carta de ${seat.player.name}`}
            testid={`table-hand-${seat.player.id}`}
          />
          <div className="rival-seat__foot">
            <HandTotal
              variant="seat"
              cards={pov.counted}
              partial={!revealed}
              compact
              testid={`table-total-${seat.player.id}`}
            />
            {!revealed && (
              <span className={`rival-seat__state ${ready ? 'is-ready' : ''}`}>
                {hand?.closed ? 'Parou' : ready ? 'Pronto' : 'Escolhendo'}
              </span>
            )}
          </div>
        </>
      ) : (
        <span className="rival-seat__out">Aguardando</span>
      )}
    </div>
  );
}

export function TableArena({
  seats,
  hands,
  playingIds,
  youId,
  revealed,
  winnerIds,
  tiebreak,
  yourTurn,
  readyIds,
  seconds,
  actionPending,
  onHit,
  onStand,
}: TableArenaProps) {
  const reduced = useReducedMotion() ?? false;
  const handOf = (id: string) => hands.find((h) => h.playerId === id);

  const rivals = seats.filter((seat) => seat.player.id !== youId);
  const yourSeat = seats.find((seat) => seat.player.id === youId);
  const yourHand = yourSeat ? handOf(youId) : undefined;
  const youPlaying = playingIds.includes(youId);
  const yourCards = yourHand?.cards ?? [];

  /* FAIXAS de assentos: a mesa é lida em profundidade, não em grade —
     ver ../tableLayout. A primeira faixa é a de FRENTE para você (mais
     funda, cartas menores) e a última encosta na sua mão. */
  const lanes = laneSlices(rivals.length);

  const dealDelay = (index: number) => (revealed ? 0 : index * TIMINGS.dealCardMs * 0.5);

  return (
    <div className="table-arena" data-seats={seats.length}>
      {/* ---- Os rivais, em faixas de profundidade ---- */}
      <div className="table-arena__rivals" data-testid="table-rivals">
        {lanes.map(({ start, count }, lane) => {
          const slice = rivals.slice(start, start + count);
          return (
            <div
              key={lane}
              className="table-lane"
              // A faixa mais funda tem a carta menor: perspectiva por
              // tamanho, sem rotação nenhuma (girar custaria 40% de
              // altura de bloco e é o que estouraria a tela).
              style={
                {
                  '--lane-cols': slice.length,
                  '--lane-depth': lanes.length - 1 - lane,
                } as CSSProperties
              }
              data-lane={lane}
            >
              {slice.map((seat) => (
                <RivalSeat
                  key={seat.player.id}
                  seat={seat}
                  hand={handOf(seat.player.id)}
                  spectator={!playingIds.includes(seat.player.id)}
                  revealed={revealed}
                  winner={revealed && winnerIds.includes(seat.player.id)}
                  ready={readyIds.includes(seat.player.id) || !!handOf(seat.player.id)?.closed}
                  choosing={!revealed && hands.length > 0}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* ---- A sua mão, na cabeceira de baixo, em tamanho cheio ---- */}
      {yourSeat && (
        <section className="table-arena__you" aria-label="Sua mão" data-testid="table-your-hand">
          {youPlaying && yourCards.length > 0 ? (
            <>
              <div className="table-arena__you-score">
                <HandTotal variant="seat" cards={yourCards} partial={false} testid="table-total-you" />
              </div>
              <HandRow
                cards={yourCards}
                cardSize="var(--card-w)"
                align="end"
                delayFor={dealDelay}
                ablaze={isNaturalBlackjack(yourCards)}
                labelPrefix="Sua carta"
                testid="table-hand-you"
              />
            </>
          ) : (
            <p className="table-arena__spectator" data-testid="table-you-spectating">
              <Icon name="users" size="1em" />{' '}
              {tiebreak ? 'Desempate entre os líderes — você assiste' : 'Aguardando a mesa'}
            </p>
          )}

          <div className={`nameplate nameplate--player ${yourTurn ? 'is-turn' : ''}`}>
            <span className="nameplate__dot" aria-hidden="true" />
            <span className="nameplate__name">Você</span>
            <WinPips wins={yourSeat.wins} testid="table-wins-you" />
          </div>
        </section>
      )}

      {/* ---- Rodapé da vez: relógio + PEDIR/PARAR (só quando é sua) ---- */}
      <div className="arena-actions">
        <AnimatePresence>
          {yourTurn && (
            <motion.div
              className="action-stack"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
              transition={reduced ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
            >
              <div
                className={`turn-clock ${seconds <= 5 ? 'is-urgent' : ''}`}
                role="timer"
                data-testid="table-clock"
                aria-label={`${seconds} segundos para escolher`}
              >
                <span className="turn-clock__track">
                  <span
                    className="turn-clock__fill"
                    style={{
                      width: `${Math.max(0, Math.min(1, seconds / TURN_SECONDS)) * 100}%`,
                    }}
                  />
                </span>
                <span className="turn-clock__value">{seconds}s</span>
              </div>
              <div className="flex w-full gap-3">
                <Button
                  onClick={onHit}
                  disabled={actionPending}
                  size="md"
                  fullWidth
                  data-testid="table-hit"
                >
                  <Icon name="plus" /> PEDIR CARTA
                </Button>
                <Button
                  variant="secondary"
                  onClick={onStand}
                  disabled={actionPending}
                  size="md"
                  fullWidth
                  data-testid="table-stand"
                >
                  <Icon name="check" /> PARAR
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
