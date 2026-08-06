import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/shared/components/Sheet';
import { formatCredits, formatDelta, formatTime } from '@/shared/lib/format';

import type { PokerHistoryEntry, PokerOutcome } from '../engine/poker/types';
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
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
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

function HistoryRow({ entry }: { entry: PokerHistoryEntry }) {
  const badge = OUTCOME_BADGE[entry.outcome];
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-arena-line bg-arena-800 px-4 py-3">
      {/* role="img": a letra sozinha ("V") não diz nada em voz alta, e o
          rótulo que a traduz seria descartado num <span> sem papel. */}
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${badge.className}`}
        role="img"
        aria-label={
          entry.outcome === 'win' ? 'Vitória' : entry.outcome === 'lose' ? 'Derrota' : 'Empate'
        }
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {summaryOf(entry)}
          <span className="font-normal text-lavender"> vs {entry.opponentName}</span>
        </p>
        <p className="text-xs text-lavender/70">
          {formatTime(entry.completedAt)}
          {entry.pot > 0 ? ` · pote ${formatCredits(entry.pot)}` : ''}
        </p>
      </div>
      <span
        className={`text-sm font-black tabular-nums ${
          entry.netChange > 0
            ? 'text-gold'
            : entry.netChange < 0
              ? 'text-opponent-soft'
              : 'text-lavender'
        }`}
      >
        {formatDelta(entry.netChange)}
      </span>
    </li>
  );
}
