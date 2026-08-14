import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';

import { ACTION_SECONDS } from '../../store/gameStore';

/**
 * O RELÓGIO DA VEZ e o botão de LEVANTAR — as duas peças da barra de
 * lances que valem para QUALQUER mesa desta casa.
 *
 * Elas moravam dentro de `BetControls`, a barra do duelo, e ficaram
 * inalcançáveis quando a mesa de seis chegou. Copiá-las teria custado
 * dobrado em toda melhoria futura e, na prática, só metade seria feita —
 * é o mesmo argumento que já tirou o `HandRow` de dentro das arenas.
 *
 * As duas mesas são legitimamente diferentes na geometria; o relógio e a
 * saída não são.
 */

export interface TurnClockProps {
  /** Segundos restantes da sua vez. */
  seconds: number;
  /** Dentro do painel de aumento, onde a altura é curta. */
  compact?: boolean;
}

/**
 * O RELÓGIO DA VEZ — os segundos que você tem para decidir.
 *
 * Ele mora na barra de lances, e não na mesa, porque é da DECISÃO que
 * ele fala: some junto com os botões quando a palavra passa adiante, e
 * acompanha o painel de aumento para dentro quando ele abre — escolher
 * quanto apostar é justamente o momento em que o tempo pesa, e seria o
 * pior momento para esconder o relógio.
 *
 * Nos últimos segundos tudo vira brasa: é o aviso de que a mesa vai
 * jogar por você (passa se for de graça, desiste se houver aposta na
 * frente).
 */
export function TurnClock({ seconds, compact = false }: TurnClockProps) {
  const urgent = seconds <= 5;
  return (
    <div
      className={`turn-clock ${compact ? 'turn-clock--compact' : ''} ${urgent ? 'is-urgent' : ''}`}
      data-testid="turn-clock"
      role="timer"
      aria-label={`${seconds} segundos para decidir`}
    >
      <span className="turn-clock__track">
        <span
          className="turn-clock__fill"
          style={{ width: `${Math.max(0, Math.min(1, seconds / ACTION_SECONDS)) * 100}%` }}
        />
      </span>
      <span className="turn-clock__value">{seconds}s</span>
    </div>
  );
}

export interface LeaveButtonProps {
  /** A saída já abriu. Apagada, ela ainda fica em cena. */
  enabled: boolean;
  onLeave: () => void;
  disabled: boolean;
  /** O que dizer enquanto ela não abriu. */
  hint: string;
}

/**
 * LEVANTAR DA MESA, na fileira de lances.
 *
 * Ele fica em cena APAGADO antes de abrir, em vez de não existir: quem
 * senta descobre a saída antes de precisar dela, e descobre também que
 * ela ainda não está disponível. Um botão que nasce do nada na segunda
 * mão empurra a fileira inteira de lugar no meio de uma decisão.
 *
 * ABERTA, ela é a MESMA PEÇA DO PASSAR: `variant="secondary"`, o vinho
 * borgonha lapidado da casa. Não é uma cópia da aparência dele — é a
 * variante dele, escolhida aqui e não redesenhada em CSS ao lado. A
 * diferença importa na manutenção: a porta não passa a ter uma segunda
 * casca para alguém manter em dia, e toda melhoria futura do
 * `secondary` (bisel, hover, foco, alto contraste) chega nela sozinha.
 *
 * O que separa as duas decisões na fileira é o RÓTULO e o ÍCONE —
 * ✓ PASSAR e ✕ LEVANTAR —, e, no meio de uma mão, a mesa ainda PERGUNTA
 * antes de levantar (ver `LeaveTablePrompt`): a saída continua sendo a
 * única da fileira que passa por uma confirmação.
 *
 * ENQUANTO NÃO ABRE, ela veste GRAFITE (`is-locked`) — e não o vinho
 * queimado com que a casa apaga um botão qualquer. São dois "não" que
 * não querem dizer a mesma coisa: o vinho apagado é o da fileira inteira
 * quando um lance está em trânsito ("agora não dá"), e o cinza é o da
 * porta que AINDA não abriu ("na próxima mão dá"). O cinza sai das
 * tintas da decisão — dourado, vinho, vermelho — justamente porque, na
 * primeira mão, esta não é uma decisão a tomar.
 *
 * As duas coisas valem nas DUAS mesas, o duelo e a de seis, porque as
 * duas montam a fileira com este mesmo botão. Os outros LEVANTAR DA MESA
 * da casa — o do intervalo entre as mãos e o de quem ficou sem fichas —
 * são outra peça e seguem em vermelho cheio.
 */
export function LeaveButton({ enabled, onLeave, disabled, hint }: LeaveButtonProps) {
  return (
    <Button
      variant="secondary"
      size="md"
      fullWidth
      className={`bet-row__leave ${enabled ? '' : 'is-locked'}`}
      onClick={onLeave}
      disabled={disabled || !enabled}
      title={enabled ? 'Correr a mão e levantar da mesa' : hint}
      /* O `title` de um botão apagado NÃO abre balão em navegador
         nenhum: o elemento não recebe evento de mouse. Quem navega por
         teclado ou leitor de tela ouviria só "LEVANTAR, indisponível" e
         ficaria sem o porquê — que é a metade que importa, porque ele
         volta sozinho daqui a uma mão. O nome acessível carrega o motivo
         junto, e começa pelo rótulo que está escrito na peça. */
      aria-label={enabled ? undefined : `Levantar da mesa — ${hint}`}
      data-testid="leave-table"
    >
      <Icon name="close" /> LEVANTAR
    </Button>
  );
}
