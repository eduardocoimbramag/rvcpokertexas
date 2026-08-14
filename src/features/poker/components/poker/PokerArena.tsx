import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import type { PokerResult, PokerRoundState, PokerSession } from '../../engine/poker/types';
import type { Card, Match } from '../../engine/types';
import type { ActionClock, GamePhase, MoveAnnounce, ShowPrompt } from '../../store/gameStore';
import { useGameStore } from '../../store/gameStore';
import { OpponentProfileSheet } from '../OpponentProfileSheet';
import { ChipStack } from '../table/ChipStack';
import { SeatMedallion } from '../table/SeatMedallion';
import { BetControls } from './BetControls';
import { CommunityBoard } from './CommunityBoard';
import { HandoverClock } from './HandoverClock';
import { LeaveTablePrompt } from './LeaveTablePrompt';
import { MoveCall } from './MoveCall';
import { PokerSeat } from './PokerSeat';
import { ShowCardsPrompt } from './ShowCardsPrompt';
import { ShowdownClash } from './ShowdownClash';
import { TableVeil } from './TableVeil';
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
  /**
   * De quantos segundos era ESTE intervalo. Não é constante: uma mão
   * morta por desistência tem intervalo pela metade. A barra do relógio
   * se mede por ele — com um total fixo ela nasceria pela metade.
   */
  handoverTotal: number;
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
 * - o POTE logo acima delas, em fichas. Ele é a ÚNICA cifra de dinheiro
 *   no meio do feltro: o que cada lado empurrou nesta rua não ganha
 *   plaquinha própria ao lado do assento — sai do montante e entra no
 *   pote, e é no montante e no pote que se lê.
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
  handoverTotal,
  cardsShown,
  onAnswerShowCards,
  onLeaveTable,
}: PokerArenaProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);
  // Perfil do rival: estado LOCAL de UI, aberto pelo medalhão do
  // desfecho. Não toca no store nem na máquina de estados.
  const [profileOpen, setProfileOpen] = useState(false);
  /* Levantar no meio de uma mão pede confirmação (ver LeaveTablePrompt).
     Estado LOCAL: é uma pergunta de interface, e a máquina de estados do
     jogo não tem — nem deve ter — uma fase "quase levantando". */
  const [leaveAsk, setLeaveAsk] = useState(false);

  /* A vez só existe depois da distribuição: enquanto as cartas voam, a
     mesa não anuncia de quem é a palavra — ninguém tem palavra ainda.
     A barra de lances entra JUNTO com o relógio dela, não antes: entre a
     mesa voltar da engine e o beat do anúncio vencer, a palavra já é sua
     e a janela ainda não abriu (ver ActionClock.open).

     Vive ACIMA dos retornos antecipados porque o efeito abaixo depende
     dela, e hook não pode nascer depois de um `return`. */
  const yourTurn =
    phase === 'betting' && clock.open && round?.toAct === 'player' && round.legalActions.length > 0;

  /* A vez passou com a confirmação de levantar aberta — o relógio venceu
     e a mesa jogou por você, ou o lance saiu por outro caminho. A
     pergunta morre com a vez que a motivou: deixá-la marcada faria ela
     ressurgir sozinha na rua seguinte, sobre uma mesa que já é outra.

     O ajuste é feito em RENDER, e não num efeito. É o padrão do React
     para estado que depende de prop: aqui ele descarta o render em curso
     e refaz na hora, sem pintar o quadro errado uma vez antes de
     corrigi-lo — que é exatamente o que um `useEffect` faria. */
  if (leaveAsk && !yourTurn) setLeaveAsk(false);

  const dealing = phase === 'dealing';
  const handover = phase === 'handover';
  /* A MESA CONGELA ENQUANTO O CONVITE DE MOSTRAR AS CARTAS ESTÁ NO AR.
     A fase já é `settle`, mas nada do desfecho entrou: as fechadas do
     rival continuam de bruços e o embate espera. É essa pausa que faz a
     pergunta valer alguma coisa — respondê-la com as cartas já viradas na
     tela seria escolher uma porta aberta. */
  const settling = phase === 'settle' && !showPrompt;
  const revealed = settling || handover;

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

  const waiting = phase === 'betting' && round.toAct === 'opponent';

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
          leitura que este duelo dá dele. Numa desistência ele espera a
          resposta do convite (`settling`) — o desfecho é a resposta à
          pergunta, e não pode entrar antes dela. */}
      {settling && result && (
        <ShowdownClash
          result={result}
          opponentName={match.opponent.name}
          cardsShown={cardsShown}
          instant={reducedMotion}
        />
      )}

      {/* ---- O BEAT ENTRE AS MÃOS ----
          A placa de quem levou o pote fica por cima do feltro enquanto as
          fichas assentam nos montantes, e a mesa distribui de novo logo
          depois. Ela mora AQUI, e não numa tela à parte, porque a sessão
          não para: sair da mesa para ler um veredito e voltar quebraria
          a única coisa que uma sessão tem de diferente de uma mão. */}
      {/* O VÉU E A PLACA entram e saem JUNTOS, na mesma `AnimatePresence`:
          o desfoque é a moldura da notícia, e uma moldura que sobrevivesse
          meio segundo à peça que emoldura ficaria em cena sem motivo. */}
      <AnimatePresence>
        {handover && result && <TableVeil key="veil" instant={reducedMotion} />}
        {handover && result && (
          <WinnerPlate
            key={result.id}
            result={result}
            opponentName={match.opponent.name}
            cardsShown={cardsShown}
            instant={reducedMotion}
          />
        )}
      </AnimatePresence>

      {/* ---- O convite de abrir a mão a quem correu ----
          Ele entra no INSTANTE da desistência, com a mesa parada, e é a
          primeira coisa que acontece depois dela. */}
      <AnimatePresence>
        {showPrompt && (
          <ShowCardsPrompt
            prompt={showPrompt}
            opponentName={match.opponent.name}
            onAnswer={onAnswerShowCards}
            instant={reducedMotion}
          />
        )}
      </AnimatePresence>

      {/* ---- A confirmação de levantar com a mão viva ---- */}
      <AnimatePresence>
        {leaveAsk && yourTurn && (
          <LeaveTablePrompt
            committed={round.committed.player}
            pot={round.pot}
            stack={round.stacks.player}
            opponentName={match.opponent.name}
            onConfirm={() => {
              setLeaveAsk(false);
              onLeaveTable();
            }}
            onCancel={() => setLeaveAsk(false)}
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
        button={round.button === 'opponent'}
        toAct={waiting}
        allIn={round.stacks.opponent === 0 && !revealed}
        highlight={highlight}
        dealDelayFor={(index) => dealDelay('opponent', index, dealing)}
        /* A PLACA DO RIVAL ABRE O PERFIL DELE. É a mesma porta que o
           medalhão do desfecho já oferecia, e ela passou a existir
           DURANTE a mão — que é quando se quer saber com quem se está
           jogando, e não depois de a mão ter acabado.
           A SUA placa não recebe a porta: um perfil de si mesmo aberto
           por engano no meio de uma decisão cronometrada é só um toque
           perdido. */
        onOpenProfile={() => setProfileOpen(true)}
        instant={reducedMotion}
      />

      <OpponentProfileSheet
        open={profileOpen}
        opponent={match.opponent}
        onClose={() => setProfileOpen(false)}
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
        {/* Na DISTRIBUIÇÃO o rodapé fica vazio, e é de propósito. Ele já
            trouxe "Entrada 100 · mesa 5.000" enquanto as cartas voavam:
            um aviso que repetia, a cada mão, dois números que não mudam
            nunca — a entrada desta mesa é fixa e o valor da mesa foi
            travado quando você sentou. Repetir o que não muda é ruído, e
            ruído numa cena de 2,8 s é ruído em cima da única coisa que
            importa ali, que são as cartas saindo do baralho. Quem precisa
            do número o tem no pote, que nasce com as duas entradas
            dentro. */}

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
            <HandoverClock
              seconds={handoverSeconds}
              total={handoverTotal}
              instant={reducedMotion}
            />
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
              /* No MEIO da mão o botão PERGUNTA antes; no intervalo entre
                 as mãos ele age direto (ver o LEVANTAR DA MESA acima), e é
                 a diferença certa: ali não há mão a correr nem pote a
                 entregar, então não há o que confirmar. */
              onLeave={() => setLeaveAsk(true)}
              instant={reducedMotion}
            />
          </motion.div>
        )}
      </div>
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
