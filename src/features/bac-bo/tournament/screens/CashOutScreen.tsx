import { SessionClose } from '../../components/SessionBanner';
import { resolveDealerReaction } from '../../scene/dealer/useDealerReaction';
import { TableScene } from '../../scene/TableScene';
import { useTournamentStore } from '../tournamentStore';

/**
 * O FECHO DA MESA DE SEIS — a MESMA tela do duelo.
 *
 * Não parecida: a mesma peça (`SessionClose`), com a mesma conta. A
 * comissão da casa incide uma vez, no caixa, e só sobre o LUCRO — nunca
 * sobre a compra que você trouxe (ver `cashOutValue`). Ela vive numa
 * função só, e é por isso que as duas mesas pagam igual.
 *
 * Antes daqui, levantar de uma mesa de cash creditava o stack bruto e
 * voltava direto para o salão: a sessão inteira — quantas mãos, quanto
 * subiu, quanto desceu — terminava sem uma linha sobre ela, e sem a
 * comissão que o duelo cobra.
 *
 * O CENÁRIO É O DO DUELO, e é o mesmo código: a CÂMERA VOLTA AO FRONTAL,
 * a crupiê entra no quadro e reage ao que a sessão fez com você —
 * comemora o lucro, consola o prejuízo, dá de ombros no zero a zero.
 *
 * Ele estava na câmera de CIMA, que é a da mesa em jogo: ali a crupiê
 * fica fora de quadro por desenho, e o fecho acontecia sobre um feltro
 * vazio. O duelo já resolvia isso — `cameraFor` desce para o frontal
 * assim que a fase vira `completed` —, e a reação dela sai do mesmo mapa
 * (`resolveDealerReaction`), com o desfecho da SESSÃO no lugar do da mão:
 * numa mesa que corre até você levantar, é a sessão que decide se houve
 * o que comemorar.
 *
 * OS DOIS BOTÕES levam para onde a sala manda: OUTRA SALA volta à
 * vitrine (é de lá que se entra numa mesa de cash, e não de um
 * pareamento), INÍCIO fecha o modo.
 */
export function CashOutScreen() {
  const caixa = useTournamentStore((s) => s.cashOut);
  const openBrowse = useTournamentStore((s) => s.openBrowse);
  const leave = useTournamentStore((s) => s.leaveTournament);

  if (!caixa) return null;

  /* O DESFECHO DA SESSÃO no lugar do da mão — é ele que a crupiê lê.
     A comissão não entra nesta conta: ela é do caixa, e quem subiu na
     mesa subiu, independentemente do que a casa cobra na porta. */
  const lucro = caixa.finalStack - caixa.buyIn;
  const reacao = resolveDealerReaction('completed', lucro > 0 ? 'win' : lucro < 0 ? 'lose' : 'tie');

  return (
    <main className="flex min-h-0 flex-1 flex-col px-6 py-4" data-testid="cashout-screen">
      {/* A MESMA altura de cabeçalho das outras telas da mesa: sem ela a
          cena começa numa linha diferente e o trilho de mogno sobe. */}
      <header className="relative z-20 mb-4 flex min-h-11 items-center justify-between gap-3" />

      <TableScene reaction={reacao} camera="front">
        <SessionClose
          buyIn={caixa.buyIn}
          finalStack={caixa.finalStack}
          onPlayAgain={openBrowse}
          playAgainLabel="OUTRA SALA"
          onHome={leave}
        />
      </TableScene>
    </main>
  );
}
