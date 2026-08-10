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
 */
export function LeaveButton({ enabled, onLeave, disabled, hint }: LeaveButtonProps) {
  return (
    <Button
      variant="ghost"
      size="md"
      fullWidth
      className="bet-row__leave"
      onClick={onLeave}
      disabled={disabled || !enabled}
      title={enabled ? 'Correr a mão e levantar da mesa' : hint}
      data-testid="leave-table"
    >
      <Icon name="close" /> LEVANTAR
    </Button>
  );
}
