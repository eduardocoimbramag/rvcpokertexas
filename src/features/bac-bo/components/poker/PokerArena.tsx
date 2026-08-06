import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { TABLE_ANTE } from '../../engine/credits';

import type { PokerResult, PokerRoundState, PokerSession } from '../../engine/poker/types';
import type { Card, Match } from '../../engine/types';
import type { ActionClock, GamePhase, MoveAnnounce, ShowPrompt } from '../../store/gameStore';
import { HANDOVER_SECONDS, useGameStore } from '../../store/gameStore';
import { OpponentProfileSheet } from '../OpponentProfileSheet';
import { ChipStack } from '../table/ChipStack';
import { SeatMedallion } from '../table/SeatMedallion';
import { BetControls } from './BetControls';
import { CommunityBoard } from './CommunityBoard';
import { MoveCall } from './MoveCall';
import { PokerSeat } from './PokerSeat';
import { ShowCardsPrompt } from './ShowCardsPrompt';
import { ShowdownClash } from './ShowdownClash';
import { WinnerPlate } from './WinnerPlate';
import { dealDelay } from './dealOrder';

export interface PokerArenaProps {
  phase: GamePhase;
  match: Match;
  /** Mão corrente (a mesa como você a vê); `null` antes da distribuição. */
  round: PokerRoundState | null;
  /** Resultado da mão; `null` até a engine fechar o pote. */
  result: PokerResult | null;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (to: number) => void;
  actionPending: boolean;
  /** Relógio da sua vez. */
  clock: ActionClock;
  /** O lance que a mesa está anunciando. */
  announce: MoveAnnounce | null;
  /** A mesa entre as mãos: stacks, botão e quantas mãos já correram. */
  session: PokerSession | null;
  /** O convite de abrir a mão a quem correu; `null` fora do beat. */
  showPrompt: ShowPrompt | null;
  /** Segundos até a mesa distribuir a próxima mão (fase `handover`). */
  handoverSeconds: number;
  /** Você abriu a mão para o rival neste pote. */
  cardsShown: boolean;
  onAnswerShowCards: (show: boolean) => void;
  /** Levanta da mesa e abre o caixa (só entre as mãos, da 2ª em diante). */
  onLeaveTable: () => void;
}

/**
 * A MESA DE TEXAS HOLD'EM 1v1 — o rival na cabeceira de cima, você na de
 * baixo e as cinco comunitárias no meio do feltro, que é onde a mão de
 * verdade se decide.
 *
 * A GEOMETRIA é a de uma mesa vista de cima, e cada peça está onde uma
 * mesa real a põe:
 *
 * - as duas FECHADAS de cada lado, na borda do respectivo assento;
 * - as cinco COMUNITÁRIAS no centro, em cinco lugares que existem desde
 *   o primeiro instante (ver CommunityBoard);
 * - o POTE logo acima delas, em fichas — o que já foi recolhido;
 * - as APOSTAS DA RUA soltas entre cada assento e o centro: o que foi
 *   empurrado e ainda não virou pote. A distinção não é decorativa; é o
 *   que deixa ler uma rua de olho nu.
 *
 * O SIGILO é o do poker, e é estrutural: as duas cartas do rival ficam
 * de bruços até o showdown, e a engine nem as manda para cá (ver
 * `LocalPokerEngine`). Uma mão levada por desistência fica MUCHADA — não
 * abre nunca, como em qualquer sala. O contrato é simétrico: ele decide
 * sem ver uma carta sua.
 *
 * Cada fase é uma cena:
 * - `dealing`: as quatro fechadas voam do baralho, os blinds na mesa.
 * - `betting`: as ruas correm; a barra de lances abre quando a palavra é
 *   sua e o relógio de 20 s corre em cima dela. A leitura da SUA mão
 *   ("DOIS PARES") acompanha do flop em diante.
 * - `settle`: showdown — as fechadas do rival viram e as cinco cartas
 *   que decidiram o pote acendem. Numa desistência, nada vira.
 * - `completed` (câmera frontal): o veredito migra para as placas que
 *   flanqueiam a crupiê, no padrão da casa.
 */
export function PokerArena({
  phase,
  match,
  round,
  result,
  onFold,
  onCheck,
  onCall,
  onRaise,
  actionPending,
  clock,
  announce,
  session,
  showPrompt,
  handoverSeconds,
  cardsShown,
  onAnswerShowCards,
  onLeaveTable,
}: PokerArenaProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);
  // Perfil do rival: estado LOCAL de UI, aberto pelo medalhão do
  // desfecho. Não toca no store nem na máquina de estados.
  const [profileOpen, setProfileOpen] = useState(false);

  const dealing = phase === 'dealing';
  const handover = phase === 'handover';
  const revealed = phase === 'settle' || handover;

  /* ---- Fase completed: a MESA FECHOU. A câmera volta ao frontal, a
     crupiê entra no quadro e o caixa é feito (ver SessionBanner). Aqui a
     mão já não interessa — o que se lê é a sessão inteira. ---- */
  if (phase === 'completed') {
    if (scenery === 'off') return null;
    return (
      <>
        <SeatMedallion side="player" name="Você" instant={reducedMotion} />
        <SeatMedallion
          side="opponent"
          name={match.opponent.name}
          instant={reducedMotion}
          onOpenProfile={() => setProfileOpen(true)}
        />
        <OpponentProfileSheet
          open={profileOpen}
          opponent={match.opponent}
          onClose={() => setProfileOpen(false)}
        />
      </>
    );
  }

  if (!round) return null;

  /* As cartas do rival: de bruços (dois `null`) enquanto a mão corre, e
     as duas de verdade só quando a engine as entrega — o que ela só faz
     no showdown. A fase manda, não a chegada dos dados: um estado que já
     traga a mão aberta continua coberto até a mesa mandar virar. */
  const opponentCards: readonly (Card | null)[] =
    revealed && round.opponentHole.length === 2 ? round.opponentHole : [null, null];

  /* As cartas que formaram a mão de quem levou o pote acendem no fim.
     Num empate as duas leituras são a mesma mão. */
  const highlight = revealed ? winningCards(result) : undefined;

  // A vez só existe depois da distribuição: enquanto as cartas voam, a
  // mesa não anuncia de quem é a palavra — ninguém tem palavra ainda.
  const betting = phase === 'betting';
  /* A barra de lances entra JUNTO com o relógio dela, não antes: entre a
     mesa voltar da engine e o beat do anúncio vencer, a palavra já é sua
     e a janela ainda não abriu (ver ActionClock.open). */
  const yourTurn =
    betting && clock.open && round.toAct === 'player' && round.legalActions.length > 0;
  const waiting = betting && round.toAct === 'opponent';

  /* A PORTA DA SESSÃO abre a partir da segunda mão. Na primeira ela está
     em cena e apagada: quem senta descobre que a saída existe antes de
     precisar dela, e descobre junto que ainda não é hora. */
  const canLeave = (session?.handsPlayed ?? 0) >= 1 && !(session?.over ?? false);

  return (
    <div
      className={`poker-arena ${scenery !== 'off' ? 'poker-arena--felt' : ''}`}
      data-testid="poker-arena"
    >
      {/* ---- O EMBATE do fim da mão, por cima do feltro ----
          Ele roda em TODA mão que chega ao fim, inclusive a levada por
          desistência: ver o que o rival tinha quando largou é a única
          leitura que este duelo dá dele. */}
      {phase === 'settle' && result && (
        <ShowdownClash result={result} opponentName={match.opponent.name} instant={reducedMotion} />
      )}

      {/* ---- O BEAT ENTRE AS MÃOS ----
          A placa de quem levou o pote fica por cima do feltro enquanto as
          fichas assentam nos montantes, e a mesa distribui de novo logo
          depois. Ela mora AQUI, e não numa tela à parte, porque a sessão
          não para: sair da mesa para ler um veredito e voltar quebraria
          a única coisa que uma sessão tem de diferente de uma mão. */}
      <AnimatePresence>
        {handover && result && !showPrompt && (
          <WinnerPlate
            key={result.id}
            result={result}
            opponentName={match.opponent.name}
            instant={reducedMotion}
          />
        )}
      </AnimatePresence>

      {/* ---- O convite de abrir a mão a quem correu ---- */}
      <AnimatePresence>
        {handover && showPrompt && (
          <ShowCardsPrompt
            prompt={showPrompt}
            opponentName={match.opponent.name}
            onAnswer={onAnswerShowCards}
            instant={reducedMotion}
          />
        )}
      </AnimatePresence>

      {/* ---- O rival, na cabeceira de cima ---- */}
      <PokerSeat
        side="opponent"
        name={match.opponent.name}
        cards={opponentCards}
        stack={round.stacks.opponent}
        committed={round.committed.opponent}
        button={round.button === 'opponent'}
        toAct={waiting}
        allIn={round.stacks.opponent === 0 && !revealed}
        highlight={highlight}
        dealDelayFor={(index) => dealDelay('opponent', index, dealing)}
        instant={reducedMotion}
      />

      {/* ---- O centro do feltro: pote, mesa e o que a mesa fala ---- */}
      <div className="poker-center">
        <div className="poker-center__pot">
          {/* O pote SOBREVIVE à mão inteira e não é remontado quando o
              valor muda: as fichas que já estão na mesa ficam onde estão
              e só as novas caem nelas. Sem `key`, portanto — de propósito. */}
          <div className="poker-pot" data-testid="pot">
            <ChipStack stake={round.pot} variant="felt" instant={reducedMotion} />
            <span className="poker-pot__value" data-testid="pot-value">
              <Icon name="chip" size="0.9em" /> {formatCredits(round.pot)}
            </span>
          </div>
        </div>

        <CommunityBoard cards={round.board} highlight={highlight} instant={reducedMotion} />

        <AnimatePresence mode="wait">
          {announce && (
            <MoveCall move={announce} opponentName={match.opponent.name} instant={reducedMotion} />
          )}
        </AnimatePresence>
      </div>

      {/* ---- A sua mão, na cabeceira de baixo ---- */}
      <PokerSeat
        side="player"
        name="Você"
        cards={round.playerHole}
        stack={round.stacks.player}
        committed={round.committed.player}
        button={round.button === 'player'}
        toAct={yourTurn}
        shown={cardsShown}
        allIn={round.stacks.player === 0 && !revealed}
        reading={round.playerHandLabel}
        highlight={highlight}
        dealDelayFor={(index) => dealDelay('player', index, dealing)}
        instant={reducedMotion}
      />

      {/* ---- Rodapé da vez ----
          O slot tem altura reservada em TODAS as fases: a barra entra e
          sai sem que a mesa suba e desça junto. */}
      <div className="arena-actions">
        {phase === 'dealing' && (
          <p className="table-note" data-testid="ante-note">
            Entrada {formatCredits(TABLE_ANTE)} · mesa {formatCredits(match.stake)}
          </p>
        )}

        {/* O INTERVALO ENTRE AS MÃOS: um relógio de 10 s correndo e a
            porta aberta ao lado dele. Zerado, a mesa distribui sozinha —
            uma sessão que exigisse um toque a cada mão para continuar
            seria uma sessão que se joga com o dedo, não com a cabeça.
            O relógio é o que transforma a saída numa escolha de verdade:
            sem ele, sair dependeria de acertar um beat. */}
        {handover && !showPrompt && session && !session.over && (
          <motion.div
            className="action-stack action-stack--wide"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
          >
            <HandoverClock seconds={handoverSeconds} instant={reducedMotion} />
            {/* No INTERVALO a porta é a única decisão que existe, e por
                isso ela ocupa a barra inteira. Espremida num quarto da
                fileira, ela dividia espaço com três lugares vazios — e um
                botão pequeno cercado de nada não lê como a única coisa a
                fazer, lê como sobra. */}
            <Button
              variant="danger"
              size="md"
              fullWidth
              onClick={onLeaveTable}
              disabled={!canLeave}
              title={canLeave ? 'Levantar da mesa' : 'Disponível a partir da 2ª mão'}
              data-testid="leave-table"
            >
              <Icon name="close" /> LEVANTAR DA MESA
            </Button>
          </motion.div>
        )}
        {waiting && (
          <motion.p
            className="turn-wait"
            data-testid="turn-wait"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
          >
            <span className="turn-wait__dot" aria-hidden="true" />
            Vez de {match.opponent.name}
          </motion.p>
        )}
        {yourTurn && (
          <motion.div
            className="action-stack action-stack--wide"
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
          >
            <BetControls
              round={round}
              seconds={clock.seconds}
              pending={actionPending}
              onFold={onFold}
              onCheck={onCheck}
              onCall={onCall}
              onRaise={onRaise}
              canLeave={canLeave}
              onLeave={onLeaveTable}
              instant={reducedMotion}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/**
 * O RELÓGIO DO INTERVALO — os segundos até a mesa distribuir de novo.
 *
 * Ele é a mesma barra do relógio da vez, e de propósito: a linguagem do
 * tempo na mesa é uma só. O que muda é o que ela promete — ali a mesa
 * joga por você, aqui ela só continua.
 */
function HandoverClock({ seconds, instant }: { seconds: number; instant: boolean }) {
  const progress = Math.max(0, Math.min(1, seconds / HANDOVER_SECONDS));
  return (
    <div className="handover-clock" data-testid="handover-clock">
      <span className="handover-clock__track" aria-hidden="true">
        <motion.span
          className="handover-clock__bar"
          initial={false}
          animate={{ scaleX: progress }}
          transition={instant ? { duration: 0 } : { duration: 1, ease: 'linear' }}
        />
      </span>
      <span className="handover-clock__label">Próxima mão em {seconds}s</span>
    </div>
  );
}

/** As cartas de quem levou o pote — as que acendem no fim da mão. */
function winningCards(result: PokerResult | null): readonly Card[] | undefined {
  if (!result) return undefined;
  if (result.outcome === 'lose') return result.opponentRank.cards;
  // Vitória e empate acendem a sua mão; no empate as duas são a mesma.
  return result.playerRank.cards;
}
