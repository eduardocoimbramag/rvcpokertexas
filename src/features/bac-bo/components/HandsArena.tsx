import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { handStep } from '../animations/cards';
import { TIMINGS } from '../animations/timings';
import type { HandValue } from '../engine/rules';
import { handValue } from '../engine/rules';
import type { BlackjackRoundState, Card, Duelist, Match, RoundResult } from '../engine/types';
import type { DoubleBetState, GamePhase, TableAnnouncement } from '../store/gameStore';
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
  /** Abre o pedido de dobra da aposta. Ausente (torneio, onde o valor é
      a taxa de entrada) tira o botão DOBRAR da mesa. */
  onRequestDouble?: () => void;
  /** Pedido de dobra em curso — a nuvem virada para o rival. */
  doubleBet?: DoubleBetState | null;
  /** A dobra está ao alcance agora (saldo cobre e ninguém pediu ainda). */
  canRequestDouble?: boolean;
  /** Lance que a mesa está anunciando ("REX PEDIU CARTA"). */
  announcement?: TableAnnouncement | null;
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
 * A VEZ é de um lado por vez: a placa de nome de quem está jogando
 * acende, e cada lance vira um anúncio na faixa livre antes de a mesa
 * trocar de lado. Ninguém pede duas cartas seguidas enquanto o outro
 * tiver mão viva.
 *
 * Cada fase é uma cena:
 * - `dealing`: as quatro cartas voam do baralho em fila (som no
 *   assentamento de cada uma — o Card3D cuida do próprio beat).
 * - `playerTurn`: a barra PEDIR/PARAR abre; o total da sua mão acompanha
 *   ao vivo (soft mostra as duas leituras, "7/17") e o do rival mostra
 *   só o que está aberto, com um "+?" lembrando o que falta.
 * - `opponentTurn`: a mesa espera o lance dele — a carta que ele pedir
 *   entra empurrando a anterior para o campo aberto.
 * - `settle`: showdown — as ocultas viram e os totais finais aparecem.
 * - `completed` (câmera frontal): o placar migra para as placas que
 *   flanqueiam a crupiê; com cenário desligado ele fica na faixa.
 */

/** Ordem de entrada das cartas na distribuição (jogador, rival, ...). */
const DEAL_SLOT = {
  player: [0, 2],
  opponent: [1, 3],
} as const;

interface HandRowProps {
  cards: readonly (Card | null)[];
  testid: string;
  /** Prefixo dos rótulos acessíveis ("Sua carta", "Carta de Luna"…). */
  labelPrefix: string;
  faceDownAt?: (index: number) => boolean;
  delayFor?: (index: number) => number;
}

/** Uma mão deitada na mesa: cartas retas, uma ao lado da outra, todas
 * inteiramente visíveis. Só uma mão longa demais para o feltro volta a
 * se sobrepor, e apenas o necessário (ver `handStep`). O deslocamento é
 * estático — quem anima entrada e virada é o Card3D de cada carta. */
function HandRow({ cards, testid, labelPrefix, faceDownAt, delayFor }: HandRowProps) {
  const step = handStep(cards.length);
  return (
    <div className="flex items-center justify-center" data-testid={testid}>
      {cards.map((card, index) => (
        <div
          key={index}
          data-testid={`${testid}-card-${index + 1}`}
          style={
            {
              marginLeft: index > 0 ? `calc(var(--card-w) * ${step})` : undefined,
              // Só conta quando a mão aperta: a carta nova cobre a anterior.
              zIndex: index,
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
      ))}
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
function verdictOf(bust: boolean, natural: boolean): { label: string; tone: string } {
  if (bust) return { label: 'ESTOUROU', tone: 'bust' };
  if (natural) return { label: 'BLACKJACK!', tone: 'natural' };
  return { label: 'PAROU', tone: 'stand' };
}

interface NameplateProps {
  side: Duelist;
  name: string;
  /** É a vez deste lado: a placa acende e respira. */
  active: boolean;
  /** Veredito do showdown, quando já houver. */
  verdict: { label: string; tone: string } | null;
}

/**
 * Placa de nome, na borda EXTERNA de cada mão (a de baixo é sua, a de
 * cima é do rival) — o lado de dentro é do total, que aponta para o
 * centro da mesa.
 *
 * A placa é também o indicador de vez: acesa em ouro, com um ponto que
 * respira, ela diz de quem é o lance sem precisar de mais nenhum texto.
 * No showdown ela recebe o veredito na mesma linha — altura fixa, então
 * nada empurra as cartas do lugar.
 */
function Nameplate({ side, name, active, verdict }: NameplateProps) {
  return (
    <div
      className={`nameplate nameplate--${side} ${active ? 'is-turn' : ''}`}
      data-testid={`nameplate-${side}`}
    >
      <span className="nameplate__dot" aria-hidden="true" />
      <span className="nameplate__name">{name}</span>
      {verdict && (
        <span
          className={`nameplate__verdict nameplate__verdict--${verdict.tone}`}
          data-testid={`verdict-${side}`}
        >
          {verdict.label}
        </span>
      )}
    </div>
  );
}

interface HandTotalProps {
  side: Duelist;
  value: HandValue;
  /** A conta ainda não fechou: falta a carta virada ("+?"). */
  partial: boolean;
}

/**
 * O total da mão, na borda INTERNA — os dois apontam para o centro do
 * feltro, como um espelho do outro.
 *
 * Tipografia: a condensada da casa (Oswald), em algarismos tabulares
 * para o número não dançar de largura ao trocar de 9 para 11. Uma mão
 * soft mostra as duas leituras ("7/17") com a menor em segundo plano —
 * o que vale é a de cima.
 */
function HandTotal({ side, value, partial }: HandTotalProps) {
  const soft = value.soft && value.total !== 21;
  return (
    <span
      className={`hand-total hand-total--${side} ${value.total > 21 ? 'is-bust' : ''}`}
      data-testid={`${side}-total`}
    >
      {soft && (
        <>
          <span className="hand-total__soft">{value.total - 10}</span>
          <span className="hand-total__slash">/</span>
        </>
      )}
      {value.total}
      {/* A conta do rival é sempre parcial até o showdown: o "+?" é a
          carta que ele guarda virada. */}
      {partial && <span className="hand-total__partial">+?</span>}
    </span>
  );
}

/**
 * O anúncio do lance na faixa livre: quem jogou e o que fez. Entra pelo
 * lado de quem jogou — o olho já sabe de onde veio antes de ler.
 */
function MoveCall({
  announcement,
  opponentName,
  instant,
}: {
  announcement: TableAnnouncement;
  opponentName: string;
  instant: boolean;
}) {
  const mine = announcement.by === 'player';
  const what = announcement.bust
    ? 'ESTOUROU'
    : announcement.action === 'hit'
      ? 'PEDIU CARTA'
      : 'PAROU';
  const from = mine ? 26 : -26;
  return (
    <motion.div
      key={announcement.id}
      className={`move-call move-call--${announcement.by} ${announcement.bust ? 'is-bust' : ''}`}
      data-testid="move-call"
      role="status"
      initial={instant ? false : { opacity: 0, y: from, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, y: -from * 0.4, scale: 0.96 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26 }}
    >
      <span className="move-call__who">{mine ? 'Você' : opponentName}</span>
      <span className="move-call__what">{what}</span>
    </motion.div>
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
  announcement,
}: HandsArenaProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const scenery = useGameStore((state) => state.settings.scenery);

  const dealing = phase === 'dealing';
  const playerTurn = phase === 'playerTurn';
  const opponentTurn = phase === 'opponentTurn';
  // Com uma dobra no ar a mesa inteira espera a resposta do rival: pedir
  // carta agora resolveria a mão por um valor ainda em discussão.
  const doublePending = doubleBet?.status === 'pending';
  // Só há o que decidir enquanto a engine oferecer ações: a mão que já
  // fechou trava os botões mesmo com a fase ainda em `playerTurn`.
  const canAct =
    playerTurn && !actionPending && !doublePending && (round?.legalActions.length ?? 0) > 0;
  // Showdown: só aqui as ocultas viram e os totais fecham.
  const revealed = phase === 'settle' || phase === 'completed';

  const playerCards: readonly Card[] = round?.playerHand ?? result?.playerHand ?? [];
  const opponentFull: readonly Card[] = result?.opponentHand ?? [];

  /* A mão do rival na mesa, antes do showdown: tudo o que ele tem MENOS
     a última carta, que fica virada — a regra de POV, sem exceção.
     O corte vale inclusive para o estado `settled` (que já traz a mão
     inteira aberta): quem revela é a fase `settle`, não a chegada do
     resultado. Cada carta nova que ele pede empurra a anterior para o
     campo aberto — a informação chega em conta-gotas. */
  const opponentKnown: readonly Card[] = round
    ? round.opponentHidden > 0
      ? round.opponentVisible
      : round.opponentVisible.slice(0, -1)
    : opponentFull.slice(0, -1);
  const opponentCards: readonly (Card | null)[] = revealed
    ? opponentFull
    : [...opponentKnown, null];

  if (playerCards.length === 0 || opponentCards.length === 0) return null;

  const playerValue = handValue(playerCards);
  // O total do rival é o das cartas ABERTAS enquanto houver oculta — com
  // o "+?" lembrando que falta carta para a conta fechar.
  const opponentValue = handValue(revealed ? opponentFull : opponentKnown);

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
          active={opponentTurn}
          verdict={revealed ? opponentVerdict : null}
        />
        <HandRow
          cards={opponentCards}
          testid="hand-opponent-cards"
          labelPrefix={`Carta de ${match.opponent.name}`}
          faceDownAt={(index) => !revealed && index === opponentCards.length - 1}
          delayFor={opponentDelay}
        />
        <HandTotal side="opponent" value={opponentValue} partial={!revealed} />
      </section>

      {/* Faixa livre do feltro: é aqui que o brasão da casa respira — e
          onde a mesa fala. A nuvem do pedido de dobra fica no alto, com
          o bico virado para o rival; o anúncio do lance, no miolo. Os
          dois são absolutos dentro da faixa: entram e saem sem mexer um
          milímetro nas duas mãos. */}
      <div className="relative w-full grow">
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
          {announcement && (
            <MoveCall
              announcement={announcement}
              opponentName={match.opponent.name}
              instant={reducedMotion}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ---- A sua mão, na cabeceira de baixo ---- */}
      <section
        className="flex flex-col items-center gap-1.5"
        aria-label="Sua mão"
        data-testid="hand-player"
      >
        <HandTotal side="player" value={playerValue} partial={false} />
        <HandRow
          cards={playerCards}
          testid="hand-player-cards"
          labelPrefix="Sua carta"
          delayFor={playerDelay}
        />
        <Nameplate
          side="player"
          name="Você"
          active={playerTurn}
          verdict={revealed ? playerVerdict : null}
        />
      </section>

      {/* ---- Barra de ações da sua vez ----
          O slot tem altura reservada em TODAS as fases: a barra entra e
          sai sem que as mãos subam e desçam junto — e é o pé do espelho,
          a contrapartida da faixa que sobra acima do rival.
          Os botões seguem em cena durante o beat em que a última carta
          assenta, mas TRAVADOS: a mão já fechou (legalActions vazio) e
          um segundo toque só produziria uma ação ilegal. */}
      <div className="arena-actions">
        {/* Fora da sua vez a barra sai e o slot fica com o aviso de quem
            está jogando — o rodapé nunca fica mudo. */}
        {opponentTurn && (
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
        {playerTurn && (
          <motion.div
            className="action-stack"
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
            {/* A dobra é do 1v1: no torneio o valor da mesa é a taxa de
                entrada do chaveamento e não se negocia no meio da mão. */}
            {onRequestDouble && (
              <Button
                variant="ghost"
                onClick={onRequestDouble}
                disabled={!canAct || !canRequestDouble}
                size="md"
                fullWidth
                data-testid="action-double"
              >
                <Icon name="chip" /> DOBRAR APOSTA
              </Button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
