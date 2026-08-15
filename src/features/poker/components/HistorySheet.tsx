import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits, formatDelta, formatTime } from '@/shared/lib/format';

import type { TableClose, TableHistoryEntry } from '../engine/poker/types';
import { tableBalance } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';
import { EmptyState } from './EmptyState';
import type { Ledger } from './ledger';
import { ledger } from './ledger';

export interface HistorySheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * O EXTRATO DA CASA — uma linha por MESA em que se jogou.
 *
 * Ele contava MÃOS, e contava a história errada. Uma noite de quarenta
 * mãos virava quarenta linhas de ±40 créditos, empurrava a mesa anterior
 * para fora do teto da lista e deixava sem resposta a única pergunta que
 * alguém faz ao abrir o histórico: "como eu fui naquela mesa?" — que
 * estava ali, repartida em quarenta pedaços que só somavam de cabeça.
 *
 * Agora cada linha é uma mesa fechada, e ela diz as três coisas de que se
 * lembra depois: QUAL mesa (o duelo é sempre "1v1"; a sala tem o nome com
 * que ela foi aberta), QUANTO tempo se ficou nela (a hora e as mãos) e o
 * BALANÇO — o que a mesa fez com o saldo, que é a linha que se procura.
 *
 * A HIERARQUIA É DE TRÊS ANDARES, e cada um responde a uma pergunta
 * diferente: o balanço de tudo em cima (o que este extrato inteiro fez
 * comigo), o do dia ao lado do dia (como foi aquela noite) e o da mesa na
 * linha dela. O andar de baixo é o que grita; os outros dois são
 * consulta, e ficam em corpo miúdo.
 *
 * O DIA SEPARA A LISTA porque a unidade mudou de tamanho. Enquanto a
 * linha era uma mão, todas cabiam na mesma sessão de vinte minutos e a
 * hora bastava; uma linha por mesa faz a lista atravessar semanas — e
 * "14:32" sem dia é uma hora que não diz quando.
 */
export function HistorySheet({ open, onClose }: HistorySheetProps) {
  const history = useGameStore((state) => state.history);
  const startSearch = useGameStore((state) => state.startSearch);

  const extrato = ledger(history);

  /* O vazio do histórico é um beco: não há botão nenhum nesta folha. O
     CTA fecha a folha e já procura oponente — o mesmo caminho do botão
     de jogar da Home. */
  const playNow = () => {
    onClose();
    void startSearch();
  };

  return (
    <Sheet open={open} title="Histórico" onClose={onClose}>
      {history.length === 0 ? (
        <EmptyState
          title="Sem mesas ainda"
          data-testid="history-empty"
          action={
            <div className="action-stack">
              <Button onClick={playNow} size="md" fullWidth data-testid="history-play">
                <Icon name="club" /> JOGAR AGORA
              </Button>
            </div>
          }
        >
          Cada mesa em que você sentar deixa uma linha aqui, com o que ela fez pelo seu saldo.
        </EmptyState>
      ) : (
        <>
          <LedgerSum extrato={extrato} />
          <div className="ledger" data-testid="history-list">
            {extrato.days.map((day) => (
              <section key={day.key} className="ledger__day">
                {/* O DIA e o que ele deu, na mesma linha: o cabeçalho de
                    uma seção de extrato é a régua dela. */}
                <h3 className="ledger__day-head">
                  <span className="ledger__day-name">{day.label}</span>
                  <span className={`ledger__day-net is-${toneOf(day.net)}`}>
                    {formatDelta(day.net)}
                  </span>
                </h3>
                <ul className="ledger__rows">
                  {day.entries.map((entry) => (
                    <TableRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** A cor de um balanço: ouro em cima, vermelho embaixo, taupe no zero. */
function toneOf(net: number): 'win' | 'lose' | 'flat' {
  return net > 0 ? 'win' : net < 0 ? 'lose' : 'flat';
}

/**
 * O SELO DA MESA que a mesa fechou de um jeito fora do comum.
 *
 * Só duas das quatro portas ganham marca, e é de propósito: levantar da
 * mesa e ver a mesa acabar são os finais ORDINÁRIOS de uma sessão, e
 * carimbá-los seria pôr um selo em toda linha da lista — o que é o mesmo
 * que não pôr nenhum. Ficar sem fichas e ter a sessão interrompida no
 * meio são as duas que mudam a leitura do número ao lado.
 */
function closeFlag(close: TableClose): string | null {
  if (close === 'busted') return 'quebrou';
  if (close === 'abandoned') return 'interrompida';
  return null;
}

/**
 * O BALANÇO DE TUDO, em cima e grande — a mesma peça do extrato da mesa
 * (ver `HandLogSheet`), e pela mesma razão: é a única linha que resume a
 * folha inteira, e é ela que a pessoa abriu a folha para ver. A lista
 * embaixo existe para explicá-la.
 */
function LedgerSum({ extrato }: { extrato: Ledger }) {
  const mesas = extrato.tables === 1 ? '1 mesa' : `${extrato.tables} mesas`;

  return (
    <div className={`ledger__sum ledger__sum--${toneOf(extrato.net)}`} data-testid="history-net">
      <span className="ledger__sum-value">
        <Icon name="chip" size="0.8em" /> {formatDelta(extrato.net)}
      </span>
      <span className="ledger__sum-label">
        {mesas}
        {extrato.up > 0 ? ` · ${extrato.up} no positivo` : ''}
      </span>
    </div>
  );
}

/**
 * UMA MESA NO EXTRATO.
 *
 * O selo à esquerda diz de que mesa se trata sem gastar palavra: o naipe
 * de paus é o duelo (o mesmo do botão da Home), as silhuetas são a sala.
 * À direita, o balanço grande e a COMPRA em corpo miúdo embaixo — sem ela
 * um "+300" não tem tamanho: trezentos sobre uma compra de quinhentos é
 * uma noite, sobre uma de cinco mil é um empate com sorte.
 */
function TableRow({ entry }: { entry: TableHistoryEntry }) {
  const net = tableBalance(entry);
  const flag = closeFlag(entry.close);
  const maos = entry.hands === 1 ? '1 mão' : `${entry.hands} mãos`;

  return (
    <li className={`ledger__row is-${toneOf(net)}`} data-testid="history-row">
      <span className={`ledger__seal ledger__seal--${entry.kind}`} aria-hidden="true">
        <Icon name={entry.kind === 'duel' ? 'club' : 'users'} size="1.05em" />
      </span>

      <span className="ledger__body">
        <span className="ledger__name">{entry.name}</span>
        <span className="ledger__meta">
          {formatTime(entry.endedAt)}
          {` · ${maos}`}
          {entry.kind === 'ring' ? ` · mesa de ${entry.seats}` : ''}
          {flag ? <span className="ledger__flag">{flag}</span> : null}
        </span>
      </span>

      <span className="ledger__value">
        <span className="ledger__delta">{formatDelta(net)}</span>
        <span className="ledger__stake">compra {formatCredits(entry.buyIn)}</span>
      </span>
    </li>
  );
}
