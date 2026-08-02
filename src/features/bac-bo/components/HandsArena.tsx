import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { TIMINGS } from '../animations/timings';
import { isNaturalBlackjack } from '../engine/rules';
import type {
  BlackjackRoundState,
  Card,
  Duelist,
  Match,
  RoundResult,
  TableMove,
} from '../engine/types';
import type { DoubleBetState, GamePhase, TurnClock, TurnReveal } from '../store/gameStore';
import { TURN_SECONDS, useGameStore } from '../store/gameStore';
import { BlazeBurst } from './table/BlazeBurst';
import { ChipStack } from './table/ChipStack';
import { HandRow } from './table/HandRow';
import { HandTotal } from './table/HandTotal';
import { povHand } from './table/pov';

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
  /** Abre o pedido de dobra da aposta. Ausente (torneio, onde o valor é
      a taxa de entrada) tira o botão DOBRAR da mesa. */
  onRequestDouble?: () => void;
  /** Pedido de dobra em curso — a nuvem virada para o rival. */
  doubleBet?: DoubleBetState | null;
  /** A dobra está ao alcance agora (saldo cobre e ninguém pediu ainda). */
  canRequestDouble?: boolean;
  /** Os dois lances da vez que acabou de fechar, revelados juntos. */
  reveal?: TurnReveal | null;
  /** Relógio da vez e o martelo do rival. */
  turn?: TurnClock;
}

/**
 * A mesa do duelo de 21: o rival na cabeceira de cima, você na de baixo
 * e o brasão respirando na faixa livre entre as duas mãos. Não há casa
 * para bater — é mão contra mão.
 *
 * A MESA É ESPELHADA em torno do brasão: as duas mãos ficam à mesma
 * distância das bordas do feltro, as cartas deitam uma ao lado da outra
 * (nada de leque: a mesa mostra tudo o que está aberto) e cada total
 * fica do lado de DENTRO da sua mão, apontado para o centro — o do
 * rival embaixo das cartas dele, o seu em cima das suas.
 *
 * A REGRA DE POV manda na cena: cada duelista vê a mão do outro menos a
 * ÚLTIMA carta dela. Então o rival sempre tem uma carta virada para
 * baixo, e cada carta nova que ele pede empurra a anterior para cima —
 * a informação chega em conta-gotas, e a última só abre no showdown.
 *
 * A VEZ é SIMULTÂNEA: os dois escolhem ao mesmo tempo, com 20 s no
 * relógio, cada um sem saber o que o outro vai fazer. A placa de nome
 * acende enquanto o lado ainda pensa e apaga quando ele bate o martelo;
 * fechada a vez, os DOIS lances são revelados juntos na faixa livre.
 * Quem não escolher a tempo tem a mão parada pela mesa.
 *
 * Cada fase é uma cena:
 * - `dealing`: as quatro cartas voam do baralho em fila (som no
 *   assentamento de cada uma — o Card3D cuida do próprio beat).
 * - `turn`: o relógio corre e a barra PEDIR/PARAR abre; o total da sua
 *   mão acompanha ao vivo (soft mostra as duas leituras, "7/17") e o do
 *   rival mostra só o que está aberto — quem lembra que falta carta é a
 *   carta virada na mesa dele, não um sinal colado no número.
 * - `settle`: showdown — as ocultas viram e os totais finais aparecem.
 * - `completed` (câmera frontal): o placar migra para as placas que
 *   flanqueiam a crupiê; com cenário desligado ele fica na faixa.
 */

/** Ordem de entrada das cartas na distribuição (jogador, rival, ...). */
const DEAL_SLOT = {
  player: [0, 2],
  opponent: [1, 3],
} as const;

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
function verdictOf(bust: boolean, natural: boolean): { label: string; tone: string } {
  if (bust) return { label: 'ESTOUROU', tone: 'bust' };
  if (natural) return { label: 'BLACKJACK!', tone: 'natural' };
  return { label: 'PAROU', tone: 'stand' };
}

interface NameplateProps {
  side: Duelist;
  name: string;
  /** Este lado ainda tem de bater o martelo: a placa acende e respira. */
  active: boolean;
  /** Situação na mesma linha: "escolhendo…", "pronto" ou o veredito. */
  status: { label: string; tone: string } | null;
}

/**
 * Placa de nome, na borda EXTERNA de cada mão (a de baixo é sua, a de
 * cima é do rival) — o lado de dentro é do total, que aponta para o
 * centro da mesa.
 *
 * A placa é também o painel de estado do duelista: acesa em ouro, com o
 * ponto respirando, enquanto ele ainda pensa; apagada quando bate o
 * martelo. O que ele ESCOLHEU nunca aparece aqui — só que já escolheu.
 * No showdown a mesma linha recebe o veredito. Altura fixa, então nada
 * disso empurra as cartas do lugar.
 */
function Nameplate({ side, name, active, status }: NameplateProps) {
  return (
    <div
      className={`nameplate nameplate--${side} ${active ? 'is-turn' : ''}`}
      data-testid={`nameplate-${side}`}
    >
      <span className="nameplate__dot" aria-hidden="true" />
      <span className="nameplate__name">{name}</span>
      {status && (
        <span
          className={`nameplate__verdict nameplate__verdict--${status.tone}`}
          data-testid={status.tone === 'ready' ? `status-${side}` : `verdict-${side}`}
        >
          {status.label}
        </span>
      )}
    </div>
  );
}

/**
 * Leitura de um lance já executado.
 *
 * O estouro do RIVAL não se anuncia: a mão dele tem uma carta virada, e
 * dizer que ele passou de 21 entregaria de graça o que só o showdown
 * pode contar — o duelo acabaria ali, com você sabendo que basta não
 * estourar. O que a mesa anuncia dele é o gesto público (pediu carta ou
 * parou); o resto vira no fim da rodada, com as cartas.
 *
 * O seu estouro é outra história: as suas cartas estão todas abertas na
 * sua frente, e esconder de você o que você já pode contar seria só
 * ruído.
 */
function moveLabel(move: TableMove): string {
  if (move.by === 'player' && move.bust) return 'ESTOUROU';
  // Relógio zerado NÃO ganha rótulo próprio: a mesa parou a mão, e o que
  // aconteceu na mesa foi exatamente isso — "PAROU". Anunciar o motivo
  // ("tempo") é ruído; o jogador viu o relógio zerar.
  return move.action === 'hit' ? 'PEDIU CARTA' : 'PAROU';
}

/**
 * A revelação da vez na faixa livre: os DOIS lances de uma vez, um por
 * linha. É o momento de tensão do duelo — ninguém sabia o que o outro
 * tinha escolhido até esta caixa abrir.
 */
function TurnCall({
  reveal,
  opponentName,
  instant,
}: {
  reveal: TurnReveal;
  opponentName: string;
  instant: boolean;
}) {
  const rows: { who: string; move: TableMove; side: Duelist }[] = [];
  if (reveal.player) rows.push({ who: 'Você', move: reveal.player, side: 'player' });
  if (reveal.opponent) rows.push({ who: opponentName, move: reveal.opponent, side: 'opponent' });

  return (
    <motion.div
      key={reveal.id}
      className="turn-call"
      data-testid="turn-call"
      role="status"
      initial={instant ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 26 }}
    >
      {rows.map(({ who, move, side }, index) => (
        <motion.div
          key={side}
          // A tinta vermelha do estouro segue a mesma regra do rótulo:
          // só a SUA mão a acende (ver `moveLabel`).
          className={`turn-call__row turn-call__row--${side} ${
            side === 'player' && move.bust ? 'is-bust' : ''
          }`}
          initial={instant ? false : { opacity: 0, x: side === 'player' ? 14 : -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={instant ? { duration: 0 } : { delay: 0.06 + index * 0.09, duration: 0.28 }}
        >
          <span className="turn-call__who">{who}</span>
          <span className="turn-call__what">{moveLabel(move)}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

/**
 * O botão da dobra e, depois do pedido, o PLACAR dela — é o mesmo lugar
 * na tela porque é a mesma conversa:
 *
 * - `idle`: o convite, aceso e clicável;
 * - `pending`: o martelo está com o rival, e o botão espera apagado;
 * - `declined`: recusa. O botão morre ali, sem vida, dizendo o que
 *   aconteceu — some o convite, fica o placar;
 * - `accepted`: a mesa dobrou. O botão PEGA FOGO nas bordas e não apaga
 *   mais até o fim da mão: o valor em jogo virou outro, e a mesa não
 *   deixa ninguém esquecer disso.
 */
function DoubleCta({
  bet,
  enabled,
  onRequest,
}: {
  bet: DoubleBetState | null | undefined;
  enabled: boolean;
  onRequest: () => void;
}) {
  const status = bet?.status ?? 'idle';
  const label =
    status === 'accepted'
      ? `APOSTA DOBRADA · ${formatCredits(bet?.amount ?? 0)}`
      : status === 'declined'
        ? 'DOBRA RECUSADA'
        : status === 'pending'
          ? 'AGUARDANDO RIVAL…'
          : 'DOBRAR APOSTA';

  return (
    <div
      className={`double-cta blaze-stage double-cta--${status}`}
      data-double-status={status}
    >
      {/* O aceite ESTOURA aqui — a mesma combustão das cartas, uma vez
          só. O que fica depois é o aro morno e parado do botão. */}
      {status === 'accepted' && <BlazeBurst variant="double-button" />}
      {/* `secondary`, não `ghost`: o convite da dobra é uma peça CHAPADA
          do vinho da casa em qualquer estado. O fantasma translúcido lia
          como botão desligado sobre o feltro claro mesmo quando estava
          clicável — e o fogo continua exclusivo do aceite. */}
      <Button
        variant="secondary"
        onClick={onRequest}
        disabled={status !== 'idle' || !enabled}
        size="md"
        fullWidth
        data-testid="action-double"
      >
        <Icon name={status === 'accepted' ? 'flame' : 'chip'} /> {label}
      </Button>
    </div>
  );
}

/**
 * O relógio da vez: os 20 s que os dois têm para escolher. A barra
 * esvazia e, nos últimos segundos, tudo vira brasa — é o aviso de que a
 * mesa vai parar a sua mão por você se ninguém bater o martelo.
 */
function TurnClockBar({ seconds }: { seconds: number }) {
  const urgent = seconds <= 5;
  return (
    <div
      className={`turn-clock ${urgent ? 'is-urgent' : ''}`}
      data-testid="turn-clock"
      role="timer"
      aria-label={`${seconds} segundos para escolher`}
    >
      <span className="turn-clock__track">
        <span
          className="turn-clock__fill"
          style={{ width: `${Math.max(0, Math.min(1, seconds / TURN_SECONDS)) * 100}%` }}
        />
      </span>
      <span className="turn-clock__value">{seconds}s</span>
    </div>
  );
}

interface DoubleBubbleProps {
  bet: DoubleBetState;
  opponentName: string;
  instant: boolean;
}

/**
 * A nuvem do pedido de dobra, na faixa livre e com o bico virado para o
 * rival: é a ELE que a pergunta foi feita. Enquanto ele pensa, as duas
 * respostas ficam acesas lado a lado — o ✓ verde e o ✗ vermelho que ele
 * tem na mão; respondido, a escolhida acende e a outra apaga.
 *
 * As respostas são um retrato do que acontece do outro lado da mesa, não
 * botões seus: quem decide subir o valor do duelo é o rival.
 */
function DoubleBubble({ bet, opponentName, instant }: DoubleBubbleProps) {
  const accepted = bet.status === 'accepted';
  const answered = accepted || bet.status === 'declined';
  const pickClass = (mine: boolean) => (answered ? (mine ? 'is-picked' : 'is-muted') : '');

  return (
    <motion.div
      className="double-bubble"
      data-testid="double-request"
      data-status={bet.status}
      role="status"
      initial={instant ? false : { opacity: 0, y: -12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 24 }}
    >
      <p className="double-bubble__title">
        {answered ? (accepted ? 'DOBRA ACEITA' : 'DOBRA RECUSADA') : 'DOBRAR A APOSTA?'}
      </p>
      <p className="double-bubble__amount" data-testid="double-amount">
        <Icon name="chip" size="0.9em" /> {formatCredits(bet.amount)}
      </p>
      <div className="double-bubble__answers">
        <span className={`double-answer double-answer--yes ${pickClass(accepted)}`}>
          <Icon name="check" size={18} />
        </span>
        <span className={`double-answer double-answer--no ${pickClass(!accepted)}`}>
          <Icon name="close" size={18} />
        </span>
      </div>
      <p className="double-bubble__hint">
        {answered ? opponentName : `${opponentName} está decidindo…`}
      </p>
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
  onRequestDouble,
  doubleBet,
  canRequestDouble = false,
  reveal,
  turn,
}: HandsArenaProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);

  const dealing = phase === 'dealing';
  const choosing = phase === 'turn';
  // Com uma dobra no ar a mesa inteira espera a resposta do rival:
  // escolher agora fecharia a vez por um valor ainda em discussão.
  const doublePending = doubleBet?.status === 'pending';
  // Só há o que decidir enquanto a engine oferecer ações: a mão que já
  // fechou (ou a escolha já travada) esvazia `legalActions`.
  const canAct =
    choosing && !actionPending && !doublePending && (round?.legalActions.length ?? 0) > 0;
  /* Quem ainda tem de bater o martelo nesta vez. A placa de nome acende
     por isso: enquanto os dois pensam, as duas acendem. */
  const playerThinking = choosing && !round?.playerClosed && round?.playerChoice === undefined;
  const opponentThinking = choosing && !round?.opponentClosed && !(turn?.opponentReady ?? false);
  /* Você já escolheu e a mesa aguarda o outro lado — o único momento em
     que o rodapé fica sem botões com a rodada viva. */
  const waitingOpponent = choosing && !playerThinking && opponentThinking;
  // Showdown: só aqui as ocultas viram e os totais fecham.
  const revealed = phase === 'settle' || phase === 'completed';

  const playerCards: readonly Card[] = round?.playerHand ?? result?.playerHand ?? [];
  const opponentFull: readonly Card[] = result?.opponentHand ?? [];

  /* A mão do rival na mesa, antes do showdown: tudo o que ele tem MENOS
     a última carta, que fica virada — a regra de POV, sem exceção. Quem
     aplica o corte é `povHand`, o mesmo dos assentos da mesa única (ver
     ./table/pov): a regra é uma, então a implementação é uma.
     O corte vale inclusive para o estado `settled` (que já traz a mão
     inteira aberta): quem revela é a fase `settle`, não a chegada do
     resultado. Cada carta nova que ele pede empurra a anterior para o
     campo aberto — a informação chega em conta-gotas. */
  const opponentPov = revealed
    ? povHand(opponentFull, true)
    : povHand(round?.opponentVisible ?? opponentFull, false, (round?.opponentHidden ?? 0) > 0);
  const opponentCards = opponentPov.shown;

  if (playerCards.length === 0 || opponentCards.length === 0) return null;

  /* Blackjack na mesa: o contorno das cartas pega fogo. A labareda é da
     MÃO, não de quem olha — as DUAS acendem, cada uma no instante em que
     a mesa pode mostrá-la sem mentir:

     - a sua, na hora: as suas duas cartas estão abertas na sua frente e
       você já sabe o que tirou;
     - a do rival, no SHOWDOWN. Nem um beat antes. A mão dele tem uma
       carta virada (a regra de POV, ver ./table/pov), e uma labareda
       acesa ali diria "ele tem 21" com a oculta ainda de bruços — o
       duelo acabaria naquele instante, com você sabendo que basta não
       estourar. O corte é o mesmo que já esconde o total dele e o
       estouro dele: a mesa nunca conta pelas beiradas o que só as
       cartas podem contar.

     A regra é simétrica, e é isso que faz dela uma regra: na tela dele o
     contrato é idêntico, com os papéis trocados. */
  // O estouro espera as cartas ASSENTAREM: durante a distribuição elas
  // ainda estão voando, e uma combustão em cima de carta no ar não tem
  // onde acontecer. O clímax é quando a mão fecha e a vez abre.
  const playerAblaze = !dealing && isNaturalBlackjack(playerCards);
  const opponentAblaze = revealed && (result?.opponentNatural ?? false);

  /* A dobra aceita é comunicada EXCLUSIVAMENTE pelo botão APOSTA
     DOBRADA — decisão de direção: nenhum efeito nas fichas nem no pote.
     A poça de brasa que já morou aqui virava um bloco amarelo sobre o
     monte e brigava com a mão de blackjack pela atenção. */

  /* Atrasos de entrada e de virada por carta. Só a distribuição tem
     coreografia: dali em diante cada carta pedida é um lance sozinho na
     mesa, e entra no instante em que a engine a devolve. Para uma carta
     já montada o `dealDelayMs` governa apenas a VIRADA. */
  const playerDelay = (index: number) =>
    dealing ? (DEAL_SLOT.player[index] ?? 0) * TIMINGS.dealCardMs : 0;

  const opponentDelay = (index: number) =>
    dealing ? (DEAL_SLOT.opponent[index] ?? 0) * TIMINGS.dealCardMs : 0;

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

  const opponentVerdict = result && verdictOf(result.opponentBust, result.opponentNatural);
  const playerVerdict = result && verdictOf(result.playerBust, result.playerNatural);

  return (
    // A margem negativa da mesa espelhada mora no CSS (.hands-arena--felt):
    // com a câmera vertical a crupiê está fora de quadro, e o espaço que
    // o `dealer-spacer` reserva para ela volta a ser feltro — é o que leva
    // a mão do rival para a cabeceira de cima.
    <div
      className={`hands-arena flex min-h-0 flex-1 flex-col items-center ${scenery !== 'off' ? 'hands-arena--felt' : ''}`}
    >
      {/* ---- O rival, na cabeceira de cima ----
          Placa de nome do lado de FORA (a borda da mesa), total do lado
          de DENTRO: os dois placares apontam para o centro do feltro. */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label={`Mão de ${match.opponent.name}`}
        data-testid="hand-opponent"
      >
        <Nameplate
          side="opponent"
          name={match.opponent.name}
          active={opponentThinking}
          status={
            revealed
              ? opponentVerdict
              : choosing && !round?.opponentClosed
                ? { label: opponentThinking ? 'ESCOLHENDO…' : 'PRONTO', tone: 'ready' }
                : null
          }
        />
        <HandRow
          cards={opponentCards}
          testid="hand-opponent-cards"
          labelPrefix={`Carta de ${match.opponent.name}`}
          faceDownAt={(index) => !revealed && index === opponentCards.length - 1}
          delayFor={opponentDelay}
          ablaze={opponentAblaze}
        />
        {/* O total do rival é o das cartas ABERTAS enquanto houver
            oculta: um número limpo do que já está na mesa. */}
        <HandTotal
          side="opponent"
          cards={opponentPov.counted}
          partial={!revealed}
          ablaze={opponentAblaze}
        />
      </section>

      {/* Faixa livre do feltro: é aqui que o brasão da casa respira — e
          onde a mesa fala. O POTE assenta no meio dela, sobre o brasão; a
          nuvem do pedido de dobra fica no alto, com o bico virado para o
          rival; o anúncio do lance, no miolo. Todos são absolutos dentro
          da faixa: entram e saem sem mexer um milímetro nas duas mãos, e
          se empilham nesta ordem — pote embaixo (z 1), nuvem (z 2),
          anúncio por cima de tudo (z 3). */}
      <div className="relative w-full grow">
        {/* O pote sobrevive à rodada inteira e NÃO é remontado quando o
            valor muda: as fichas que já estão na mesa ficam onde estão e
            só as novas caem nela. É o que faz a dobra aceita parecer o
            rival empurrando fichas para o centro, em vez de a mesa se
            redesenhar. Sem `key`, portanto — de propósito. */}
        {match.stake > 0 && (
          <div className="felt-pot" data-testid="felt-pot">
            <ChipStack stake={match.stake} variant="felt" instant={reducedMotion} />
          </div>
        )}
        <AnimatePresence>
          {doubleBet?.open && (
            <DoubleBubble
              bet={doubleBet}
              opponentName={match.opponent.name}
              instant={reducedMotion}
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {reveal && (
            <TurnCall reveal={reveal} opponentName={match.opponent.name} instant={reducedMotion} />
          )}
        </AnimatePresence>
      </div>

      {/* ---- A sua mão, na cabeceira de baixo ---- */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label="Sua mão"
        data-testid="hand-player"
      >
        <HandTotal side="player" cards={playerCards} partial={false} ablaze={playerAblaze} />
        {/* O espelho da regra de POV, do SEU lado: a última carta da sua
            mão está aberta aqui e virada na tela dele. Nada nela denuncia
            isso — então o selo do olho cortado o faz (ver CardVeil). No
            showdown ele sai de cena junto com o segredo. */}
        <HandRow
          cards={playerCards}
          testid="hand-player-cards"
          labelPrefix="Sua carta"
          delayFor={playerDelay}
          ablaze={playerAblaze}
          veiledAt={(index) => !revealed && index === playerCards.length - 1}
        />
        {/* A SUA placa não anuncia a sua vez: você sabe se já escolheu —
            quem precisa de aviso é o outro lado da mesa. O que entra aqui
            é só o veredito do showdown. O ponto aceso da placa (active)
            continua marcando que a mesa espera o seu martelo. */}
        <Nameplate
          side="player"
          name="Você"
          active={playerThinking}
          status={revealed ? playerVerdict : null}
        />
      </section>

      {/* ---- Rodapé da vez ----
          O slot tem altura reservada em TODAS as fases: a barra entra e
          sai sem que as mãos subam e desçam junto — e é o pé do espelho,
          a contrapartida da faixa que sobra acima do rival.
          Enquanto você tem escolha a fazer, o relógio corre em cima dos
          botões; depois do seu martelo, o slot vira a espera pelo rival. */}
      <div className="arena-actions">
        {waitingOpponent && (
          <motion.p
            className="turn-wait"
            data-testid="turn-wait"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
          >
            <span className="turn-wait__dot" aria-hidden="true" />
            Aguardando {match.opponent.name}
          </motion.p>
        )}
        {playerThinking && (
          <motion.div
            className="action-stack"
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
          >
            <TurnClockBar seconds={turn?.seconds ?? TURN_SECONDS} />
            {/* relative + z: as pontas da coroa de fogo do botão da
                dobra sobem por trás DESTES controles — nunca por cima.
                É o que deixa as chamas passarem da borda sem cobrir
                PEDIR CARTA nem PARAR. */}
            <div className="relative z-10 flex w-full gap-3">
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
            {/* A dobra é do 1v1: no torneio o valor da mesa é a taxa de
                entrada do chaveamento e não se negocia no meio da mão.
                Depois do pedido o botão deixa de ser botão e vira o
                PLACAR da negociação — apagado na recusa, em brasa no
                aceite. */}
            {onRequestDouble && (
              <DoubleCta
                bet={doubleBet}
                enabled={canAct && canRequestDouble}
                onRequest={onRequestDouble}
              />
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
