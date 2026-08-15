import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { OpponentProfileSheet } from '../../components/OpponentProfileSheet';
import { HandoverClock } from '../../components/poker/HandoverClock';
import { TableTools } from '../../components/table/TableTools';
import { StreetAnnounce } from '../../components/poker/StreetAnnounce';
import { TableScene } from '../../scene/TableScene';
import { asOpponent } from '../seatOrder';
import type { TournamentPlayer } from '../types';
import { useTournamentStore } from '../tournamentStore';
import { CashActions } from './CashActions';
import { CashArena } from './CashArena';
import { CashShowPrompt } from './CashShowPrompt';

/**
 * A MESA DE CASH DE 6 em cena.
 *
 * Ela usa O MESMO CENÁRIO do resto da casa (`TableScene`, câmera de
 * cima), e não uma tela solta sobre a foto do salão. A diferença não é
 * de enfeite: o cenário é o que faz a mesa de poker parecer uma mesa de
 * poker — o feltro, a luz do teto, a moldura da sala. Sem ele a mesa de
 * seis lia como um menu com cartas.
 *
 * A CÂMERA É SEMPRE A DE CIMA. No duelo ela desce ao nível da mesa antes
 * da mão e sobe no feltro; aqui não há "antes da mão" separado — a mesa
 * de cash é uma sessão contínua, e o enquadramento não tem por que
 * mudar no meio dela.
 *
 * LEVANTAR é um direito e não custa nada — é a diferença entre cash e
 * torneio, e foi assim que a mesa fechada foi definida no pedido:
 * "ninguém entra depois de começar. Você sai quando quiser." A saída
 * abre na SEGUNDA mão, pela mesma regra do duelo: quem senta, joga ao
 * menos uma.
 */
export function CashTableScreen() {
  const view = useTournamentStore((s) => s.cashTable);
  const youSeat = useTournamentStore((s) => s.cashSeat);
  const lobbyName = useTournamentStore((s) => s.lobbyName);
  const legal = useTournamentStore((s) => s.cashLegal);
  const toCall = useTournamentStore((s) => s.cashToCall);
  const raise = useTournamentStore((s) => s.cashRaise);
  const call = useTournamentStore((s) => s.cashCall);
  const verdict = useTournamentStore((s) => s.cashVerdict);
  const streetCut = useTournamentStore((s) => s.cashStreetCut);
  const clock = useTournamentStore((s) => s.cashClock);
  const phase = useTournamentStore((s) => s.cashPhase);
  const handover = useTournamentStore((s) => s.cashHandover);
  const show = useTournamentStore((s) => s.cashShow);
  const shown = useTournamentStore((s) => s.cashShown);
  const canLeave = useTournamentStore((s) => s.cashCanLeave);
  const broke = useTournamentStore((s) => s.cashBroke);
  const cashAct = useTournamentStore((s) => s.cashAct);
  const answerShow = useTournamentStore((s) => s.cashAnswerShow);
  const leaveCashTable = useTournamentStore((s) => s.leaveCashTable);
  const [leaving, setLeaving] = useState(false);
  /* O PERFIL do rival em que se tocou. Estado LOCAL de interface: a mesa
     não tem — nem deve ter — uma fase "olhando o perfil de alguém". */
  const [profile, setProfile] = useState<TournamentPlayer | null>(null);
  const reduced = useReducedMotion() ?? false;

  if (!view || youSeat < 0) return null;

  const meu = view.seats[youSeat];
  const fichas = (meu?.stack ?? 0) + (meu?.bet ?? 0);
  const suaVez = phase === 'hand' && view.toAct === youSeat && legal.length > 0;
  /* VOCÊ CORREU E A MÃO CONTINUA. É um estado sem volta dentro da mão
     corrente, e o único em que não há lance nenhum a fazer — a mesa segue
     sem você até fechar o pote. */
  const correu = meu?.folded ?? false;

  return (
    <main className="cash-screen" data-testid="cash-screen">
      {/* O LETREIRO DA RUA sai por um portal e desfoca a cena inteira —
          é o mesmo corte de cena do duelo, e ele vale mais aqui: numa
          mesa de seis a rua vira depois de até seis lances, e sem o corte
          o flop apareceria no meio de uma fila de anúncios de bot. */}
      <StreetAnnounce street={streetCut} />

      {/* O CABEÇALHO FICA FORA DA CENA, exatamente como no duelo.
          A `TableScene` desenha o feltro num recorte que sobe 5rem acima
          do próprio topo; com o cabeçalho DENTRO dela, a cena começava 60
          px mais alto que no duelo e o trilho de mogno saía do quadro
          pela borda de cima. Fora dela, a geometria das duas mesas passa
          a ser a mesma medida a medida. */}
      {/* O CABEÇALHO É O NOME DA SALA, e só.
          Ali morava também a economia da mesa — compra, blinds e o
          contador de mãos —, e ela saiu porque é ficha técnica: a compra
          se decide na criação e não muda; o blind está em cena a cada mão
          nas fichas na frente de quem o paga; e o número da mão não muda
          decisão nenhuma. Três informações fixas ocupando a faixa mais
          nobre da tela, sobre um feltro onde o que importa são as cartas.
          Tudo isso continua a um toque, na ficha da sala.

          O nome fica CENTRADO: o botão de levantar é âncora à direita, e
          com o nome à esquerda o cabeçalho lia como duas peças soltas em
          vez de uma faixa. */}
      {/* O BOTÃO DE BANDEIRA SAIU DAQUI. Ele era a saída da mesa num
          ícone de 2rem no canto, e tinha dois problemas: a bandeira não
          diz "levantar" para ninguém, e o canto superior direito não é
          onde o olho de quem quer sair vai parar.
          A saída não sumiu — ela ficou onde uma decisão de mesa se toma,
          que é a faixa sob o polegar: na barra de lances enquanto a vez é
          sua, na espera depois que você corre, e em tamanho de lance na
          janela entre as mãos. Três lugares, todos escritos por extenso. */}
      {/* AS DUAS FERRAMENTAS ficam nos cantos, e o nome da mesa no meio.
          Elas são a MESMA peça do duelo: o valor das fichas à esquerda,
          o extrato da sessão à direita. */}
      <header className="cash-screen__head">
        <TableTools />
        <h1 className="cash-screen__title" data-testid="cash-room-name">
          {lobbyName}
        </h1>
      </header>

      <TableScene reaction="idle" camera="overhead">
        <div className="cash-screen__stage">
          <CashArena
            view={view}
            youSeat={youSeat}
            call={call}
            highlight={verdict?.highlight}
            phase={phase}
            verdict={verdict}
            shown={shown}
            onOpenProfile={setProfile}
          />

          {/* O RODAPÉ RESERVA A MESMA ALTURA EM TODAS AS FASES.
              `.arena-actions` é a banda do duelo (8,9rem): a barra de
              lances, a espera e a placa do desfecho trocam DENTRO dela e
              o feltro não sobe nem desce. Sem a reserva, o rodapé pulava
              de 52px para ~76px conforme a vez e a mesa inteira se
              recentrava a cada lance de bot — e a sobra vertical que
              sobrava virava o vão morto embaixo.
              É essa mesma reserva que o brasão gravado no pano desconta
              (ver `--arena-actions-h` em `.table-crest--overhead`).

              A placa do desfecho cobre a barra, e é isso que se quer:
              com a mão fechada não há lance a fazer, e o lugar sob o
              polegar passa a ser o da notícia. */}
          <div className="arena-actions">
            <AnimatePresence mode="wait">
              {show.open ? (
                /* O CONVITE DE ABRIR A MÃO vem ANTES de tudo e segura a
                   cena: enquanto ele está no ar o embate espera, e é essa
                   pausa que faz a pergunta valer alguma coisa. */
                <CashShowPrompt key="show" prompt={show} onAnswer={answerShow} instant={reduced} />
              ) : phase === 'settle' ? (
                /* DURANTE O EMBATE A BARRA SE CALA. A cena é a notícia, e
                   ela ocupa o feltro inteiro por dois ou três segundos;
                   qualquer coisa escrita aqui embaixo disputaria o olho
                   com as duas placas que estão se medindo. O lugar segue
                   reservado — é o que impede a mesa de subir e descer no
                   momento em que se está lendo o desfecho. É o mesmo
                   silêncio do duelo nesta batida. */
                <span key="settle" aria-hidden="true" />
              ) : phase === 'handover' ? (
                /* O INTERVALO ENTRE AS MÃOS: o relógio da próxima e a
                   porta ao lado dele, exatamente como no duelo. Zerado, a
                   mesa distribui sozinha — uma sessão que exigisse um
                   toque a cada mão para continuar seria uma sessão que se
                   joga com o dedo, e não com a cabeça.
                   No intervalo a porta é a ÚNICA decisão que existe, e por
                   isso ocupa a barra inteira. */
                <motion.div
                  key="handover"
                  className="action-stack action-stack--wide"
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.25 }}
                >
                  <HandoverClock
                    seconds={handover.seconds}
                    total={handover.total}
                    instant={reduced}
                  />
                  <Button
                    variant="danger"
                    size="md"
                    fullWidth
                    onClick={() => setLeaving(true)}
                    disabled={!canLeave}
                    title={canLeave ? 'Levantar da mesa' : 'Disponível a partir da 2ª mão'}
                    data-testid="cash-leave"
                  >
                    <Icon name="close" /> LEVANTAR DA MESA
                  </Button>
                </motion.div>
              ) : suaVez ? (
                <CashActions
                  key="actions"
                  legal={legal}
                  toCall={toCall}
                  raise={raise}
                  committed={meu?.bet ?? 0}
                  seconds={clock.seconds}
                  canLeave={canLeave}
                  onLeave={() => setLeaving(true)}
                  onAct={cashAct}
                  instant={reduced}
                />
              ) : (
                /* O lugar da barra guarda a altura enquanto a vez é de
                 outro: uma mesa que sobe e desce a cada lance de bot faria
                 as cartas dançarem justamente quando se tenta lê-las. */
                <div key="wait" className="cash-screen__wait" data-testid="cash-wait">
                  <span>
                    {broke
                      ? 'Você ficou sem fichas'
                      : correu
                        ? 'Você correu esta mão'
                        : 'Aguardando a mesa'}
                  </span>
                  {/* A SAÍDA É A ÚNICA JOGADA QUE SOBROU — e por isso ela
                      vem em vermelho e do tamanho de um lance.
                      São dois estados sem volta dentro da mão corrente:

                      - SEM FICHAS você não recebe carta, não tem vez e
                        nunca mais vê a barra de lances — a mesa virava uma
                        sala trancada com a pessoa dentro;
                      - DEPOIS DE CORRER a mão continua sem você. Não há
                        lance a fazer, não há decisão a tomar, e a mesa
                        ainda pode levar meio minuto para fechar o pote.
                        Ficar olhando não é uma escolha; é a ausência de
                        uma.

                      Nos dois casos a única decisão possível é sair, e ela
                      precisa estar onde o polegar já está. */}
                  {(broke || correu) && (
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => setLeaving(true)}
                      disabled={!broke && !canLeave}
                      title={
                        broke || canLeave ? 'Levantar da mesa' : 'Disponível a partir da 2ª mão'
                      }
                      data-testid="cash-leave-broke"
                    >
                      <Icon name="close" /> LEVANTAR DA MESA
                    </Button>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </TableScene>

      {/* O PERFIL DE QUEM SE TOCOU, por cima de tudo. É a MESMA folha do
          duelo: quem senta numa mesa desta casa tem um perfil só, e ele
          se abre pela placa do nome nas duas mesas. */}
      <OpponentProfileSheet
        open={profile !== null}
        opponent={asOpponent(profile ?? { id: 'ninguem', name: '—', avatar: '—', isYou: false })}
        onClose={() => setProfile(null)}
      />

      <AnimatePresence>
        {leaving && (
          <>
            <motion.div
              className="cash-screen__shade"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeaving(false)}
              aria-hidden="true"
            />
            {/* A pergunta diz a CONTA, não "tem certeza?". Quanto volta
                para o saldo é a única informação que muda a decisão — e
                num cash ela é sempre boa notícia: o que está na sua
                frente é seu, e sair não custa nada. */}
            <motion.div
              className="show-prompt cash-leave-prompt"
              role="alertdialog"
              aria-label="Levantar da mesa"
              data-testid="cash-leave-prompt"
              initial={reduced ? false : { opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
              transition={
                reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }
              }
            >
              <p className="show-prompt__lead">Levantar da mesa?</p>
              {/* A pergunta diz a CONTA, e a conta muda quando não há
                  conta: prometer "as fichas voltam para o saldo" a quem
                  está com zero na frente é uma frase que soa como
                  reembolso e não é. */}
              <p className="show-prompt__ask">
                {fichas > 0
                  ? 'Numa mesa de cash você sai quando quiser. As fichas na sua frente voltam para o saldo.'
                  : 'Você não tem mais fichas nesta mesa. Levantar só fecha a sala.'}
              </p>
              {fichas > 0 && (
                <p className="cash-leave-prompt__take" data-testid="cash-leave-take">
                  <Icon name="chip" size="1em" /> {formatCredits(fichas)}
                </p>
              )}
              <div className="show-prompt__actions">
                <Button
                  size="md"
                  fullWidth
                  onClick={() => setLeaving(false)}
                  data-testid="cash-stay"
                >
                  <Icon name="check" /> FICAR NA MESA
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setLeaving(false);
                    leaveCashTable();
                  }}
                  data-testid="cash-leave-confirm"
                >
                  <Icon name="flag" /> LEVANTAR
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
