import { formatCredits } from '@/shared/lib/format';

/**
 * OS DISCOS DE POSIÇÃO — o do dealer e os dois blinds.
 *
 * São a MESMA peça em três tintas, e por isso moram num componente só:
 * um disco de cassino com relevo, borda tracejada e miolo rebaixado (a
 * matéria das fichas da casa, ver `.chip`). O que muda de um para o
 * outro é a paleta e as letras gravadas — e é assim que se lê numa mesa
 * de verdade, onde os três são discos iguais em cores diferentes.
 *
 * O QUE CADA UM DIZ, que é o motivo de existirem:
 *
 * - **D** é a ORDEM DA PALAVRA. Quem o tem fala por último do flop em
 *   diante, e essa é a vantagem mais valiosa de uma mão de poker.
 * - **SB** e **BB** são QUEM PAGOU para a mão existir. Numa mesa de anel
 *   os dois são obrigatórios e rodam com o botão: saber quem está no
 *   blind é saber quem já tem fichas no meio e quem fala por último
 *   antes do flop.
 *
 * A hierarquia das tintas segue a do dinheiro: o dealer é MARFIM, como o
 * disco de verdade — ele não custa nada e manda na ordem; o big blind é
 * OURO, que é a entrada cheia; o small é TERRACOTA, a metade dela. De
 * relance a mesa se lê sem soletrar as letras.
 *
 * Os blinds só fazem sentido numa mesa de ANEL. No duelo desta casa não
 * há blinds — os dois lados pagam a mesma entrada a cada mão (ver
 * `TABLE_ANTE`) —, e por isso lá só o disco do dealer entra em cena:
 * inventar um SB/BB ali seria desenhar uma regra que a mesa não tem.
 */
export type PuckKind = 'dealer' | 'small' | 'big';

const FACE: Record<PuckKind, string> = { dealer: 'D', small: 'SB', big: 'BB' };
const MODIFIER: Record<PuckKind, string> = { dealer: 'dealer', small: 'sb', big: 'bb' };

export interface SeatPuckProps {
  kind: PuckKind;
  /** Quem senta aqui — o rótulo é lido em voz alta, o disco não. */
  name: string;
  you: boolean;
  /** O que o blind custou nesta mesa. O disco do dealer não cobra nada. */
  amount?: number;
  testId: string;
}

/**
 * O DISCO SOLTO, do tamanho que o lugar onde ele mora mandar.
 *
 * É a peça que vai no vão ao lado da SUA mão, onde há pano sobrando e
 * ele fica onde um disco fica numa mesa de verdade: à sua esquerda,
 * sobre o feltro.
 */
export function SeatPuck({ kind, name, you, amount, testId }: SeatPuckProps) {
  const quem = you ? 'você' : name;
  const custo = amount === undefined ? '' : ` de ${formatCredits(amount)}`;
  const label =
    kind === 'dealer'
      ? `Botão do dealer com ${quem}: fala por último do flop em diante`
      : kind === 'small'
        ? `Small blind com ${quem}: entrada obrigatória${custo} nesta mão`
        : `Big blind com ${quem}: entrada obrigatória${custo} nesta mão`;

  return (
    <span
      className={`seat-puck seat-puck--${MODIFIER[kind]}`}
      data-testid={testId}
      role="img"
      aria-label={label}
    >
      <span className="seat-puck__face" aria-hidden="true">
        {FACE[kind]}
      </span>
    </span>
  );
}

/**
 * O MESMO DISCO, MONTADO NA PLACA DE QUEM O TEM — a versão dos assentos
 * de RIVAL, nas duas mesas da casa.
 *
 * Do outro lado do feltro não há pano sobrando: os assentos dos rivais
 * são estreitos por definição (são cinco na metade de cima de um
 * telefone), e cada pixel que o disco tomava numa fileira própria saía
 * da largura do NOME — que é a leitura que a placa existe para dar. Foi
 * assim que o disco chegou aos 8px em que ele não se lê mais: não por
 * escolha de tamanho, mas por falta de lugar.
 *
 * Montado, ele deixa de disputar. Ele encosta no canto da placa, meio
 * dentro e meio fora, como um disco que alguém apoiou ali — e o tamanho
 * dele passa a ser decidido pela ESCALA DA MESA, não pelo que sobrou da
 * fileira. A placa ainda RESERVA a metade de fora (ver `--cash-puck` no
 * index.css): o disco transborda para dentro dessa reserva e nunca para
 * cima do assento vizinho.
 *
 * Isto não é o selo miúdo que já morou DENTRO da placa, espremido entre
 * o nome e o stack, e que lia como abreviação de alguma coisa: aquele
 * estava no fluxo do texto e roubava a linha; este pende sobre a peça,
 * em tamanho de disco, e não empurra uma letra.
 *
 * NO SEU ASSENTO ele não é montado — lá continua solto, no vão à
 * esquerda da sua mão. É a diferença certa: o seu lado do feltro é o
 * único que tem pano sobrando, e a sua placa é a única que ninguém
 * precisa ler de relance no meio da vez de outra pessoa.
 */
export function PlatePuck(props: SeatPuckProps) {
  return (
    <span className="seat-puck-mount">
      <SeatPuck {...props} />
    </span>
  );
}
