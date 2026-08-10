import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { StreetAnnounce } from '../../components/poker/StreetAnnounce';
import { TableScene } from '../../scene/TableScene';
import { useTournamentStore } from '../tournamentStore';
import { CashActions } from './CashActions';
import { CashArena } from './CashArena';
import { CashVerdictPlate } from './CashVerdictPlate';

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
  const show = useTournamentStore((s) => s.cashShow);
  const shown = useTournamentStore((s) => s.cashShown);
  const canLeave = useTournamentStore((s) => s.cashCanLeave);
  const broke = useTournamentStore((s) => s.cashBroke);
  const cashAct = useTournamentStore((s) => s.cashAct);
  const answerShow = useTournamentStore((s) => s.cashAnswerShow);
  const leaveCashTable = useTournamentStore((s) => s.leaveCashTable);
  const [leaving, setLeaving] = useState(false);
  const reduced = useReducedMotion() ?? false;

  if (!view || youSeat < 0) return null;

  const meu = view.seats[youSeat];
  const fichas = (meu?.stack ?? 0) + (meu?.bet ?? 0);
  const suaVez = view.toAct === youSeat && legal.length > 0;

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
      <header className="cash-screen__head">
        <h1 className="cash-screen__title" data-testid="cash-room-name">
          {lobbyName}
        </h1>
        <button
          type="button"
          className="cash-screen__leave"
          onClick={() => setLeaving(true)}
          data-testid="cash-leave"
          aria-label="Levantar da mesa"
        >
          <Icon name="flag" size={16} />
        </button>
      </header>

      <TableScene reaction="idle" camera="overhead">
        <div className="cash-screen__stage">
          <CashArena view={view} youSeat={youSeat} call={call} highlight={verdict?.highlight} />

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
              {verdict ? (
                <CashVerdictPlate
                  key="verdict"
                  verdict={verdict}
                  show={show}
                  shown={shown}
                  onAnswerShow={answerShow}
                  instant={reduced}
                />
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
                  <span>{broke ? 'Você ficou sem fichas' : 'Aguardando a mesa'}</span>
                  {/* SEM FICHAS, A SAÍDA É A ÚNICA JOGADA — e por isso ela
                      vem em vermelho e do tamanho de um lance.
                      Quem quebra não recebe carta, não tem vez e nunca
                      mais vê a barra de lances: o LEVANTAR que mora nela
                      fica inalcançável, e a mesa vira uma sala trancada
                      com a pessoa dentro. A porta do cabeçalho continua
                      lá, mas é um ícone de 2rem no canto — não é onde o
                      olho de quem acabou de quebrar vai parar. */}
                  {broke && (
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => setLeaving(true)}
                      data-testid="cash-leave-broke"
                    >
                      <Icon name="flag" /> LEVANTAR DA MESA
                    </Button>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </TableScene>

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
