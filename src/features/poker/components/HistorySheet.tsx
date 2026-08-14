import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits, formatDelta, formatTime } from '@/shared/lib/format';

import type { PokerHistoryEntry, PokerOutcome, RingHistoryEntry } from '../engine/poker/types';
import { isRingEntry } from '../engine/poker/types';
import { useGameStore } from '../store/gameStore';
import { EmptyState } from './EmptyState';

export interface HistorySheetProps {
  open: boolean;
  onClose: () => void;
}

const OUTCOME_BADGE: Record<PokerOutcome, { label: string; className: string }> = {
  win: { label: 'V', className: 'bg-gold/20 text-gold' },
  lose: { label: 'D', className: 'bg-opponent/20 text-opponent-soft' },
  tie: { label: 'E', className: 'bg-lavender/20 text-lavender' },
};

/** Histórico das últimas rodadas persistidas. */
export function HistorySheet({ open, onClose }: HistorySheetProps) {
  const history = useGameStore((state) => state.history);
  const startSearch = useGameStore((state) => state.startSearch);

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
          title="Sem rodadas ainda"
          data-testid="history-empty"
          action={
            <div className="action-stack">
              <Button onClick={playNow} size="md" fullWidth data-testid="history-play">
                <Icon name="club" /> JOGAR AGORA
              </Button>
            </div>
          }
        >
          Seu extrato do clube começa no primeiro duelo.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="history-list">
          {history.map((entry) =>
            isRingEntry(entry) ? (
              <RingRow key={entry.id} entry={entry} />
            ) : (
              <HistoryRow key={entry.id} entry={entry} />
            ),
          )}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * O que a linha do extrato conta de uma mão: a SUA mão, que no poker é
 * um nome e não um número ("Dois pares, Reis e 9"), e como ela terminou.
 *
 * A mão aparece mesmo quando alguém desistiu — é a mesma razão pela qual
 * a mesa a mostra no fim: rever que se largou uma mão boa (ou que o
 * rival largou) é o que este extrato tem de útil.
 */
function summaryOf(entry: PokerHistoryEntry): string {
  const label = entry.playerRank.label;
  if (entry.showdown) return label;
  return entry.foldedBy === 'player' ? `${label} · você desistiu` : `${label} · rival desistiu`;
}

/**
 * A CASCA DE UMA LINHA do extrato — o selo do desfecho, o miolo e o
 * saldo da mão. Duelo e mesa de 6 são jogos diferentes e contam coisas
 * diferentes, mas a linha é a mesma peça: um extrato em que metade das
 * linhas tem outro formato deixa de ser um extrato.
 */
function Row({
  outcome,
  children,
  netChange,
}: {
  outcome: PokerOutcome;
  children: React.ReactNode;
  netChange: number;
}) {
  const badge = OUTCOME_BADGE[outcome];
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-arena-line bg-arena-800 px-4 py-3">
      {/* role="img": a letra sozinha ("V") não diz nada em voz alta, e o
          rótulo que a traduz seria descartado num <span> sem papel. */}
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${badge.className}`}
        role="img"
        aria-label={outcome === 'win' ? 'Vitória' : outcome === 'lose' ? 'Derrota' : 'Empate'}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      <span
        className={`text-sm font-black tabular-nums ${
          netChange > 0 ? 'text-gold' : netChange < 0 ? 'text-opponent-soft' : 'text-lavender'
        }`}
      >
        {formatDelta(netChange)}
      </span>
    </li>
  );
}

/**
 * UMA MÃO DA MESA DE 6 no extrato.
 *
 * O que ela conta é o que só uma mesa de seis tem para contar: com
 * quantas pessoas se disputou e quanto havia no meio. Repetir aqui o
 * formato do duelo ("vs Fulano") mentiria — não houve um rival, houve
 * cinco —, e a leitura da SUA mão só existe quando a mão foi ao
 * showdown: numa mesa de verdade quem leva o pote sem mostrar não deixa
 * registro do que tinha.
 */
function RingRow({ entry }: { entry: RingHistoryEntry }) {
  const eu = entry.seats.find((s) => s.isYou);
  const disputantes = entry.seats.filter((s) => !s.folded).length;
  const pote = entry.pots.reduce((sum, p) => sum + p.amount, 0);
  const outcome: PokerOutcome = entry.netChange > 0 ? 'win' : entry.netChange < 0 ? 'lose' : 'tie';

  const leitura = eu?.rank?.label ?? (eu?.folded ? 'Você desistiu' : 'Levou sem mostrar');

  return (
    <Row outcome={outcome} netChange={entry.netChange}>
      <p className="truncate text-sm font-bold">
        {leitura}
        <span className="font-normal text-lavender"> · {entry.tableName}</span>
      </p>
      <p className="text-xs text-lavender/70">
        {formatTime(entry.completedAt)}
        {` · mesa de ${entry.seats.length}`}
        {entry.showdown ? ` · ${disputantes} no showdown` : ''}
        {pote > 0 ? ` · pote ${formatCredits(pote)}` : ''}
      </p>
    </Row>
  );
}

function HistoryRow({ entry }: { entry: PokerHistoryEntry }) {
  return (
    <Row outcome={entry.outcome} netChange={entry.netChange}>
      <p className="truncate text-sm font-bold">
        {summaryOf(entry)}
        <span className="font-normal text-lavender"> vs {entry.opponentName}</span>
      </p>
      <p className="text-xs text-lavender/70">
        {formatTime(entry.completedAt)}
        {entry.pot > 0 ? ` · pote ${formatCredits(entry.pot)}` : ''}
      </p>
    </Row>
  );
}
