import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { Monogram } from '../../components/AvatarBadge';
import { Card3D } from '../../components/Card3D';
import { ChipRack } from '../../components/poker/ChipRack';
import { CommunityBoard } from '../../components/poker/CommunityBoard';
import { ClashStage } from '../../components/poker/ShowdownClash';
import { TableVeil } from '../../components/poker/TableVeil';
import { ChipStack } from '../../components/table/ChipStack';
import type { Card } from '../../engine/types';
import type { CashMoveCall, CashPhase, CashVerdict } from '../tournamentStore';
import { CashVerdictPlate } from './CashVerdictPlate';
import { TIMINGS } from '../../animations/timings';
import type { CashSeatView, CashTableView } from '../cashTable';
import { DEAL_STAGGER, dealSlots, tableTotal } from '../cashTable';
import { rivalsFromPov } from '../seatOrder';
import { laneSlices } from '../tableLayout';
import type { TournamentPlayer } from '../types';

/**
 * A MESA DE CASH DE 6 — o feltro visto de cima.
 *
 * O POV É FIXO, e foi assim que ele foi pedido:
 *
 *   > "o pov será sempre o mesmo, independente de onde você sentar, a
 *   > única diferença e quem vai estar na sua esquerda/direita"
 *
 * Você fica SEMPRE na cabeceira de baixo, com a mão em tamanho cheio. Os
 * cinco rivais ocupam a metade de cima em faixas de profundidade — três
 * ao fundo, dois à frente (ver `tableLayout`) —, e quem cai em cada lugar
 * sai da rotação do anel a partir da SUA cadeira (ver `rivalsFromPov`).
 * Sentar na cadeira 1 ou na 5 não muda uma linha do que se vê: muda quem
 * está onde.
 *
 * A ASSIMETRIA É DE JOGO, não de estética. A sua mão é a que você precisa
 * ler para decidir, e ela fica de perto; as dos outros estão de bruços e
 * ficam de longe. Uma mesa de verdade também é assim.
 *
 * O que cada assento mostra é o que uma mesa real mostra: QUEM, QUANTO
 * TEM e O QUE PÔS. O stack é público — é com ele que se calcula tudo o
 * que há para calcular no poker — e as cartas não são.
 *
 * Este componente não decide nada: recebe um instante da mesa e o
 * desenha. Quem produz o instante hoje é `openCashTable`; amanhã é a
 * engine multiway, e depois um servidor. Nenhum dos três precisa que ele
 * mude.
 */

export interface CashArenaProps {
  view: CashTableView;
  /** A sua cadeira: é dela que sai a rotação do ponto de vista. */
  youSeat: number;
  /** O último lance da mesa, para o alto-falante. */
  call?: CashMoveCall | null;
  /** As cinco cartas que decidiram — as do feltro acendem. */
  highlight?: readonly Card[];
  /** Em que batida do fim da mão a mesa está (ver `CashPhase`). */
  phase: CashPhase;
  /** O desfecho da mão; `null` enquanto ela corre. */
  verdict?: CashVerdict | null;
  /** Você abriu a mão desta rodada. */
  shown: boolean;
  /** Abre o perfil de quem senta num assento de rival. */
  onOpenProfile: (player: TournamentPlayer) => void;
}

/**
 * PARA QUE LADO O MONTANTE DE FICHAS APONTA.
 *
 * Para fora da faixa, sempre — e é isso que resolve a sobreposição pela
 * raiz. As duas cartas de um rival ocupam o assento inteiro, então a
 * pilha nunca coube DENTRO dele: ela era pintada por cima do vizinho da
 * esquerda, invariavelmente do mesmo lado, porque o lado era fixo.
 *
 * Com o lado derivado do LUGAR NA FAIXA, a pilha do assento da esquerda
 * sai pela borda esquerda do feltro, a do assento da direita pela
 * direita, e a de quem está no meio desce para debaixo das próprias
 * cartas. Nenhuma delas tem vizinho no caminho — não por folga de
 * cálculo, mas por construção.
 */
type ChipSide = 'left' | 'below' | 'right';

/** O lugar na faixa decide o lado: pontas para fora, meio para baixo. */
function chipSideFor(index: number, count: number): ChipSide {
  if (index === 0) return 'left';
  if (index === count - 1) return 'right';
  return 'below';
}

interface SeatProps {
  seat: CashSeatView;
  /** Tem o botão do dealer. */
  button: boolean;
  /** A mesa está esperando a decisão deste assento. */
  toAct: boolean;
  /** Atraso de cada carta na coreografia da distribuição. */
  delayFor: (index: number) => number;
  /** As cartas que decidiram a mão: as deste assento que estão nelas acendem. */
  highlight?: readonly Card[];
  /** A leitura da mão — só existe do SEU lado. */
  reading?: string | null;
  /** Para onde sai o montante de fichas. Só os rivais o usam. */
  chips?: ChipSide;
  /** Abre o perfil de quem senta aqui. Só os rivais o têm. */
  onOpenProfile?: () => void;
  instant: boolean;
  you: boolean;
}

/** Esta carta está entre as que decidiram o pote? */
function isLit(card: Card | null, highlight?: readonly Card[]): boolean {
  if (!card || !highlight) return false;
  return highlight.some((h) => h.rank === card.rank && h.suit === card.suit);
}

/**
 * A aposta que está no feltro à frente de um assento, em fichas e cifra.
 *
 * ELA NÃO OCUPA ALTURA NENHUMA, e isso não é detalhe: a pastilha nasce
 * quando o blind é pago e some quando a rua fecha e a mesa recolhe. Com
 * ela no fluxo, a altura do assento mudava a cada rua — e a fileira de
 * rivais inteira mudava junto, empurrando o miolo do feltro, o board e as
 * SUAS cartas. Foi medido: 18px de salto no miolo e 28px nas cartas de
 * baixo, ao longo de uma mão.
 *
 * A primeira correção foi RESERVAR o lugar dela, e estava meio certa: o
 * salto sumia, mas o assento passava a carregar a altura da pastilha o
 * tempo todo — 36px a menos de feltro num aparelho de 568px, que é
 * justamente onde ele não sobra. Tirá-la do fluxo resolve as duas coisas:
 * ela pende sobre o pano à frente do assento, que é onde as fichas de
 * uma aposta ficam numa mesa de verdade, e não empurra nada.
 *
 * Vazia ela fica INVISÍVEL, e não removida: `visibility` guarda a peça
 * para a entrada dela não ser um salto. E sem `data-testid`, porque o que
 * não está em cena não deve ser encontrável — a mesa conta as apostas
 * por ele.
 */
function BetSpot({ amount, testid }: { amount: number; testid: string }) {
  const vazio = amount <= 0;
  return (
    <span className="cash-bet-slot">
      <span
        className={`cash-bet ${vazio ? 'cash-bet--empty' : ''}`}
        {...(vazio ? { 'aria-hidden': true } : { 'data-testid': testid })}
      >
        <span className="cash-bet__chip" aria-hidden="true" />
        <span className="cash-bet__value">{formatCredits(Math.max(0, amount))}</span>
      </span>
    </span>
  );
}

/**
 * O disco do dealer. Numa mesa de 3 ou mais ele não paga blind nenhum —
 * quem paga é quem senta à esquerda dele —, e diz uma coisa só, que
 * decide mão: a ORDEM DA PALAVRA.
 */
function DealerPuck({ name, you }: { name: string; you: boolean }) {
  return (
    <span
      className="dealer-puck dealer-puck--cash"
      data-testid="cash-dealer-button"
      role="img"
      aria-label={`Botão do dealer com ${you ? 'você' : name}: fala por último do flop em diante`}
    >
      <span className="dealer-puck__face" aria-hidden="true">
        D
      </span>
    </span>
  );
}

/**
 * ASSENTO DE RIVAL: placa de identidade, duas cartas de bruços e a aposta
 * no feltro à frente. Compacto de propósito — são cinco deles na metade
 * de cima de um telefone.
 */
function RivalSeat({
  seat,
  button,
  toAct,
  delayFor,
  highlight,
  chips = 'left',
  onOpenProfile,
  instant,
}: SeatProps) {
  const { player, stack, bet, cards, folded, allIn } = seat;

  /* O montante, montado uma vez e pendurado no lugar que o assento pede.
     A peça é a MESMA nos três lados — o que muda é em qual fenda do
     assento ela mora, e por isso ela não pode ser remontada por lado:
     as fichas do `ChipRack` viajam com `layout`, e trocar a árvore em
     que elas vivem cortaria o voo delas até o pote. */
  const rack = <ChipRack side="opponent" stack={stack} instant={instant} />;

  return (
    <div
      className={`cash-seat cash-seat--chips-${chips} ${folded ? 'cash-seat--folded' : ''}`}
      data-testid={`cash-seat-${seat.seatIndex}`}
      data-seat={seat.seatIndex}
      data-chips={chips}
    >
      {/* A PLACA É A DO DUELO (`seat-plate`). A classe `.cash-seat__plate`
          que vem junto só diz o TAMANHO — toda a matéria da peça
          (moldura de ouro, medalhão, selos, halo da vez) mora na do
          duelo, e imitá-la aqui era o que fazia a mesa de 6 parecer
          outro jogo. */}
      {/* A PLACA DO RIVAL DIZ DUAS COISAS: QUEM e QUANTO.
          É a placa do duelo (`seat-plate`), e a classe `.cash-seat__plate`
          só diz o tamanho — mas aqui ela vai ENXUTA, e isso é decisão de
          espaço: numa faixa de três assentos cada placa tem ~79px a
          320px, e tudo o que entrava nela roubava corpo de fonte do nome
          e do montante, que são as duas leituras que se faz vinte vezes
          por mão.

          O que saiu, e por que nada se perdeu com isso:
          - o MEDALHÃO: repetia a inicial de um nome que está escrito ao
            lado, em dois centímetros de distância;
          - o selo SB/BB: os blinds já estão em cena DUAS vezes — nas
            fichas de aposta na frente do assento e na posição relativa
            ao disco do dealer, que é de onde eles saem;
          - o selo MOSTROU: quando alguém abre a mão, as cartas dele ficam
            de face para cima. O selo repetia o que a carta já dizia.

          O ALL-IN FICA. Ele não é enfeite de placa: é o único estado que
          muda o que se pode fazer contra aquele assento, e aparece uma
          vez a cada muitas mãos — não é o "resto" que ocupava espaço, é a
          notícia mais importante que uma mesa dá. */}
      {/* A CABEÇA DO ASSENTO: a placa e, à direita dela, o disco do dealer.
          O disco morava num dos vãos da linha da mão, e de lá dizia a
          coisa certa no lugar errado — ele é um atributo de QUEM senta
          ali, não da mão que está na mesa, e o vão passou a ser o
          corredor por onde o montante sai.

          A FENDA DO DISCO É RESERVADA EM TODO ASSENTO, tenha ele o botão
          ou não. É o que mantém todas as placas com a mesma largura: se
          a fenda só existisse no assento do dealer, a placa dele
          encolheria e a fileira ficaria irregular a cada mão — de novo o
          defeito que a largura fixa existe para acabar. */}
      <div className="cash-seat__head">
        {/* A PLACA ABRE O PERFIL de quem senta ali — a mesma porta do
            duelo, e o mesmo argumento: numa mesa de seis saber com quem
            se joga vale mais ainda, porque são cinco desconhecidos e
            nenhum deles se apresenta.
            É um `button` de verdade, e não um `div` que responde a
            clique: a placa mede ~50px de largura e é o único alvo de
            toque do assento — sem foco de teclado e sem rótulo, ela
            seria uma porta que só o dedo encontra. */}
        <button
          type="button"
          className={`seat-plate cash-seat__plate seat-plate--tappable ${toAct ? 'is-turn' : ''}`}
          onClick={onOpenProfile}
          aria-label={`Ver o perfil de ${player.name}`}
          data-testid={`cash-profile-${seat.seatIndex}`}
        >
          <span className="seat-plate__body">
            {/* NOME EM CIMA, FICHAS EMBAIXO — de propósito, e não por
              acidente de quebra de linha.
              Disputando uma linha só, a placa precisava da largura da
              SOMA dos dois; empilhados, ela precisa da largura do MAIOR.
              É o que devolve espaço suficiente para a letra crescer em
              vez de encolher — e o que garante que nenhum apelido e
              nenhum stack quebrem o layout, hoje ou depois.

              O selo ALL-IN anda COM O NOME, e não numa terceira linha:
              ele é raro, e uma placa de três andares seria mais alta que
              a das vizinhas justamente na mão mais importante. */}
            <span className="seat-plate__line">
              <span className="cash-seat__ident">
                <span className="seat-plate__name" data-testid={`cash-name-${seat.seatIndex}`}>
                  {player.name}
                </span>
                {allIn && <span className="seat-plate__flag seat-plate__flag--allin">ALL-IN</span>}
              </span>
              <span className="seat-plate__stack" data-testid={`cash-stack-${seat.seatIndex}`}>
                <Icon name="chip" size="0.9em" /> {formatCredits(stack)}
              </span>
            </span>
          </span>
        </button>
        <span className="cash-seat__puck">
          {button && <DealerPuck name={player.name} you={false} />}
        </span>
      </div>

      {/* A LINHA DA MÃO. Os dois vãos são FENDAS de largura zero: as duas
          cartas ocupam o assento inteiro, e o que mora nos vãos é
          desenhado PARA FORA — para a esquerda no assento da esquerda,
          para a direita no da direita. Como só o vão externo é usado, o
          que sai vai para a borda do feltro e não para cima de ninguém. */}
      <div className="cash-seat__line">
        <span className="cash-seat__gutter">{chips === 'left' && rack}</span>
        <div className="cash-seat__cards" data-testid={`cash-hole-${seat.seatIndex}`}>
          {cards.map((card, index) => (
            <span
              key={index}
              className={`cash-seat__card ${isLit(card, highlight) ? 'is-lit' : ''}`}
            >
              <Card3D
                card={card}
                size="var(--cash-card-w)"
                faceDown={card === null}
                dealDelayMs={delayFor(index)}
                label={`Carta ${index + 1} de ${player.name}`}
              />
            </span>
          ))}
        </div>
        <span className="cash-seat__gutter">{chips === 'right' && rack}</span>
      </div>

      {/* QUEM ESTÁ NO MEIO DA FAIXA NÃO TEM BORDA para onde mandar o
          montante — dos dois lados dele há um vizinho. Então ele desce:
          debaixo das próprias cartas há espaço que é só dele.
          O MONTANTE em fichas fica, e em qualquer um dos três lugares:
          um número diz quanto o rival tem; a pilha diz de relance QUEM
          está na frente, que é a leitura que se faz vinte vezes por mão
          numa mesa de seis. */}
      {chips === 'below' && <span className="cash-seat__below">{rack}</span>}

      <BetSpot amount={bet} testid={`cash-bet-${seat.seatIndex}`} />
    </div>
  );
}

/** O SEU assento: mesma informação, tamanho de quem precisa ler. */
function YourSeat({ seat, button, toAct, delayFor, highlight, reading, instant }: SeatProps) {
  const { player, stack, bet, cards, allIn, folded } = seat;

  return (
    <section
      /* QUEM CORRE APAGA, e isso vale para você também. Enquanto só os
         rivais apagavam, a sua mão largada continuava em cena com o
         mesmo peso da de quem ainda disputa o pote — e no showdown ela
         competia com as cartas que decidiram. */
      className={`cash-you ${toAct ? 'is-turn' : ''} ${folded ? 'cash-seat--folded' : ''}`}
      aria-label="Sua mão"
      data-testid="cash-seat-you"
    >
      <div className="cash-seat__line">
        <span className="cash-seat__gutter">{button && <DealerPuck name={player.name} you />}</span>
        <div className="cash-seat__cards cash-seat__cards--mine" data-testid="cash-hole-you">
          {cards.map((card, index) => (
            <span
              key={index}
              className={`cash-seat__card ${isLit(card, highlight) ? 'is-lit' : ''}`}
            >
              <Card3D
                card={card}
                size="var(--hole-card-w)"
                faceDown={card === null}
                dealDelayMs={delayFor(index)}
                label={`Sua carta ${index + 1}`}
              />
            </span>
          ))}
        </div>
        <span className="cash-seat__gutter">
          <ChipRack side="player" stack={stack} instant={instant} />
        </span>
      </div>

      <BetSpot amount={bet} testid="cash-bet-you" />

      <div
        className={`seat-plate seat-plate--player cash-seat__plate cash-seat__plate--mine ${
          toAct ? 'is-turn' : ''
        }`}
      >
        <span className="seat-plate__crest" aria-hidden="true">
          <Monogram name={player.name} you />
        </span>
        <span className="seat-plate__body">
          <span className="seat-plate__line">
            <span className="seat-plate__name">Você</span>
            {allIn && <span className="seat-plate__flag seat-plate__flag--allin">ALL-IN</span>}
            {seat.shown && (
              <span
                className="seat-plate__flag seat-plate__flag--shown"
                data-testid="cash-shown-you"
              >
                MOSTROU
              </span>
            )}
            <span className="seat-plate__stack" data-testid="cash-stack-you">
              <Icon name="chip" size="0.9em" /> {formatCredits(stack)}
            </span>
          </span>
          {/* A LEITURA DA MÃO, em ouro menor, embaixo — a mesma linha da
              placa do duelo. Ela muda a cada rua e é comentário, não
              decisão: por isso não disputa com o nome e o montante, que
              são o que se consulta a cada lance. */}
          {reading && (
            <span className="seat-plate__reading" data-testid="cash-hand-reading">
              {reading}
            </span>
          )}
        </span>
      </div>
    </section>
  );
}

/**
 * O ALTO-FALANTE DA MESA: o último lance, dito por extenso.
 *
 * Sem ele, um lance é só um número que mudou em dois lugares da tela — o
 * stack de alguém e o pote. Numa mesa de seis isso é fatal: entre uma
 * vez sua e a seguinte cinco pessoas jogaram, e a mesa que você reencontra
 * não se parece com a que você deixou.
 *
 * O ALL-IN vem antes de tudo, e é a única leitura que substitui a ação em
 * vez de completá-la: quando alguém põe o stack inteiro no meio, o quanto
 * foi já não importa — o que importa é que não sobrou nada.
 */
function CashMoveBubble({ call, instant }: { call: CashMoveCall; instant: boolean }) {
  const verbo = call.allIn
    ? 'ALL-IN'
    : call.action === 'fold'
      ? 'CORREU'
      : call.action === 'check'
        ? 'PASSOU'
        : call.action === 'call'
          ? `PAGOU ${formatCredits(call.amount)}`
          : `APOSTOU ${formatCredits(call.to)}`;

  return (
    <motion.p
      className={`move-call ${call.allIn ? 'move-call--allin' : ''}`}
      role="status"
      data-testid="cash-call"
      initial={instant ? false : { opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={instant ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      transition={instant ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26 }}
    >
      <span className="move-call__who">{call.name}</span>
      <span className="move-call__what">{verbo}</span>
      {/* A mesa jogou por ele: o relógio venceu. É informação de jogo —
          um lance por tempo não conta nada sobre a mão de quem o levou. */}
      {call.timedOut && <span className="move-call__flag">tempo</span>}
    </motion.p>
  );
}

export function CashArena({
  view,
  youSeat,
  call,
  highlight,
  phase,
  verdict,
  shown,
  onOpenProfile,
}: CashArenaProps) {
  const reduced = useReducedMotion() ?? false;
  const total = view.seats.length;
  const slots = dealSlots(view.button, total);

  /* A coreografia da distribuição sai da ORDEM REAL da mesa: uma carta de
     cada vez a partir da esquerda do botão, duas voltas. É por isso que o
     atraso vem do slot global e não do índice na fileira — o crupiê não
     dá as duas cartas de ninguém juntas. */
  const delayFor = (seatIndex: number) => (index: number) =>
    reduced ? 0 : (slots[seatIndex]?.[index] ?? 0) * TIMINGS.dealCardMs * DEAL_STAGGER;

  /* Os blinds NÃO são mais um selo na placa: eles já estão em cena nas
     fichas de aposta na frente de quem os pagou e na posição relativa ao
     disco do dealer — que é de onde eles saem. Ver `blindSeats`. */

  const you = view.seats[youSeat];
  const rivals = rivalsFromPov(youSeat, total)
    .map((seatIndex) => view.seats[seatIndex])
    .filter((seat): seat is CashSeatView => seat !== undefined);
  const lanes = laneSlices(rivals.length);

  return (
    <div className="cash-arena" data-testid="cash-arena" data-seats={total}>
      {/* ---- O EMBATE do fim da mão, por cima do feltro ----
          É a MESMA cena do duelo (`ClashStage`): as duas placas entram das
          bordas, batem no meio e a perdedora é jogada para fora girando.
          O que muda é quem sobe de cada lado, e isso o store já resolveu
          (ver `buildClash`) — de um lado você, do outro quem levou o pote.

          Antes daqui o fim de uma mão de seis era uma plaquinha no rodapé:
          o momento mais importante da mão — a hora em que as mãos se medem
          — passava sem ninguém ver a medição acontecer. */}
      {phase === 'settle' && verdict && (
        <ClashStage
          top={{
            side: 'opponent',
            name: verdict.clash.rivalName,
            rank: verdict.clash.rivalRank,
            won: verdict.clash.outcome === 'lose',
            folded: verdict.clash.rivalFolded,
            /* A placa fecha quando o store não tem a leitura: fora do
               showdown ela só existe se o rival tiver aberto a mão. */
            concealed: verdict.clash.rivalRank === null,
          }}
          bottom={{
            side: 'player',
            name: 'Você',
            rank: verdict.clash.yourRank,
            won: verdict.clash.outcome === 'win',
            folded: verdict.clash.youFolded,
            /* A SUA MÃO VOCÊ SEMPRE SABE, e a placa só a esconde quando
               esconder foi JOGADA sua: o convite de abrir só vai a quem
               levou o pote sem showdown, e guardar ali vale nas mãos
               seguintes.
               Quando você foi quem correu, não houve escolha nenhuma a
               respeitar — e ver o que se largou é justamente a leitura
               que esta cena existe para dar. */
            concealed: !verdict.clash.showdown && verdict.clash.outcome !== 'lose' && !shown,
          }}
          tie={verdict.clash.outcome === 'tie'}
          reveal={verdict.clash.showdown || verdict.clash.rivalRank !== null}
          brief={!verdict.clash.showdown}
          outcome={verdict.clash.outcome}
          instant={reduced}
        />
      )}

      {/* ---- A JANELA DO INTERVALO ----
          A placa de quem levou o pote fica por cima do feltro enquanto as
          fichas assentam nos montantes, e a mesa distribui logo depois.
          Ela mora AQUI, e não numa tela à parte, porque a sessão não
          para: sair da mesa para ler um veredito e voltar quebraria a
          única coisa que uma sessão tem de diferente de uma mão. */}
      <AnimatePresence>
        {/* O VÉU E A PLACA entram e saem juntos: o desfoque é a moldura
            da notícia. Ver `TableVeil`. */}
        {phase === 'handover' && verdict && <TableVeil key="veil" instant={reduced} />}
        {phase === 'handover' && verdict && (
          <CashVerdictPlate key="verdict" verdict={verdict} shown={shown} instant={reduced} />
        )}
      </AnimatePresence>

      {/* ---- Os rivais, em faixas de profundidade ---- */}
      <div className="cash-arena__rivals" data-testid="cash-rivals">
        {lanes.map(({ start, count }, lane) => (
          <div
            key={lane}
            className="cash-lane"
            // A faixa mais funda tem a carta menor: perspectiva por
            // tamanho, sem rotação nenhuma — girar custaria altura de
            // bloco, que é justamente o que falta num telefone.
            // A CONTAGEM continua indo junto, e agora pesa MAIS que a
            // profundidade: numa faixa de três não cabem três pares de
            // carta cheios mais os dois corredores de ficha das pontas —
            // é a única faixa que aperta, e ela aperta esteja onde
            // estiver (ver `--lane-crowd` em `.cash-lane`).
            // `--lanes` é o orçamento de altura: uma mesa de 3 ou 4 tem
            // UMA fileira de rival e pode gastar o dobro em carta que
            // uma de 5 ou 6, que tem duas. Sem isso o teto de altura
            // teria de ser o da pior mesa, e as de fileira única
            // pagariam por um aperto que não é delas.
            style={
              {
                '--lane-cols': count,
                '--lanes': lanes.length,
                '--lane-depth': lanes.length - 1 - lane,
              } as CSSProperties
            }
            data-lane={lane}
          >
            {rivals.slice(start, start + count).map((seat, index) => (
              <RivalSeat
                key={seat.seatIndex}
                seat={seat}
                button={seat.seatIndex === view.button}
                toAct={view.toAct === seat.seatIndex}
                delayFor={delayFor(seat.seatIndex)}
                highlight={highlight}
                chips={chipSideFor(index, count)}
                onOpenProfile={() => onOpenProfile(seat.player)}
                instant={reduced}
                you={false}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ---- O MEIO: o pote em fichas, as comunitárias e o lance ---- */}
      <div className="cash-arena__middle">
        {/* O POTE, a MESMA peça do duelo (`.poker-pot`): as fichas dão a
            ESCALA de relance — dobrar a aposta dobra o monte — e a cifra
            embaixo dá a conta exata que a decisão seguinte precisa.
            Antes era o `plate` do ChipStack, e a proporção saía
            invertida: ficha miúda com uma placa duas vezes maior que ela,
            quando o duelo tem ficha grande e pastilha discreta. */}
        <div className="poker-pot" data-testid="cash-pot">
          <ChipStack stake={tableTotal(view)} variant="felt" instant={reduced} />
          <span className="poker-pot__value" data-testid="cash-pot-value">
            <Icon name="chip" size="0.9em" /> {formatCredits(tableTotal(view))}
          </span>
        </div>

        <CommunityBoard cards={view.board} highlight={highlight} instant={reduced} />
      </div>

      {/* ---- Você, na cabeceira de baixo ---- */}
      {you && (
        <YourSeat
          seat={you}
          button={youSeat === view.button}
          toAct={view.toAct === youSeat}
          delayFor={delayFor(youSeat)}
          highlight={highlight}
          reading={view.yourHandLabel}
          instant={reduced}
          you
        />
      )}

      {/* O ÚLTIMO LANCE, dito por extenso, ABAIXO DA SUA PLACA.
          Numa mesa de seis ele é indispensável: cinco pessoas jogam entre
          uma vez sua e a seguinte, e sem a locução o pote cresce sem que
          se saiba por quê.

          O lugar dele é a última linha do feltro, e é a terceira tentativa:
          dentro do miolo ele disputava altura com o board e o empurrava
          para cima das cartas da segunda fileira; flutuando por cima,
          cobria as comunitárias; entre o board e a sua mão, encostava na
          sua própria placa. Embaixo de tudo ele não tem em quem esbarrar,
          e cai no lugar onde o olho já está — a placa com o seu nome. */}
      <div className="cash-arena__speaker">
        <AnimatePresence mode="wait">
          {call && <CashMoveBubble key={call.id} call={call} instant={reduced} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
