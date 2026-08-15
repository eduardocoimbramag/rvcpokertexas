import { useState } from 'react';

import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits, formatDelta } from '@/shared/lib/format';

import { useGameStore } from '../../store/gameStore';
import { CHIP_DENOMINATIONS } from './pot';
import type { HandLog } from './handLog';
import { handLog } from './handLog';

/**
 * AS DUAS FERRAMENTAS DA MESA — o valor das fichas à esquerda, o extrato
 * da sessão à direita.
 *
 * Elas são a MESMA peça nas duas mesas, e ficam nos dois cantos de cima
 * porque é o único lugar da tela que não disputa com nada: o feltro é do
 * jogo, a faixa de baixo é do polegar, e o alto tem o nome da mesa no
 * meio e dois cantos vazios.
 *
 * SÃO DISCRETAS DE PROPÓSITO. Um botão de ferramenta que pede atenção
 * compete com as cartas — e nenhuma das duas decide mão nenhuma: uma
 * responde "quanto vale esta ficha?" e a outra "como cheguei até aqui?".
 * As duas são consultas, não jogadas. Daí o ícone sem rótulo, o disco de
 * vinho translúcido e o ouro só no traço.
 *
 * O ALVO DE TOQUE é maior que o desenho (44px, o mínimo da casa): a peça
 * é pequena porque não deve chamar, não porque deva ser difícil de
 * acertar.
 */
export function TableTools() {
  /* A MESA EM CENA é a única que existe para este painel: a lista viva da
     sessão já é só dela, então não há chave a passar nem lista a filtrar
     (ver `handLog`). */
  const hands = useGameStore((state) => state.tableHands);
  const [aberto, setAberto] = useState<'fichas' | 'maos' | null>(null);

  const log = handLog(hands);

  return (
    <div className="table-tools">
      <button
        type="button"
        className="table-tool"
        onClick={() => setAberto('fichas')}
        aria-label="Ver o valor das fichas"
        data-testid="table-chips"
      >
        <Icon name="help" size={17} />
      </button>

      <button
        type="button"
        className="table-tool"
        onClick={() => setAberto('maos')}
        aria-label="Ver as mãos desta mesa"
        data-testid="table-history"
      >
        <Icon name="scroll" size={17} />
      </button>

      <ChipValuesSheet open={aberto === 'fichas'} onClose={() => setAberto(null)} />
      <HandLogSheet log={log} open={aberto === 'maos'} onClose={() => setAberto(null)} />
    </div>
  );
}

/**
 * O VALOR DAS FICHAS — as sete da casa, com quanto cada uma vale.
 *
 * A pergunta que ele responde é literal: as fichas TÊM valor fixo (ver
 * `CHIP_DENOMINATIONS`), e é por isso que um montante de milhares cabe
 * numa faixa de feltro — seis douradas são seis mil, e isso se lê sem
 * contar nada. Quem não sabe a tabela vê um monte colorido.
 *
 * O quadro é PEQUENO porque a tabela é pequena: sete linhas, a ficha de
 * verdade (a mesma peça do pote e do montante, `.rvc-chip`) e a cifra ao
 * lado. Desenhar uma ficha de mentira aqui seria a única ficha da casa
 * que não é a ficha da casa.
 *
 * E é SÓ a tabela. Havia um parágrafo embaixo explicando que a mesa troca
 * as miúdas pelas de valor maior — verdade, e irrelevante: quem abre este
 * quadro tem uma pergunta de duas palavras ("quanto vale?") e a resposta
 * está nas sete linhas. Um parágrafo ali era leitura que ninguém pediu no
 * lugar em que a peça já tinha respondido.
 */
function ChipValuesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Valor das fichas" onClose={onClose}>
      <ul className="chip-table" data-testid="chip-table">
        {CHIP_DENOMINATIONS.map((value) => (
          <li key={value} className="chip-table__row">
            <span className={`rvc-chip rvc-chip--${value}`} aria-hidden="true">
              <span className="rvc-chip__crest" />
            </span>
            <span className="chip-table__value">{formatCredits(value)}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/**
 * O EXTRATO DA MESA — o saldo da sessão em cima, e as mãos embaixo.
 *
 * A ORDEM É A DE QUEM JOGOU: da primeira mão para a última. Um extrato
 * de banco começa na mais recente porque a pergunta lá é "o que acabou
 * de acontecer"; aqui a pergunta é outra — "como cheguei a este stack" —,
 * e ela se responde de trás para a frente.
 *
 * O SALDO VEM ANTES, e grande. É a única linha que resume a sessão
 * inteira, e é ela que a pessoa abriu o painel para ver; a lista existe
 * para explicá-la.
 *
 * QUEM CORREU tem selo próprio. Uma mão largada e uma mão perdida no
 * showdown custam as duas fichas, mas não contam a mesma história: uma
 * diz que você pagou para ver e perdeu, a outra que você saiu antes. Sem
 * o selo, as duas viram o mesmo número negativo.
 */
function HandLogSheet({
  log,
  open,
  onClose,
}: {
  log: HandLog;
  open: boolean;
  onClose: () => void;
}) {
  const tom = log.net > 0 ? 'win' : log.net < 0 ? 'lose' : 'flat';

  /* "MÃOS DESTA MESA", e não "histórico da mesa": desde que o extrato da
     casa passou a listar MESAS, a palavra "histórico" tem dono na
     interface — é a folha do menu. Dois painéis com o mesmo nome e
     unidades diferentes fariam a pessoa procurar mãos onde há mesas. */
  return (
    <Sheet open={open} title="Mãos desta mesa" onClose={onClose}>
      <div className={`hand-log__sum hand-log__sum--${tom}`} data-testid="hand-log-net">
        <span className="hand-log__sum-value">
          <Icon name="chip" size="0.8em" /> {formatDelta(log.net)}
        </span>
        <span className="hand-log__sum-label">
          {log.rows.length === 1 ? '1 mão jogada' : `${log.rows.length} mãos jogadas`}
        </span>
      </div>

      {log.rows.length === 0 ? (
        /* A mesa acabou de abrir. Dizer "sem registros" seria responder à
           pergunta errada: o que houve não é ausência de dado, é que a
           primeira mão ainda está correndo. */
        <p className="hand-log__empty" data-testid="hand-log-empty">
          A primeira mão ainda está na mesa.
        </p>
      ) : (
        <ol className="hand-log" data-testid="hand-log">
          {log.rows.map((row) => (
            <li
              key={row.no}
              className={`hand-log__row ${row.delta > 0 ? 'is-win' : row.delta < 0 ? 'is-lose' : ''}`}
              data-testid={`hand-log-row-${row.no}`}
            >
              <span className="hand-log__no">{row.no}</span>
              {row.folded && <span className="hand-log__flag">correu</span>}
              <span className="hand-log__delta">{formatDelta(row.delta)}</span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
