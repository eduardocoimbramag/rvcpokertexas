import { motion, useReducedMotion } from 'framer-motion';

import { Icon } from '@/shared/components/Icon';
import { formatCredits } from '@/shared/lib/format';

import { AvatarBadge } from '../../components/AvatarBadge';
import { HandoverClock } from '../../components/poker/HandoverClock';
import { neighbourHint, seatOf } from '../seatOrder';
import { SEATING_SECONDS, useTournamentStore } from '../tournamentStore';

/**
 * AS SEIS CADEIRAS VAZIAS — a tela entre a sala e a primeira mão.
 *
 * Ela existe porque escolher onde sentar é a única decisão de mesa que
 * se toma antes de ver carta, e porque foi pedida assim: seis lugares,
 * um botão em cada, e quem clica primeiro senta.
 *
 * O QUE A ESCOLHA DECIDE, e o que ela não decide:
 *
 * - decide QUEM FICA À SUA ESQUERDA — quem fala depois de você. É a
 *   única informação real de uma cadeira, e por isso ela é dita por
 *   extenso em cada uma em vez de ficar implícita na posição;
 * - NÃO decide posição em relação ao botão do dealer. O botão é sorteado
 *   depois que todos sentam, e a tela diz isso em texto fixo. Sem esse
 *   aviso, perder a corrida seria perder vantagem por reflexo — e no
 *   poker a posição vale dinheiro. Com ele, a corrida continua existindo
 *   pelo prazer dela e não pune quem clicou meio segundo depois.
 *
 * O POV é fixo: você fica sempre embaixo, olhando a mesa de cima. Aqui,
 * porém, as cadeiras aparecem na ORDEM REAL (1 a 6) — antes de sentar
 * não há "seu lugar" a partir do qual girar a mesa, e numerá-las na
 * ordem crua é o que deixa "sentei na 4" significar alguma coisa. A
 * rotação entra depois, quando a mesa monta (ver `seatsFromPov`).
 */
export function SeatingScreen() {
  const seats = useTournamentStore((s) => s.seats);
  const claiming = useTournamentStore((s) => s.claiming);
  const claimError = useTournamentStore((s) => s.claimError);
  const claimSeat = useTournamentStore((s) => s.claimSeat);
  const releaseSeat = useTournamentStore((s) => s.releaseSeat);
  const buyIn = useTournamentStore((s) => s.buyIn);
  const blind = useTournamentStore((s) => s.blind);
  const lobbyName = useTournamentStore((s) => s.lobbyName);

  const clock = useTournamentStore((s) => s.seatingClock);
  const reduced = useReducedMotion() ?? false;

  const mine = seatOf(seats, 'you');
  const seated = mine >= 0;

  return (
    <main className="seating" data-testid="seating-screen">
      <header className="seating__head">
        <h1 className="seating__title">{lobbyName}</h1>
        {/* A economia da mesa segue em cena: é o contrato que a vitrine
            anunciou, e quem chega aqui pela lista precisa reconhecê-lo. */}
        <p className="seating__stakes" data-testid="seating-stakes">
          <Icon name="chip" size="0.9em" className="inline align-[-0.1em]" /> Compra{' '}
          {formatCredits(buyIn)} · Blind {formatCredits(blind)}
        </p>
      </header>

      {/* Chamada, cadeiras, regra e status andam JUNTOS num bloco só.
          Separados, a chamada ficava colada no topo e ia parar em cima do
          lustre da cena — ilegível a 320px —, e sobrava um vão morto entre
          o título e a primeira fileira. O véu do bloco resolve o resto:
          a foto da sala continua em cena, o texto continua legível. */}
      <div className="seating__body">
        <p className="seating__lead" data-testid="seating-lead">
          {seated ? 'Você está na mesa.' : 'Escolha sua cadeira.'}
        </p>

        <ul className="seating__ring" data-testid="seating-ring">
          {seats.map((player, index) => {
            const isMine = player?.isYou ?? false;
            const busy = claiming === index;
            /* A dica existe para ESCOLHER. Depois que você senta ela vira
               ruído — e pior: passa a te nomear ("Entre Théo e Você"),
               dizendo onde você ficaria numa cadeira que já não pode
               ocupar. Sentado, a fileira se cala. */
            const hint = seated ? null : neighbourHint(index, seats);

            if (player) {
              return (
                <li
                  key={index}
                  className="seat-card seat-card--taken"
                  data-testid={`seat-${index}`}
                >
                  <span className="seat-card__no" aria-hidden="true">
                    {index + 1}
                  </span>
                  <AvatarBadge name={player.name} you={isMine} className="seat-card__face" />
                  <span className="seat-card__name" data-testid={`seat-name-${index}`}>
                    {isMine ? 'Você' : player.name}
                  </span>
                  {isMine && (
                    <button
                      type="button"
                      className="seat-card__release"
                      onClick={releaseSeat}
                      data-testid="seat-release"
                    >
                      Trocar
                    </button>
                  )}
                </li>
              );
            }

            return (
              <li key={index} className="seat-card" data-testid={`seat-${index}`}>
                <span className="seat-card__no" aria-hidden="true">
                  {index + 1}
                </span>
                <motion.button
                  type="button"
                  className="seat-card__claim"
                  /* Sentado, os outros botões APAGAM em vez de sumir: uma
                   fileira que muda de forma quando você senta faria a
                   mesa dançar no instante em que ela deveria assentar. */
                  disabled={seated || claiming !== null}
                  onClick={() => void claimSeat(index)}
                  whileTap={{ scale: 0.96 }}
                  data-testid={`seat-claim-${index}`}
                  aria-label={
                    hint
                      ? `Sentar na cadeira ${index + 1}. ${hint}`
                      : `Sentar na cadeira ${index + 1}`
                  }
                >
                  {busy ? 'PEDINDO…' : 'CADEIRA VAZIA'}
                </motion.button>
                {/* A única informação real que a cadeira carrega. */}
                {hint && (
                  <span className="seat-card__hint" data-testid={`seat-hint-${index}`}>
                    {hint}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* O RELÓGIO DA ESCOLHA — a única coisa que faltava dizer.
            Aqui moravam dois avisos em texto: que o botão do dealer é
            sorteado no fim, e a conta de cadeiras livres. O primeiro
            explicava uma regra que a tela nunca contraria; o segundo
            repetia, por extenso, o que as seis cadeiras já mostram de
            relance. Nenhum dos dois respondia a pergunta que a tela
            deixava no ar — QUANDO ISTO ACABA —, e sem resposta ela não
            acabava mesmo: quem não clicasse ficava ali, e as outras cinco
            pessoas junto.

            A barra é a mesma do intervalo entre as mãos (`HandoverClock`)
            porque a linguagem do tempo desta casa é uma só.

            A promessa muda com o seu estado, e é isso que a faz valer: de
            pé, ela avisa que a mesa sorteia por você; sentado, ela deixa
            de ser um prazo e vira uma contagem. */}
        <div className="seating__clock">
          <HandoverClock
            seconds={clock}
            total={SEATING_SECONDS}
            label={
              seated
                ? `A mesa começa em ${clock}s`
                : `Escolha em ${clock}s, ou a mesa sorteia por você`
            }
            testId="seating-clock"
            instant={reduced}
          />
        </div>

        {/* A RECUSA continua tendo voz. Ela é o único texto que sobrou
            aqui, e sobrou porque é o único que conta uma novidade: a
            cadeira que você pediu já era de outra pessoa. */}
        {claimError && (
          <p className="seating__status" role="status" data-testid="seating-status">
            {claimError}
          </p>
        )}
      </div>
    </main>
  );
}
